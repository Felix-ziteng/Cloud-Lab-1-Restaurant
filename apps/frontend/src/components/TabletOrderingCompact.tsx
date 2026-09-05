import { useState } from 'react';
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

const KITCHEN_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-[oklch(93%_0.02_50)] text-[oklch(45%_0.03_45)]',
  preparing: 'bg-[oklch(88%_0.09_70)] text-[oklch(42%_0.12_60)]',
  done: 'bg-[oklch(89%_0.08_145)] text-[oklch(40%_0.1_145)]',
};

function ImagePlaceholderIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(62% 0.1 40)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

// 桌台平板"紧凑模式"点餐视图：菜单少的店适合——分类 Tab + 菜品网格 + 右侧常驻购物车栏。
// 逻辑全部来自 useTableOrder（跟 GuestOrderPage 共用），这里只管横屏布局。
export default function TabletOrderingCompact({
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
    activeCategory,
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
  const [selectingDish, setSelectingDish] = useState<Dish | null>(null);

  return (
    <>
      <RealtimeListener event="connect" onEvent={() => refreshOrder().catch(() => {})} />
      <RealtimeListener event="item_status_changed" onEvent={() => refreshOrder().catch(() => {})} />
      <RealtimeListener event="item_added" onEvent={() => refreshOrder().catch(() => {})} />
      <RealtimeListener event="order_paid" onEvent={() => refreshOrder().catch(() => {})} />
      <RealtimeListener event="order_cancelled" onEvent={() => refreshOrder().catch(() => {})} />

      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[oklch(98%_0.006_40)] font-['Nunito_Sans',system-ui,sans-serif] text-[oklch(22%_0.01_30)]">
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
            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-8 py-6">
              {order.status === 'awaiting_payment' && (
                <div className="rounded-2xl bg-[oklch(93%_0.04_45)] px-4 py-2.5 text-sm text-[oklch(40%_0.1_40)]">已发起结账，请等待店员到桌结账</div>
              )}
              {order.status === 'cancelled' && (
                <div className="rounded-2xl bg-[oklch(93%_0.06_25)] px-4 py-2.5 text-sm text-[oklch(45%_0.18_25)]">该订单已被店员取消</div>
              )}

              <div className="flex gap-3">
                {menu.map((category) => {
                  const isActive = category.id === activeCategory?.id;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setActiveCategoryId(category.id)}
                      className={
                        isActive
                          ? 'rounded-full bg-[oklch(60%_0.21_35)] px-6 py-2.5 text-[15px] font-bold text-white'
                          : 'rounded-full bg-[oklch(94%_0.01_40)] px-6 py-2.5 text-[15px] font-semibold text-[oklch(45%_0.02_30)]'
                      }
                    >
                      {category.name}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-5">
                {activeCategory?.dishes?.map((dish) => {
                  const hasModifiers = dish.modifierGroups.length > 0;
                  const qty = cartQuantityForDish(dish.id);
                  return (
                    <div key={dish.id} className="flex flex-col gap-3 rounded-[20px] bg-white p-4.5 shadow-[0_2px_4px_oklch(20%_0.02_30_/_0.06),0_8px_20px_oklch(20%_0.02_30_/_0.08)]">
                      <div className="flex aspect-[16/10] items-center justify-center rounded-[14px] bg-[oklch(93%_0.04_45)]">
                        <ImagePlaceholderIcon />
                      </div>
                      <div>
                        <p className="mb-1.5 text-[15px] font-bold">{dish.name}</p>
                        {dish.description && (
                          <span className="inline-block rounded-full bg-[oklch(88%_0.1_150)] px-2.5 py-0.5 text-[11px] font-bold text-[oklch(35%_0.1_150)]">
                            {dish.description}
                          </span>
                        )}
                        <DishTasteTags dish={dish} config={config ?? null} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-['Baloo_2',system-ui,sans-serif] text-[17px] font-bold text-[oklch(58%_0.2_35)]">¥{Number(dish.price).toFixed(2)}</span>
                        {!hasModifiers && qty > 0 ? (
                          <div className="flex items-center gap-2.5">
                            <button type="button" onClick={() => decrementSimpleLine(dish.id)} className="flex size-[42px] items-center justify-center rounded-full bg-[oklch(94%_0.01_40)] text-lg font-bold text-[oklch(45%_0.02_30)]">
                              −
                            </button>
                            <span className="min-w-3.5 text-center text-base font-bold">{qty}</span>
                            <button type="button" onClick={() => addToCart(dish.id)} className="flex size-[42px] items-center justify-center rounded-full bg-[oklch(60%_0.21_35)] text-lg font-bold text-white">
                              +
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            {hasModifiers && qty > 0 && (
                              <span className="text-sm font-bold text-[oklch(55%_0.02_30)]">已加 {qty} 份</span>
                            )}
                            <button
                              type="button"
                              onClick={() => (hasModifiers ? setSelectingDish(dish) : addToCart(dish.id))}
                              className="rounded-full bg-[oklch(90%_0.05_45)] px-5 py-2 text-sm font-bold text-[oklch(45%_0.18_35)]"
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

            <div className="flex w-[360px] shrink-0 flex-col overflow-y-auto p-6 shadow-[-4px_0_20px_oklch(20%_0.02_30_/_0.06)]">
              <p className="mb-4 font-['Baloo_2',system-ui,sans-serif] text-lg font-bold">购物车</p>

              <div className="flex flex-col gap-3.5">
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
                      <div key={line.lineId} className="flex items-center justify-between gap-2 text-sm">
                        <div>
                          <p className="font-bold">{dish.name}</p>
                          {optionLabels.length > 0 && (
                            <p className="text-xs text-[oklch(55%_0.02_30)]">{optionLabels.join(' · ')}</p>
                          )}
                          <div className="flex items-center gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={() => updateLineQuantity(line.lineId, -1)}
                              className="flex size-6 items-center justify-center rounded-full bg-[oklch(94%_0.01_40)] text-sm font-bold text-[oklch(45%_0.02_30)]"
                            >
                              −
                            </button>
                            <span className="min-w-3 text-center text-[oklch(50%_0.02_40)]">× {line.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateLineQuantity(line.lineId, 1)}
                              className="flex size-6 items-center justify-center rounded-full bg-[oklch(60%_0.21_35)] text-sm font-bold text-white"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <span className="font-bold text-[oklch(58%_0.2_35)]">
                          ¥{(lineUnitPrice(line) * line.quantity).toFixed(2)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="h-px bg-[oklch(92%_0.01_40)] my-4" />

              <div className="mb-4.5 flex items-center justify-between">
                <span className="text-sm font-bold text-[oklch(50%_0.02_40)]">合计</span>
                <span className="font-['Baloo_2',system-ui,sans-serif] text-2xl font-bold">¥{cartTotal.toFixed(2)}</span>
              </div>

              <button
                type="button"
                onClick={submitCart}
                disabled={busy || cart.length === 0}
                className="rounded-full bg-[oklch(18%_0.01_30)] p-4.5 text-center text-[17px] font-bold text-white disabled:opacity-50"
              >
                提交给厨房
              </button>

              {order.items.length > 0 && (
                <>
                  <div className="h-px bg-[oklch(92%_0.01_40)] my-4" />
                  <p className="mb-3 text-sm font-bold text-[oklch(45%_0.02_30)]">本桌已点</p>
                  <div className="flex flex-col gap-2">
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
                        {item.roundNumber > 0 ? (
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${KITCHEN_STATUS_CLASS[item.kitchenStatus]}`}>
                            {KITCHEN_STATUS_LABEL[item.kitchenStatus]}
                          </span>
                        ) : (
                          <span className="rounded-full bg-[oklch(94%_0.01_40)] px-2.5 py-0.5 text-xs font-bold text-[oklch(45%_0.02_30)]">未提交</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {order.status === 'open' && order.items.some((i) => i.roundNumber > 0) && (
                    <button
                      type="button"
                      onClick={requestCheckout}
                      disabled={busy}
                      className="mt-4 rounded-full border-2 border-[oklch(60%_0.21_35)] py-2.5 text-sm font-bold text-[oklch(50%_0.2_35)] disabled:opacity-50"
                    >
                      结账
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
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
