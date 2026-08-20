import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GuestOrderCreated, MenuCategory, StoreConfig } from '@restaurant/shared-types';
import { api, setToken } from '../api/client';

// 外卖/自提顾客自助下单：不需要登录，浏览菜单 -> 加购物车 -> 填联系方式一次性提交。
// 跟堂食的"加购物车 -> 提交给厨房"两步式不一样：这里没有"回头继续点"的场景，
// 提交即建单，建单成功就直接推厨房（见 OrdersService.createStandaloneOrder）
export default function TakeoutOrderPage() {
  const navigate = useNavigate();
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [config, setConfig] = useState<StoreConfig | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [form, setForm] = useState({
    type: 'takeout' as 'takeout' | 'delivery',
    customerContact: '',
    deliveryAddress: '',
    pickupTime: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<MenuCategory[]>('/menu').then(setMenu).catch(() => setError('菜单加载失败，请刷新重试'));
    api.get<StoreConfig>('/store-config').then(setConfig).catch(() => {});
  }, []);

  function addToCart(dishId: string, delta: number) {
    setCart((prev) => {
      const next = Math.max(0, (prev[dishId] ?? 0) + delta);
      const updated = { ...prev, [dishId]: next };
      if (next === 0) delete updated[dishId];
      return updated;
    });
  }

  const cartTotal = Object.entries(cart).reduce((sum, [dishId, qty]) => {
    const dish = menu.flatMap((c) => c.dishes).find((d) => d.id === dishId);
    return sum + (dish ? Number(dish.price) * qty : 0);
  }, 0);

  async function submitOrder(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const items = Object.entries(cart).map(([dishId, quantity]) => ({ dishId, quantity }));
    if (items.length === 0) {
      setError('请先选几道菜');
      return;
    }
    if (!form.customerContact.trim()) {
      setError('请填写联系电话');
      return;
    }
    if (form.type === 'delivery' && !form.deliveryAddress.trim()) {
      setError('请填写配送地址');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<GuestOrderCreated>('/orders/guest', {
        type: form.type,
        items,
        customerContact: form.customerContact,
        deliveryAddress: form.type === 'delivery' ? form.deliveryAddress : undefined,
        pickupTime: form.type === 'takeout' && form.pickupTime ? form.pickupTime : undefined,
      });
      // 订单专属 token，按 orderId 分开存——顾客可能先后下过好几单，不能互相覆盖
      setToken(`guest-order:${res.orderId}`, res.token);
      navigate(`/order-status/${res.orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '下单失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  // deliveryEnabled 现在的含义是"外卖/自提自助下单模块整体是否开放"（见后端 orders.controller.ts
  // 的注释）：产品化阶段默认关闭，只有客户需要时才为这家店单独打开。config 还没拉回来之前
  // 先不下结论，避免刷新瞬间闪一下"未开放"再变回正常页面
  if (config && !config.deliveryEnabled) {
    return (
      <div>
        <h1>外卖 / 自提点餐</h1>
        <p>该门店暂未开放外卖/自提自助下单，请到店点餐或联系店员代下单。</p>
      </div>
    );
  }

  return (
    <div>
      <h1>外卖 / 自提点餐</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <section>
        <h2>菜单</h2>
        {menu.map((category) => (
          <div key={category.id}>
            <h3>{category.name}</h3>
            {category.dishes
              ?.filter((d) => d.isAvailable)
              .map((dish) => (
                <div key={dish.id}>
                  <span>
                    {dish.name} ¥{Number(dish.price).toFixed(2)}
                  </span>
                  <button type="button" onClick={() => addToCart(dish.id, -1)} disabled={!cart[dish.id]}>
                    −
                  </button>
                  <span>{cart[dish.id] ?? 0}</span>
                  <button type="button" onClick={() => addToCart(dish.id, 1)}>
                    +
                  </button>
                </div>
              ))}
          </div>
        ))}
      </section>

      <form onSubmit={submitOrder}>
        <h2>取餐方式</h2>
        <label>
          <input
            type="radio"
            checked={form.type === 'takeout'}
            onChange={() => setForm({ ...form, type: 'takeout' })}
          />
          到店自提
        </label>
        <label>
          <input
            type="radio"
            checked={form.type === 'delivery'}
            onChange={() => setForm({ ...form, type: 'delivery' })}
          />
          配送到家
        </label>

        <div>
          <input
            placeholder="联系电话"
            value={form.customerContact}
            onChange={(e) => setForm({ ...form, customerContact: e.target.value })}
          />
        </div>

        {form.type === 'delivery' && (
          <div>
            <input
              placeholder="配送地址"
              value={form.deliveryAddress}
              onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })}
            />
          </div>
        )}

        {form.type === 'takeout' && (
          <div>
            <input
              type="datetime-local"
              value={form.pickupTime}
              onChange={(e) => setForm({ ...form, pickupTime: e.target.value })}
            />
            <span>期望取餐时间（可选）</span>
          </div>
        )}

        <p>合计：¥{cartTotal.toFixed(2)}（到店/送达时付款）</p>

        <button type="submit" disabled={submitting}>
          提交订单
        </button>
      </form>

      <p>
        <a href="/track-order">查询已下的订单</a>
      </p>
    </div>
  );
}
