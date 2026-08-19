import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TablesModule } from '../tables/tables.module';
import { StoreConfigModule } from '../store-config/store-config.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, RealtimeModule, TablesModule, StoreConfigModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
