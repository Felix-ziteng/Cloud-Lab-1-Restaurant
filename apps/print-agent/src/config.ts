import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}，请检查 .env`);
  return value;
}

export const config = {
  backendUrl: process.env.BACKEND_URL ?? 'http://localhost:3000',
  printAgentToken: required('PRINT_AGENT_TOKEN'),
  // 目前只接了 Epson（TM-T82III 网口+无线版），Star/Bixolon 先留适配器占位，
  // 等真有客户用别的牌子再实现，见 printers/StarPrinter.ts、BixolonPrinter.ts
  printerBrand: (process.env.PRINTER_BRAND ?? 'epson') as 'epson' | 'star' | 'bixolon',
  printerHost: required('PRINTER_HOST'),
  printerPort: Number(process.env.PRINTER_PORT ?? 9100),
  // 断线重连后的兜底轮询间隔——WebSocket 是主要通知渠道，这个纯粹是"以防万一漏了"
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 30_000),
};
