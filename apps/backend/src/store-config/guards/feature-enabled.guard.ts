import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StoreConfigService, FeatureFlag } from '../store-config.service';
import { REQUIRE_FEATURE_KEY } from '../decorators/require-feature.decorator';

@Injectable()
export class FeatureEnabledGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly storeConfigService: StoreConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<FeatureFlag>(REQUIRE_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!feature) return true;

    const enabled = await this.storeConfigService.isEnabled(feature);
    if (!enabled) {
      throw new ForbiddenException(`该门店未启用此功能：${feature}`);
    }
    return true;
  }
}
