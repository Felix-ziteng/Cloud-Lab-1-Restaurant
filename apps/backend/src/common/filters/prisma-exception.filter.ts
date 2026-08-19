import { ArgumentsHost, Catch, ConflictException, ExceptionFilter, NotFoundException } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '@prisma/client';

// 兜底网：具体的接口应该像 deleteDish/deleteCategory/deleteTable 那样提前查一遍、
// 给出针对性的报错信息，这个 filter 只是防止漏查的地方把原始数据库错误直接抛给客户端
// 变成一个没人看得懂的 500——目前已经真实踩过两次坑（店员账号外键、菜品外键）。
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const mapped = this.mapError(exception);
    httpAdapter.reply(ctx.getResponse(), mapped.getResponse(), mapped.getStatus());
  }

  private mapError(exception: Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2003': // 外键约束
        return new ConflictException('该数据仍被其他记录引用，无法执行此操作');
      case 'P2025': // 找不到要更新/删除的记录
        return new NotFoundException('记录不存在');
      case 'P2002': // 唯一约束冲突
        return new ConflictException('数据已存在，请勿重复提交');
      default:
        return new ConflictException('数据库操作失败');
    }
  }
}
