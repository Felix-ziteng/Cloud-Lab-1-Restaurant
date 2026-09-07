import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StoreConfigService } from '../store-config/store-config.service';
import { MenuProfilesService } from '../menu-profiles/menu-profiles.service';
import { UpsertDishDto } from './dto/upsert-dish.dto';
import { UpsertCategoryDto } from './dto/upsert-category.dto';

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeConfig: StoreConfigService,
    private readonly menuProfiles: MenuProfilesService,
  ) {}

  // 顾客视角：只看可售菜品；店员/管理端传 includeUnavailable=true 看全部。
  // 分类按当前生效的菜单版本过滤（见 MenuProfilesService.resolveActive）——没配置多菜单版本
  // 时 activeProfile 是 null，完全不过滤，行为跟这个功能上线前一样
  async getMenu(includeUnavailable = false) {
    const activeProfile = await this.menuProfiles.resolveActive();

    const categories = await this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        dishes: {
          where: includeUnavailable ? {} : { isAvailable: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            modifierGroups: {
              orderBy: { sortOrder: 'asc' },
              include: { group: { include: { options: { orderBy: { sortOrder: 'asc' } } } } },
            },
          },
        },
      },
    });

    const visible = activeProfile
      ? categories.filter((c) => c.menuProfileIds.length === 0 || c.menuProfileIds.includes(activeProfile.id))
      : categories;

    // DishModifierGroup 只是挂载关系的中间表，前端点餐界面只关心"这道菜挂了哪些选项组模板"，
    // 这里拍平掉中间表那一层，只留 group 本身
    return visible.map((category) => ({
      ...category,
      dishes: category.dishes.map((dish) => {
        const { modifierGroups, ...rest } = dish;
        return { ...rest, modifierGroups: modifierGroups.map((link) => link.group) };
      }),
    }));
  }

  // 同步菜品 <-> 选项组模板的挂载关系：传了 modifierGroupIds 就整组替换成这个列表，
  // 不传（undefined）表示这次编辑不touch挂载，维持现状——避免每次编辑菜品其它字段时
  // 不小心把已挂的选项组清空
  private async syncModifierGroups(dishId: string, modifierGroupIds: string[] | undefined) {
    if (modifierGroupIds === undefined) return;
    await this.prisma.dishModifierGroup.deleteMany({ where: { dishId } });
    if (modifierGroupIds.length === 0) return;
    await this.prisma.dishModifierGroup.createMany({
      data: modifierGroupIds.map((groupId, index) => ({ dishId, groupId, sortOrder: index })),
    });
  }

  // 门店开启了"显示辣度/过敏原"之后，新增/编辑菜品就必须显式标注——不允许留空，
  // 避免客人把"没标"误读成"确认不含"（见跟用户讨论过敏原风险的决策记录）
  private async assertTasteInfoComplete(dto: UpsertDishDto) {
    const config = await this.storeConfig.get();
    if (config.showSpicyLevel && dto.spicyLevel === undefined) {
      throw new BadRequestException('已开启辣度显示，新增/编辑菜品时必须选择辣度等级');
    }
    if (config.showAllergens && dto.allergens === undefined) {
      throw new BadRequestException('已开启过敏原显示，新增/编辑菜品时必须确认过敏原（没有就都不选）');
    }
  }

  async createDish(dto: UpsertDishDto) {
    await this.assertTasteInfoComplete(dto);
    const { modifierGroupIds, ...data } = dto;
    const dish = await this.prisma.dish.create({ data });
    await this.syncModifierGroups(dish.id, modifierGroupIds);
    return dish;
  }

  async updateDish(id: string, dto: UpsertDishDto) {
    await this.assertTasteInfoComplete(dto);
    const { modifierGroupIds, ...data } = dto;
    const dish = await this.prisma.dish.update({ where: { id }, data });
    await this.syncModifierGroups(id, modifierGroupIds);
    return dish;
  }

  // 上传接口存完文件之后调这个，只更新 imageUrl 这一个字段——不走 updateDish/UpsertDishDto
  // 那一整套（不想让"传一张图"意外触发辣度/过敏原必填校验或选项组同步）
  updateDishImage(id: string, imageUrl: string) {
    return this.prisma.dish.update({ where: { id }, data: { imageUrl } });
  }

  async deleteDish(id: string) {
    const dish = await this.prisma.dish.findUnique({ where: { id } });
    if (!dish) throw new NotFoundException('菜品不存在');

    // 历史订单项不依赖这道菜的外键展示——名称/单价早就快照在 OrderItem.dishNameSnapshot/
    // unitPriceSnapshot 里了，删除菜品时数据库会把已有订单项的 dishId 置空（onDelete: SetNull），
    // 历史订单显示不受影响，所以允许直接删除，不再要求先"下架"
    return this.prisma.dish.delete({ where: { id } });
  }

  // 售罄开关：非敏感操作，普通店员即可（见 API_DESIGN.md 第 5 节）
  setAvailability(id: string, isAvailable: boolean) {
    return this.prisma.dish.update({ where: { id }, data: { isAvailable } });
  }

  createCategory(dto: UpsertCategoryDto) {
    return this.prisma.category.create({
      data: { name: dto.name, sortOrder: dto.sortOrder ?? 0, menuProfileIds: dto.menuProfileIds ?? [] },
    });
  }

  updateCategory(id: string, dto: UpsertCategoryDto) {
    return this.prisma.category.update({
      where: { id },
      data: { name: dto.name, sortOrder: dto.sortOrder, menuProfileIds: dto.menuProfileIds },
    });
  }

  async deleteCategory(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('分类不存在');

    const dishCount = await this.prisma.dish.count({ where: { categoryId: id } });
    if (dishCount > 0) throw new ConflictException('该分类下还有菜品，请先移除或转移菜品');

    return this.prisma.category.delete({ where: { id } });
  }
}
