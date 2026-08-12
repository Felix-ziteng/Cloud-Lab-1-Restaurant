import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { OpenTableSessionDto } from './dto/open-table-session.dto';
import { MergeTableSessionDto } from './dto/merge-table-session.dto';

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // 店员在前台手动开台。见 API_DESIGN.md 第 3 节。
  async openSession(dto: OpenTableSessionDto, staffId: string) {
    const tables = await this.prisma.table.findMany({ where: { id: { in: dto.tableIds } } });
    if (tables.length !== dto.tableIds.length) {
      throw new NotFoundException('部分桌台不存在');
    }
    const notIdle = tables.find((t) => t.status !== 'idle');
    if (notIdle) {
      throw new ConflictException(`桌台 ${notIdle.tableNumber} 当前不是空闲状态`);
    }

    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tableSession.create({
        data: {
          partySize: dto.partySize,
          openedByStaffId: staffId,
          tables: { create: dto.tableIds.map((tableId) => ({ tableId })) },
          order: {
            create: { type: 'dine_in', createdByType: 'staff', createdByStaffId: staffId },
          },
        },
        include: { order: true, tables: true },
      });
      await tx.table.updateMany({ where: { id: { in: dto.tableIds } }, data: { status: 'occupied' } });
      return created;
    });

    this.realtime.emitToFrontdesk('table_status_changed', { tableIds: dto.tableIds, status: 'occupied' });
    return session;
  }

  async mergeSession(sessionId: string, dto: MergeTableSessionDto) {
    const additional = await this.prisma.table.findMany({ where: { id: { in: dto.additionalTableIds } } });
    const notIdle = additional.find((t) => t.status !== 'idle');
    if (notIdle) {
      throw new ConflictException(`桌台 ${notIdle.tableNumber} 当前不是空闲状态，无法并入`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tableSessionTable.createMany({
        data: dto.additionalTableIds.map((tableId) => ({ sessionId, tableId })),
      });
      await tx.table.updateMany({ where: { id: { in: dto.additionalTableIds } }, data: { status: 'occupied' } });
    });

    this.realtime.emitToFrontdesk('table_status_changed', {
      tableIds: dto.additionalTableIds,
      status: 'occupied',
    });
    return this.prisma.tableSession.findUniqueOrThrow({ where: { id: sessionId }, include: { tables: true } });
  }

  // 结账完成后调用：会话关闭，关联桌台转为"待清台"（见 API_DESIGN.md 第 3 节的状态链）
  async closeSession(sessionId: string) {
    const session = await this.prisma.tableSession.findUnique({
      where: { id: sessionId },
      include: { tables: true },
    });
    if (!session) throw new NotFoundException('会话不存在');

    const tableIds = session.tables.map((t) => t.tableId);
    await this.prisma.$transaction([
      this.prisma.tableSession.update({
        where: { id: sessionId },
        data: { status: 'closed', closedAt: new Date() },
      }),
      this.prisma.table.updateMany({ where: { id: { in: tableIds } }, data: { status: 'pending_clear' } }),
    ]);

    this.realtime.emitToFrontdesk('table_status_changed', { tableIds, status: 'pending_clear' });
  }

  // 店员确认清台完成
  async clearTable(tableId: string) {
    const table = await this.prisma.table.findUnique({ where: { id: tableId } });
    if (!table) throw new NotFoundException('桌台不存在');
    if (table.status !== 'pending_clear') {
      throw new ConflictException('该桌台当前不是待清台状态');
    }

    await this.prisma.table.update({ where: { id: tableId }, data: { status: 'idle' } });
    this.realtime.emitToFrontdesk('table_status_changed', { tableIds: [tableId], status: 'idle' });
  }

  // 顾客扫码 / 桌台平板加入。核心规则见 docs/API_DESIGN.md 第 3 节：
  //   idle          -> 自动开台
  //   occupied      -> 加入已有会话
  //   pending_clear -> 拒绝，必须先由店员清台
  async joinOrAutoOpen(tableId: string, partySize?: number) {
    const table = await this.prisma.table.findUnique({ where: { id: tableId } });
    if (!table) throw new NotFoundException('桌台不存在');

    if (table.status === 'pending_clear') {
      throw new ConflictException('table_pending_clear');
    }

    let session = await this.prisma.tableSession.findFirst({
      where: { status: { in: ['open', 'pending_checkout'] }, tables: { some: { tableId } } },
      include: { order: true },
    });

    if (!session) {
      session = await this.prisma.$transaction(async (tx) => {
        const created = await tx.tableSession.create({
          data: {
            partySize: partySize ?? 1,
            tables: { create: [{ tableId }] },
            order: { create: { type: 'dine_in', createdByType: 'customer' } },
          },
          include: { order: true },
        });
        await tx.table.update({ where: { id: tableId }, data: { status: 'occupied' } });
        return created;
      });
      this.realtime.emitToFrontdesk('table_status_changed', { tableIds: [tableId], status: 'occupied' });
    }

    const token = this.jwtService.sign({
      type: 'guest',
      sub: randomUUID(),
      tableSessionId: session.id,
      orderId: session.order!.id,
    });

    return { sessionToken: token, orderId: session.order!.id };
  }
}
