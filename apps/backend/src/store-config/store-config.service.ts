import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

export type FeatureFlag = 'kdsScreenEnabled' | 'deliveryEnabled' | 'reservationEnabled';
export type UiTheme = 'modern' | 'warm';
export type TabletMenuLayout = 'compact' | 'browse';

@Injectable()
export class StoreConfigService {
  constructor(private readonly prisma: PrismaService) {}

  // 单店部署下是固定单行"单例"：不存在就用默认值建一行，存在就直接读。
  // GET /store-config 不鉴权（见 controller 注释），所以这里显式把 tabletOpenPasscodeHash
  // 摘掉再返回——哪怕只是哈希，4 位数字的哈希空间也小到能离线爆破，绝不能吐给客户端
  async get() {
    const config = await this.prisma.storeConfig.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
    const { tabletOpenPasscodeHash: _tabletOpenPasscodeHash, ...safe } = config;
    return safe;
  }

  async update(
    patch: Partial<Record<FeatureFlag, boolean>> & {
      uiTheme?: UiTheme;
      tabletMenuLayout?: TabletMenuLayout;
      tabletOpenPasscode?: string;
    },
  ) {
    const { tabletOpenPasscode, ...rest } = patch;
    const data = tabletOpenPasscode
      ? { ...rest, tabletOpenPasscodeHash: await bcrypt.hash(tabletOpenPasscode, 10) }
      : rest;

    const config = await this.prisma.storeConfig.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    });
    const { tabletOpenPasscodeHash: _tabletOpenPasscodeHash, ...safe } = config;
    return safe;
  }

  async isEnabled(feature: FeatureFlag): Promise<boolean> {
    const config = await this.get();
    return config[feature];
  }

  // 平板密码键盘每输满 4 位就调一次这个（见 tables 模块的 tablet-open 端点也会再校验一遍）——
  // 没设置过密码（hash 为空）一律当密码错，不给任何默认密码兜底
  async verifyTabletPasscode(passcode: string): Promise<boolean> {
    const config = await this.prisma.storeConfig.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
    if (!config.tabletOpenPasscodeHash) return false;
    return bcrypt.compare(passcode, config.tabletOpenPasscodeHash);
  }
}
