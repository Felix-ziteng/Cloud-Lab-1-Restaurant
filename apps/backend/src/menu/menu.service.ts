import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertDishDto } from './dto/upsert-dish.dto';
import { UpsertCategoryDto } from './dto/upsert-category.dto';

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

  async deleteDish(id: string) {
    const dish = await this.prisma.dish.findUnique({ where: { id } });
    if (!dish) throw new NotFoundException('菜品不存在');

    // 已经被下过单的菜品，订单项还挂着这道菜的外键，硬删会破坏历史订单——
    // 用"下架"就够了，删除只留给从没被点过的菜。提示文案要跟前端按钮的字一致，不然用户找不到
    const orderedCount = await this.prisma.orderItem.count({ where: { dishId: id } });
    if (orderedCount > 0) {
      throw new ConflictException('该菜品已经有历史订单记录，不能删除，请点旁边的"下架"按钮');
    }

    return this.prisma.dish.delete({ where: { id } });
  }

  // 售罄开关：非敏感操作，普通店员即可（见 API_DESIGN.md 第 5 节）
  setAvailability(id: string, isAvailable: boolean) {
    return this.prisma.dish.update({ where: { id }, data: { isAvailable } });
  }

  createCategory(dto: UpsertCategoryDto) {
    return this.prisma.category.create({ data: { name: dto.name, sortOrder: dto.sortOrder ?? 0 } });
  }

  updateCategory(id: string, dto: UpsertCategoryDto) {
    return this.prisma.category.update({ where: { id }, data: { name: dto.name, sortOrder: dto.sortOrder } });
  }

  async deleteCategory(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('分类不存在');

    const dishCount = await this.prisma.dish.count({ where: { categoryId: id } });
    if (dishCount > 0) throw new ConflictException('该分类下还有菜品，请先移除或转移菜品');

    return this.prisma.category.delete({ where: { id } });
  }
}
