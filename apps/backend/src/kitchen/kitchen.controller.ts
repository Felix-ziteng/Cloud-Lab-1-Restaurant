import { Body, Controller, ForbiddenException, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthPayload } from '../auth/auth.types';
import { KitchenService } from './kitchen.service';
import { UpdateKitchenStatusDto } from './dto/update-kitchen-status.dto';

@Controller('order-items')
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  // KDS 复用店员 PIN 登录（决策记录 2026-08-20：评估过无个人登录的站点级令牌，
  // 收益撑不起单独的签发/设备预配置流程，维持现状即可，见 auth.types.ts）
  @UseGuards(JwtAuthGuard)
  @Get('queue')
  getQueue(@CurrentAuth() auth: AuthPayload) {
    if (auth.type !== 'staff') {
      throw new ForbiddenException('仅店员可查看出品队列');
    }
    return this.kitchenService.getQueue();
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/kitchen-status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateKitchenStatusDto, @CurrentAuth() auth: AuthPayload) {
    if (auth.type !== 'staff') {
      throw new ForbiddenException('仅店员可更新出品状态');
    }
    return this.kitchenService.updateStatus(id, dto.status);
  }
}
