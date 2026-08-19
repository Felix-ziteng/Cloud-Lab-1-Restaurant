import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { OpenTableSessionDto } from './dto/open-table-session.dto';
import { MergeTableSessionDto } from './dto/merge-table-session.dto';
import { UpsertTableDto } from './dto/upsert-table.dto';
import { UnmergeTableSessionDto } from './dto/unmerge-table-session.dto';
import { TransferTableSessionDto } from './dto/transfer-table-session.dto';
import { UpdatePartySizeDto } from './dto/update-party-size.dto';

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // 前台桌台看板：每张桌台 + 如果占用中，带出当前会话和账单
  async list() {
    const tables = await this.prisma.table.findMany({
      orderBy: { tableNumber: 'asc' },
      include: {
        sessions: {
          where: { session: { status: { in: ['open', 'pending_checkout'] } } },
          include: { session: { include: { order: true } } },
        },
      },
    });

    return tables.map(({ sessions, ...table }) => ({
      ...table,
      activeSession: sessions[0]?.session ?? null,
    }));
  }

  createTable(dto: UpsertTableDto) {
    return this.prisma.table.create({ data: { tableNumber: dto.tableNumber, capacity: dto.capacity, zone: dto.zone } });
  }

  async updateTable(id: string, dto: UpsertTableDto) {
    const table = await this.prisma.table.findUnique({ where: { id } });
    if (!table) throw new NotFoundException('桌台不存在');
    return this.prisma.table.update({
      where: { id },
      data: { tableNumber: dto.tableNumber, capacity: dto.capacity, zone: dto.zone },
    });
  }

  async deleteTable(id: string) {
    const table = await this.prisma.table.findUnique({ where: { id } });
    if (!table) throw new NotFoundException('桌台不存在');
    if (table.status !== 'idle') throw new ConflictException('该桌台不是空闲状态，无法删除');
    await this.prisma.table.delete({ where: { id } });
  }

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

  // 拆台：把某张桌从合并会话里移出，那张桌恢复空闲。会话至少要留一张桌，
  // 拆到只剩最后一张时应该走结账/清台，不是继续拆
  async unmergeTable(sessionId: string, dto: UnmergeTableSessionDto) {
    const link = await this.prisma.tableSessionTable.findUnique({
      where: { sessionId_tableId: { sessionId, tableId: dto.tableId } },
    });
    if (!link) throw new NotFoundException('该桌台不在这个会话里');

    const remaining = await this.prisma.tableSessionTable.count({ where: { sessionId } });
    if (remaining <= 1) {
      throw new ConflictException('这是会话里唯一的桌台，拆不出去——需要结账的话请走结账流程');
    }

    await this.prisma.$transaction([
      this.prisma.tableSessionTable.delete({ where: { sessionId_tableId: { sessionId, tableId: dto.tableId } } }),
      this.prisma.table.update({ where: { id: dto.tableId }, data: { status: 'idle' } }),
    ]);

    this.realtime.emitToFrontdesk('table_status_changed', { tableIds: [dto.tableId], status: 'idle' });
  }

  // 换桌：客人从一张桌挪到另一张空闲桌，会话本身不变（订单、已点的菜都还在同一个会话下）
  async transferTable(sessionId: string, dto: TransferTableSessionDto) {
    const [fromLink, toTable] = await Promise.all([
      this.prisma.tableSessionTable.findUnique({
        where: { sessionId_tableId: { sessionId, tableId: dto.fromTableId } },
      }),
      this.prisma.table.findUnique({ where: { id: dto.toTableId } }),
    ]);
    if (!fromLink) throw new NotFoundException('原桌台不在这个会话里');
    if (!toTable) throw new NotFoundException('目标桌台不存在');
    if (toTable.status !== 'idle') throw new ConflictException('目标桌台不是空闲状态');

    await this.prisma.$transaction([
      this.prisma.tableSessionTable.delete({
        where: { sessionId_tableId: { sessionId, tableId: dto.fromTableId } },
      }),
      this.prisma.tableSessionTable.create({ data: { sessionId, tableId: dto.toTableId } }),
      this.prisma.table.update({ where: { id: dto.fromTableId }, data: { status: 'idle' } }),
      this.prisma.table.update({ where: { id: dto.toTableId }, data: { status: 'occupied' } }),
    ]);

    this.realtime.emitToFrontdesk('table_status_changed', {
      tableIds: [dto.fromTableId, dto.toTableId],
      status: 'transferred',
    });
  }

  async updatePartySize(sessionId: string, dto: UpdatePartySizeDto) {
    const session = await this.prisma.tableSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('会话不存在');
    if (session.status === 'closed') throw new ConflictException('该会话已关闭，不能改人数');

    return this.prisma.tableSession.update({ where: { id: sessionId }, data: { partySize: dto.partySize } });
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
  //
  // "先查有没有会话、没有就建一个"这两步如果不加锁，两个几乎同时到达的并发请求
  // （比如 React StrictMode 开发模式下同一个 useEffect 会触发两次）都可能在对方提交前
  // 读到"还没开台"，各自建出一个会话——用 SELECT ... FOR UPDATE 锁住这一行桌台记录，
  // 让并发请求排队执行，而不是都通过检查。
  async joinOrAutoOpen(tableId: string, partySize?: number) {
    const { session, created } = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM tables WHERE id = ${tableId} FOR UPDATE
      `;
      const table = locked[0];
      if (!table) throw new NotFoundException('桌台不存在');
      if (table.status === 'pending_clear') throw new ConflictException('table_pending_clear');

      if (table.status === 'occupied') {
        const existing = await tx.tableSession.findFirstOrThrow({
          where: { status: { in: ['open', 'pending_checkout'] }, tables: { some: { tableId } } },
          include: { order: true },
        });
        return { session: existing, created: false };
      }

      const newSession = await tx.tableSession.create({
        data: {
          partySize: partySize ?? 1,
          tables: { create: [{ tableId }] },
          order: { create: { type: 'dine_in', createdByType: 'customer' } },
        },
        include: { order: true },
      });
      await tx.table.update({ where: { id: tableId }, data: { status: 'occupied' } });
      return { session: newSession, created: true };
    });

    if (created) {
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
