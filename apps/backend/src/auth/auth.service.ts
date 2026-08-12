import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // PIN 不作为查找键（bcrypt 哈希不可逆、不可索引），只能在在职账号范围内逐个比对。
  // 单店员工规模下（几人到几十人）这个开销可以忽略；如果未来员工规模变大，
  // 可以改成"PIN + 工号"两段式输入来避免线性扫描。
  async staffLogin(pin: string) {
    const candidates = await this.prisma.staffAccount.findMany({ where: { status: 'active' } });
    const matched = await this.findPinMatch(candidates, pin);

    if (!matched) {
      throw new UnauthorizedException('PIN 码不正确');
    }

    const token = this.jwtService.sign({ type: 'staff', sub: matched.id, role: matched.role });
    return { token, role: matched.role };
  }

  async riderLogin(pin: string) {
    const candidates = await this.prisma.rider.findMany({ where: { status: 'active' } });
    const matched = await this.findPinMatch(candidates, pin);

    if (!matched) {
      throw new UnauthorizedException('PIN 码不正确');
    }

    const token = this.jwtService.sign({ type: 'rider', sub: matched.id });
    return { token };
  }

  private async findPinMatch<T extends { pinHash: string }>(
    candidates: T[],
    pin: string,
  ): Promise<T | undefined> {
    for (const candidate of candidates) {
      if (await bcrypt.compare(pin, candidate.pinHash)) {
        return candidate;
      }
    }
    return undefined;
  }
}
