import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { PrintJobsController } from './print-jobs.controller';
import { PrintJobsService } from './print-jobs.service';

@Module({
  imports: [RealtimeModule],
  controllers: [PrintJobsController],
  providers: [PrintJobsService],
  exports: [PrintJobsService],
})
export class PrintJobsModule {}
