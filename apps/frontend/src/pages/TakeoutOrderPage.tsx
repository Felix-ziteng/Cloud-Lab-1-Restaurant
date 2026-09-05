import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GuestOrderCreated, MenuCategory, StoreConfig } from '@restaurant/shared-types';
import { api, setToken } from '../api/client';
import DishTasteTags from '../components/DishTasteTags';

// 图片占位图标：菜品还没有真实图片素材时的通用占位，不用 emoji（跟 GuestOrderPage 共用同一个画法，
// 保持顾客侧两个点餐入口视觉一致——这里没有拆成共享组件，两处各画一份，图标本身极简，重复成本很低）
function ImagePlaceholderIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="oklch(62% 0.1 40)"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

const INPUT_CLASS =
  'w-full rounded-2xl border border-[oklch(90%_0.01_40)] bg-white px-4 py-3 text-sm text-[oklch(22%_0.01_30)] outline-none placeholder:text-[oklch(60%_0.02_40)] focus:border-[oklch(60%_0.21_35)]';

// 外卖/自提顾客自助下单：不需要登录，浏览菜单 -> 加购物车 -> 填联系方式一次性提交。
// 跟堂食的"加购物车 -> 提交给厨房"两步式不一样：这里没有"回头继续点"的场景，
// 提交即建单，建单成功就直接推厨房（见 OrdersService.createStandaloneOrder）
//
// 视觉方向：跟 GuestOrderPage 同一套"活力原生 App 风"（2026-08-20 选定，见 design 稿），
// 顾客侧两个点餐入口保持视觉一致，不跟门店的 modern/warm 主题 token 走
export default function TakeoutOrderPage() {
  const navigate = useNavigate();
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
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
    api
      .get<MenuCategory[]>('/menu')
      .then((categories) => {
        setMenu(categories);
        setActiveCategoryId(categories[0]?.id ?? null);
      })
      .catch(() => setError('菜单加载失败，请刷新重试'));
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
      <div className="flex min-h-screen items-center justify-center bg-[oklch(98%_0.006_40)] p-6 font-['Nunito_Sans',system-ui,sans-serif]">
        <div className="mx-auto max-w-sm text-center">
          <h1 className="font-['Baloo_2',system-ui,sans-serif] text-lg font-bold text-[oklch(22%_0.01_30)]">
            外卖 / 自提点餐
          </h1>
          <p className="mt-2 text-sm text-[oklch(50%_0.02_40)]">
            该门店暂未开放外卖/自提自助下单，请到店点餐或联系店员代下单。
          </p>
        </div>
      </div>
    );
  }

  const activeCategory = menu.find((c) => c.id === activeCategoryId) ?? menu[0];

  return (
    <form
      onSubmit={submitOrder}
      className="min-h-screen bg-[oklch(98%_0.006_40)] pb-32 font-['Nunito_Sans',system-ui,sans-serif] text-[oklch(22%_0.01_30)]"
    >
      <div className="mx-auto max-w-md">
        <div className="rounded-b-[18px] bg-[oklch(60%_0.21_35)] px-5 pb-3 pt-3.5">
          <h1 className="font-['Baloo_2',system-ui,sans-serif] text-lg font-bold text-white">外卖 / 自提点餐</h1>
          <p className="text-xs text-white/85">选好菜、填好联系方式就能下单</p>
        </div>

        <div className="flex flex-col gap-4 px-5 pt-4">
          {error && (
            <div className="rounded-2xl bg-[oklch(93%_0.06_25)] px-4 py-2.5 text-sm text-[oklch(45%_0.18_25)]">
              {error}
            </div>
          )}

          <div className="flex gap-2.5 overflow-x-auto">
            {menu.map((category) => {
              const isActive = category.id === activeCategory?.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategoryId(category.id)}
                  className={
                    isActive
                      ? 'shrink-0 whitespace-nowrap rounded-full bg-[oklch(60%_0.21_35)] px-5 py-2 text-sm font-bold text-white'
                      : 'shrink-0 whitespace-nowrap rounded-full bg-[oklch(94%_0.01_40)] px-5 py-2 text-sm font-semibold text-[oklch(45%_0.02_30)]'
                  }
                >
                  {category.name}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3.5">
            {activeCategory?.dishes
              ?.filter((d) => d.isAvailable)
              .map((dish) => {
                const qty = cart[dish.id] ?? 0;
                return (
                  <div
                    key={dish.id}
                    className="flex items-center gap-3.5 rounded-[20px] bg-white p-3.5 shadow-[0_2px_4px_oklch(20%_0.02_30_/_0.06),0_8px_20px_oklch(20%_0.02_30_/_0.08)]"
                  >
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-[oklch(93%_0.04_45)]">
                      <ImagePlaceholderIcon />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-sm font-bold">{dish.name}</p>
                      {dish.description && (
                        <span className="mb-1 inline-block rounded-full bg-[oklch(88%_0.1_150)] px-2.5 py-0.5 text-[11px] font-bold text-[oklch(35%_0.1_150)]">
                          {dish.description}
                        </span>
                      )}
                      <DishTasteTags dish={dish} config={config} />
                      <div className="mt-1 font-['Baloo_2',system-ui,sans-serif] text-[17px] font-bold text-[oklch(58%_0.2_35)]">
                        ¥{Number(dish.price).toFixed(2)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {qty > 0 && (
                        <button
                          type="button"
                          onClick={() => addToCart(dish.id, -1)}
                          className="flex size-7 items-center justify-center rounded-full bg-[oklch(94%_0.01_40)] text-base font-bold text-[oklch(45%_0.02_30)]"
                        >
                          −
                        </button>
                      )}
                      {qty > 0 && <span className="min-w-3.5 text-center text-sm font-bold">{qty}</span>}
                      {qty > 0 ? (
                        <button
                          type="button"
                          onClick={() => addToCart(dish.id, 1)}
                          className="flex size-7 items-center justify-center rounded-full bg-[oklch(60%_0.21_35)] text-base font-bold text-white"
                        >
                          +
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToCart(dish.id, 1)}
                          className="rounded-full bg-[oklch(90%_0.05_45)] px-4 py-1.5 text-[13px] font-bold text-[oklch(45%_0.18_35)]"
                        >
                          加入
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="flex flex-col gap-3 border-t border-[oklch(90%_0.01_40)] pt-4">
            <h2 className="text-sm font-bold text-[oklch(45%_0.02_30)]">取餐方式</h2>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setForm({ ...form, type: 'takeout' })}
                className={
                  form.type === 'takeout'
                    ? 'flex-1 rounded-full bg-[oklch(60%_0.21_35)] py-2.5 text-sm font-bold text-white'
                    : 'flex-1 rounded-full bg-[oklch(94%_0.01_40)] py-2.5 text-sm font-semibold text-[oklch(45%_0.02_30)]'
                }
              >
                到店自提
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, type: 'delivery' })}
                className={
                  form.type === 'delivery'
                    ? 'flex-1 rounded-full bg-[oklch(60%_0.21_35)] py-2.5 text-sm font-bold text-white'
                    : 'flex-1 rounded-full bg-[oklch(94%_0.01_40)] py-2.5 text-sm font-semibold text-[oklch(45%_0.02_30)]'
                }
              >
                配送到家
              </button>
            </div>

            <input
              placeholder="联系电话"
              value={form.customerContact}
              onChange={(e) => setForm({ ...form, customerContact: e.target.value })}
              className={INPUT_CLASS}
            />

            {form.type === 'delivery' && (
              <input
                placeholder="配送地址"
                value={form.deliveryAddress}
                onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })}
                className={INPUT_CLASS}
              />
            )}

            {form.type === 'takeout' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pickup-time" className="text-xs text-[oklch(50%_0.02_40)]">
                  期望取餐时间（可选）
                </label>
                <input
                  id="pickup-time"
                  type="datetime-local"
                  value={form.pickupTime}
                  onChange={(e) => setForm({ ...form, pickupTime: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
            )}
          </div>

          <p className="text-center text-sm text-[oklch(50%_0.02_40)]">
            <a href="/track-order" className="font-semibold text-[oklch(50%_0.2_35)] underline underline-offset-2">
              查询已下的订单
            </a>
          </p>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 rounded-t-[24px] bg-[oklch(18%_0.01_30)] px-5 py-4">
        <div className="mx-auto flex max-w-md items-center justify-between gap-4">
          <div>
            <div className="text-xs text-white/60">合计（到店/送达时付款）</div>
            <div className="font-['Baloo_2',system-ui,sans-serif] text-lg font-bold text-white">
              ¥{cartTotal.toFixed(2)}
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-[oklch(60%_0.21_35)] px-7 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            提交订单
          </button>
        </div>
      </div>
    </form>
  );
}
