import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { PrintAgentGuard } from './guards/print-agent.guard';
import { PrintJobsService } from './print-jobs.service';
import { MarkPrintJobDto } from './dto/mark-print-job.dto';

// 只给打印代理（apps/print-agent）用，不是店员/顾客接口——鉴权走 PrintAgentGuard 的
// 固定共享密钥，不是 JWT
@UseGuards(PrintAgentGuard)
@Controller('print-jobs')
export class PrintJobsController {
  constructor(private readonly printJobsService: PrintJobsService) {}

  @Get('pending')
  listPending() {
    return this.printJobsService.listPending();
  }

  @Patch(':id')
  mark(@Param('id') id: string, @Body() dto: MarkPrintJobDto) {
    if (dto.status === 'printed') return this.printJobsService.markPrinted(id);
    return this.printJobsService.markFailed(id, dto.errorMessage);
  }
}
