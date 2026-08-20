import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportsService } from './reports.service';

// 只给店长看，普通店员不开放——这是店长自己想看的经营数据，不是操作台需要的信息
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('manager')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  getOverview(@Query('from') from: string, @Query('to') to: string) {
    return this.reportsService.getOverview(from, to);
  }
}
