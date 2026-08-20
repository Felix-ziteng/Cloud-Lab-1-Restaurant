import { BadRequestException } from '@nestjs/common';

// 用不带时区后缀的 ISO 字符串，让 Node 按服务器本地时区解析——门店的营业日边界
// 就是服务器所在时区的自然日边界，这样"8月20日"才对应店里真实的一个营业日。
// 报表（ReportsService）和历史订单按日期筛选（OrdersService.list）共用同一套解析逻辑。
export function parseDayBoundary(dateStr: string, endOfDay: boolean): Date {
  const date = new Date(`${dateStr}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('日期格式不正确，应为 YYYY-MM-DD');
  return date;
}
