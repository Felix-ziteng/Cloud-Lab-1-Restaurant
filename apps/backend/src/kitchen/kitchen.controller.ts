import { Body, Controller, ForbiddenException, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthPayload } from '../auth/auth.types';
import { KitchenService } from './kitchen.service';
import { UpdateKitchenStatusDto } from './dto/update-kitchen-status.dto';

@Controller('order-items')
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  // MVP 简化：厨房站点级令牌（kitchen_station）尚未设计签发流程（见 auth.types.ts），
  // 现阶段 KDS 页面借用店员 PIN 登录来访问，等站点级预配置流程做出来了再切换
  @UseGuards(JwtAuthGuard)
  @Get('queue')
  getQueue(@CurrentAuth() auth: AuthPayload) {
    if (auth.type !== 'kitchen_station' && auth.type !== 'staff') {
      throw new ForbiddenException('仅厨房站点或店员可查看出品队列');
    }
    return this.kitchenService.getQueue();
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/kitchen-status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateKitchenStatusDto, @CurrentAuth() auth: AuthPayload) {
    if (auth.type !== 'kitchen_station' && auth.type !== 'staff') {
      throw new ForbiddenException('仅厨房站点或店员可更新出品状态');
    }
    return this.kitchenService.updateStatus(id, dto.status);
  }
}
