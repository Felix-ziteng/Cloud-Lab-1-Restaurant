import { ALLERGEN_OPTIONS, type Dish, type StoreConfig } from '@restaurant/shared-types';

// 顾客点餐卡片上的辣度/过敏原小标签：只有门店开启对应显示开关、且这道菜真的标注过时才渲染，
// 不辣（0 级）和没标注过（null/空数组）都不渲染，保持卡片干净、也避免"空白=保证不含"的误导
export default function DishTasteTags({
  dish,
  config,
}: {
  dish: Pick<Dish, 'spicyLevel' | 'allergens'>;
  config: Pick<StoreConfig, 'showSpicyLevel' | 'showAllergens'> | null;
}) {
  if (!config) return null;
  const showSpicy = config.showSpicyLevel && dish.spicyLevel !== null && dish.spicyLevel > 0;
  const showAllergens = config.showAllergens && dish.allergens.length > 0;
  if (!showSpicy && !showAllergens) return null;

  return (
    <div className="mb-1 flex flex-wrap items-center gap-1.5">
      {showSpicy && (
        <span className="inline-block rounded-full bg-[oklch(93%_0.08_35)] px-2.5 py-0.5 text-[11px] font-bold text-[oklch(45%_0.18_30)]">
          {'🌶️'.repeat(dish.spicyLevel as number)}
        </span>
      )}
      {showAllergens && (
        <span className="inline-block rounded-full bg-[oklch(93%_0.05_80)] px-2.5 py-0.5 text-[11px] font-bold text-[oklch(45%_0.1_70)]">
          含{dish.allergens.map((id) => ALLERGEN_OPTIONS.find((a) => a.id === id)?.label ?? id).join('、')}
        </span>
      )}
    </div>
  );
}
