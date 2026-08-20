import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

// 骑手模块暂时删除：店家自己送，不需要指定具体是哪个骑手/骑手账号体系，
// 配送这件事只剩一个状态字段，店员直接标记"已出发"就够了。
@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async updateStatus(orderId: string, status: 'delivering' | 'delivered') {
    const info = await this.prisma.deliveryInfo.findUnique({ where: { orderId } });
    if (!info) throw new NotFoundException('配送单不存在');

    const updated = await this.prisma.deliveryInfo.update({ where: { orderId }, data: { status } });
    this.realtime.emitToFrontdesk('delivery_status_changed', { orderId, status });
    return updated;
  }
}
