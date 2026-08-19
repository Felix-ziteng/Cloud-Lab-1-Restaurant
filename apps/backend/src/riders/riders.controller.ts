import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { FeatureEnabledGuard } from '../store-config/guards/feature-enabled.guard';
import { RequireFeature } from '../store-config/decorators/require-feature.decorator';
import { RidersService } from './riders.service';
import { CreateRiderDto } from './dto/create-rider.dto';
import { UpdateRiderDto } from './dto/update-rider.dto';
import { ResetRiderPinDto } from './dto/reset-rider-pin.dto';

// 骑手账号管理仅在门店开启外卖模块时有意义，跟 delivery 分组挂同一个开关
@Controller('riders')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureEnabledGuard)
@Roles('manager')
@RequireFeature('deliveryEnabled')
export class RidersController {
  constructor(private readonly ridersService: RidersService) {}

  @Get()
  list() {
    return this.ridersService.list();
  }

  @Post()
  create(@Body() dto: CreateRiderDto) {
    return this.ridersService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRiderDto) {
    return this.ridersService.update(id, dto);
  }

  @Patch(':id/pin')
  resetPin(@Param('id') id: string, @Body() dto: ResetRiderPinDto) {
    return this.ridersService.resetPin(id, dto.pin);
  }
}
