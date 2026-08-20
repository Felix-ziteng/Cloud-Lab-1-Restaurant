import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TablesService } from '../tables/tables.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tablesService: TablesService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(dto: CreateReservationDto, staffId: string) {
    const reservation = await this.prisma.reservation.create({
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
    this.realtime.emitToFrontdesk('reservation_changed', { reservationId: reservation.id });
    return reservation;
  }

  list() {
    // 到点提醒是前端职责：按 reservedTime 临近程度做高亮/置顶展示（见 API_DESIGN.md / DATA_MODEL.md 3.5）
    return this.prisma.reservation.findMany({ orderBy: { reservedTime: 'asc' } });
  }

  async cancel(id: string) {
    const updated = await this.prisma.reservation.update({ where: { id }, data: { status: 'cancelled' } });
    this.realtime.emitToFrontdesk('reservation_changed', { reservationId: id });
    return updated;
  }

  // 暂不启用：这个模块整体挂在 reservationEnabled 开关下（当前是 false），
  // 所以这条路由现在天然不可达；代码先写完，等预定模块真正对某个客户开放时一起启用
  // （见 2026-08-20 决策记录）。只允许从"待到店"转过来——已经到店/已取消的没有"没来"这回事
  async noShow(id: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('预定不存在');
    if (reservation.status !== 'pending') throw new BadRequestException('只有待到店的预定才能标记为未到');

    const updated = await this.prisma.reservation.update({ where: { id }, data: { status: 'no_show' } });
    this.realtime.emitToFrontdesk('reservation_changed', { reservationId: id });
    return updated;
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

    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { status: 'arrived', arrivedAt: new Date() },
    });
    this.realtime.emitToFrontdesk('reservation_changed', { reservationId: id });
    return updated;
  }
}
