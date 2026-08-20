import { config } from './config';
import { createPrinter } from './printers';
import { PrintQueue } from './queue';

async function main() {
  const printer = createPrinter(config.printerBrand, config.printerHost, config.printerPort);

  const status = await printer.getStatus();
  if (!status.connected) {
    console.warn(
      `[print-agent] 启动时打印机未连接（${config.printerHost}:${config.printerPort}${status.detail ? '，' + status.detail : ''}）——` +
        '继续运行，任务会先攒着，打印机恢复后下一轮轮询会重试',
    );
  } else {
    console.log(`[print-agent] 打印机已连接: ${config.printerHost}:${config.printerPort}`);
  }

  const queue = new PrintQueue(printer);
  queue.start();
  console.log(`[print-agent] 已启动，连接后端: ${config.backendUrl}`);
}

main().catch((err) => {
  console.error('[print-agent] 启动失败:', err);
  process.exit(1);
});
