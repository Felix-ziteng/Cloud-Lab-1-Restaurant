import { useEffect, useRef, useState } from 'react';
import type { Dish, StoreConfig } from '@restaurant/shared-types';
import { useTableOrder } from '../hooks/useTableOrder';
import { RealtimeListener } from '../realtime/RealtimeContext';
import DishTasteTags from './DishTasteTags';
import DishModifierSheet from './DishModifierSheet';

const KITCHEN_STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  preparing: '制作中',
  done: '已完成',
};

function ImagePlaceholderIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(62% 0.1 40)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

// 桌台平板"长菜单模式"点餐视图：菜单多/自助餐适合——左侧竖排分类导航（滚动菜单时
// 自动跟着切换高亮）+ 菜品连续滚动 + 购物车收起成右下角悬浮气泡，点开才展开成抽屉。
// 逻辑全部来自 useTableOrder（跟 GuestOrderPage/TabletOrderingCompact 共用）。
export default function TabletOrderingBrowse({
  orderId,
  tokenKind,
  tableNumber,
  config,
}: {
  orderId: string;
  tokenKind: string;
  tableNumber: string;
  config?: StoreConfig | null;
}) {
  const {
    menu,
    activeCategoryId,
    setActiveCategoryId,
    order,
    cart,
    addToCart,
    decrementSimpleLine,
    updateLineQuantity,
    cartQuantityForDish,
    lineUnitPrice,
    submitCart,
    requestCheckout,
    cartTotal,
    error,
    busy,
    refreshOrder,
  } = useTableOrder({ orderId, tokenKind });

  const [cartOpen, setCartOpen] = useState(false);
  const [selectingDish, setSelectingDish] = useState<Dish | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 滚动菜单时，左侧分类导航自动跟着切换高亮（scrollspy）——观察每个分类区块，
  // 谁离滚动容器顶部最近就高亮谁；反过来点左侧分类，滚动到那个区块（见下面的 scrollToCategory）
  useEffect(() => {
    if (!menu.length || !scrollRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const nearestTop = visible.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b));
        const id = nearestTop.target.getAttribute('data-category-id');
        if (id) setActiveCategoryId(id);
      },
      { root: scrollRef.current, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

  function scrollToCategory(id: string) {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const cartItemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <>
      <RealtimeListener event="connect" onEvent={() => refreshOrder().catch(() => {})} />
      <RealtimeListener event="item_status_changed" onEvent={() => refreshOrder().catch(() => {})} />
      <RealtimeListener event="item_added" onEvent={() => refreshOrder().catch(() => {})} />
      <RealtimeListener event="order_paid" onEvent={() => refreshOrder().catch(() => {})} />
      <RealtimeListener event="order_cancelled" onEvent={() => refreshOrder().catch(() => {})} />

      <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[oklch(98%_0.006_40)] font-['Nunito_Sans',system-ui,sans-serif] text-[oklch(22%_0.01_30)]">
        <div className="flex items-baseline gap-3 bg-[oklch(60%_0.21_35)] px-8 py-3.5">
          <h1 className="font-['Baloo_2',system-ui,sans-serif] text-xl font-bold text-white">桌台 {tableNumber}</h1>
          <p className="text-[13px] text-white/85">欢迎光临，点好菜提交给厨房就好啦</p>
        </div>

        {!order ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-[oklch(50%_0.02_40)]">{error ?? '加载中…'}</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <div className="flex w-[220px] shrink-0 flex-col gap-1 overflow-y-auto bg-white p-3 shadow-[4px_0_20px_oklch(20%_0.02_30_/_0.06)]">
              {menu.map((category) => {
                const isActive = category.id === activeCategoryId;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => scrollToCategory(category.id)}
                    className={
                      isActive
                        ? 'rounded-2xl bg-[oklch(60%_0.21_35)] px-4 py-3.5 text-left text-[15px] font-bold text-white'
                        : 'rounded-2xl bg-transparent px-4 py-3.5 text-left text-[15px] font-semibold text-[oklch(45%_0.02_30)]'
                    }
                  >
                    {category.name}
                  </button>
                );
              })}
            </div>

            <div ref={scrollRef} className="flex flex-1 flex-col gap-4 overflow-y-auto px-7 py-6">
              {order.status === 'awaiting_payment' && (
                <div className="rounded-2xl bg-[oklch(93%_0.04_45)] px-4 py-2.5 text-sm text-[oklch(40%_0.1_40)]">已发起结账，请等待店员到桌结账</div>
              )}
              {order.status === 'cancelled' && (
                <div className="rounded-2xl bg-[oklch(93%_0.06_25)] px-4 py-2.5 text-sm text-[oklch(45%_0.18_25)]">该订单已被店员取消</div>
              )}

              {menu.map((category) => (
                <div
                  key={category.id}
                  ref={(el) => {
                    sectionRefs.current[category.id] = el;
                  }}
                  data-category-id={category.id}
                  className="flex flex-col gap-4"
                >
                  <h2 className="font-['Baloo_2',system-ui,sans-serif] text-xl font-bold text-[oklch(60%_0.21_35)]">{category.name}</h2>
                  <div className="grid grid-cols-4 gap-4">
                    {category.dishes?.map((dish) => {
                      const hasModifiers = dish.modifierGroups.length > 0;
                      const qty = cartQuantityForDish(dish.id);
                      return (
                        <div key={dish.id} className="flex flex-col gap-2 rounded-[18px] bg-white p-3.5 shadow-[0_2px_4px_oklch(20%_0.02_30_/_0.06),0_8px_20px_oklch(20%_0.02_30_/_0.08)]">
                          <div className="flex aspect-[16/10] items-center justify-center rounded-xl bg-[oklch(93%_0.04_45)]">
                            <ImagePlaceholderIcon />
                          </div>
                          <p className="text-sm font-bold">{dish.name}</p>
                          <DishTasteTags dish={dish} config={config ?? null} />
                          <div className="flex items-center justify-between">
                            <span className="font-['Baloo_2',system-ui,sans-serif] text-base font-bold text-[oklch(58%_0.2_35)]">¥{Number(dish.price).toFixed(2)}</span>
                            {!hasModifiers && qty > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <button type="button" onClick={() => decrementSimpleLine(dish.id)} className="flex size-8 items-center justify-center rounded-full bg-[oklch(94%_0.01_40)] text-base font-bold text-[oklch(45%_0.02_30)]">
                                  −
                                </button>
                                <span className="min-w-3 text-center text-sm font-bold">{qty}</span>
                                <button type="button" onClick={() => addToCart(dish.id)} className="flex size-8 items-center justify-center rounded-full bg-[oklch(60%_0.21_35)] text-base font-bold text-white">
                                  +
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                {hasModifiers && qty > 0 && (
                                  <span className="text-xs font-bold text-[oklch(55%_0.02_30)]">已加 {qty} 份</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => (hasModifiers ? setSelectingDish(dish) : addToCart(dish.id))}
                                  className="rounded-full bg-[oklch(90%_0.05_45)] px-3.5 py-1.5 text-xs font-bold text-[oklch(45%_0.18_35)]"
                                >
                                  {hasModifiers ? '选规格' : '加入'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {order && (cartItemCount > 0 || order.items.length > 0) && !cartOpen && (
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="absolute bottom-6 right-7 flex items-center gap-3 rounded-full bg-[oklch(18%_0.01_30)] px-5.5 py-3.5 shadow-[0_8px_24px_oklch(20%_0.02_30_/_0.25)]"
          >
            <CartIcon />
            <span className="text-[15px] font-bold text-white">
              {cartItemCount > 0 ? `已选 ${cartItemCount} 件 · ¥${cartTotal.toFixed(2)}` : '查看已点菜品'}
            </span>
          </button>
        )}

        {order && cartOpen && (
          <>
            <div className="absolute inset-0 bg-[oklch(20%_0.02_30_/_0.35)]" onClick={() => setCartOpen(false)} />
            <div className="absolute bottom-6 right-7 flex max-h-[calc(100%-3rem)] w-[400px] flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_8px_32px_oklch(20%_0.02_30_/_0.22)]">
              <div className="flex shrink-0 items-center justify-between px-6 pb-4 pt-6">
                <p className="font-['Baloo_2',system-ui,sans-serif] text-lg font-bold">已点菜品</p>
                <button type="button" onClick={() => setCartOpen(false)} className="flex size-8 items-center justify-center rounded-full bg-[oklch(94%_0.01_40)] text-base text-[oklch(45%_0.02_30)]">
                  ×
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">
                <div className="flex flex-col gap-4">
                  {cart.length === 0 ? (
                    <p className="text-sm text-[oklch(55%_0.02_30)]">还没有点菜</p>
                  ) : (
                    cart.map((line) => {
                      const dish = menu.flatMap((c) => c.dishes).find((d) => d.id === line.dishId);
                      if (!dish) return null;
                      const optionLabels = dish.modifierGroups
                        .flatMap((g) => g.options)
                        .filter((o) => line.selectedOptionIds.includes(o.id))
                        .map((o) => o.label);
                      return (
                        <div key={line.lineId} className="flex items-center gap-3">
                          <div className="flex size-13 shrink-0 items-center justify-center rounded-2xl bg-[oklch(93%_0.04_45)]">
                            <ImagePlaceholderIcon />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold">{dish.name}</p>
                            {optionLabels.length > 0 && (
                              <p className="text-xs text-[oklch(55%_0.02_30)]">{optionLabels.join(' · ')}</p>
                            )}
                            <p className="text-xs text-[oklch(50%_0.02_40)]">¥{lineUnitPrice(line).toFixed(2)} × {line.quantity}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => updateLineQuantity(line.lineId, -1)} className="flex size-[42px] items-center justify-center rounded-full bg-[oklch(94%_0.01_40)] text-lg font-bold text-[oklch(45%_0.02_30)]">
                              −
                            </button>
                            <span className="min-w-3 text-center text-sm font-bold">{line.quantity}</span>
                            <button type="button" onClick={() => updateLineQuantity(line.lineId, 1)} className="flex size-[42px] items-center justify-center rounded-full bg-[oklch(60%_0.21_35)] text-lg font-bold text-white">
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {order.items.length > 0 && (
                    <>
                      <div className="h-px bg-[oklch(92%_0.01_40)]" />
                      <p className="text-sm font-bold text-[oklch(45%_0.02_30)]">本桌已点</p>
                      {order.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                          <div>
                            <span>{item.dishNameSnapshot} × {item.quantity}</span>
                            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                              <p className="text-xs text-[oklch(55%_0.02_30)]">
                                {item.selectedModifiers.map((m) => m.optionLabel).join(' · ')}
                              </p>
                            )}
                          </div>
                          <span className="text-[oklch(50%_0.02_40)]">
                            {item.roundNumber === 0 ? '未提交' : KITCHEN_STATUS_LABEL[item.kitchenStatus]}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              <div className="shrink-0 px-6 pb-6 pt-4">
                <div className="mb-4 h-px bg-[oklch(92%_0.01_40)]" />

                <div className="mb-4.5 flex items-center justify-between">
                  <span className="text-sm font-bold text-[oklch(50%_0.02_40)]">合计</span>
                  <span className="font-['Baloo_2',system-ui,sans-serif] text-2xl font-bold">¥{cartTotal.toFixed(2)}</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    submitCart();
                    setCartOpen(false);
                  }}
                  disabled={busy || cart.length === 0}
                  className="w-full rounded-full bg-[oklch(18%_0.01_30)] p-4.5 text-center text-[17px] font-bold text-white disabled:opacity-50"
                >
                  提交给厨房
                </button>

                {order.status === 'open' && order.items.some((i) => i.roundNumber > 0) && (
                  <button
                    type="button"
                    onClick={requestCheckout}
                    disabled={busy}
                    className="mt-3 w-full rounded-full border-2 border-[oklch(60%_0.21_35)] py-2.5 text-sm font-bold text-[oklch(50%_0.2_35)] disabled:opacity-50"
                  >
                    结账
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

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
    </>
  );
}
