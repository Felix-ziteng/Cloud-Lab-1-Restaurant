import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthPayload } from '../auth/auth.types';
import { FeatureEnabledGuard } from '../store-config/guards/feature-enabled.guard';
import { RequireFeature } from '../store-config/decorators/require-feature.decorator';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AddOrderItemsDto } from './dto/add-order-items.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { PriceAdjustmentDto } from './dto/price-adjustment.dto';
import { UpdateItemQuantityDto } from './dto/update-item-quantity.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  createStandaloneOrder(@Body() dto: CreateOrderDto, @CurrentAuth() auth: AuthPayload) {
    if (auth.type !== 'staff') throw new ForbiddenException('仅店员可创建外卖/自提订单');
    return this.ordersService.createStandaloneOrder(dto, { type: 'staff', staffId: auth.sub });
  }

  // 公开接口，不需要登录：顾客在店外自助下单外卖/自提。返回的 token 是这张订单专属的
  // guest token，前端存起来后续凭它查看订单状态（见 OrdersService.createGuestOrder）
  //
  // 挂在 deliveryEnabled 开关下：这个开关现在的含义是"外卖/自提自助下单模块整体是否开放"，
  // 不只是"是否支持配送到家"——这个模块需要暴露到公网（见 ops/Caddyfile），产品化之前
  // 默认关闭，只有客户明确需要时才单独为这家店打开，避免默认部署凭空多一个公网攻击面
  @UseGuards(FeatureEnabledGuard)
  @RequireFeature('deliveryEnabled')
  @Post('guest')
  createGuestOrder(@Body() dto: CreateOrderDto) {
    return this.ordersService.createGuestOrder(dto);
  }

  // 换设备/清了缓存导致 token 丢了的找回入口：订单号 + 下单手机号，重新签发 token。
  // 必须声明在 @Get(':id') 前面，不然 Nest 会把 'lookup' 当成 :id 参数匹配掉
  @UseGuards(FeatureEnabledGuard)
  @RequireFeature('deliveryEnabled')
  @Get('lookup')
  lookupGuestOrder(@Query('orderNumber') orderNumber: string, @Query('phone') phone: string) {
    const parsed = Number(orderNumber);
    if (!orderNumber || Number.isNaN(parsed)) throw new BadRequestException('订单号格式不正确');
    if (!phone) throw new BadRequestException('请填写手机号');
    return this.ordersService.lookupGuestOrder(parsed, phone);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @Query('status') status: string | undefined,
    @Query('type') type: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentAuth() auth: AuthPayload,
  ) {
    if (auth.type !== 'staff') throw new ForbiddenException('仅店员可查看订单列表');
    return this.ordersService.list({ status, type, limit: limit ? Number(limit) : undefined, from, to });
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getById(@Param('id') id: string, @CurrentAuth() auth: AuthPayload) {
    this.assertOrderScope(auth, id);
    return this.ordersService.getById(id);
  }

  // guest（自己会话内）或 staff 均可加菜
  @UseGuards(JwtAuthGuard)
  @Post(':id/items')
  addItems(@Param('id') id: string, @Body() dto: AddOrderItemsDto, @CurrentAuth() auth: AuthPayload) {
    this.assertOrderScope(auth, id);
    return this.ordersService.addItems(id, dto, auth.type === 'staff' ? 'staff' : 'customer', auth.sub);
  }

  // 只能改/删还没提交给厨房的购物车项，服务层会拒绝已提交的项
  @UseGuards(JwtAuthGuard)
  @Patch(':id/items/:itemId')
  updateItemQuantity(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateItemQuantityDto,
    @CurrentAuth() auth: AuthPayload,
  ) {
    this.assertOrderScope(auth, id);
    return this.ordersService.updateItemQuantity(id, itemId, dto.quantity);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentAuth() auth: AuthPayload) {
    this.assertOrderScope(auth, id);
    return this.ordersService.removeItem(id, itemId);
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

  // 暂不启用：manager 权限门槛跟改价/打折/作废这些订单级敏感操作一致，
  // 前端目前没有任何按钮调用这个接口（见 OrdersService.cancelOrder 的说明）
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Post(':id/cancel')
  cancelOrder(@Param('id') id: string) {
    return this.ordersService.cancelOrder(id);
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
