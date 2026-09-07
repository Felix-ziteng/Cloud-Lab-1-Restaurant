import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type FeatureFlag = 'kdsScreenEnabled' | 'deliveryEnabled' | 'reservationEnabled';
export type UiTheme = 'modern' | 'warm';
export type TabletMenuLayout = 'compact' | 'browse';

@Injectable()
export class StoreConfigService {
  constructor(private readonly prisma: PrismaService) {}

  // 单店部署下是固定单行"单例"：不存在就用默认值建一行，存在就直接读
  get() {
    return this.prisma.storeConfig.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
  }

  async update(
    patch: Partial<Record<FeatureFlag, boolean>> & {
      uiTheme?: UiTheme;
      tabletMenuLayout?: TabletMenuLayout;
      showSpicyLevel?: boolean;
      showAllergens?: boolean;
      // 前台"临时切换菜单版本"用，见 menu-profiles.service.ts 的 setOverride——
      // 不经过这个 service 对外暴露的 manager-only PATCH /store-config 路由，
      // 是 MenuProfilesService 直接调用这个方法写的
      activeMenuProfileOverrideId?: string | null;
      activeMenuProfileOverrideDate?: string | null;
    },
  ) {
    return this.prisma.storeConfig.upsert({
      where: { id: 1 },
      update: patch,
      create: { id: 1, ...patch },
    });
  }

  async isEnabled(feature: FeatureFlag): Promise<boolean> {
    const config = await this.get();
    return config[feature];
  }
}
