import { useEffect, useState, type FormEvent } from 'react';
import {
  ALLERGEN_OPTIONS,
  SPICY_LEVEL_LABELS,
  type Dish,
  type MenuCategory,
  type MenuProfile,
  type MenuProfileRule,
  type ModifierGroup,
  type TableWithSession,
  type StaffAccount,
  type StoreConfig,
} from '@restaurant/shared-types';
import { api, assetUrl, getToken } from '../api/client';
import { applyTheme } from '../theme/applyTheme';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// 店长专属的数据维护面板：菜单/桌台/员工/门店设置。跟前台其它部分一样先求能用，样式后置。
export default function ManagementPanel({
  config,
  onConfigChange,
}: {
  config: StoreConfig;
  onConfigChange: (config: StoreConfig) => void;
}) {
  return (
    <Tabs defaultValue="menu" className="flex flex-col gap-4">
      <TabsList>
        <TabsTrigger value="menu">菜单管理</TabsTrigger>
        <TabsTrigger value="tables">桌台/包间管理</TabsTrigger>
        <TabsTrigger value="staff">员工账号管理</TabsTrigger>
        <TabsTrigger value="settings">门店设置</TabsTrigger>
      </TabsList>
      <TabsContent value="menu">
        <MenuManagement config={config} />
      </TabsContent>
      <TabsContent value="tables">
        <TableManagement />
      </TabsContent>
      <TabsContent value="staff">
        <StaffManagement />
      </TabsContent>
      <TabsContent value="settings">
        <StoreSettings config={config} onConfigChange={onConfigChange} />
      </TabsContent>
    </Tabs>
  );
}

