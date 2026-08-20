import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

const SUMMARY_SELECT = { id: true, name: true, role: true, status: true } as const;

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.staffAccount.findMany({ select: SUMMARY_SELECT, orderBy: { name: 'asc' } });
  }

  async create(dto: CreateStaffDto) {
    await this.assertPinAvailable(dto.pin);
    const pinHash = await bcrypt.hash(dto.pin, 10);
    return this.prisma.staffAccount.create({
      data: { name: dto.name, role: dto.role, pinHash },
      select: SUMMARY_SELECT,
    });
  }

  async update(id: string, dto: UpdateStaffDto) {
    const account = await this.prisma.staffAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('账号不存在');

    const losingManagerStatus =
      account.role === 'manager' &&
      account.status === 'active' &&
      ((dto.role !== undefined && dto.role !== 'manager') || (dto.status !== undefined && dto.status !== 'active'));

    if (losingManagerStatus) {
      const otherActiveManagers = await this.prisma.staffAccount.count({
        where: { role: 'manager', status: 'active', id: { not: id } },
      });
      if (otherActiveManagers === 0) {
        throw new ConflictException('至少要保留一个在职的店长/管理员账号');
      }
    }

    return this.prisma.staffAccount.update({ where: { id }, data: dto, select: SUMMARY_SELECT });
  }

  async resetPin(id: string, pin: string) {
    await this.assertPinAvailable(pin, id);
    const pinHash = await bcrypt.hash(pin, 10);
    await this.prisma.staffAccount.update({ where: { id }, data: { pinHash } });
    return { ok: true };
  }

  // PIN 登录（auth.service.ts）是"在职账号里线性扫描，谁的哈希先匹配上就是谁"——
  // 如果两个在职员工的 PIN 撞了，后登录的那个人会被系统认成前一个人，审计记录全部记错人。
  // 只能在新建/重置这两个"拿得到明文 PIN"的时刻做拦截，账号重新激活（没带新 PIN）
  // 那条路径拿不到明文、没法比对，是这个方案本身的局限，不在这里处理。
  private async assertPinAvailable(pin: string, excludeId?: string) {
    const candidates = await this.prisma.staffAccount.findMany({
      where: { status: 'active', id: excludeId ? { not: excludeId } : undefined },
      select: { pinHash: true },
    });
    for (const candidate of candidates) {
      if (await bcrypt.compare(pin, candidate.pinHash)) {
        throw new ConflictException('该 PIN 码已被其他在职员工使用，请换一个');
      }
    }
  }
}
