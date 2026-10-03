import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { AuditIngestService } from './audit-ingest.service';
import { AuditQueryService } from './audit-query.service';

@Module({
  imports: [SessionsModule],
  providers: [AuditIngestService, AuditQueryService],
  exports: [AuditIngestService, AuditQueryService],
})
export class AuditModule {}
