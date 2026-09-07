import { useEffect, useRef, useState } from 'react';
import type { Dish, StoreConfig } from '@restaurant/shared-types';
import { assetUrl } from '../api/client';
import { useTableOrder } from '../hooks/useTableOrder';
import { RealtimeListener } from '../realtime/RealtimeContext';
import DishTasteTags from './DishTasteTags';
import DishModifierSheet from './DishModifierSheet';
import TableQrModal from './TableQrModal';

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

function QrIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z" />
    </svg>
  );
}

// 桌台平板"紧凑模式"点餐视图：菜单少的店适合——分类 Tab + 菜品网格 + 右侧常驻购物车栏。
// 逻辑全部来自 useTableOrder（跟 GuestOrderPage 共用），这里只管横屏布局。
export default function TabletOrderingCompact({
  orderId,
  tokenKind,
  tableId,
  tableNumber,
  config,
}: {
  orderId: string;
  tokenKind: string;
  tableId: string;
  tableNumber: string;
  config?: StoreConfig | null;
}) {
  const {
    menu,
    activeCategory,
    setActiveCategoryId,
    order,
    cartItems,
    orderedItems,
    addToCart,
    decrementSimpleLine,
    updateLineQuantity,
    cartQuantityForDish,
    submitCart,
    requestCheckout,
    cartTotal,
    flashItemIds,
    error,
    busy,
    refreshOrder,
  } = useTableOrder({ orderId, tokenKind });
  const [selectingDish, setSelectingDish] = useState<Dish | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  // 购物车（还没提交）和本桌已点（已提交给厨房）分 Tab 展示，不再堆在同一个列表里。
  // 默认选中哪个 Tab：购物车里有东西就优先看购物车；购物车是空的但已经点过菜，
  // 就默认打开"本桌已点"，别让人以为这桌什么都没点——这个默认值只在 order 第一次
  // 加载完成时算一次，之后用户自己点了别的 Tab 就不再被这个逻辑改回去
  const [activeTab, setActiveTab] = useState<'cart' | 'ordered'>('cart');
  const initialTabSet = useRef(false);
  useEffect(() => {
    if (initialTabSet.current || !order) return;
    initialTabSet.current = true;
    if (cartItems.length === 0 && orderedItems.length > 0) setActiveTab('ordered');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

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
          <p className="flex-1 text-[13px] text-white/85">欢迎光临，点好菜提交给厨房就好啦</p>
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15"
            title="扫码点餐"
          >
            <QrIcon />
          </button>
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
                      <div className="flex aspect-[16/10] items-center justify-center overflow-hidden rounded-[14px] bg-[oklch(93%_0.04_45)]">
                        {dish.imageUrl ? (
                          <img src={assetUrl(dish.imageUrl)} alt="" className="size-full object-cover" />
                        ) : (
                          <ImagePlaceholderIcon />
                        )}
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
              <div className="mb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('cart')}
                  className={
                    activeTab === 'cart'
                      ? "rounded-full bg-[oklch(60%_0.21_35)] px-4 py-2 font-['Baloo_2',system-ui,sans-serif] text-[15px] font-bold text-white"
                      : "rounded-full bg-[oklch(94%_0.01_40)] px-4 py-2 font-['Baloo_2',system-ui,sans-serif] text-[15px] font-bold text-[oklch(45%_0.02_30)]"
                  }
                >
                  购物车 ({cartItems.reduce((s, i) => s + i.quantity, 0)})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ordered')}
                  className={
                    activeTab === 'ordered'
                      ? "rounded-full bg-[oklch(60%_0.21_35)] px-4 py-2 font-['Baloo_2',system-ui,sans-serif] text-[15px] font-bold text-white"
                      : "rounded-full bg-[oklch(94%_0.01_40)] px-4 py-2 font-['Baloo_2',system-ui,sans-serif] text-[15px] font-bold text-[oklch(45%_0.02_30)]"
                  }
                >
                  本桌已点 ({orderedItems.length})
                </button>
              </div>

              {activeTab === 'cart' ? (
                <>
                  <div className="flex flex-col gap-3.5">
                    {cartItems.length === 0 ? (
                      <p className="text-sm text-[oklch(55%_0.02_30)]">还没有点菜</p>
                    ) : (
                      cartItems.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-sm transition-colors duration-700 ${
                            flashItemIds.has(item.id) ? 'bg-[oklch(88%_0.1_150)]' : 'bg-transparent'
                          }`}
                        >
                          <div>
                            <p className="font-bold">{item.dishNameSnapshot}</p>
                            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                              <p className="text-xs text-[oklch(55%_0.02_30)]">
                                {item.selectedModifiers.map((m) => m.optionLabel).join(' · ')}
                              </p>
                            )}
                            <div className="flex items-center gap-2 pt-0.5">
                              <button
                                type="button"
                                onClick={() => updateLineQuantity(item.id, -1)}
                                className="flex size-6 items-center justify-center rounded-full bg-[oklch(94%_0.01_40)] text-sm font-bold text-[oklch(45%_0.02_30)]"
                              >
                                −
                              </button>
                              <span className="min-w-3 text-center text-[oklch(50%_0.02_40)]">× {item.quantity}</span>
                              <button
                                type="button"
                                onClick={() => updateLineQuantity(item.id, 1)}
                                className="flex size-6 items-center justify-center rounded-full bg-[oklch(60%_0.21_35)] text-sm font-bold text-white"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <span className="font-bold text-[oklch(58%_0.2_35)]">
                            ¥{(Number(item.unitPriceSnapshot) * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      ))
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
                    disabled={busy || cartItems.length === 0}
                    className="rounded-full bg-[oklch(18%_0.01_30)] p-4.5 text-center text-[17px] font-bold text-white disabled:opacity-50"
                  >
                    提交给厨房
                  </button>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    {orderedItems.length === 0 ? (
                      <p className="text-sm text-[oklch(55%_0.02_30)]">这桌还没有已提交的菜</p>
                    ) : (
                      orderedItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                          <div>
                            <span>{item.dishNameSnapshot} × {item.quantity}</span>
                            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                              <p className="text-xs text-[oklch(55%_0.02_30)]">
                                {item.selectedModifiers.map((m) => m.optionLabel).join(' · ')}
                              </p>
                            )}
                          </div>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${KITCHEN_STATUS_CLASS[item.kitchenStatus]}`}>
                            {KITCHEN_STATUS_LABEL[item.kitchenStatus]}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="h-px bg-[oklch(92%_0.01_40)] my-4" />

                  <div className="mb-4.5 flex items-center justify-between">
                    <span className="text-sm font-bold text-[oklch(50%_0.02_40)]">合计</span>
                    <span className="font-['Baloo_2',system-ui,sans-serif] text-2xl font-bold">¥{Number(order.total).toFixed(2)}</span>
                  </div>

                  {order.status === 'open' && orderedItems.length > 0 && (
                    <button
                      type="button"
                      onClick={requestCheckout}
                      disabled={busy}
                      className="rounded-full border-2 border-[oklch(60%_0.21_35)] py-2.5 text-sm font-bold text-[oklch(50%_0.2_35)] disabled:opacity-50"
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

      {qrOpen && <TableQrModal tableId={tableId} tableNumber={tableNumber} onClose={() => setQrOpen(false)} />}
    </>
  );
}
