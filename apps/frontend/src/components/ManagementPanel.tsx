import { useEffect, useState, type FormEvent } from 'react';
import type { Dish, MenuCategory, TableWithSession, StaffAccount, StoreConfig } from '@restaurant/shared-types';
import { api } from '../api/client';

// 店长专属的数据维护面板：菜单/桌台/员工。跟前台其它部分一样先求能用，样式后置。
export default function ManagementPanel(_props: { config: StoreConfig }) {
  return (
    <div>
      <MenuManagement />
      <TableManagement />
      <StaffManagement />
    </div>
  );
}

// 四个子面板都用同一个模式：run() 统一包一层，失败了报错显示在这个面板自己的 error 里，
// 而不是像之前那样各写各的、大部分连 try/catch 都没有——deleteDish 那次报错在控制台里
// 变成一条 Uncaught，界面上什么反馈都没有，就是因为漏了这层
function MenuManagement() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newDish, setNewDish] = useState<Record<string, { name: string; price: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string; sortOrder: string } | null>(
    null,
  );
  const [editingDish, setEditingDish] = useState<{
    id: string;
    name: string;
    price: string;
    description: string;
  } | null>(null);

  const load = () => api.get<MenuCategory[]>('/menu?includeUnavailable=true').then(setCategories).catch(() => {});
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
    setEditingCategory({ id: category.id, name: category.name, sortOrder: String(category.sortOrder) });
  }

  async function saveCategory(e: FormEvent) {
    e.preventDefault();
    if (!editingCategory) return;
    await run(async () => {
      await api.put(
        `/categories/${editingCategory.id}`,
        { name: editingCategory.name, sortOrder: Number(editingCategory.sortOrder) || 0 },
        'staffToken',
      );
      setEditingCategory(null);
    });
  }

  async function addDish(categoryId: string, e: FormEvent) {
    e.preventDefault();
    const draft = newDish[categoryId];
    if (!draft?.name.trim() || !draft.price) return;
    await run(async () => {
      await api.post('/dishes', { categoryId, name: draft.name, price: Number(draft.price) }, 'staffToken');
      setNewDish((prev) => ({ ...prev, [categoryId]: { name: '', price: '' } }));
    });
  }

  async function deleteDish(id: string) {
    await run(() => api.delete(`/dishes/${id}`, 'staffToken'));
  }

  async function toggleAvailable(id: string, isAvailable: boolean) {
    await run(() => api.patch(`/dishes/${id}/availability`, { isAvailable }, 'staffToken'));
  }

  function startEditDish(dish: Dish) {
    setEditingDish({ id: dish.id, name: dish.name, price: String(dish.price), description: dish.description ?? '' });
  }

  async function saveDish(dish: Dish, e: FormEvent) {
    e.preventDefault();
    if (!editingDish) return;
    await run(async () => {
      await api.put(
        `/dishes/${dish.id}`,
        {
          categoryId: dish.categoryId,
          name: editingDish.name,
          price: Number(editingDish.price),
          description: editingDish.description || undefined,
          isAvailable: dish.isAvailable,
        },
        'staffToken',
      );
      setEditingDish(null);
    });
  }

  return (
    <section>
      <h2>菜单管理</h2>
      {error && <p style={{ color: 'red' }}>操作失败：{error}</p>}

      <form onSubmit={addCategory}>
        <input placeholder="新分类名称" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
        <button type="submit">新增分类</button>
      </form>

      {categories.map((category) => (
        <div key={category.id}>
          {editingCategory?.id === category.id ? (
            <form onSubmit={saveCategory}>
              <input
                value={editingCategory.name}
                onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
              />
              <input
                type="number"
                value={editingCategory.sortOrder}
                onChange={(e) => setEditingCategory({ ...editingCategory, sortOrder: e.target.value })}
              />
              <button type="submit">保存</button>
              <button type="button" onClick={() => setEditingCategory(null)}>
                取消
              </button>
            </form>
          ) : (
            <h3>
              {category.name}
              <button onClick={() => startEditCategory(category)}>编辑</button>
              <button onClick={() => deleteCategory(category.id)}>删除分类</button>
            </h3>
          )}
          <ul>
            {category.dishes.map((dish) =>
              editingDish?.id === dish.id ? (
                <li key={dish.id}>
                  <form onSubmit={(e) => saveDish(dish, e)}>
                    <input
                      value={editingDish.name}
                      onChange={(e) => setEditingDish({ ...editingDish, name: e.target.value })}
                    />
                    <input
                      type="number"
                      value={editingDish.price}
                      onChange={(e) => setEditingDish({ ...editingDish, price: e.target.value })}
                    />
                    <input
                      placeholder="描述（可选）"
                      value={editingDish.description}
                      onChange={(e) => setEditingDish({ ...editingDish, description: e.target.value })}
                    />
                    <button type="submit">保存</button>
                    <button type="button" onClick={() => setEditingDish(null)}>
                      取消
                    </button>
                  </form>
                </li>
              ) : (
                <li key={dish.id}>
                  {dish.name} ¥{Number(dish.price).toFixed(2)}
                  {dish.isAvailable ? '（在售）' : '（已下架）'}
                  <button onClick={() => toggleAvailable(dish.id, !dish.isAvailable)}>
                    {dish.isAvailable ? '下架' : '上架'}
                  </button>
                  <button onClick={() => startEditDish(dish)}>编辑</button>
                  <button onClick={() => deleteDish(dish.id)}>删除</button>
                </li>
              ),
            )}
          </ul>
          <form onSubmit={(e) => addDish(category.id, e)}>
            <input
              placeholder="菜品名称"
              value={newDish[category.id]?.name ?? ''}
              onChange={(e) =>
                setNewDish((prev) => ({ ...prev, [category.id]: { name: e.target.value, price: prev[category.id]?.price ?? '' } }))
              }
            />
            <input
              placeholder="价格"
              type="number"
              value={newDish[category.id]?.price ?? ''}
              onChange={(e) =>
                setNewDish((prev) => ({ ...prev, [category.id]: { name: prev[category.id]?.name ?? '', price: e.target.value } }))
              }
            />
            <button type="submit">加菜品</button>
          </form>
        </div>
      ))}
    </section>
  );
}

