import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StoreConfigModule } from '../store-config/store-config.module';
import { MenuProfilesController } from './menu-profiles.controller';
import { MenuProfilesService } from './menu-profiles.service';

@Module({
  imports: [AuthModule, StoreConfigModule],
  controllers: [MenuProfilesController],
  providers: [MenuProfilesService],
  exports: [MenuProfilesService],
})
export class MenuProfilesModule {}
