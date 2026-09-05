import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Dish, StoreConfig } from '@restaurant/shared-types';
import { api, setToken } from '../api/client';
import { RealtimeProvider, RealtimeListener } from '../realtime/RealtimeContext';
import { useTableOrder } from '../hooks/useTableOrder';
import { Badge } from '@/components/ui/badge';
import DishTasteTags from '../components/DishTasteTags';
import DishModifierSheet from '../components/DishModifierSheet';

const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: 'bg-status-pending text-status-pending-foreground',
  preparing: 'bg-status-preparing text-status-preparing-foreground',
  done: 'bg-status-done text-status-done-foreground',
};

const KITCHEN_STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  preparing: '制作中',
  done: '已完成',
};

// 图片占位图标：菜品还没有真实图片素材时的通用占位，不用 emoji
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

// 顾客扫码 / 桌台平板共用的点餐页（见 ARCHITECTURE.md 2.4：两者是同一套代码、同一权限）
// 视觉方向：活力原生 App 风（高饱和橙红 + 圆角卡片，2026-08-20 跟用户对比三个方向后选定，
// 见 design 稿）——这一页用自己专属的字体/配色（index.html 里的 Baloo 2 + Nunito Sans，
// 以及这里直接写死的 oklch 值），不跟 index.css 里门店级的 modern/warm 主题 token 走同一套，
// 因为这套视觉是专门给顾客点餐页选的固定方向，不是要新增第三个可切换的门店主题
//
// 这里只管"扫码怎么拿到 orderId/token"，拿到之后菜单/购物车/下单这些逻辑都在
// useTableOrder 里——桌台平板的点餐视图（TabletOrderingCompact/Browse）是另一种
// "怎么拿到 orderId" 的方式（选桌+密码），共用同一个 hook
export default function GuestOrderPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const tokenKind = `guest:${tableId}`;

  const [orderId, setOrderId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [config, setConfig] = useState<StoreConfig | null>(null);
  const [selectingDish, setSelectingDish] = useState<Dish | null>(null);
  // StrictMode 开发模式下同一个 effect 会故意触发两次；join 不是纯读操作（会在桌台空闲时建会话），
  // 这个 ref 保证一次页面访问只真正 join 一次，不产生两个 token 互相覆盖 localStorage 的问题
  const joinedRef = useRef(false);

  useEffect(() => {
    if (!tableId || joinedRef.current) return;
    joinedRef.current = true;

    async function join() {
      try {
        const joinRes = await api.post<{ sessionToken: string; orderId: string; tableNumber: string }>(
          `/table-sessions/${tableId}/join`,
          {},
        );
        setToken(tokenKind, joinRes.sessionToken);
        setOrderId(joinRes.orderId);
        setTableNumber(joinRes.tableNumber);
      } catch (err) {
        if (err instanceof Error && err.message.includes('table_pending_clear')) {
          setJoinError('请稍等，服务员正在清台');
        } else {
          setJoinError('加载失败，请稍后重试');
        }
      }
    }

    join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  useEffect(() => {
    api.get<StoreConfig>('/store-config').then(setConfig).catch(() => {});
  }, []);

  const {
    menu,
    activeCategory,
    setActiveCategoryId,
    order,
    cart,
    addToCart,
    decrementSimpleLine,
    cartQuantityForDish,
    submitCart,
    requestCheckout,
    cartTotal,
    error,
    busy,
    refreshOrder,
  } = useTableOrder({ orderId, tokenKind });

  const displayError = joinError ?? error;

  if (displayError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[oklch(98%_0.006_40)] p-6 font-['Nunito_Sans',system-ui,sans-serif]">
        <p className="text-sm text-[oklch(45%_0.02_30)]">{displayError}</p>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[oklch(98%_0.006_40)] p-6 font-['Nunito_Sans',system-ui,sans-serif]">
        <p className="text-sm text-[oklch(45%_0.02_30)]">加载中…</p>
      </div>
    );
  }

  return (
    <RealtimeProvider tokenKind={tokenKind}>
      <RealtimeListener event="connect" onEvent={() => refreshOrder().catch(() => {})} />
      <RealtimeListener event="item_status_changed" onEvent={() => refreshOrder().catch(() => {})} />
      <RealtimeListener event="item_added" onEvent={() => refreshOrder().catch(() => {})} />
      <RealtimeListener event="order_paid" onEvent={() => refreshOrder().catch(() => {})} />
      <RealtimeListener event="order_cancelled" onEvent={() => refreshOrder().catch(() => {})} />
      <div className="min-h-screen bg-[oklch(98%_0.006_40)] pb-32 font-['Nunito_Sans',system-ui,sans-serif] text-[oklch(22%_0.01_30)]">
        <div className="mx-auto max-w-md">
          <div className="flex items-baseline gap-2.5 rounded-b-[18px] bg-[oklch(60%_0.21_35)] px-5 pb-3 pt-3.5">
            <h1 className="whitespace-nowrap font-['Baloo_2',system-ui,sans-serif] text-lg font-bold text-white">
              桌台 {tableNumber ?? ''}
            </h1>
            <p className="truncate text-xs text-white/85">欢迎光临，点好菜提交给厨房就好啦</p>
          </div>

          <div className="flex flex-col gap-4 px-5 pt-4">
            {order.status === 'awaiting_payment' && (
              <div className="rounded-2xl bg-[oklch(93%_0.04_45)] px-4 py-2.5 text-sm text-[oklch(40%_0.1_40)]">
                已发起结账，请等待店员到桌结账
              </div>
            )}
            {order.status === 'cancelled' && (
              <div className="rounded-2xl bg-[oklch(93%_0.06_25)] px-4 py-2.5 text-sm text-[oklch(45%_0.18_25)]">
                该订单已被店员取消
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
              {activeCategory?.dishes?.map((dish) => {
                const hasModifiers = dish.modifierGroups.length > 0;
                const qty = cartQuantityForDish(dish.id);
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
                      {!hasModifiers && qty > 0 && (
                        <button
                          type="button"
                          onClick={() => decrementSimpleLine(dish.id)}
                          className="flex size-7 items-center justify-center rounded-full bg-[oklch(94%_0.01_40)] text-base font-bold text-[oklch(45%_0.02_30)]"
                        >
                          −
                        </button>
                      )}
                      {!hasModifiers && qty > 0 && <span className="min-w-3.5 text-center text-sm font-bold">{qty}</span>}
                      {hasModifiers && qty > 0 && (
                        <span className="text-xs font-bold text-[oklch(55%_0.02_30)]">已加 {qty} 份</span>
                      )}
                      {!hasModifiers && qty > 0 ? (
                        <button
                          type="button"
                          onClick={() => addToCart(dish.id)}
                          className="flex size-7 items-center justify-center rounded-full bg-[oklch(60%_0.21_35)] text-base font-bold text-white"
                        >
                          +
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => (hasModifiers ? setSelectingDish(dish) : addToCart(dish.id))}
                          className="rounded-full bg-[oklch(90%_0.05_45)] px-4 py-1.5 text-[13px] font-bold text-[oklch(45%_0.18_35)]"
                        >
                          {hasModifiers ? '选规格' : '加入'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 border-t border-[oklch(90%_0.01_40)] pt-4">
              <h2 className="text-sm font-bold text-[oklch(45%_0.02_30)]">本桌已点</h2>
              {order.items.length === 0 ? (
                <p className="text-sm text-[oklch(55%_0.02_30)]">还没有点菜</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <span>
                          {item.dishNameSnapshot} × {item.quantity}
                        </span>
                        {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                          <p className="text-xs text-[oklch(55%_0.02_30)]">
                            {item.selectedModifiers.map((m) => m.optionLabel).join(' · ')}
                          </p>
                        )}
                      </div>
                      {item.roundNumber === 0 ? (
                        <Badge variant="secondary">未提交</Badge>
                      ) : (
                        <Badge className={STATUS_BADGE_CLASS[item.kitchenStatus]}>
                          {KITCHEN_STATUS_LABEL[item.kitchenStatus]}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between pt-1 text-sm font-bold">
                <span>合计</span>
                <span>¥{Number(order.total).toFixed(2)}</span>
              </div>
            </div>

            {order.status === 'open' && order.items.some((i) => i.roundNumber > 0) && (
              <button
                type="button"
                onClick={requestCheckout}
                disabled={busy}
                className="rounded-full border-2 border-[oklch(60%_0.21_35)] py-2.5 text-sm font-bold text-[oklch(50%_0.2_35)] disabled:opacity-50"
              >
                结账
              </button>
            )}
          </div>
        </div>

        {cart.length > 0 && (
          <div className="fixed inset-x-0 bottom-0 rounded-t-[24px] bg-[oklch(18%_0.01_30)] px-5 py-4">
            <div className="mx-auto flex max-w-md items-center justify-between gap-4">
              <div>
                <div className="text-xs text-white/60">待提交</div>
                <div className="font-['Baloo_2',system-ui,sans-serif] text-lg font-bold text-white">
                  ¥{cartTotal.toFixed(2)}
                </div>
              </div>
              <button
                type="button"
                onClick={submitCart}
                disabled={busy}
                className="rounded-full bg-[oklch(60%_0.21_35)] px-7 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                提交给厨房
              </button>
            </div>
          </div>
        )}

        {selectingDish && (
          <DishModifierSheet
            dish={selectingDish}
            onCancel={() => setSelectingDish(null)}
            onConfirm={(selectedOptionIds) => {
              addToCart(selectingDish.id, selectedOptionIds);
              setSelectingDish(null);
            }}
          />
        )}
      </div>
    </RealtimeProvider>
  );
}
