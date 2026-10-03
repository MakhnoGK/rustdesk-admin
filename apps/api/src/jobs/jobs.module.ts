import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SessionsModule } from '../sessions/sessions.module';
import { AuditRetentionService } from './audit-retention.service';
import { JobsService } from './jobs.service';

@Module({
  imports: [ScheduleModule.forRoot(), SessionsModule],
  providers: [JobsService, AuditRetentionService],
  exports: [AuditRetentionService],
})
export class JobsModule {}
