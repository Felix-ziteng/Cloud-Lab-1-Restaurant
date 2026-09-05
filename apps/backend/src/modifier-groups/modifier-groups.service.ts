import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertModifierGroupDto } from './dto/upsert-modifier-group.dto';

@Injectable()
export class ModifierGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  // 全量返回给商家配置界面当模板库用，数量级很小（门店自建的选项组），不用分页
  list() {
    return this.prisma.modifierGroup.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  create(dto: UpsertModifierGroupDto) {
    return this.prisma.modifierGroup.create({
      data: {
        name: dto.name,
        selectionType: dto.selectionType,
        sortOrder: dto.sortOrder ?? 0,
        options: {
          create: dto.options.map((o, index) => ({
            label: o.label,
            priceDelta: o.priceDelta ?? 0,
            sortOrder: index,
          })),
        },
      },
      include: { options: true },
    });
  }

  // 选项本身会被下单时快照成文字存进 OrderItem.selectedModifiers，不被历史订单引用，
  // 所以编辑直接"整组替换"最简单：删掉这个组下所有旧选项，按新列表重建，不用逐条 diff
  async update(id: string, dto: UpsertModifierGroupDto) {
    await this.assertExists(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.modifierOption.deleteMany({ where: { groupId: id } });
      return tx.modifierGroup.update({
        where: { id },
        data: {
          name: dto.name,
          selectionType: dto.selectionType,
          sortOrder: dto.sortOrder ?? 0,
          options: {
            create: dto.options.map((o, index) => ({
              label: o.label,
              priceDelta: o.priceDelta ?? 0,
              sortOrder: index,
            })),
          },
        },
        include: { options: true },
      });
    });
  }

  async delete(id: string) {
    await this.assertExists(id);
    const linkedDishCount = await this.prisma.dishModifierGroup.count({ where: { groupId: id } });
    if (linkedDishCount > 0) {
      throw new ConflictException('该选项组还挂在菜品上，请先在菜品编辑里取消勾选，再删除');
    }
    return this.prisma.modifierGroup.delete({ where: { id } });
  }

  private async assertExists(id: string) {
    const group = await this.prisma.modifierGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('选项组不存在');
  }
}
