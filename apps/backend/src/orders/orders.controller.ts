import { Body, Controller, ForbiddenException, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthPayload } from '../auth/auth.types';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AddOrderItemsDto } from './dto/add-order-items.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { PriceAdjustmentDto } from './dto/price-adjustment.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  createStandaloneOrder(@Body() dto: CreateOrderDto, @CurrentAuth() auth: AuthPayload) {
    if (auth.type !== 'staff') throw new ForbiddenException('仅店员可创建外卖/自提订单');
    return this.ordersService.createStandaloneOrder(dto, auth.sub);
  }

  // guest（自己会话内）或 staff 均可加菜
  @UseGuards(JwtAuthGuard)
  @Post(':id/items')
  addItems(@Param('id') id: string, @Body() dto: AddOrderItemsDto, @CurrentAuth() auth: AuthPayload) {
    this.assertOrderScope(auth, id);
    return this.ordersService.addItems(id, dto, auth.type === 'staff' ? 'staff' : 'customer', auth.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentAuth() auth: AuthPayload) {
    this.assertOrderScope(auth, id);
    return this.ordersService.submitRound(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/checkout-request')
  checkoutRequest(@Param('id') id: string, @CurrentAuth() auth: AuthPayload) {
    this.assertOrderScope(auth, id);
    return this.ordersService.requestCheckout(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/payments')
  recordPayment(@Param('id') id: string, @Body() dto: RecordPaymentDto, @CurrentAuth() auth: AuthPayload) {
    if (auth.type !== 'staff') throw new ForbiddenException('仅店员可记录收款');
    return this.ordersService.recordPayment(id, dto, auth.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Post(':id/price-adjustments')
  applyPriceAdjustment(@Param('id') id: string, @Body() dto: PriceAdjustmentDto, @CurrentAuth() auth: AuthPayload) {
    return this.ordersService.applyPriceAdjustment(id, dto, auth.sub);
  }

  // guest token 只能操作自己会话绑定的订单，防止拿着 A 桌的令牌改 B 桌的单
  private assertOrderScope(auth: AuthPayload, orderId: string) {
    if (auth.type === 'guest' && auth.orderId !== orderId) {
      throw new ForbiddenException('无权操作该订单');
    }
  }
}
