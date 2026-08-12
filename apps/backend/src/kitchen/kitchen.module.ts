import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [KitchenController],
  providers: [KitchenService],
})
export class KitchenModule {}
