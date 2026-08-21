import { useCallback, useEffect, useState } from 'react';
import type { MenuCategory, OrderDetail } from '@restaurant/shared-types';
import { api } from '../api/client';

// 手机扫码点餐（GuestOrderPage）和桌台平板点餐（紧凑/长菜单两种布局）共用的下单逻辑：
// 拉菜单、购物车状态、加菜/提交/结账、订单刷新。三处只有 JSX 展示层不一样，业务逻辑
// 不重复维护——谁调用这个 hook，谁负责"怎么先拿到 orderId"（手机是扫码 join，
// 平板是选桌+密码 tablet-open），也负责用 RealtimeProvider/RealtimeListener 接实时刷新
// （这个 hook 本身不碰 Context，只提供 refreshOrder 给调用方的 RealtimeListener 用）。
export function useTableOrder({ orderId, tokenKind }: { orderId: string | null; tokenKind: string }) {
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
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

  function addToCart(dishId: string, delta: number) {
    setCart((prev) => {
      const next = Math.max(0, (prev[dishId] ?? 0) + delta);
      const updated = { ...prev, [dishId]: next };
      if (next === 0) delete updated[dishId];
      return updated;
    });
  }

  async function submitCart() {
    if (!orderId || Object.keys(cart).length === 0) return;
    setBusy(true);
    try {
      const items = Object.entries(cart).map(([dishId, quantity]) => ({ dishId, quantity }));
      await api.post(`/orders/${orderId}/items`, { items }, tokenKind);
      await api.post(`/orders/${orderId}/submit`, {}, tokenKind);
      setCart({});
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

  const cartTotal = Object.entries(cart).reduce((sum, [dishId, qty]) => {
    const dish = menu.flatMap((c) => c.dishes).find((d) => d.id === dishId);
    return sum + (dish ? Number(dish.price) * qty : 0);
  }, 0);

  const activeCategory = menu.find((c) => c.id === activeCategoryId) ?? menu[0];

  return {
    menu,
    activeCategory,
    activeCategoryId,
    setActiveCategoryId,
    order,
    cart,
    addToCart,
    submitCart,
    requestCheckout,
    cartTotal,
    error,
    setError,
    busy,
    refreshOrder,
  };
}
