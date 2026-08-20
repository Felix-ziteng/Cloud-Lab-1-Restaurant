import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TablesModule } from '../tables/tables.module';
import { StoreConfigModule } from '../store-config/store-config.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [AuthModule, TablesModule, StoreConfigModule, RealtimeModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}
