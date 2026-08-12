import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TablesModule } from '../tables/tables.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [AuthModule, TablesModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}
