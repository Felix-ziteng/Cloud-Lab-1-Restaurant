import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Category } from '@restaurant/shared-types';
import { api, setToken, getToken } from '../api/client';

// 顾客扫码 / 桌台平板共用的点餐页（见 ARCHITECTURE.md 2.4：两者是同一套代码、同一权限）
export default function GuestOrderPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const [menu, setMenu] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tableId) return;

    async function joinAndLoadMenu() {
      try {
        if (!getToken('guestToken')) {
          const { sessionToken } = await api.post<{ sessionToken: string; orderId: string }>(
            `/table-sessions/${tableId}/join`,
            {},
          );
          setToken('guestToken', sessionToken);
        }
        const categories = await api.get<Category[]>('/menu');
        setMenu(categories);
      } catch (err) {
        if (err instanceof Error && err.message.includes('table_pending_clear')) {
          setError('请稍等，服务员正在清台');
        } else {
          setError('加载失败，请稍后重试');
        }
      }
    }

    joinAndLoadMenu();
  }, [tableId]);

  if (error) return <p>{error}</p>;

  return (
    <div>
      <h1>桌台 {tableId}</h1>
      {menu.map((category) => (
        <section key={category.id}>
          <h2>{category.name}</h2>
          {/* TODO: 菜品列表、加入购物车、提交订单 —— 下一阶段实现 */}
        </section>
      ))}
    </div>
  );
}
