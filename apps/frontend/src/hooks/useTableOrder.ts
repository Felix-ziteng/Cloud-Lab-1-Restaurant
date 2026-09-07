import { useCallback, useEffect, useRef, useState } from 'react';
import type { MenuCategory, OrderDetail, OrderItem } from '@restaurant/shared-types';
import { api } from '../api/client';

// 手机扫码点餐（GuestOrderPage）和桌台平板点餐（紧凑/长菜单两种布局）共用的下单逻辑：
// 拉菜单、购物车状态、加菜/提交/结账、订单刷新。三处只有 JSX 展示层不一样，业务逻辑
// 不重复维护——谁调用这个 hook，谁负责"怎么先拿到 orderId"（手机是扫码 join，
// 平板是选桌+密码 tablet-open），也负责用 RealtimeProvider/RealtimeListener 接实时刷新
// （这个 hook 本身不碰 Context，只提供 refreshOrder 给调用方的 RealtimeListener 用）。
//
// 购物车不是本地状态：它就是 order.items 里 submittedAt 为 null 的那些项（"本桌已点"是
// submittedAt 不为 null 的那些）。每次加/减/删都是一次真实的后端请求（addItems/
// updateItemQuantity/removeItem，这几个接口本来就是给店员前台"加菜"用的，现在顾客/平板
// 点餐也复用），后端改动后会通过 realtime 广播给同一桌的所有设备——所以购物车天然是
// "这一桌共享的"，手机加的菜平板能直接看到、改数量、删掉，任何一台设备提交都会把这一桌
// 当前所有未提交的项一起提交。这是产品决策（2026-09-07 跟用户确认过），不是 bug。
export function useTableOrder({ orderId, tokenKind }: { orderId: string | null; tokenKind: string }) {
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flashItemIds, setFlashItemIds] = useState<Set<string>>(new Set());

  // 上一次刷新时"未提交项 id -> 数量"的快照，用来判断这次刷新里哪些项是新增/加量的，
  // 给这些行加一下高亮动效——不区分是不是自己这台设备刚做的操作，自己操作完刷新到
  // 结果时也会有一下确认闪烁，逻辑统一、不用额外判断"这个变化是谁触发的"
  const prevQuantitiesRef = useRef<Map<string, number>>(new Map());
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshOrder = useCallback(async () => {
    if (!orderId) return;
    const detail = await api.get<OrderDetail>(`/orders/${orderId}`, tokenKind);
    const prev = prevQuantitiesRef.current;
    const next = new Map<string, number>();
    const changed = new Set<string>();
    for (const item of detail.items) {
      if (item.submittedAt !== null || item.isVoided) continue;
      next.set(item.id, item.quantity);
      const prevQty = prev.get(item.id);
      if (prevQty === undefined || item.quantity > prevQty) changed.add(item.id);
    }
    prevQuantitiesRef.current = next;
    setOrder(detail);
    if (changed.size > 0) {
      setFlashItemIds(changed);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashItemIds(new Set()), 700);
    }
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

  const cartItems = order ? order.items.filter((i) => i.submittedAt === null && !i.isVoided) : [];
  const orderedItems = order ? order.items.filter((i) => i.submittedAt !== null && !i.isVoided) : [];

  function optionLabelsOf(item: Pick<OrderItem, 'selectedModifiers'>): string[] {
    return (item.selectedModifiers ?? []).map((m) => m.optionLabel).sort();
  }

  function resolveSelectedLabels(dishId: string, selectedOptionIds: string[]): string[] {
    const dish = menu.flatMap((c) => c.dishes).find((d) => d.id === dishId);
    if (!dish) return [];
    return dish.modifierGroups
      .flatMap((g) => g.options)
      .filter((o) => selectedOptionIds.includes(o.id))
      .map((o) => o.label)
      .sort();
  }

  function sameLabels(a: string[], b: string[]) {
    return a.length === b.length && a.every((label, i) => label === b[i]);
  }

  // 加一份：没有选项的菜维持"点一下直接加"的老行为（selectedOptionIds 传空数组）；
  // 有选项的菜由调用方先弹 DishModifierSheet 收集选项，选完再调这个。
  // 同款选项组合（按标签文字比较，见 hook 顶部注释）合并成同一条未提交项累加数量，
  // 不同组合各开一条。
  async function addToCart(dishId: string, selectedOptionIds: string[] = []) {
    if (!orderId) return;
    setBusy(true);
    try {
      const targetLabels = resolveSelectedLabels(dishId, selectedOptionIds);
      const existing = cartItems.find(
        (i) => i.dishId === dishId && sameLabels(optionLabelsOf(i), targetLabels),
      );
      if (existing) {
        await api.patch(`/orders/${orderId}/items/${existing.id}`, { quantity: existing.quantity + 1 }, tokenKind);
      } else {
        await api.post(`/orders/${orderId}/items`, { items: [{ dishId, quantity: 1, selectedOptionIds }] }, tokenKind);
      }
      await refreshOrder();
    } catch {
      setError('加菜失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  // 没有选项的菜，卡片上"-"按钮用这个：找这道菜"零选项"那条未提交项减一份，减到 0 就整条删除
  async function decrementSimpleLine(dishId: string) {
    if (!orderId) return;
    const line = cartItems.find((i) => i.dishId === dishId && optionLabelsOf(i).length === 0);
    if (!line) return;
    setBusy(true);
    try {
      if (line.quantity <= 1) {
        await api.delete(`/orders/${orderId}/items/${line.id}`, tokenKind);
      } else {
        await api.patch(`/orders/${orderId}/items/${line.id}`, { quantity: line.quantity - 1 }, tokenKind);
      }
      await refreshOrder();
    } catch {
      setError('操作失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  // 购物车列表里单条项自己的 +/-，改到 0 直接整条删除
  async function updateLineQuantity(itemId: string, delta: number) {
    if (!orderId) return;
    const line = cartItems.find((i) => i.id === itemId);
    if (!line) return;
    const nextQuantity = line.quantity + delta;
    setBusy(true);
    try {
      if (nextQuantity <= 0) {
        await api.delete(`/orders/${orderId}/items/${itemId}`, tokenKind);
      } else {
        await api.patch(`/orders/${orderId}/items/${itemId}`, { quantity: nextQuantity }, tokenKind);
      }
      await refreshOrder();
    } catch {
      setError('操作失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  async function removeLine(itemId: string) {
    if (!orderId) return;
    setBusy(true);
    try {
      await api.delete(`/orders/${orderId}/items/${itemId}`, tokenKind);
      await refreshOrder();
    } catch {
      setError('操作失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  async function submitCart() {
    if (!orderId || cartItems.length === 0) return;
    setBusy(true);
    try {
      await api.post(`/orders/${orderId}/submit`, {}, tokenKind);
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

  const cartTotal = cartItems.reduce((sum, item) => sum + Number(item.unitPriceSnapshot) * item.quantity, 0);

  function cartQuantityForDish(dishId: string) {
    return cartItems.filter((i) => i.dishId === dishId).reduce((sum, i) => sum + i.quantity, 0);
  }

  const activeCategory = menu.find((c) => c.id === activeCategoryId) ?? menu[0];

  return {
    menu,
    activeCategory,
    activeCategoryId,
    setActiveCategoryId,
    order,
    cartItems,
    orderedItems,
    addToCart,
    decrementSimpleLine,
    updateLineQuantity,
    removeLine,
    cartQuantityForDish,
    submitCart,
    requestCheckout,
    cartTotal,
    flashItemIds,
    error,
    setError,
    busy,
    refreshOrder,
  };
}
