import { io } from 'socket.io-client';
import type { KitchenTicketPayload, PrintJob, ReceiptPayload } from '@restaurant/shared-types';
import { config } from './config';
import { api } from './api-client';
import type { Printer } from './printers';

// 打印代理跟后端只有两条通路：WebSocket 收"有新任务了"的即时通知（发了就忘，不保证送达），
// REST 轮询 /print-jobs/pending 兜底补漏（代理离线期间产生的任务、或者错过的 WS 事件都靠这个补上）。
// 两条通路都走到同一个 processJob，用 inFlight 这个 Set 防止同一个任务被并发处理两次。
export class PrintQueue {
  private inFlight = new Set<string>();

  constructor(private readonly printer: Printer) {}

  start() {
    this.connectSocket();
    this.pollOnce();
    setInterval(() => this.pollOnce(), config.pollIntervalMs);
  }

  private connectSocket() {
    const socket = io(config.backendUrl, { auth: { token: config.printAgentToken } });

    socket.on('connect', () => {
      console.log('[print-agent] WebSocket 已连接，加入 kitchen 房间');
      this.pollOnce(); // 重连后立刻补一次，弥补断线期间可能错过的任务
    });

    socket.on('disconnect', (reason) => {
      console.warn('[print-agent] WebSocket 断开:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('[print-agent] WebSocket 连接失败:', err.message);
    });

    socket.on('print_job_created', () => {
      this.pollOnce();
    });
  }

  private async pollOnce() {
    let jobs: PrintJob[];
    try {
      jobs = await api.listPending();
    } catch (err) {
      console.error('[print-agent] 拉取待打印任务失败:', err instanceof Error ? err.message : err);
      return;
    }

    for (const job of jobs) {
      if (this.inFlight.has(job.id)) continue;
      this.inFlight.add(job.id);
      this.processJob(job).finally(() => this.inFlight.delete(job.id));
    }
  }

  private async processJob(job: PrintJob) {
    try {
      if (job.type === 'kitchen') {
        await this.printer.printKitchenOrder(job.payload as KitchenTicketPayload);
      } else {
        await this.printer.printReceipt(job.payload as ReceiptPayload);
      }
      await api.markPrinted(job.id);
      console.log(`[print-agent] 打印成功: ${job.type} ${job.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[print-agent] 打印失败: ${job.type} ${job.id} —`, message);
      try {
        await api.markFailed(job.id, message);
      } catch (reportErr) {
        console.error('[print-agent] 上报打印失败状态也失败了:', reportErr);
      }
    }
  }
}
