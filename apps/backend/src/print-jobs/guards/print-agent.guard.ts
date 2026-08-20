import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

// 打印代理是一个无人值守的本地服务，不是店员账号——用固定的共享密钥而不是 PIN 登录换 JWT，
// 不用应付令牌过期后重新登录这件事（打印代理没有界面可以弹窗提示"请重新登录"）。
// 全程局域网内，风险跟店内其它内部服务调用一致。
@Injectable()
export class PrintAgentGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers['x-print-agent-token'];
    const expected = this.config.get<string>('PRINT_AGENT_TOKEN');

    if (!expected || token !== expected) {
      throw new UnauthorizedException('打印代理凭证无效');
    }
    return true;
  }
}