function TableManagement() {
  const [tables, setTables] = useState<TableWithSession[]>([]);
  const [form, setForm] = useState({ tableNumber: '', capacity: '2', zone: '' });
  const [error, setError] = useState<string | null>(null);
  const [editingTable, setEditingTable] = useState<{
    id: string;
    tableNumber: string;
    capacity: string;
    zone: string;
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
    await run(async () => {
      await api.post(
        '/tables',
        { tableNumber: form.tableNumber, capacity: Number(form.capacity), zone: form.zone || undefined },
        'staffToken',
      );
      setForm({ tableNumber: '', capacity: '2', zone: '' });
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
    });
  }

  async function saveTable(e: FormEvent) {
    e.preventDefault();
    if (!editingTable) return;
    await run(async () => {
      await api.put(
        `/tables/${editingTable.id}`,
        {
          tableNumber: editingTable.tableNumber,
          capacity: Number(editingTable.capacity),
          zone: editingTable.zone || undefined,
        },
        'staffToken',
      );
      setEditingTable(null);
    });
  }

  return (
    <section>
      <h2>桌台/包间管理</h2>
      {error && <p style={{ color: 'red' }}>操作失败：{error}</p>}
      <ul>
        {tables.map((table) =>
          editingTable?.id === table.id ? (
            <li key={table.id}>
              <form onSubmit={saveTable}>
                <input
                  value={editingTable.tableNumber}
                  onChange={(e) => setEditingTable({ ...editingTable, tableNumber: e.target.value })}
                />
                <input
                  type="number"
                  value={editingTable.capacity}
                  onChange={(e) => setEditingTable({ ...editingTable, capacity: e.target.value })}
                />
                <input
                  placeholder="区域/包间名（可选）"
                  value={editingTable.zone}
                  onChange={(e) => setEditingTable({ ...editingTable, zone: e.target.value })}
                />
                <button type="submit">保存</button>
                <button type="button" onClick={() => setEditingTable(null)}>
                  取消
                </button>
              </form>
            </li>
          ) : (
            <li key={table.id}>
              {table.tableNumber}（{table.capacity} 人{table.zone ? ` · ${table.zone}` : ''} · {table.status}）
              <button onClick={() => startEditTable(table)}>编辑</button>
              <button onClick={() => deleteTable(table.id)} disabled={table.status !== 'idle'}>
                删除
              </button>
            </li>
          ),
        )}
      </ul>
      <form onSubmit={addTable}>
        <input placeholder="桌号" value={form.tableNumber} onChange={(e) => setForm({ ...form, tableNumber: e.target.value })} />
        <input
          placeholder="容量"
          type="number"
          value={form.capacity}
          onChange={(e) => setForm({ ...form, capacity: e.target.value })}
        />
        <input placeholder="区域/包间名（可选）" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} />
        <button type="submit">新增桌台</button>
      </form>
    </section>
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
    <section>
      <h2>员工账号管理</h2>
      {error && <p style={{ color: 'red' }}>操作失败：{error}</p>}
      <ul>
        {staff.map((account) => (
          <li key={account.id}>
            {account.name} · {account.role === 'manager' ? '店长/管理员' : '普通店员'} · {account.status === 'active' ? '在职' : '停用'}
            <button onClick={() => toggleRole(account)}>切换角色</button>
            <button onClick={() => toggleStatus(account)}>{account.status === 'active' ? '停用' : '恢复'}</button>
            <button onClick={() => resetPin(account.id)}>重置 PIN</button>
          </li>
        ))}
      </ul>
      <form onSubmit={addStaff}>
        <input placeholder="姓名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input
          placeholder="初始 PIN（4~6 位）"
          value={form.pin}
          onChange={(e) => setForm({ ...form, pin: e.target.value })}
        />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'staff' | 'manager' })}>
          <option value="staff">普通店员</option>
          <option value="manager">店长/管理员</option>
        </select>
        <button type="submit">新增员工</button>
      </form>
    </section>
  );
}

