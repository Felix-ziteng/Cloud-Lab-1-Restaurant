import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import type { AuthPayload } from '../auth.types';

// 校验 Authorization: Bearer <token>，适用于店员/店长/配送员/桌台会话四类调用方
// （token 内的 `type` 字段区分身份，具体角色/作用域校验交给 RolesGuard / GuestSessionGuard）
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException('缺少身份令牌');
    }

    try {
      request.auth = this.jwtService.verify<AuthPayload>(token);
      return true;
    } catch {
      throw new UnauthorizedException('身份令牌无效或已过期');
    }
  }
}
