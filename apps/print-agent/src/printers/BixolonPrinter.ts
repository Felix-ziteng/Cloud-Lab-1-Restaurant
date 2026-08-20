import type { KitchenTicketPayload, ReceiptPayload } from '@restaurant/shared-types';
import type { Printer, PrinterStatus } from './Printer';

// 占位适配器，同 StarPrinter.ts 的说明——Bixolon 走的也是标准 ESC/POS，
// node-thermal-printer 没有内置 Bixolon 类型，真要接的话大概率用 PrinterTypes.CUSTOM
// 加自定义指令集，需要拿到实体机器才能验证具体指令差异
export class BixolonPrinter implements Printer {
  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {}

  async printKitchenOrder(_order: KitchenTicketPayload): Promise<void> {
    throw new Error(`BixolonPrinter 尚未实现（${this.host}:${this.port}）——目前只有 Epson 适配器是真实可用的`);
  }

  async printReceipt(_order: ReceiptPayload): Promise<void> {
    throw new Error('BixolonPrinter 尚未实现');
  }

  async testPrint(): Promise<void> {
    throw new Error('BixolonPrinter 尚未实现');
  }

  async getStatus(): Promise<PrinterStatus> {
    return { connected: false, detail: 'BixolonPrinter 尚未实现' };
  }
}
