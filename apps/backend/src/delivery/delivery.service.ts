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
