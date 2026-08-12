// 厨房 KDS 看板：站点级访问，无个人登录（见 API_DESIGN.md 第 2 节）
export default function KitchenPage() {
  return (
    <div>
      <h1>厨房看板</h1>
      {/* TODO: 订阅 kitchen 房间的 new_order_item / item_status_changed，展示订单队列 —— 下一阶段实现 */}
    </div>
  );
}
