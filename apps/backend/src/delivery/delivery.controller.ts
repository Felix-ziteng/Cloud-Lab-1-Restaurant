import { Body, Controller, ForbiddenException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthPayload } from '../auth/auth.types';
import { DeliveryService } from './delivery.service';
import { AssignRiderDto } from './dto/assign-rider.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';

@Controller('orders/:orderId/delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @UseGuards(JwtAuthGuard)
  @Post('assign')
  assign(@Param('orderId') orderId: string, @Body() dto: AssignRiderDto, @CurrentAuth() auth: AuthPayload) {
    if (auth.type !== 'staff') throw new ForbiddenException('仅店员可分配骑手');
    return this.deliveryService.assignRider(orderId, dto.riderId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('status')
  updateStatus(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateDeliveryStatusDto,
    @CurrentAuth() auth: AuthPayload,
  ) {
    if (auth.type !== 'rider') throw new ForbiddenException('仅骑手可更新配送状态');
    return this.deliveryService.updateStatus(orderId, auth.sub, dto.status);
  }

  @UseGuards(JwtAuthGuard)
  @Post('confirm-payment')
  confirmPayment(@Param('orderId') orderId: string, @CurrentAuth() auth: AuthPayload) {
    if (auth.type !== 'rider') throw new ForbiddenException('仅骑手可确认收款');
    return this.deliveryService.confirmPayment(orderId, auth.sub);
  }
}
