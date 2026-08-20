import type { KitchenTicketPayload, ReceiptPayload } from '@restaurant/shared-types';
import type { Printer, PrinterStatus } from './Printer';

// 占位适配器：目前没有 Star 品牌的实体打印机可以联调，接口先按 Printer 契约摆好，
// 等真有客户用 Star 的机器再实现（node-thermal-printer 本身已经支持 Star 的 ESC/POS 变体，
// 参考 EpsonPrinter.ts 改 PrinterTypes.STAR 即可，大概率不需要重新设计）
export class StarPrinter implements Printer {
  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {}

  async printKitchenOrder(_order: KitchenTicketPayload): Promise<void> {
    throw new Error(`StarPrinter 尚未实现（${this.host}:${this.port}）——目前只有 Epson 适配器是真实可用的`);
  }

  async printReceipt(_order: ReceiptPayload): Promise<void> {
    throw new Error('StarPrinter 尚未实现');
  }

  async testPrint(): Promise<void> {
    throw new Error('StarPrinter 尚未实现');
  }

  async getStatus(): Promise<PrinterStatus> {
    return { connected: false, detail: 'StarPrinter 尚未实现' };
  }
}
