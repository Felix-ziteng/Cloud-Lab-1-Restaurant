import { useEffect, useState } from 'react';
import type { ReportOverview } from '@restaurant/shared-types';
import { api } from '../api/client';
import OrderHistoryPanel from './OrderHistoryPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setDrillDownDate(null)}>
          ← 返回经营概览
        </Button>
        <OrderHistoryPanel from={drillDownDate} to={drillDownDate} />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>经营概览</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="report-from" className="text-muted-foreground">
              从
            </Label>
            <Input id="report-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="report-to" className="text-muted-foreground">
              到
            </Label>
            <Input id="report-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button onClick={load}>查询</Button>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {report && (
          <>
            <div className="flex flex-col gap-1 text-sm text-foreground">
              <p>
                营业额：¥{report.revenue.total.toFixed(2)}（堂食 ¥{report.revenue.byType.dine_in.toFixed(2)} · 自提 ¥
                {report.revenue.byType.takeout.toFixed(2)} · 配送 ¥{report.revenue.byType.delivery.toFixed(2)}）
              </p>
              <p>
                订单量：{report.orderCount.total}（堂食 {report.orderCount.byType.dine_in} · 自提{' '}
                {report.orderCount.byType.takeout} · 配送 {report.orderCount.byType.delivery}）
              </p>
              <p>翻台率：{report.tableTurnoverRate.toFixed(2)}（次/桌/天）</p>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日期</TableHead>
                  <TableHead>营业额</TableHead>
                  <TableHead>订单量</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.dailyBreakdown.map((row) => (
                  <TableRow key={row.date}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>¥{row.revenue.toFixed(2)}</TableCell>
                    <TableCell>{row.orderCount}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => setDrillDownDate(row.date)}>
                        查看当天订单
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {report.dailyBreakdown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      这段时间没有数据
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
