import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // KDS 队列：已提交、未完成、未作废的菜品项，按提交时间排序
  getQueue() {
    return this.prisma.orderItem.findMany({
      where: { isVoided: false, submittedAt: { not: null }, kitchenStatus: { not: 'done' } },
      orderBy: { submittedAt: 'asc' },
      include: {
        order: {
          select: {
            id: true,
            type: true,
            tableSessionId: true,
            tableSession: { include: { tables: { include: { table: true } } } },
          },
        },
      },
    });
  }

  async updateStatus(orderItemId: string, status: 'preparing' | 'done') {
    const item = await this.prisma.orderItem.update({
      where: { id: orderItemId },
      data: { kitchenStatus: status },
      include: { order: true },
    });

    this.realtime.emitToKitchen('item_status_changed', { orderItemId, status });
    if (item.order.tableSessionId) {
      this.realtime.emitToTable(item.order.tableSessionId, 'item_status_changed', { orderItemId, status });
    }
    return item;
  }
}
