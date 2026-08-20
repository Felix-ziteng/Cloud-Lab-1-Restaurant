import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseDayBoundary } from '../common/date-range.util';

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(fromStr: string, toStr: string) {
    const from = parseDayBoundary(fromStr, false);
    const to = parseDayBoundary(toStr, true);
    if (from > to) throw new BadRequestException('开始日期不能晚于结束日期');

    const [payments, orders, closedSessionCount, tableCount] = await Promise.all([
      // 营业额按"实际收款时间"算，不是按下单时间——跟店长对账时看的现金流水口径一致
      this.prisma.payment.findMany({
        where: { collectedAt: { gte: from, lte: to } },
        select: { amount: true, collectedAt: true, order: { select: { type: true } } },
      }),
      // 取消的订单不算"订单量"——那单生意根本没发生，算进去会虚增订单量。
      // cancelOrder 这个动作目前还没接前端入口（见 OrdersService.cancelOrder），
      // 但这条排除逻辑先写上，不然真正启用那天订单量统计会立刻带 bug
      this.prisma.order.findMany({
        where: { createdAt: { gte: from, lte: to }, status: { not: 'cancelled' } },
        select: { id: true, type: true, createdAt: true },
      }),
      // 翻台率只跟堂食有关：这段时间内"完成"（清台关闭）的桌台会话数
      this.prisma.tableSession.count({ where: { closedAt: { gte: from, lte: to } } }),
      this.prisma.table.count(),
    ]);

    const revenueByType: Record<string, number> = { dine_in: 0, takeout: 0, delivery: 0 };
    const dailyRevenue = new Map<string, number>();
    let revenueTotal = 0;
    for (const p of payments) {
      const amount = Number(p.amount);
      revenueTotal += amount;
      revenueByType[p.order.type] = (revenueByType[p.order.type] ?? 0) + amount;
      const key = localDateKey(p.collectedAt);
      dailyRevenue.set(key, (dailyRevenue.get(key) ?? 0) + amount);
    }

    const orderCountByType: Record<string, number> = { dine_in: 0, takeout: 0, delivery: 0 };
    const dailyOrderCount = new Map<string, number>();
    for (const o of orders) {
      orderCountByType[o.type] = (orderCountByType[o.type] ?? 0) + 1;
      const key = localDateKey(o.createdAt);
      dailyOrderCount.set(key, (dailyOrderCount.get(key) ?? 0) + 1);
    }

    const dayCount = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
    const tableTurnoverRate = tableCount > 0 ? closedSessionCount / (tableCount * dayCount) : 0;

    const allDateKeys = new Set([...dailyRevenue.keys(), ...dailyOrderCount.keys()]);
    const dailyBreakdown = [...allDateKeys]
      .sort()
      .map((date) => ({
        date,
        revenue: dailyRevenue.get(date) ?? 0,
        orderCount: dailyOrderCount.get(date) ?? 0,
      }));

    return {
      from: fromStr,
      to: toStr,
      revenue: { total: revenueTotal, byType: revenueByType },
      orderCount: { total: orders.length, byType: orderCountByType },
      tableTurnoverRate,
      dailyBreakdown,
    };
  }
}
