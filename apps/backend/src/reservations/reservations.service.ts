import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TablesService } from '../tables/tables.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tablesService: TablesService,
  ) {}

  create(dto: CreateReservationDto, staffId: string) {
    return this.prisma.reservation.create({
      data: {
        customerName: dto.customerName,
        phone: dto.phone,
        partySize: dto.partySize,
        reservedTime: new Date(dto.reservedTime),
        tableId: dto.tableId,
        note: dto.note,
        createdByStaffId: staffId,
      },
    });
  }

  list() {
    // 到点提醒是前端职责：按 reservedTime 临近程度做高亮/置顶展示（见 API_DESIGN.md / DATA_MODEL.md 3.5）
    return this.prisma.reservation.findMany({ orderBy: { reservedTime: 'asc' } });
  }

  async cancel(id: string) {
    return this.prisma.reservation.update({ where: { id }, data: { status: 'cancelled' } });
  }

  // 到店：触发开台，并把新会话关联回预定记录
  async arrive(id: string, tableIds: string[], staffId: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('预定不存在');

    const session = await this.tablesService.openSession(
      { tableIds, partySize: reservation.partySize },
      staffId,
    );
    // TableSession 持有 reservationId 外键（见 schema.prisma），反向从这里补上关联
    await this.prisma.tableSession.update({ where: { id: session.id }, data: { reservationId: id } });

    return this.prisma.reservation.update({
      where: { id },
      data: { status: 'arrived', arrivedAt: new Date() },
    });
  }
}
