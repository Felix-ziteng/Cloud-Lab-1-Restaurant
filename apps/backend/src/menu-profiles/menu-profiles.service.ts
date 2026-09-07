import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { MenuProfileRule } from '@restaurant/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { StoreConfigService } from '../store-config/store-config.service';
import { UpsertMenuProfileDto } from './dto/upsert-menu-profile.dto';

function todayLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

@Injectable()
export class MenuProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeConfig: StoreConfigService,
  ) {}

  list() {
    return this.prisma.menuProfile.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async create(dto: UpsertMenuProfileDto) {
    if (dto.isDefault) await this.clearOtherDefaults();
    return this.prisma.menuProfile.create({
      data: {
        name: dto.name,
        isDefault: dto.isDefault ?? false,
        sortOrder: dto.sortOrder ?? 0,
        rules: (dto.rules ?? []) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async update(id: string, dto: UpsertMenuProfileDto) {
    if (dto.isDefault) await this.clearOtherDefaults(id);
    return this.prisma.menuProfile.update({
      where: { id },
      data: {
        name: dto.name,
        isDefault: dto.isDefault,
        sortOrder: dto.sortOrder,
        rules: dto.rules as unknown as Prisma.InputJsonValue | undefined,
      },
    });
  }

  // 保证任何时候最多一个默认版本：设置某一行为默认之前，先把其它行都置为非默认
  private clearOtherDefaults(excludeId?: string) {
    return this.prisma.menuProfile.updateMany({
      where: excludeId ? { id: { not: excludeId } } : {},
      data: { isDefault: false },
    });
  }

  // 删除前把所有分类里对这个版本的引用摘掉——Prisma 没有"从所有行的数组字段里移除某个值"
  // 的内置写法，得用原生 SQL 的 array_remove；同时如果前台正手动切换到这个版本，一并清掉
  // 覆盖状态，避免删除后前台还指向一个不存在的版本
  async delete(id: string) {
    await this.prisma.$executeRaw`UPDATE categories SET "menuProfileIds" = array_remove("menuProfileIds", ${id}) WHERE ${id} = ANY("menuProfileIds")`;
    const config = await this.storeConfig.get();
    if (config.activeMenuProfileOverrideId === id) {
      await this.setOverride(null);
    }
    return this.prisma.menuProfile.delete({ where: { id } });
  }

  // 前台"临时切换菜单版本"/"恢复自动"用，不要求 manager 权限（见 controller）
  async setOverride(profileId: string | null) {
    await this.storeConfig.update(
      profileId
        ? { activeMenuProfileOverrideId: profileId, activeMenuProfileOverrideDate: todayLocalDate() }
        : { activeMenuProfileOverrideId: null, activeMenuProfileOverrideDate: null },
    );
  }

  // 核心方法：算出当前生效的菜单版本，供 MenuService.getMenu() 过滤分类用，也供
  // 前台指示器（GET /menu-profiles/active）直接展示
  async resolveActive() {
    const profiles = await this.list();
    if (profiles.length === 0) return null; // 没配置多菜单，完全不限制——最常见的情况

    const config = await this.storeConfig.get();
    if (config.activeMenuProfileOverrideId && config.activeMenuProfileOverrideDate === todayLocalDate()) {
      const overridden = profiles.find((p) => p.id === config.activeMenuProfileOverrideId);
      if (overridden) return overridden;
    }

    const now = new Date();
    const dayOfWeek = now.getDay();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    for (const profile of profiles) {
      const rules = profile.rules as unknown as MenuProfileRule[];
      const matches = rules.some(
        (r) => r.daysOfWeek.includes(dayOfWeek) && hhmm >= r.startTime && hhmm < r.endTime,
      );
      if (matches) return profile;
    }

    return profiles.find((p) => p.isDefault) ?? null;
  }
}
