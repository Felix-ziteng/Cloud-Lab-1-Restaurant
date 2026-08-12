import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import type { AuthPayload } from '../auth/auth.types';
import { TablesService } from './tables.service';
import { OpenTableSessionDto } from './dto/open-table-session.dto';
import { MergeTableSessionDto } from './dto/merge-table-session.dto';
import { JoinTableSessionDto } from './dto/join-table-session.dto';

@Controller()
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

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
  @Post('table-sessions/:id/close')
  closeSession(@Param('id') id: string) {
    return this.tablesService.closeSession(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('tables/:id/clear')
  clearTable(@Param('id') id: string) {
    return this.tablesService.clearTable(id);
  }

  // 无需登录：顾客扫码或桌台平板首次访问就是通过这个接口换取会话令牌
  @Post('table-sessions/:tableId/join')
  join(@Param('tableId') tableId: string, @Body() dto: JoinTableSessionDto) {
    return this.tablesService.joinOrAutoOpen(tableId, dto.partySize);
  }
}
