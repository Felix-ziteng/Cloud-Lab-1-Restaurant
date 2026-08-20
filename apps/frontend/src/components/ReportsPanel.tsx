import { useEffect, useState } from 'react';
import type { ReportOverview } from '@restaurant/shared-types';
import { api } from '../api/client';
import OrderHistoryPanel from './OrderHistoryPanel';

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 店长经营概览：营业额/订单量/翻台率，按日期范围看。只有 manager 能看（后端也做了同样的限制）。
// 点每日明细表里的某一天，下钻进那一天的订单明细（复用 OrderHistoryPanel，传 from=to=那一天）。
export default function ReportsPanel() {
  const [from, setFrom] = useState(todayLocal());
  const [to, setTo] = useState(todayLocal());
  const [report, setReport] = useState<ReportOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drillDownDate, setDrillDownDate] = useState<string | null>(null);

  function load() {
    setError(null);
    api
      .get<ReportOverview>(`/reports/overview?from=${from}&to=${to}`, 'staffToken')
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (drillDownDate) {
    return (
      <section>
        <button onClick={() => setDrillDownDate(null)}>← 返回经营概览</button>
        <OrderHistoryPanel from={drillDownDate} to={drillDownDate} />
      </section>
    );
  }

  return (
    <section>
      <h2>经营概览</h2>
      <div>
        <label>
          从 <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          到 <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button onClick={load}>查询</button>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {report && (
        <>
          <p>
            营业额：¥{report.revenue.total.toFixed(2)}（堂食 ¥{report.revenue.byType.dine_in.toFixed(2)} · 自提 ¥
            {report.revenue.byType.takeout.toFixed(2)} · 配送 ¥{report.revenue.byType.delivery.toFixed(2)}）
          </p>
          <p>
            订单量：{report.orderCount.total}（堂食 {report.orderCount.byType.dine_in} · 自提{' '}
            {report.orderCount.byType.takeout} · 配送 {report.orderCount.byType.delivery}）
          </p>
          <p>翻台率：{report.tableTurnoverRate.toFixed(2)}（次/桌/天）</p>

          <table border={1} cellPadding={4}>
            <thead>
              <tr>
                <th>日期</th>
                <th>营业额</th>
                <th>订单量</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {report.dailyBreakdown.map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td>¥{row.revenue.toFixed(2)}</td>
                  <td>{row.orderCount}</td>
                  <td>
                    <button onClick={() => setDrillDownDate(row.date)}>查看当天订单</button>
                  </td>
                </tr>
              ))}
              {report.dailyBreakdown.length === 0 && (
                <tr>
                  <td colSpan={4}>这段时间没有数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
