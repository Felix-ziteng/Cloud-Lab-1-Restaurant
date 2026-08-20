import type { KitchenTicketPayload, ReceiptPayload } from '@restaurant/shared-types';

export type PrinterStatus = { connected: boolean; detail?: string };

// 统一接口，屏蔽具体品牌的 ESC/POS 差异——以后客户自己有别的打印机，
// 只需要照着这个接口再写一个适配器，Print Agent 的其它部分（队列、REST/WS 通信）不用改
export interface Printer {
  printKitchenOrder(order: KitchenTicketPayload): Promise<void>;
  printReceipt(order: ReceiptPayload): Promise<void>;
  testPrint(): Promise<void>;
  getStatus(): Promise<PrinterStatus>;
}
