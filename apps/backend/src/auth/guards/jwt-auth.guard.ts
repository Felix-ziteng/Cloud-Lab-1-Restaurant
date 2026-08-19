import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import type { AuthPayload } from '../auth.types';
import { PrismaService } from '../../prisma/prisma.service';

// 校验 Authorization: Bearer <token>，适用于店员/店长/配送员/桌台会话四类调用方
// （token 内的 `type` 字段区分身份，具体角色/作用域校验交给 RolesGuard / GuestSessionGuard）
//
// JWT 本身是无状态的：签名和有效期校验通过，不代表这个账号现在还存在、还在职。
// 店员/骑手这两类必须额外查一次库，确认账号还在且状态是 active——否则账号被停用/删除后，
// 已经签发出去的令牌会一直能用到自然过期（最长 12 小时），这是一个真实的安全漏洞，
// 也是之前"开台报 500"那次故障的根因（令牌指向的账号在一次数据库重置后已经不存在了）。
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException('缺少身份令牌');
    }

    let payload: AuthPayload;
    try {
      payload = this.jwtService.verify<AuthPayload>(token);
    } catch {
      throw new UnauthorizedException('身份令牌无效或已过期');
    }

    if (payload.type === 'staff') {
      const account = await this.prisma.staffAccount.findUnique({ where: { id: payload.sub } });
      if (!account || account.status !== 'active') {
        throw new UnauthorizedException('账号已失效，请重新登录');
      }
      // 权限（role）以数据库当前值为准：token 里的 role 只是签发时的快照，
      // 万一账号被改了角色，旧 token 不该继续拿着旧权限用到过期
      payload.role = account.role;
    } else if (payload.type === 'rider') {
      const rider = await this.prisma.rider.findUnique({ where: { id: payload.sub } });
      if (!rider || rider.status !== 'active') {
        throw new UnauthorizedException('账号已失效，请重新登录');
      }
    }

    request.auth = payload;
    return true;
  }
}
