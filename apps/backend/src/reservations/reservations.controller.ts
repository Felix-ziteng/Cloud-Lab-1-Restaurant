import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthPayload } from '../auth/auth.types';
import { FeatureEnabledGuard } from '../store-config/guards/feature-enabled.guard';
import { RequireFeature } from '../store-config/decorators/require-feature.decorator';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ArriveReservationDto } from './dto/arrive-reservation.dto';

@Controller('reservations')
@UseGuards(JwtAuthGuard, FeatureEnabledGuard)
@RequireFeature('reservationEnabled')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  create(@Body() dto: CreateReservationDto, @CurrentAuth() auth: AuthPayload) {
    if (auth.type !== 'staff') throw new ForbiddenException('仅店员可登记预定');
    return this.reservationsService.create(dto, auth.sub);
  }

  @Get()
  list() {
    return this.reservationsService.list();
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.reservationsService.cancel(id);
  }

  // 暂不启用：整个控制器都挂在 reservationEnabled 开关下，见 ReservationsService.noShow 的说明
  @Patch(':id/no-show')
  noShow(@Param('id') id: string) {
    return this.reservationsService.noShow(id);
  }

  @Post(':id/arrive')
  arrive(@Param('id') id: string, @Body() dto: ArriveReservationDto, @CurrentAuth() auth: AuthPayload) {
    if (auth.type !== 'staff') throw new ForbiddenException('仅店员可操作到店开台');
    return this.reservationsService.arrive(id, dto.tableIds, auth.sub);
  }
}
