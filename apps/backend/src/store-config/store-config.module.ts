import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StoreConfigController } from './store-config.controller';
import { StoreConfigService } from './store-config.service';
import { FeatureEnabledGuard } from './guards/feature-enabled.guard';

@Module({
  imports: [AuthModule],
  controllers: [StoreConfigController],
  providers: [StoreConfigService, FeatureEnabledGuard],
  exports: [StoreConfigService, FeatureEnabledGuard],
})
export class StoreConfigModule {}
