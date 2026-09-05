import { useState } from 'react';
import type { Dish } from '@restaurant/shared-types';

// 点了有加料/口味选项的菜之后弹出的选择层：盖在当前页面上，不跳转路由，选完关掉。
// 用 fixed 而不是 absolute——GuestOrderPage/TabletOrderingBrowse/TabletOrderingCompact
// 三处的 DOM 结构各不一样，fixed 能保证不管挂在哪层都盖满整个视口。
export default function DishModifierSheet({
  dish,
  onCancel,
  onConfirm,
}: {
  dish: Dish;
  onCancel: () => void;
  onConfirm: (selectedOptionIds: string[]) => void;
}) {
  // 每个选项组自己的已选 id 列表：single_required/single_optional 长度最多为 1，multiple 不限
  const [selection, setSelection] = useState<Record<string, string[]>>({});

  function toggleOption(groupId: string, optionId: string, exclusive: boolean) {
    setSelection((prev) => {
      const current = prev[groupId] ?? [];
      if (exclusive) {
        return { ...prev, [groupId]: current[0] === optionId ? [] : [optionId] };
      }
      const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
      return { ...prev, [groupId]: next };
    });
  }

  const missingRequired = dish.modifierGroups.some(
    (group) => group.selectionType === 'single_required' && (selection[group.id]?.length ?? 0) !== 1,
  );

  function confirm() {
    if (missingRequired) return;
    onConfirm(Object.values(selection).flat());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-bold text-foreground">{dish.name}</h2>
          <button type="button" onClick={onCancel} className="text-xl text-muted-foreground">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-5">
            {dish.modifierGroups.map((group) => {
              const exclusive = group.selectionType !== 'multiple';
              const chosen = selection[group.id] ?? [];
              return (
                <div key={group.id} className="flex flex-col gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {group.name}
                    {group.selectionType === 'single_required' && <span className="ml-1 text-destructive">*必选</span>}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.options.map((option) => {
                      const isSelected = chosen.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleOption(group.id, option.id, exclusive)}
                          className={
                            isSelected
                              ? 'rounded-full bg-[oklch(60%_0.21_35)] px-4 py-2 text-sm font-semibold text-white'
                              : 'rounded-full bg-[oklch(94%_0.01_40)] px-4 py-2 text-sm font-semibold text-[oklch(45%_0.02_30)]'
                          }
                        >
                          {option.label}
                          {Number(option.priceDelta) > 0 && ` +¥${Number(option.priceDelta).toFixed(2)}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={confirm}
            disabled={missingRequired}
            className="w-full rounded-full bg-[oklch(60%_0.21_35)] py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
