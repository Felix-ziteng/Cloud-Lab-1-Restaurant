import { Body, Controller, ForbiddenException, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthPayload } from '../auth/auth.types';
import { KitchenService } from './kitchen.service';
import { UpdateKitchenStatusDto } from './dto/update-kitchen-status.dto';

@Controller('order-items')
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  @UseGuards(JwtAuthGuard)
  @Patch(':id/kitchen-status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateKitchenStatusDto, @CurrentAuth() auth: AuthPayload) {
    if (auth.type !== 'kitchen_station' && auth.type !== 'staff') {
      throw new ForbiddenException('仅厨房站点或店员可更新出品状态');
    }
    return this.kitchenService.updateStatus(id, dto.status);
  }
}
