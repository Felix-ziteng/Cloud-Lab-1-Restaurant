import { SetMetadata } from '@nestjs/common';
import type { FeatureFlag } from '../store-config.service';

export const REQUIRE_FEATURE_KEY = 'requireFeature';

// 用法：@RequireFeature('deliveryEnabled') —— 这家店没开启外卖模块时，相关接口整体不可用
export const RequireFeature = (feature: FeatureFlag) => SetMetadata(REQUIRE_FEATURE_KEY, feature);
