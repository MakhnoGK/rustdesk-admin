import { Module } from '@nestjs/common';
import { SessionProjectionService } from './session-projection.service';
import { SessionReconciliationService } from './session-reconciliation.service';
import { SessionsQueryService } from './sessions-query.service';

@Module({
  providers: [SessionProjectionService, SessionReconciliationService, SessionsQueryService],
  exports: [SessionProjectionService, SessionReconciliationService, SessionsQueryService],
})
export class SessionsModule {}
