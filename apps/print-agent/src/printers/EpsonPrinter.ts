import { printer as ThermalPrinter, types as PrinterTypes, characterSet as CharacterSet } from 'node-thermal-printer';
import type { KitchenTicketPayload, ReceiptPayload } from '@restaurant/shared-types';
import type { Printer, PrinterStatus } from './Printer';

const ORDER_TYPE_LABEL: Record<KitchenTicketPayload['orderType'], string> = {
  dine_in: '堂食',
  takeout: '自提',
  delivery: '配送',
};

// TM-T82III 网口+无线版：网络接口用 tcp://<ip>:<port>，node-thermal-printer 内部按这个 URI
// 直接开一条 TCP 连接发 ESC/POS 指令（见 node_modules/node-thermal-printer/lib/interfaces/network.js），
// 不需要装厂商驱动。characterSet 选 CHINA 是打印中文菜名/桌号的关键——默认字符集不含中文，
// 菜名会被打印成乱码或问号，这个坑没有实体打印机很容易漏掉。
export class EpsonPrinter implements Printer {
  private printer: ThermalPrinter;

  constructor(host: string, port: number) {
    this.printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: `tcp://${host}:${port}`,
      characterSet: CharacterSet.CHINA,
      removeSpecialCharacters: false,
      options: { timeout: 5000 },
    });
  }

  async printKitchenOrder(order: KitchenTicketPayload): Promise<void> {
    const p = this.printer;
    p.clear();
    p.alignCenter();
    p.setTextDoubleHeight();
    p.bold(true);
    p.println('厨房单');
    p.bold(false);
    p.setTextNormal();

    const label =
      order.orderType === 'dine_in'
        ? `桌台 ${order.tableLabel ?? '-'}`
        : `${ORDER_TYPE_LABEL[order.orderType]} #${order.orderNumber}`;
    p.println(label);
    p.println(`第 ${order.roundNumber} 轮`);
    p.drawLine();

    p.alignLeft();
    for (const item of order.items) {
      p.leftRight(item.dishName, `x${item.quantity}`);
      if (item.notes) p.println(`  备注: ${item.notes}`);
    }
    p.drawLine();
    p.println(new Date(order.createdAt).toLocaleString('zh-CN'));

    p.cut();
    await p.execute();
  }

  async printReceipt(order: ReceiptPayload): Promise<void> {
    const p = this.printer;
    p.clear();
    p.alignCenter();
    p.bold(true);
    p.println('收款小票');
    p.bold(false);

    const label =
      order.orderType === 'dine_in' ? `桌台 ${order.tableLabel ?? '-'}` : ORDER_TYPE_LABEL[order.orderType];
    p.println(`${label} · 订单号 #${order.orderNumber}`);
    p.drawLine();

    p.alignLeft();
    for (const item of order.items) {
      p.leftRight(`${item.dishName} x${item.quantity}`, `¥${(Number(item.unitPrice) * item.quantity).toFixed(2)}`);
    }
    p.drawLine();
    p.leftRight('小计', `¥${Number(order.subtotal).toFixed(2)}`);
    p.leftRight('折扣', `¥${Number(order.discountTotal).toFixed(2)}`);
    p.bold(true);
    p.leftRight('合计', `¥${Number(order.total).toFixed(2)}`);
    p.bold(false);
    p.println(`支付方式: ${order.paymentMethod}`);
    p.drawLine();
    p.println(new Date(order.paidAt).toLocaleString('zh-CN'));

    p.cut();
    await p.execute();
  }

  async testPrint(): Promise<void> {
    const p = this.printer;
    p.clear();
    p.alignCenter();
    p.bold(true);
    p.println('测试打印');
    p.bold(false);
    p.println('中文字符集测试：柠檬鸭 主食');
    p.println(new Date().toLocaleString('zh-CN'));
    p.cut();
    await p.execute();
  }

  async getStatus(): Promise<PrinterStatus> {
    const connected = await this.printer.isPrinterConnected();
    return { connected };
  }
}
