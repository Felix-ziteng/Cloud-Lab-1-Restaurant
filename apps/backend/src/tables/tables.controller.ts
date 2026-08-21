import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthPayload } from '../auth/auth.types';
import { TablesService } from './tables.service';
import { OpenTableSessionDto } from './dto/open-table-session.dto';
import { MergeTableSessionDto } from './dto/merge-table-session.dto';
import { JoinTableSessionDto } from './dto/join-table-session.dto';
import { UpsertTableDto } from './dto/upsert-table.dto';
import { UnmergeTableSessionDto } from './dto/unmerge-table-session.dto';
import { TransferTableSessionDto } from './dto/transfer-table-session.dto';
import { UpdatePartySizeDto } from './dto/update-party-size.dto';
import { TabletOpenDto } from './dto/tablet-open.dto';

@Controller()
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @UseGuards(JwtAuthGuard)
  @Get('tables')
  list() {
    return this.tablesService.list();
  }

  // 不鉴权：桌台平板选桌开台前拉空闲桌台列表用，字段已经在 service 层砍到最小
  @Get('tables/idle')
  listIdle() {
    return this.tablesService.listIdle();
  }

  // 桌台/包间是门店"底图"数据，跟菜单目录价同级别，仅 manager 可维护
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Post('tables')
  createTable(@Body() dto: UpsertTableDto) {
    return this.tablesService.createTable(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Put('tables/:id')
  updateTable(@Param('id') id: string, @Body() dto: UpsertTableDto) {
    return this.tablesService.updateTable(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Delete('tables/:id')
  deleteTable(@Param('id') id: string) {
    return this.tablesService.deleteTable(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('table-sessions')
  openSession(@Body() dto: OpenTableSessionDto, @CurrentAuth() auth: AuthPayload) {
    // 路由本身只挂 JwtAuthGuard（登录即可），店员/店长均可开台，不属于敏感操作，无需 RolesGuard
    const staffId = auth.type === 'staff' ? auth.sub : undefined;
    return this.tablesService.openSession(dto, staffId!);
  }

  @UseGuards(JwtAuthGuard)
  @Post('table-sessions/:id/merge')
  mergeSession(@Param('id') id: string, @Body() dto: MergeTableSessionDto) {
    return this.tablesService.mergeSession(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('table-sessions/:id/unmerge')
  unmergeTable(@Param('id') id: string, @Body() dto: UnmergeTableSessionDto) {
    return this.tablesService.unmergeTable(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('table-sessions/:id/transfer')
  transferTable(@Param('id') id: string, @Body() dto: TransferTableSessionDto) {
    return this.tablesService.transferTable(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('table-sessions/:id/party-size')
  updatePartySize(@Param('id') id: string, @Body() dto: UpdatePartySizeDto) {
    return this.tablesService.updatePartySize(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('table-sessions/:id/close')
  closeSession(@Param('id') id: string) {
    return this.tablesService.closeSession(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('tables/:id/clear')
  clearTable(@Param('id') id: string) {
    return this.tablesService.clearTable(id);
  }

  // 无需登录：顾客扫码首次访问就是通过这个接口换取会话令牌
  @Post('table-sessions/:tableId/join')
  join(@Param('tableId') tableId: string, @Body() dto: JoinTableSessionDto) {
    return this.tablesService.joinOrAutoOpen(tableId, dto.partySize);
  }

  // 无需登录：桌台平板（流动、店员现场选桌）走这个入口，多一道开台密码校验，
  // 跟顾客扫码的 join 不是同一个入口——不能让扫码 join 也顺带被密码保护住
  @Post('table-sessions/:tableId/tablet-open')
  tabletOpen(@Param('tableId') tableId: string, @Body() dto: TabletOpenDto) {
    return this.tablesService.tabletOpen(tableId, dto.partySize, dto.passcode);
  }
}
