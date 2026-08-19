import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StoreConfigModule } from '../store-config/store-config.module';
import { RidersController } from './riders.controller';
import { RidersService } from './riders.service';

@Module({
  imports: [AuthModule, StoreConfigModule],
  controllers: [RidersController],
  providers: [RidersService],
})
export class RidersModule {}
