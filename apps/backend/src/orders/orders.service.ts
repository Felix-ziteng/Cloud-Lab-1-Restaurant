import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { TablesService } from '../tables/tables.service';
import { StoreConfigService } from '../store-config/store-config.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AddOrderItemsDto } from './dto/add-order-items.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { PriceAdjustmentDto } from './dto/price-adjustment.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly tablesService: TablesService,
    private readonly storeConfigService: StoreConfigService,
  ) {}

  // V1 暂定：外卖/自提订单由店员在前台代客创建（POS 场景）。
  // 顾客在店外自助下单外卖/自提，目前还没有对应的身份/令牌模型（见 DATA_MODEL.md 待确认事项），
  // 是下一阶段需要单独设计的缺口，先不在这里假装实现。
  async createStandaloneOrder(dto: CreateOrderDto, staffId: string) {
    // delivery 专属接口（分配骑手/更新状态等）挂了 deliveryEnabled 开关，
    // 但创建订单本身走的是这个通用入口，得在这里单独补一道，否则开关形同虚设
    if (dto.type === 'delivery' && !(await this.storeConfigService.isEnabled('deliveryEnabled'))) {
      throw new ForbiddenException('该门店未启用外卖配送功能');
    }

    const dishes = await this.prisma.dish.findMany({ where: { id: { in: dto.items.map((i) => i.dishId) } } });

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          type: dto.type,
          createdByType: 'staff',
          createdByStaffId: staffId,
          customerContact: dto.customerContact,
          pickupTime: dto.pickupTime ? new Date(dto.pickupTime) : undefined,
          ...(dto.type === 'delivery'
            ? {
                deliveryInfo: {
                  create: {
                    address: dto.deliveryAddress ?? '',
                    contactPhone: dto.customerContact,
                    codAmount: 0,
                  },
                },
              }
            : {}),
        },
      });

      await this.insertItems(tx, order.id, dto.items, dishes, 'staff', staffId);
      return this.recalculateTotals(order.id, tx);
    });
  }

  async addItems(orderId: string, dto: AddOrderItemsDto, actorType: 'customer' | 'staff', actorId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'open') throw new BadRequestException('该订单已不可加菜');

    const dishes = await this.prisma.dish.findMany({ where: { id: { in: dto.items.map((i) => i.dishId) } } });

    await this.insertItems(this.prisma, orderId, dto.items, dishes, actorType, actorId);
    const updated = await this.recalculateTotals(orderId, this.prisma);

    if (order.tableSessionId) {
      this.realtime.emitToTable(order.tableSessionId, 'item_added', { orderId });
    }
    return updated;
  }

  // 提交当前一轮（购物车项 roundNumber=0）为正式下单批次，推送厨房
  async submitRound(orderId: string) {
    const pendingItems = await this.prisma.orderItem.findMany({
      where: { orderId, submittedAt: null },
    });
    if (pendingItems.length === 0) {
      throw new BadRequestException('没有待提交的菜品');
    }

    const lastRound = await this.prisma.orderItem.aggregate({
      where: { orderId },
      _max: { roundNumber: true },
    });
    const nextRound = (lastRound._max.roundNumber ?? 0) + 1;

    await this.prisma.orderItem.updateMany({
      where: { id: { in: pendingItems.map((i) => i.id) } },
      data: { roundNumber: nextRound, submittedAt: new Date() },
    });

    this.realtime.emitToKitchen('new_order_item', { orderId, roundNumber: nextRound });

    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.tableSessionId) {
      this.realtime.emitToTable(order.tableSessionId, 'item_added', { orderId, roundNumber: nextRound });
    }

    return { roundNumber: nextRound, itemCount: pendingItems.length };
  }

  async requestCheckout(orderId: string) {
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'awaiting_payment' },
    });
    this.realtime.emitToFrontdesk('checkout_requested', { orderId, tableSessionId: order.tableSessionId });
    return order;
  }

  async recordPayment(orderId: string, dto: RecordPaymentDto, staffId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('订单不存在');

    const [, updatedOrder] = await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          orderId,
          method: dto.method,
          amount: dto.amount,
          collectedByType: 'staff',
          collectedByStaffId: staffId,
        },
      }),
      this.prisma.order.update({ where: { id: orderId }, data: { status: 'paid' } }),
    ]);

    if (order.tableSessionId) {
      await this.tablesService.closeSession(order.tableSessionId);
      this.realtime.emitToTable(order.tableSessionId, 'order_paid', { orderId });
    }

    return updatedOrder;
  }

  // 仅 manager 可调用（由 controller 上的 @Roles('manager') 保证）
  async applyPriceAdjustment(orderId: string, dto: PriceAdjustmentDto, managerId: string) {
    await this.prisma.priceAdjustment.create({
      data: {
        orderId,
        orderItemId: dto.orderItemId,
        type: dto.type,
        amount: dto.amount,
        reason: dto.reason,
        approvedByStaffId: managerId,
      },
    });

    if (dto.type === 'void' && dto.orderItemId) {
      await this.prisma.orderItem.update({ where: { id: dto.orderItemId }, data: { isVoided: true } });
    }

    return this.recalculateTotals(orderId, this.prisma);
  }

  private async insertItems(
    tx: Pick<PrismaService, 'orderItem'>,
    orderId: string,
    items: { dishId: string; quantity: number; notes?: string }[],
    dishes: { id: string; name: string; price: unknown }[],
    actorType: 'customer' | 'staff',
    actorId?: string,
  ) {
    for (const item of items) {
      const dish = dishes.find((d) => d.id === item.dishId);
      if (!dish) throw new BadRequestException(`菜品不存在: ${item.dishId}`);

      await tx.orderItem.create({
        data: {
          orderId,
          dishId: dish.id,
          dishNameSnapshot: dish.name,
          unitPriceSnapshot: dish.price as never,
          quantity: item.quantity,
          notes: item.notes,
          addedByType: actorType,
          addedByStaffId: actorType === 'staff' ? actorId : undefined,
        },
      });
    }
  }

  // 简化版合计逻辑：subtotal = 未作废项金额之和，discountTotal = 打折/赠菜类调整之和。
  // price_override 的精确语义（是改单价还是改总额）留待下一阶段细化，这里先只落审计记录、不参与计算。
  private async recalculateTotals(orderId: string, tx: Pick<PrismaService, 'orderItem' | 'priceAdjustment' | 'order'>) {
    const items = await tx.orderItem.findMany({ where: { orderId, isVoided: false } });
    const subtotal = items.reduce((sum, item) => sum + Number(item.unitPriceSnapshot) * item.quantity, 0);

    const discounts = await tx.priceAdjustment.findMany({
      where: { orderId, type: { in: ['discount', 'comp'] } },
    });
    const discountTotal = discounts.reduce((sum, adj) => sum + Number(adj.amount), 0);

    return tx.order.update({
      where: { id: orderId },
      data: { subtotal, discountTotal, total: Math.max(0, subtotal - discountTotal) },
    });
  }
}
