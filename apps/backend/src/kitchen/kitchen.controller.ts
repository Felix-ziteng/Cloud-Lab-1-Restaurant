import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { KitchenService } from './kitchen.service';
import { UpdateKitchenStatusDto } from './dto/update-kitchen-status.dto';

// KDS 站点级访问、无个人登录（2026-08-20 修正决策：之前评估过站点级 JWT 令牌，
// 因为收益撑不起单独的签发/设备预配置流程而搁置——但那次评估针对的是"要不要发一个
// 专属令牌"，不代表这两个接口就必须挂在店员 PIN 登录后面。真正兜住暴露面的是
// ops/Caddyfile 的白名单：/api/order-items/* 不在其中，公网隧道天然碰不到，
// 只有厨房这台设备所在的局域网能访问，所以这里可以直接不做鉴权）
@Controller('order-items')
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  @Get('queue')
  getQueue() {
    return this.kitchenService.getQueue();
  }

  @Patch(':id/kitchen-status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateKitchenStatusDto) {
    return this.kitchenService.updateStatus(id, dto.status);
  }
}
