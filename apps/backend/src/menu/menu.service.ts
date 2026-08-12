import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertDishDto } from './dto/upsert-dish.dto';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  // 顾客视角：只看可售菜品；店员/管理端传 includeUnavailable=true 看全部
  async getMenu(includeUnavailable = false) {
    return this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        dishes: {
          where: includeUnavailable ? {} : { isAvailable: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  createDish(dto: UpsertDishDto) {
    return this.prisma.dish.create({ data: dto });
  }

  updateDish(id: string, dto: UpsertDishDto) {
    return this.prisma.dish.update({ where: { id }, data: dto });
  }

  deleteDish(id: string) {
    return this.prisma.dish.delete({ where: { id } });
  }

  // 售罄开关：非敏感操作，普通店员即可（见 API_DESIGN.md 第 5 节）
  setAvailability(id: string, isAvailable: boolean) {
    return this.prisma.dish.update({ where: { id }, data: { isAvailable } });
  }
}
