import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthPayload } from '../auth/auth.types';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ArriveReservationDto } from './dto/arrive-reservation.dto';

@Controller('reservations')
@UseGuards(JwtAuthGuard)
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

  @Post(':id/arrive')
  arrive(@Param('id') id: string, @Body() dto: ArriveReservationDto, @CurrentAuth() auth: AuthPayload) {
    if (auth.type !== 'staff') throw new ForbiddenException('仅店员可操作到店开台');
    return this.reservationsService.arrive(id, dto.tableIds, auth.sub);
  }
}
