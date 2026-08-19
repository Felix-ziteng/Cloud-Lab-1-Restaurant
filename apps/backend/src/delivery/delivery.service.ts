import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async assignRider(orderId: string, riderId: string) {
    // 指派给一个已停用的骑手账号不会报错也不会真的送达——JwtAuthGuard 会挡掉停用账号的登录，
    // 骑手压根看不到这单，店员却以为已经派出去了。提前查一遍，给一个能看懂的报错
    const rider = await this.prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider || rider.status !== 'active') {
      throw new NotFoundException('骑手账号不存在或已停用');
    }

    const info = await this.prisma.deliveryInfo.update({
      where: { orderId },
      data: { riderId, status: 'assigned' },
    });
    this.realtime.emitToRider(riderId, 'delivery_assigned', { orderId });
    return info;
  }

  async updateStatus(orderId: string, riderId: string, status: 'picked_up' | 'delivering' | 'delivered') {
    const info = await this.prisma.deliveryInfo.findUnique({ where: { orderId } });
    if (!info) throw new NotFoundException('配送单不存在');
    if (info.riderId !== riderId) throw new ForbiddenException('该单未分配给当前骑手');

    const updated = await this.prisma.deliveryInfo.update({ where: { orderId }, data: { status } });
    this.realtime.emitToFrontdesk('delivery_status_changed', { orderId, status });
    return updated;
  }

  async confirmPayment(orderId: string, riderId: string) {
    const info = await this.prisma.deliveryInfo.findUnique({ where: { orderId } });
    if (!info) throw new NotFoundException('配送单不存在');
    if (info.riderId !== riderId) throw new ForbiddenException('该单未分配给当前骑手');

    const [updatedInfo] = await this.prisma.$transaction([
      this.prisma.deliveryInfo.update({
        where: { orderId },
        data: { paymentConfirmed: true, confirmedAt: new Date(), status: 'delivered' },
      }),
      this.prisma.order.update({ where: { id: orderId }, data: { status: 'paid' } }),
      this.prisma.payment.create({
        data: {
          orderId,
          method: 'rider_cod',
          amount: info.codAmount,
          collectedByType: 'rider',
          collectedByRiderId: riderId,
        },
      }),
    ]);

    return updatedInfo;
  }
}
