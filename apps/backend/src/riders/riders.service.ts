import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRiderDto } from './dto/create-rider.dto';
import { UpdateRiderDto } from './dto/update-rider.dto';

const SUMMARY_SELECT = { id: true, name: true, status: true } as const;

@Injectable()
export class RidersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.rider.findMany({ select: SUMMARY_SELECT, orderBy: { name: 'asc' } });
  }

  async create(dto: CreateRiderDto) {
    const pinHash = await bcrypt.hash(dto.pin, 10);
    return this.prisma.rider.create({ data: { name: dto.name, pinHash }, select: SUMMARY_SELECT });
  }

  update(id: string, dto: UpdateRiderDto) {
    return this.prisma.rider.update({ where: { id }, data: dto, select: SUMMARY_SELECT });
  }

  async resetPin(id: string, pin: string) {
    const pinHash = await bcrypt.hash(pin, 10);
    await this.prisma.rider.update({ where: { id }, data: { pinHash } });
    return { ok: true };
  }
}
