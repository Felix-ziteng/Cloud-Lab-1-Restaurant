import { Body, Controller, ForbiddenException, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthPayload } from '../auth/auth.types';
import { FeatureEnabledGuard } from '../store-config/guards/feature-enabled.guard';
import { RequireFeature } from '../store-config/decorators/require-feature.decorator';
import { DeliveryService } from './delivery.service';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';

// 整个控制器都挂在 deliveryEnabled 开关下：这家店没开外卖模块，这些接口直接不可用
//
// 骑手模块暂时删除：店家自己配送，不需要分配骑手这一步，店员直接在前台把配送状态
// 标记为"配送中"/"已送达"就够了。
@UseGuards(FeatureEnabledGuard)
@RequireFeature('deliveryEnabled')
@Controller('orders/:orderId/delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @UseGuards(JwtAuthGuard)
  @Patch('status')
  updateStatus(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateDeliveryStatusDto,
    @CurrentAuth() auth: AuthPayload,
  ) {
    if (auth.type !== 'staff') throw new ForbiddenException('仅店员可更新配送状态');
    return this.deliveryService.updateStatus(orderId, dto.status);
  }
}
