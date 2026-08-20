import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type FeatureFlag = 'kdsScreenEnabled' | 'deliveryEnabled' | 'reservationEnabled';
export type UiTheme = 'modern' | 'warm';

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

  update(patch: Partial<Record<FeatureFlag, boolean>> & { uiTheme?: UiTheme }) {
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
