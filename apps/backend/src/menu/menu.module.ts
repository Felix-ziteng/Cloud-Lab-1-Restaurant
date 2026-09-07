import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StoreConfigModule } from '../store-config/store-config.module';
import { MenuProfilesModule } from '../menu-profiles/menu-profiles.module';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';

@Module({
  imports: [AuthModule, StoreConfigModule, MenuProfilesModule],
  controllers: [MenuController],
  providers: [MenuService],
})
export class MenuModule {}
