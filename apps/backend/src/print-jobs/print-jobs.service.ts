import { Injectable, NotFoundException } from '@nestjs/common';
import type { KitchenTicketPayload, ReceiptPayload } from '@restaurant/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

// 厨房小票/收据的打印内容：建单/收款那一刻的快照，不是实时反查订单当前状态——
// 打印代理不需要理解订单业务逻辑，只需要把这个 payload 排版成 ESC/POS 指令。
// 即使订单之后被改价/作废，已经生成的这张 PrintJob 内容也不受影响，这是故意的
// （小票本来就该反映"打印那一刻"的情况，不是"现在"的情况）。
// 类型定义在 @restaurant/shared-types 里，因为这个 payload 形状是 backend 和
// apps/print-agent 两个独立包之间的真实契约，不是内部实现细节。
@Injectable()
export class PrintJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async createKitchenJob(orderId: string, payload: KitchenTicketPayload) {
    const job = await this.prisma.printJob.create({
      data: { type: 'kitchen', orderId, payload: payload as never },
    });
    this.realtime.emitToKitchen('print_job_created', { id: job.id, type: 'kitchen' });
    return job;
  }

  async createReceiptJob(orderId: string, payload: ReceiptPayload) {
    const job = await this.prisma.printJob.create({
      data: { type: 'receipt', orderId, payload: payload as never },
    });
    this.realtime.emitToKitchen('print_job_created', { id: job.id, type: 'receipt' });
    return job;
  }

  // 打印代理启动时/断线重连后用来补打漏掉的任务——WebSocket 通知是"发了就忘"，
  // 代理离线期间产生的任务不会重发，靠这个接口兜底
  listPending() {
    return this.prisma.printJob.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markPrinted(id: string) {
    const job = await this.prisma.printJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('打印任务不存在');
    return this.prisma.printJob.update({
      where: { id },
      data: { status: 'printed', printedAt: new Date() },
    });
  }

  async markFailed(id: string, errorMessage?: string) {
    const job = await this.prisma.printJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('打印任务不存在');
    return this.prisma.printJob.update({
      where: { id },
      data: { status: 'failed', errorMessage },
    });
  }
}