function StoreSettings({
  config,
  onConfigChange,
}: {
  config: StoreConfig;
  onConfigChange: (config: StoreConfig) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  }

  async function toggleFeature(feature: keyof StoreConfig, value: boolean) {
    await run(async () => {
      const updated = await api.patch<StoreConfig>('/store-config', { [feature]: value }, 'staffToken');
      onConfigChange(updated);
    });
  }

  async function changeTheme(theme: StoreConfig['uiTheme']) {
    await run(async () => {
      const updated = await api.patch<StoreConfig>('/store-config', { uiTheme: theme }, 'staffToken');
      onConfigChange(updated);
      applyTheme(updated.uiTheme);
    });
  }

  async function changeTabletMenuLayout(layout: StoreConfig['tabletMenuLayout']) {
    await run(async () => {
      const updated = await api.patch<StoreConfig>('/store-config', { tabletMenuLayout: layout }, 'staffToken');
      onConfigChange(updated);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>门店设置</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorBanner error={error} />

        <label className="flex items-center gap-2 text-sm text-foreground">
          <Switch
            checked={config.kdsScreenEnabled}
            onCheckedChange={(checked) => toggleFeature('kdsScreenEnabled', checked)}
          />
          启用厨房电子看板
        </label>

        {/* 外卖/配送、预定这两个模块的开关暂时从界面上藏起来：产品化阶段默认关闭、按客户定制
            才打开（见项目记忆 delivery_reservation_modules_off_by_default），不需要在设置页
            让店长自己看到并意外打开一个还没准备好对外的模块。真要给某个客户开，直接改数据库
            /调用 PATCH /store-config，不通过这个界面。 */}

        <label className="flex items-center gap-2 text-sm text-foreground">
          <Switch
            checked={config.showSpicyLevel}
            onCheckedChange={(checked) => toggleFeature('showSpicyLevel', checked)}
          />
          在菜单上显示辣度（开启后，新增/编辑菜品时必须选择辣度等级）
        </label>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <Switch
            checked={config.showAllergens}
            onCheckedChange={(checked) => toggleFeature('showAllergens', checked)}
          />
          在菜单上显示过敏原（开启后，新增/编辑菜品时必须确认过敏原）
        </label>

        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">界面主题（全店生效：顾客点餐页 / 厨房看板 / 前台）</p>
          <RadioGroup
            value={config.uiTheme}
            onValueChange={(value) => changeTheme(value as StoreConfig['uiTheme'])}
            className="flex flex-row gap-6"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="modern" id="theme-modern" />
              <Label htmlFor="theme-modern">现代简约</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="warm" id="theme-warm" />
              <Label htmlFor="theme-warm">暖色调</Label>
            </div>
          </RadioGroup>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">桌台平板点餐视图（菜单少用紧凑，菜单多/自助餐用长菜单）</p>
          <RadioGroup
            value={config.tabletMenuLayout}
            onValueChange={(value) => changeTabletMenuLayout(value as StoreConfig['tabletMenuLayout'])}
            className="flex flex-row gap-6"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="compact" id="tablet-layout-compact" />
              <Label htmlFor="tablet-layout-compact">紧凑模式</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="browse" id="tablet-layout-browse" />
              <Label htmlFor="tablet-layout-browse">长菜单模式</Label>
            </div>
          </RadioGroup>
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      操作失败：{error}
    </div>
  );
}

// 四个子面板都用同一个模式：run() 统一包一层，失败了报错显示在这个面板自己的 error 里，
// 而不是像之前那样各写各的、大部分连 try/catch 都没有——deleteDish 那次报错在控制台里
// 变成一条 Uncaught，界面上什么反馈都没有，就是因为漏了这层
const emptyDishDraft = {
  name: '',
  price: '',
  spicyLevel: '',
  allergens: [] as string[],
  modifierGroupIds: [] as string[],
};

function MenuManagement({ config }: { config: StoreConfig }) {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [menuProfiles, setMenuProfiles] = useState<MenuProfile[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newDish, setNewDish] = useState<Record<string, typeof emptyDishDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<{
    id: string;
    name: string;
    sortOrder: string;
    menuProfileIds: string[];
  } | null>(null);
  const [editingDish, setEditingDish] = useState<{
    id: string;
    name: string;
    price: string;
    description: string;
    spicyLevel: string;
    allergens: string[];
    modifierGroupIds: string[];
    imageUrl: string | null;
  } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const load = () => api.get<MenuCategory[]>('/menu?includeUnavailable=true').then(setCategories).catch(() => {});
  const loadModifierGroups = () =>
    api.get<ModifierGroup[]>('/modifier-groups', 'staffToken').then(setModifierGroups).catch(() => {});
  const loadMenuProfiles = () =>
    api.get<MenuProfile[]>('/menu-profiles', 'staffToken').then(setMenuProfiles).catch(() => {});
  useEffect(() => {
    load();
    loadModifierGroups();
    loadMenuProfiles();
  }, []);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    await run(async () => {
      await api.post('/categories', { name: newCategoryName, sortOrder: categories.length }, 'staffToken');
      setNewCategoryName('');
    });
  }

  async function deleteCategory(id: string) {
    await run(() => api.delete(`/categories/${id}`, 'staffToken'));
  }

  function startEditCategory(category: MenuCategory) {
    setEditingCategory({
      id: category.id,
      name: category.name,
      sortOrder: String(category.sortOrder),
      menuProfileIds: category.menuProfileIds,
    });
  }

  async function saveCategory(e: FormEvent) {
    e.preventDefault();
    if (!editingCategory) return;
    await run(async () => {
      await api.put(
        `/categories/${editingCategory.id}`,
        {
          name: editingCategory.name,
          sortOrder: Number(editingCategory.sortOrder) || 0,
          menuProfileIds: editingCategory.menuProfileIds,
        },
        'staffToken',
      );
      setEditingCategory(null);
    });
  }

  async function addDish(categoryId: string, e: FormEvent) {
    e.preventDefault();
    const draft = newDish[categoryId] ?? emptyDishDraft;
    if (!draft.name.trim() || !draft.price) return;
    if (config.showSpicyLevel && draft.spicyLevel === '') {
      setError('已开启辣度显示，请为菜品选择辣度');
      return;
    }
    await run(async () => {
      await api.post(
        '/dishes',
        {
          categoryId,
          name: draft.name,
          price: Number(draft.price),
          spicyLevel: config.showSpicyLevel ? Number(draft.spicyLevel) : undefined,
          allergens: config.showAllergens ? draft.allergens : undefined,
          modifierGroupIds: draft.modifierGroupIds,
        },
        'staffToken',
      );
      setNewDish((prev) => ({ ...prev, [categoryId]: emptyDishDraft }));
    });
  }

  async function deleteDish(id: string) {
    await run(() => api.delete(`/dishes/${id}`, 'staffToken'));
  }

  async function toggleAvailable(id: string, isAvailable: boolean) {
    await run(() => api.patch(`/dishes/${id}/availability`, { isAvailable }, 'staffToken'));
  }

  function startEditDish(dish: Dish) {
    setEditingDish({
      id: dish.id,
      name: dish.name,
      price: String(dish.price),
      description: dish.description ?? '',
      spicyLevel: dish.spicyLevel === null ? '' : String(dish.spicyLevel),
      allergens: dish.allergens,
      modifierGroupIds: dish.modifierGroups.map((g) => g.id),
      imageUrl: dish.imageUrl,
    });
  }

  // 图片是独立即时生效的，不是表单草稿的一部分——选完文件立刻上传，传完马上能在预览里
  // 看到效果，不用等点"保存"那一下才生效
  async function uploadDishImage(dishId: string, file: File) {
    setError(null);
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(assetUrl(`/dishes/${dishId}/image`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken('staffToken')}` },
        body: form,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? '图片上传失败');
      const updated = (await res.json()) as Dish;
      setEditingDish((prev) => (prev && prev.id === dishId ? { ...prev, imageUrl: updated.imageUrl } : prev));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片上传失败');
    } finally {
      setUploadingImage(false);
    }
  }

  async function saveDish(dish: Dish, e: FormEvent) {
    e.preventDefault();
    if (!editingDish) return;
    if (config.showSpicyLevel && editingDish.spicyLevel === '') {
      setError('已开启辣度显示，请为菜品选择辣度');
      return;
    }
    await run(async () => {
      await api.put(
        `/dishes/${dish.id}`,
        {
          categoryId: dish.categoryId,
          name: editingDish.name,
          price: Number(editingDish.price),
          description: editingDish.description || undefined,
          isAvailable: dish.isAvailable,
          spicyLevel: config.showSpicyLevel ? Number(editingDish.spicyLevel) : undefined,
          allergens: config.showAllergens ? editingDish.allergens : undefined,
          modifierGroupIds: editingDish.modifierGroupIds,
        },
        'staffToken',
      );
      setEditingDish(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
    <Card>
      <CardHeader>
        <CardTitle>菜单管理</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorBanner error={error} />

        <form onSubmit={addCategory} className="flex gap-2">
          <Input
            placeholder="新分类名称"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            className="max-w-xs"
          />
          <Button type="submit">新增分类</Button>
        </form>

        <div className="flex flex-col gap-4">
          {categories.map((category) => (
            <div key={category.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              {editingCategory?.id === category.id ? (
                <form onSubmit={saveCategory} className="flex flex-wrap items-center gap-2">
                  <Input
                    className="max-w-40"
                    value={editingCategory.name}
                    onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  />
                  <Input
                    className="w-24"
                    type="number"
                    value={editingCategory.sortOrder}
                    onChange={(e) => setEditingCategory({ ...editingCategory, sortOrder: e.target.value })}
                  />
                  {menuProfiles.length > 0 && (
                    <MenuProfileCheckboxes
                      profiles={menuProfiles}
                      value={editingCategory.menuProfileIds}
                      onChange={(v) => setEditingCategory({ ...editingCategory, menuProfileIds: v })}
                    />
                  )}
                  <Button type="submit" size="sm">
                    保存
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditingCategory(null)}>
                    取消
                  </Button>
                </form>
              ) : (
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">{category.name}</h3>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => startEditCategory(category)}>
                      编辑
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteCategory(category.id)}>
                      删除分类
                    </Button>
                  </div>
                </div>
              )}

              <Table>
                <TableBody>
                  {category.dishes.map((dish) =>
                    editingDish?.id === dish.id ? (
                      <TableRow key={dish.id}>
                        <TableCell colSpan={3}>
                          <form onSubmit={(e) => saveDish(dish, e)} className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-2">
                              {editingDish.imageUrl && (
                                <img
                                  src={assetUrl(editingDish.imageUrl)}
                                  alt=""
                                  className="size-12 rounded-lg object-cover"
                                />
                              )}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                disabled={uploadingImage}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) uploadDishImage(dish.id, file);
                                  e.target.value = '';
                                }}
                                className="max-w-40 text-xs"
                              />
                            </div>
                            <Input
                              className="max-w-32"
                              value={editingDish.name}
                              onChange={(e) => setEditingDish({ ...editingDish, name: e.target.value })}
                            />
                            <Input
                              className="w-24"
                              type="number"
                              value={editingDish.price}
                              onChange={(e) => setEditingDish({ ...editingDish, price: e.target.value })}
                            />
                            <Input
                              className="max-w-48"
                              placeholder="描述（可选）"
                              value={editingDish.description}
                              onChange={(e) => setEditingDish({ ...editingDish, description: e.target.value })}
                            />
                            {config.showSpicyLevel && (
                              <SpicySelect
                                value={editingDish.spicyLevel}
                                onChange={(v) => setEditingDish({ ...editingDish, spicyLevel: v })}
                              />
                            )}
                            {config.showAllergens && (
                              <AllergenCheckboxes
                                value={editingDish.allergens}
                                onChange={(v) => setEditingDish({ ...editingDish, allergens: v })}
                              />
                            )}
                            {modifierGroups.length > 0 && (
                              <ModifierGroupCheckboxes
                                groups={modifierGroups}
                                value={editingDish.modifierGroupIds}
                                onChange={(v) => setEditingDish({ ...editingDish, modifierGroupIds: v })}
                              />
                            )}
                            <Button type="submit" size="sm">
                              保存
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setEditingDish(null)}>
                              取消
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={dish.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {dish.imageUrl && (
                              <img src={assetUrl(dish.imageUrl)} alt="" className="size-10 rounded object-cover" />
                            )}
                            <span>
                              {dish.name} · ¥{Number(dish.price).toFixed(2)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={dish.isAvailable ? 'secondary' : 'outline'}>
                              {dish.isAvailable ? '在售' : '已下架'}
                            </Badge>
                            {config.showSpicyLevel && dish.spicyLevel !== null && dish.spicyLevel > 0 && (
                              <Badge variant="outline">{'🌶️'.repeat(dish.spicyLevel)}</Badge>
                            )}
                            {config.showAllergens && dish.allergens.length > 0 && (
                              <Badge variant="outline">
                                含
                                {dish.allergens
                                  .map((id) => ALLERGEN_OPTIONS.find((a) => a.id === id)?.label ?? id)
                                  .join('、')}
                              </Badge>
                            )}
                            {dish.modifierGroups.length > 0 && (
                              <Badge variant="outline">{dish.modifierGroups.map((g) => g.name).join('、')}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => toggleAvailable(dish.id, !dish.isAvailable)}>
                              {dish.isAvailable ? '下架' : '上架'}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => startEditDish(dish)}>
                              编辑
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteDish(dish.id)}>
                              删除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>

              <form onSubmit={(e) => addDish(category.id, e)} className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="菜品名称"
                  className="max-w-40"
                  value={newDish[category.id]?.name ?? ''}
                  onChange={(e) =>
                    setNewDish((prev) => ({
                      ...prev,
                      [category.id]: { ...emptyDishDraft, ...prev[category.id], name: e.target.value },
                    }))
                  }
                />
                <Input
                  placeholder="价格"
                  type="number"
                  className="w-24"
                  value={newDish[category.id]?.price ?? ''}
                  onChange={(e) =>
                    setNewDish((prev) => ({
                      ...prev,
                      [category.id]: { ...emptyDishDraft, ...prev[category.id], price: e.target.value },
                    }))
                  }
                />
                {config.showSpicyLevel && (
                  <SpicySelect
                    value={newDish[category.id]?.spicyLevel ?? ''}
                    onChange={(v) =>
                      setNewDish((prev) => ({
                        ...prev,
                        [category.id]: { ...emptyDishDraft, ...prev[category.id], spicyLevel: v },
                      }))
                    }
                  />
                )}
                {config.showAllergens && (
                  <AllergenCheckboxes
                    value={newDish[category.id]?.allergens ?? []}
                    onChange={(v) =>
                      setNewDish((prev) => ({
                        ...prev,
                        [category.id]: { ...emptyDishDraft, ...prev[category.id], allergens: v },
                      }))
                    }
                  />
                )}
                {modifierGroups.length > 0 && (
                  <ModifierGroupCheckboxes
                    groups={modifierGroups}
                    value={newDish[category.id]?.modifierGroupIds ?? []}
                    onChange={(v) =>
                      setNewDish((prev) => ({
                        ...prev,
                        [category.id]: { ...emptyDishDraft, ...prev[category.id], modifierGroupIds: v },
                      }))
                    }
                  />
                )}
                <Button type="submit" size="sm">
                  加菜品
                </Button>
              </form>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
    <ModifierGroupManagement groups={modifierGroups} onChanged={loadModifierGroups} />
    <MenuProfileManagement profiles={menuProfiles} onChanged={loadMenuProfiles} />
    </div>
  );
}

function SpicySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-28">
        <SelectValue placeholder="选择辣度" />
      </SelectTrigger>
      <SelectContent>
        {SPICY_LEVEL_LABELS.map((label, level) => (
          <SelectItem key={level} value={String(level)}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AllergenCheckboxes({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {ALLERGEN_OPTIONS.map((option) => (
        <label key={option.id} className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={value.includes(option.id)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, option.id] : value.filter((id) => id !== option.id))
            }
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

function ModifierGroupCheckboxes({
  groups,
  value,
  onChange,
}: {
  groups: ModifierGroup[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {groups.map((group) => (
        <label key={group.id} className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={value.includes(group.id)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, group.id] : value.filter((id) => id !== group.id))
            }
          />
          {group.name}
        </label>
      ))}
    </div>
  );
}

function MenuProfileCheckboxes({
  profiles,
  value,
  onChange,
}: {
  profiles: MenuProfile[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="text-xs text-muted-foreground">所属菜单版本（不选=所有版本都显示）：</span>
      {profiles.map((profile) => (
        <label key={profile.id} className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={value.includes(profile.id)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, profile.id] : value.filter((id) => id !== profile.id))
            }
          />
          {profile.name}
        </label>
      ))}
    </div>
  );
}

const SELECTION_TYPE_LABELS: Record<string, string> = {
  single_required: '必选单选',
  single_optional: '可选单选',
  multiple: '可选多选',
};

type ModifierGroupDraft = {
  name: string;
  selectionType: 'single_required' | 'single_optional' | 'multiple';
  options: { label: string; priceDelta: string }[];
};

const emptyModifierGroupDraft: ModifierGroupDraft = {
  name: '',
  selectionType: 'single_required',
  options: [{ label: '', priceDelta: '' }],
};

// 选项组草稿里"选项"这一部分的增删改，独立成组件（而不是嵌套定义在 ModifierGroupManagement
// 里面）——嵌套定义每次父组件渲染都会创建一个新的函数/组件身份，React 会当成不同的组件类型，
// 卸载重装整棵子树，导致里面的 <Input> 每敲一个字就被卸载重建、丢失焦点，表现为"只能打一个字"
function OptionRows({
  draft,
  setDraft,
}: {
  draft: ModifierGroupDraft;
  setDraft: (d: ModifierGroupDraft) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {draft.options.map((option, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            placeholder="选项名称，比如「加鸡蛋」"
            className="max-w-40"
            value={option.label}
            onChange={(e) => {
              const options = draft.options.map((o, i) => (i === index ? { ...o, label: e.target.value } : o));
              setDraft({ ...draft, options });
            }}
          />
          <Input
            placeholder="加价（可选，默认0）"
            type="number"
            className="w-32"
            value={option.priceDelta}
            onChange={(e) => {
              const options = draft.options.map((o, i) => (i === index ? { ...o, priceDelta: e.target.value } : o));
              setDraft({ ...draft, options });
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDraft({ ...draft, options: draft.options.filter((_, i) => i !== index) })}
          >
            删除选项
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => setDraft({ ...draft, options: [...draft.options, { label: '', priceDelta: '' }] })}
      >
        + 加一个选项
      </Button>
    </div>
  );
}

// 门店级"选项组模板"管理（选面型、加料这类）：不预设内容，商家自己建，建好了在上面
// 菜单管理的表单里勾选适用哪些菜（见 MenuManagement 里的 modifierGroupIds）
function ModifierGroupManagement({ groups, onChanged }: { groups: ModifierGroup[]; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState<ModifierGroupDraft>(emptyModifierGroupDraft);
  const [editingGroup, setEditingGroup] = useState<(ModifierGroupDraft & { id: string }) | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  }

  function toPayload(draft: ModifierGroupDraft) {
    return {
      name: draft.name,
      selectionType: draft.selectionType,
      options: draft.options
        .filter((o) => o.label.trim())
        .map((o) => ({ label: o.label, priceDelta: o.priceDelta ? Number(o.priceDelta) : 0 })),
    };
  }

  async function createGroup(e: FormEvent) {
    e.preventDefault();
    if (!newGroup.name.trim() || toPayload(newGroup).options.length === 0) {
      setError('选项组名称和至少一个选项都不能为空');
      return;
    }
    await run(async () => {
      await api.post('/modifier-groups', toPayload(newGroup), 'staffToken');
      setNewGroup(emptyModifierGroupDraft);
    });
  }

  function startEditGroup(group: ModifierGroup) {
    setEditingGroup({
      id: group.id,
      name: group.name,
      selectionType: group.selectionType,
      options: group.options.map((o) => ({ label: o.label, priceDelta: o.priceDelta })),
    });
  }

  async function saveGroup(e: FormEvent) {
    e.preventDefault();
    if (!editingGroup) return;
    if (!editingGroup.name.trim() || toPayload(editingGroup).options.length === 0) {
      setError('选项组名称和至少一个选项都不能为空');
      return;
    }
    await run(async () => {
      await api.put(`/modifier-groups/${editingGroup.id}`, toPayload(editingGroup), 'staffToken');
      setEditingGroup(null);
    });
  }

  async function deleteGroup(id: string) {
    await run(() => api.delete(`/modifier-groups/${id}`, 'staffToken'));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>口味/加料选项组</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorBanner error={error} />
        <p className="text-sm text-muted-foreground">
          先在这里建好选项组模板（比如"选面型""加料"），再去上面的菜单管理里勾选哪些菜适用。
        </p>

        <div className="flex flex-col gap-3">
          {groups.map((group) =>
            editingGroup?.id === group.id ? (
              <form
                key={group.id}
                onSubmit={saveGroup}
                className="flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="max-w-40"
                    value={editingGroup.name}
                    onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                  />
                  <Select
                    value={editingGroup.selectionType}
                    onValueChange={(v) => setEditingGroup({ ...editingGroup, selectionType: v as ModifierGroupDraft['selectionType'] })}
                  >
                    <SelectTrigger size="sm" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SELECTION_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <OptionRows draft={editingGroup} setDraft={(d) => setEditingGroup({ ...d, id: editingGroup.id })} />
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    保存
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditingGroup(null)}>
                    取消
                  </Button>
                </div>
              </form>
            ) : (
              <div key={group.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{group.name}</span>
                    <Badge variant="secondary">{SELECTION_TYPE_LABELS[group.selectionType]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {group.options
                      .map((o) => (Number(o.priceDelta) > 0 ? `${o.label}(+¥${o.priceDelta})` : o.label))
                      .join('、')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => startEditGroup(group)}>
                    编辑
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteGroup(group.id)}>
                    删除
                  </Button>
                </div>
              </div>
            ),
          )}
        </div>

        <form onSubmit={createGroup} className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="新选项组名称，比如「选面型」"
              className="max-w-48"
              value={newGroup.name}
              onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
            />
            <Select
              value={newGroup.selectionType}
              onValueChange={(v) => setNewGroup({ ...newGroup, selectionType: v as ModifierGroupDraft['selectionType'] })}
            >
              <SelectTrigger size="sm" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SELECTION_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <OptionRows draft={newGroup} setDraft={setNewGroup} />
          <Button type="submit" size="sm" className="w-fit">
            新增选项组
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const WEEKDAYS_ALL = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS_MON_FRI = [1, 2, 3, 4, 5];
const WEEKDAYS_SAT_SUN = [0, 6];

// 菜单版本名称固定从这份预设里选，不再自由输入——为后续多语言铺路（名称会展示给顾客，
// 固定枚举才能一一映射翻译）。每项自带默认时间规则，选中后回填，商家可以在下面继续改；
// 节假日相关的几项没有默认规则，只能靠前台手动切换打开（法定节假日日期年年不同，没法预设）。
const MENU_PROFILE_PRESETS: { id: string; name: string; defaultRules: MenuProfileRule[] }[] = [
  { id: 'lunch', name: '午餐', defaultRules: [{ daysOfWeek: WEEKDAYS_ALL, startTime: '11:00', endTime: '14:00' }] },
  {
    id: 'weekday_lunch',
    name: '工作日午餐',
    defaultRules: [{ daysOfWeek: WEEKDAYS_MON_FRI, startTime: '11:00', endTime: '14:00' }],
  },
  { id: 'dinner', name: '晚餐', defaultRules: [{ daysOfWeek: WEEKDAYS_ALL, startTime: '17:00', endTime: '21:00' }] },
  {
    id: 'weekday_dinner',
    name: '工作日晚餐',
    defaultRules: [{ daysOfWeek: WEEKDAYS_MON_FRI, startTime: '17:00', endTime: '21:00' }],
  },
  {
    id: 'weekend_lunch',
    name: '周末午餐',
    defaultRules: [{ daysOfWeek: WEEKDAYS_SAT_SUN, startTime: '11:00', endTime: '14:00' }],
  },
  {
    id: 'weekend_dinner',
    name: '周末晚餐',
    defaultRules: [{ daysOfWeek: WEEKDAYS_SAT_SUN, startTime: '17:00', endTime: '21:00' }],
  },
  { id: 'holiday', name: '节假日', defaultRules: [] },
  { id: 'holiday_lunch', name: '节假日午餐', defaultRules: [] },
  { id: 'holiday_dinner', name: '节假日晚餐', defaultRules: [] },
];

function findMenuProfilePresetIdByName(name: string): string {
  return MENU_PROFILE_PRESETS.find((p) => p.name === name)?.id ?? '';
}

function ruleSummary(rules: MenuProfileRule[]): string {
  if (rules.length === 0) return '无自动规则（仅前台手动切换，比如节假日菜单）';
  return rules
    .map((r) => `${r.daysOfWeek.map((d) => WEEKDAY_LABELS[d]).join('')} ${r.startTime}-${r.endTime}`)
    .join('、');
}

// 一条规则的星期几复选框 + 时间段——定义成模块级别的独立组件，不嵌套在 MenuProfileManagement
// 内部：嵌套定义会导致每次父组件渲染都创建一个新的函数/组件身份，React 把它当成不同的组件类型、
// 卸载重装整棵子树，输入框每敲一个字就丢焦点（这个 bug 之前在 OptionRows 上踩过一次，见其注释）
function MenuProfileRuleRows({
  rules,
  setRules,
}: {
  rules: MenuProfileRule[];
  setRules: (rules: MenuProfileRule[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {rules.map((rule, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2 rounded border border-border p-2">
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_LABELS.map((label, day) => (
              <label key={day} className="flex items-center gap-0.5 text-xs">
                <input
                  type="checkbox"
                  checked={rule.daysOfWeek.includes(day)}
                  onChange={(e) => {
                    const daysOfWeek = e.target.checked
                      ? [...rule.daysOfWeek, day]
                      : rule.daysOfWeek.filter((d) => d !== day);
                    setRules(rules.map((r, i) => (i === index ? { ...r, daysOfWeek } : r)));
                  }}
                />
                {label}
              </label>
            ))}
          </div>
          <Input
            type="time"
            className="w-28"
            value={rule.startTime}
            onChange={(e) => setRules(rules.map((r, i) => (i === index ? { ...r, startTime: e.target.value } : r)))}
          />
          <span className="text-xs text-muted-foreground">至</span>
          <Input
            type="time"
            className="w-28"
            value={rule.endTime}
            onChange={(e) => setRules(rules.map((r, i) => (i === index ? { ...r, endTime: e.target.value } : r)))}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRules(rules.filter((_, i) => i !== index))}
          >
            删除规则
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => setRules([...rules, { daysOfWeek: [], startTime: '11:00', endTime: '14:00' }])}
      >
        + 加一条自动生效规则
      </Button>
    </div>
  );
}

type MenuProfileDraft = {
  name: string;
  isDefault: boolean;
  sortOrder: string;
  rules: MenuProfileRule[];
};

const emptyMenuProfileDraft: MenuProfileDraft = { name: '', isDefault: false, sortOrder: '0', rules: [] };

// 门店级"菜单版本"管理（午市/晚市/周末/节假日这类）：不预设内容，商家自己建，建好了在上面
// 菜单管理里给分类勾选属于哪个版本（见 MenuProfileCheckboxes）
function MenuProfileManagement({ profiles, onChanged }: { profiles: MenuProfile[]; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [newProfile, setNewProfile] = useState<MenuProfileDraft>(emptyMenuProfileDraft);
  const [editingProfile, setEditingProfile] = useState<(MenuProfileDraft & { id: string }) | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  }

  function toPayload(draft: MenuProfileDraft) {
    return {
      name: draft.name,
      isDefault: draft.isDefault,
      sortOrder: Number(draft.sortOrder) || 0,
      rules: draft.rules,
    };
  }

  // 选中某个预设：名称直接取预设文案，规则回填预设默认值（深拷贝，避免改动共享同一份预设常量）
  function applyPreset(id: string, apply: (name: string, rules: MenuProfileRule[]) => void) {
    const preset = MENU_PROFILE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    apply(
      preset.name,
      preset.defaultRules.map((r) => ({ ...r, daysOfWeek: [...r.daysOfWeek] })),
    );
  }

  async function createProfile(e: FormEvent) {
    e.preventDefault();
    if (!newProfile.name.trim()) {
      setError('请选择菜单版本类型');
      return;
    }
    await run(async () => {
      await api.post('/menu-profiles', toPayload(newProfile), 'staffToken');
      setNewProfile(emptyMenuProfileDraft);
    });
  }

  function startEditProfile(profile: MenuProfile) {
    setEditingProfile({
      id: profile.id,
      name: profile.name,
      isDefault: profile.isDefault,
      sortOrder: String(profile.sortOrder),
      rules: profile.rules,
    });
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!editingProfile) return;
    if (!editingProfile.name.trim()) {
      setError('请选择菜单版本类型');
      return;
    }
    await run(async () => {
      await api.put(`/menu-profiles/${editingProfile.id}`, toPayload(editingProfile), 'staffToken');
      setEditingProfile(null);
    });
  }

  async function deleteProfile(id: string) {
    await run(() => api.delete(`/menu-profiles/${id}`, 'staffToken'));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>菜单版本</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorBanner error={error} />
        <p className="text-sm text-muted-foreground">
          不建任何版本 = 只有一份菜单，不受影响。建好版本后，去上面"菜单管理"里给分类勾选所属版本——
          不勾选的分类在所有版本下都显示。没配自动规则的版本（比如节假日菜单）只能靠前台手动切换打开。
        </p>

        <div className="flex flex-col gap-3">
          {profiles.map((profile) =>
            editingProfile?.id === profile.id ? (
              <form
                key={profile.id}
                onSubmit={saveProfile}
                className="flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={findMenuProfilePresetIdByName(editingProfile.name)}
                    onValueChange={(id) =>
                      applyPreset(id, (name, rules) => setEditingProfile({ ...editingProfile, name, rules }))
                    }
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="选择菜单版本类型" />
                    </SelectTrigger>
                    <SelectContent>
                      {MENU_PROFILE_PRESETS.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {preset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={editingProfile.isDefault}
                      onChange={(e) => setEditingProfile({ ...editingProfile, isDefault: e.target.checked })}
                    />
                    设为默认版本
                  </label>
                  <Input
                    className="w-20"
                    type="number"
                    placeholder="排序"
                    value={editingProfile.sortOrder}
                    onChange={(e) => setEditingProfile({ ...editingProfile, sortOrder: e.target.value })}
                  />
                </div>
                <MenuProfileRuleRows
                  rules={editingProfile.rules}
                  setRules={(rules) => setEditingProfile({ ...editingProfile, rules })}
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    保存
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditingProfile(null)}>
                    取消
                  </Button>
                </div>
              </form>
            ) : (
              <div key={profile.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{profile.name}</span>
                    {profile.isDefault && <Badge variant="secondary">默认</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{ruleSummary(profile.rules)}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => startEditProfile(profile)}>
                    编辑
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteProfile(profile.id)}>
                    删除
                  </Button>
                </div>
              </div>
            ),
          )}
        </div>

        <form onSubmit={createProfile} className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={findMenuProfilePresetIdByName(newProfile.name)}
              onValueChange={(id) => applyPreset(id, (name, rules) => setNewProfile({ ...newProfile, name, rules }))}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="选择菜单版本类型" />
              </SelectTrigger>
              <SelectContent>
                {MENU_PROFILE_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={newProfile.isDefault}
                onChange={(e) => setNewProfile({ ...newProfile, isDefault: e.target.checked })}
              />
              设为默认版本
            </label>
          </div>
          <MenuProfileRuleRows rules={newProfile.rules} setRules={(rules) => setNewProfile({ ...newProfile, rules })} />
          <Button type="submit" size="sm" className="w-fit">
            新增菜单版本
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TableManagement() {
  const [tables, setTables] = useState<TableWithSession[]>([]);
  const [form, setForm] = useState({ tableNumber: '', capacity: '2', zone: '', passcode: '' });
  const [error, setError] = useState<string | null>(null);
  const [editingTable, setEditingTable] = useState<{
    id: string;
    tableNumber: string;
    capacity: string;
    zone: string;
    passcode: string;
  } | null>(null);

  const load = () => api.get<TableWithSession[]>('/tables', 'staffToken').then(setTables).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  }

  async function addTable(e: FormEvent) {
    e.preventDefault();
    if (!form.tableNumber.trim()) return;
    if (!/^\d{4}$/.test(form.passcode)) {
      setError('开台密码必须是 4 位数字');
      return;
    }
    await run(async () => {
      await api.post(
        '/tables',
        {
          tableNumber: form.tableNumber,
          capacity: Number(form.capacity),
          zone: form.zone || undefined,
          passcode: form.passcode,
        },
        'staffToken',
      );
      setForm({ tableNumber: '', capacity: '2', zone: '', passcode: '' });
    });
  }

  async function deleteTable(id: string) {
    await run(() => api.delete(`/tables/${id}`, 'staffToken'));
  }

  function startEditTable(table: TableWithSession) {
    setEditingTable({
      id: table.id,
      tableNumber: table.tableNumber,
      capacity: String(table.capacity),
      zone: table.zone ?? '',
      passcode: table.passcode,
    });
  }

  async function saveTable(e: FormEvent) {
    e.preventDefault();
    if (!editingTable) return;
    if (!/^\d{4}$/.test(editingTable.passcode)) {
      setError('开台密码必须是 4 位数字');
      return;
    }
    await run(async () => {
      await api.put(
        `/tables/${editingTable.id}`,
        {
          tableNumber: editingTable.tableNumber,
          capacity: Number(editingTable.capacity),
          zone: editingTable.zone || undefined,
          passcode: editingTable.passcode,
        },
        'staffToken',
      );
      setEditingTable(null);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>桌台/包间管理</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorBanner error={error} />

        <Table>
          <TableBody>
            {tables.map((table) =>
              editingTable?.id === table.id ? (
                <TableRow key={table.id}>
                  <TableCell colSpan={2}>
                    <form onSubmit={saveTable} className="flex flex-wrap items-center gap-2">
                      <Input
                        className="max-w-24"
                        value={editingTable.tableNumber}
                        onChange={(e) => setEditingTable({ ...editingTable, tableNumber: e.target.value })}
                      />
                      <Input
                        className="w-20"
                        type="number"
                        value={editingTable.capacity}
                        onChange={(e) => setEditingTable({ ...editingTable, capacity: e.target.value })}
                      />
                      <Input
                        className="max-w-40"
                        placeholder="区域/包间名（可选）"
                        value={editingTable.zone}
                        onChange={(e) => setEditingTable({ ...editingTable, zone: e.target.value })}
                      />
                      <Input
                        className="w-24"
                        placeholder="开台密码"
                        value={editingTable.passcode}
                        onChange={(e) => setEditingTable({ ...editingTable, passcode: e.target.value })}
                      />
                      <Button type="submit" size="sm">
                        保存
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditingTable(null)}>
                        取消
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={table.id}>
                  <TableCell>
                    {table.tableNumber}（{table.capacity} 人
                    {table.zone ? ` · ${table.zone}` : ''} · {table.status} · 密码 {table.passcode}）
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => startEditTable(table)}>
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteTable(table.id)}
                        disabled={table.status !== 'idle'}
                      >
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>

        <form onSubmit={addTable} className="flex flex-wrap gap-2">
          <Input
            placeholder="桌号"
            className="max-w-24"
            value={form.tableNumber}
            onChange={(e) => setForm({ ...form, tableNumber: e.target.value })}
          />
          <Input
            placeholder="容量"
            type="number"
            className="w-20"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
          />
          <Input
            placeholder="区域/包间名（可选）"
            className="max-w-40"
            value={form.zone}
            onChange={(e) => setForm({ ...form, zone: e.target.value })}
          />
          <Input
            placeholder="开台密码（4位数字）"
            className="w-32"
            value={form.passcode}
            onChange={(e) => setForm({ ...form, passcode: e.target.value })}
          />
          <Button type="submit">新增桌台</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function StaffManagement() {
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [form, setForm] = useState({ name: '', pin: '', role: 'staff' as 'staff' | 'manager' });
  const [error, setError] = useState<string | null>(null);

  const load = () => api.get<StaffAccount[]>('/staff', 'staffToken').then(setStaff).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  }

  async function addStaff(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || form.pin.length < 4) return;
    await run(async () => {
      await api.post('/staff', form, 'staffToken');
      setForm({ name: '', pin: '', role: 'staff' });
    });
  }

  async function toggleRole(account: StaffAccount) {
    await run(() => api.put(`/staff/${account.id}`, { role: account.role === 'manager' ? 'staff' : 'manager' }, 'staffToken'));
  }

  async function toggleStatus(account: StaffAccount) {
    await run(() =>
      api.put(`/staff/${account.id}`, { status: account.status === 'active' ? 'inactive' : 'active' }, 'staffToken'),
    );
  }

  async function resetPin(id: string) {
    const pin = window.prompt('新 PIN 码（4~6 位）？');
    if (!pin) return;
    await run(() => api.patch(`/staff/${id}/pin`, { pin }, 'staffToken'));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>员工账号管理</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorBanner error={error} />

        <Table>
          <TableBody>
            {staff.map((account) => (
              <TableRow key={account.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{account.name}</span>
                    <Badge variant="secondary">{account.role === 'manager' ? '店长/管理员' : '普通店员'}</Badge>
                    <Badge variant={account.status === 'active' ? 'secondary' : 'outline'}>
                      {account.status === 'active' ? '在职' : '停用'}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => toggleRole(account)}>
                      切换角色
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleStatus(account)}>
                      {account.status === 'active' ? '停用' : '恢复'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => resetPin(account.id)}>
                      重置 PIN
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <form onSubmit={addStaff} className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="姓名"
            className="max-w-32"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            placeholder="初始 PIN（4~6 位）"
            className="max-w-40"
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value })}
          />
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as 'staff' | 'manager' })}>
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="staff">普通店员</SelectItem>
              <SelectItem value="manager">店长/管理员</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit">新增员工</Button>
        </form>
      </CardContent>
    </Card>
  );
}
