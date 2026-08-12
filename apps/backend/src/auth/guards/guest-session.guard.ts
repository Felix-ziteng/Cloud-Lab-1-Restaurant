import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

// 校验调用方是合法的桌台会话（顾客手机 / 桌台平板），拒绝店员/骑手令牌误用到顾客专属接口
@Injectable()
export class GuestSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const auth = request.auth;

    if (!auth || auth.type !== 'guest') {
      throw new ForbiddenException('需要有效的桌台会话');
    }

    return true;
  }
}
