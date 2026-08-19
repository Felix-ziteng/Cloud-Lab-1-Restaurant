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

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
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

      await this.insertItems(tx, created.id, dto.items, dishes, 'staff', staffId);

      // 堂食是"加购物车 -> 手动提交"两步，外卖/自提是店员一次性代客下单，没有"提交"这一步——
      // 建单本身就该直接推给厨房，不然这里插入的 OrderItem 会一直停在 submittedAt=null，
      // 厨房看板的查询条件要求 submittedAt 不为空，这些菜会永远不出现在厨房队列里
      await tx.orderItem.updateMany({
        where: { orderId: created.id, submittedAt: null },
        data: { roundNumber: 1, submittedAt: new Date() },
      });

      return this.recalculateTotals(created.id, tx);
    });

    this.realtime.emitToKitchen('new_order_item', { orderId: order.id, roundNumber: 1 });
    return order;
  }

  getById(orderId: string) {
    return this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        items: { where: { isVoided: false }, orderBy: { createdAt: 'asc' } },
        payments: true,
        priceAdjustments: true,
      },
    });
  }

  // 历史订单查看（精简版）：按时间倒序，可选按状态/类型筛，只给列表摘要信息，
  // 详情还是走 getById——列表页不用把每单的菜品明细都拉下来
  list(filters: { status?: string; type?: string; limit?: number }) {
    return this.prisma.order.findMany({
      where: {
        status: filters.status ? (filters.status as never) : undefined,
        type: filters.type ? (filters.type as never) : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 50,
      include: {
        tableSession: { include: { tables: { include: { table: true } } } },
        deliveryInfo: { include: { rider: { select: { id: true, name: true, status: true } } } },
      },
    });
  }

  // 骑手只能看分配给自己的配送单，不走上面那个店员专用的通用列表
  listForRider(riderId: string) {
    return this.prisma.order.findMany({
      where: { deliveryInfo: { riderId } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        items: { where: { isVoided: false } },
        deliveryInfo: true,
      },
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

  // 顾客/店员点错菜、想改数量或撤销——但只能动"购物车里还没提交给厨房"的项（submittedAt 为空）。
  // 已经提交的菜品要撤，走 price-adjustments 的 void（manager 专属），不能在这里绕过审批
  async updateItemQuantity(orderId: string, itemId: string, quantity: number) {
    const item = await this.assertOwnedUnsubmittedItem(orderId, itemId);
    await this.prisma.orderItem.update({ where: { id: item.id }, data: { quantity } });
    return this.finishItemMutation(orderId);
  }

  async removeItem(orderId: string, itemId: string) {
    const item = await this.assertOwnedUnsubmittedItem(orderId, itemId);
    await this.prisma.orderItem.delete({ where: { id: item.id } });
    return this.finishItemMutation(orderId);
  }

  private async assertOwnedUnsubmittedItem(orderId: string, itemId: string) {
    const item = await this.prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!item || item.orderId !== orderId) {
      throw new NotFoundException('订单项不存在');
    }
    if (item.submittedAt !== null) {
      throw new BadRequestException('已提交厨房的菜品不能直接修改，需要店长走作废/改价流程');
    }
    return item;
  }

  private async finishItemMutation(orderId: string) {
    const updated = await this.recalculateTotals(orderId, this.prisma);
    if (updated.tableSessionId) {
      this.realtime.emitToTable(updated.tableSessionId, 'item_added', { orderId });
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
    if (dto.orderItemId) {
      const item = await this.prisma.orderItem.findUnique({ where: { id: dto.orderItemId } });
      if (!item || item.orderId !== orderId) {
        throw new BadRequestException('该菜品不属于这张订单');
      }
    }

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

  // 合计逻辑：
  //   - discount/comp：从小计里扣，可以叠加多条（累加）
  //   - price_override 挂在某个菜品项上：那一项按覆盖后的金额算进小计，不再用 单价*数量；
  //     同一项有多条覆盖记录时，以最后一条（created_at 最新）为准，不叠加
  //   - price_override 不挂具体菜品（整单改价）：直接把 total 覆盖成指定金额，
  //     不再走"小计 - 折扣"这套计算；同样是以最后一条整单改价记录为准
  private async recalculateTotals(
    orderId: string,
    tx: Pick<PrismaService, 'orderItem' | 'priceAdjustment' | 'order' | 'deliveryInfo'>,
  ) {
    const items = await tx.orderItem.findMany({ where: { orderId, isVoided: false } });
    const adjustments = await tx.priceAdjustment.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });

    const itemOverrides = new Map<string, number>();
    let orderLevelOverride: number | undefined;
    for (const adj of adjustments) {
      if (adj.type !== 'price_override') continue;
      if (adj.orderItemId) {
        itemOverrides.set(adj.orderItemId, Number(adj.amount)); // 按时间顺序遍历，后面的自然覆盖前面的
      } else {
        orderLevelOverride = Number(adj.amount);
      }
    }

    const subtotal = items.reduce((sum, item) => {
      const overridden = itemOverrides.get(item.id);
      return sum + (overridden !== undefined ? overridden : Number(item.unitPriceSnapshot) * item.quantity);
    }, 0);

    const discountTotal = adjustments
      .filter((adj) => adj.type === 'discount' || adj.type === 'comp')
      .reduce((sum, adj) => sum + Number(adj.amount), 0);

    const total = orderLevelOverride !== undefined ? orderLevelOverride : Math.max(0, subtotal - discountTotal);

    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: { subtotal, discountTotal, total },
    });

    // 外卖订单的货到付款金额要跟着 total 走：加菜/改价/作废任何一个环节改了总价，
    // 骑手应收的金额都要同步更新，不然骑手上门收的钱跟系统里的账对不上。
    // updateMany 而不是 update：非外卖订单没有 deliveryInfo 行，用 update 会因为找不到记录直接报错
    if (updatedOrder.type === 'delivery') {
      await tx.deliveryInfo.updateMany({ where: { orderId }, data: { codAmount: total } });
    }

    return updatedOrder;
  }
}
