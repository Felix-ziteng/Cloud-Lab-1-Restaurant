import { useCallback, useEffect, useState } from 'react';
import type { MenuCategory, OrderDetail } from '@restaurant/shared-types';
import { api } from '../api/client';

// 购物车里的一条线：同一道菜、不同选项组合（比如"加鸡蛋"和"不加鸡蛋"）算两条独立的线，
// 不能只用 dishId 当 key 合并数量——否则没法区分数量分别属于哪种选项组合
export interface CartLine {
  lineId: string; // 纯前端本地 key（crypto.randomUUID()），提交时不会用到
  dishId: string;
  quantity: number;
  selectedOptionIds: string[];
}

// 不用 crypto.randomUUID()：平板/顾客手机都是通过局域网 IP 走明文 HTTP 访问（不是
// localhost/HTTPS），不是"安全上下文"，Web Crypto API 在这种环境下不可用
let lineIdCounter = 0;
function generateLineId() {
  lineIdCounter += 1;
  return `line-${Date.now()}-${lineIdCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

function sameSelection(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, i) => id === sortedB[i]);
}

// 手机扫码点餐（GuestOrderPage）和桌台平板点餐（紧凑/长菜单两种布局）共用的下单逻辑：
// 拉菜单、购物车状态、加菜/提交/结账、订单刷新。三处只有 JSX 展示层不一样，业务逻辑
// 不重复维护——谁调用这个 hook，谁负责"怎么先拿到 orderId"（手机是扫码 join，
// 平板是选桌+密码 tablet-open），也负责用 RealtimeProvider/RealtimeListener 接实时刷新
// （这个 hook 本身不碰 Context，只提供 refreshOrder 给调用方的 RealtimeListener 用）。
export function useTableOrder({ orderId, tokenKind }: { orderId: string | null; tokenKind: string }) {
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshOrder = useCallback(async () => {
    if (!orderId) return;
    const detail = await api.get<OrderDetail>(`/orders/${orderId}`, tokenKind);
    setOrder(detail);
  }, [orderId, tokenKind]);

  useEffect(() => {
    if (!orderId) return;
    api
      .get<MenuCategory[]>('/menu')
      .then((categories) => {
        setMenu(categories);
        setActiveCategoryId((prev) => prev ?? categories[0]?.id ?? null);
      })
      .catch(() => setError('菜单加载失败，请稍后重试'));
    refreshOrder().catch(() => setError('加载失败，请稍后重试'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // 加一份：没有选项的菜维持"点一下直接加"的老行为（selectedOptionIds 传空数组）；
  // 有选项的菜由调用方先弹 DishModifierSheet 收集选项，选完再调这个。
  // 同款选项组合（顺序无关）会合并成同一条线累加数量，不同组合各开一条线。
  function addToCart(dishId: string, selectedOptionIds: string[] = []) {
    setCart((prev) => {
      const existing = prev.find((l) => l.dishId === dishId && sameSelection(l.selectedOptionIds, selectedOptionIds));
      if (existing) {
        return prev.map((l) => (l.lineId === existing.lineId ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { lineId: generateLineId(), dishId, quantity: 1, selectedOptionIds }];
    });
  }

  // 没有选项的菜，卡片上"-"按钮用这个：找这道菜"零选项"那条线减一份，减到 0 就整条移除
  function decrementSimpleLine(dishId: string) {
    setCart((prev) => {
      const line = prev.find((l) => l.dishId === dishId && l.selectedOptionIds.length === 0);
      if (!line) return prev;
      if (line.quantity <= 1) return prev.filter((l) => l.lineId !== line.lineId);
      return prev.map((l) => (l.lineId === line.lineId ? { ...l, quantity: l.quantity - 1 } : l));
    });
  }

  // 购物车抽屉里单条线自己的 +/-，改到 0 直接整条移除
  function updateLineQuantity(lineId: string, delta: number) {
    setCart((prev) => {
      const next = prev
        .map((l) => (l.lineId === lineId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0);
      return next;
    });
  }

  function removeLine(lineId: string) {
    setCart((prev) => prev.filter((l) => l.lineId !== lineId));
  }

  async function submitCart() {
    if (!orderId || cart.length === 0) return;
    setBusy(true);
    try {
      const items = cart.map((l) => ({
        dishId: l.dishId,
        quantity: l.quantity,
        selectedOptionIds: l.selectedOptionIds,
      }));
      await api.post(`/orders/${orderId}/items`, { items }, tokenKind);
      await api.post(`/orders/${orderId}/submit`, {}, tokenKind);
      setCart([]);
      await refreshOrder();
    } catch {
      setError('提交失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  async function requestCheckout() {
    if (!orderId) return;
    setBusy(true);
    try {
      await api.post(`/orders/${orderId}/checkout-request`, {}, tokenKind);
      await refreshOrder();
    } catch {
      setError('结账请求失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  function lineUnitPrice(line: CartLine): number {
    const dish = menu.flatMap((c) => c.dishes).find((d) => d.id === line.dishId);
    if (!dish) return 0;
    const optionsTotal = dish.modifierGroups
      .flatMap((g) => g.options)
      .filter((o) => line.selectedOptionIds.includes(o.id))
      .reduce((sum, o) => sum + Number(o.priceDelta), 0);
    return Number(dish.price) + optionsTotal;
  }

  const cartTotal = cart.reduce((sum, line) => sum + lineUnitPrice(line) * line.quantity, 0);

  function cartQuantityForDish(dishId: string) {
    return cart.filter((l) => l.dishId === dishId).reduce((sum, l) => sum + l.quantity, 0);
  }

  const activeCategory = menu.find((c) => c.id === activeCategoryId) ?? menu[0];

  return {
    menu,
    activeCategory,
    activeCategoryId,
    setActiveCategoryId,
    order,
    cart,
    addToCart,
    decrementSimpleLine,
    updateLineQuantity,
    removeLine,
    cartQuantityForDish,
    lineUnitPrice,
    submitCart,
    requestCheckout,
    cartTotal,
    error,
    setError,
    busy,
    refreshOrder,
  };
}
