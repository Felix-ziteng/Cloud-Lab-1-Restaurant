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
    const pinHash = await bcrypt.hash(pin, 10);
    await this.prisma.staffAccount.update({ where: { id }, data: { pinHash } });
    return { ok: true };
  }
}
