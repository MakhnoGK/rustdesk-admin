import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppConfig } from '../config/app-config.service';
import { AuditRetentionService } from './audit-retention.service';
import { SessionReconciliationService } from '../sessions/session-reconciliation.service';

const RETENTION_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Registers the background jobs. The timeout sweep runs once at startup (so a restart catches
 * up) and then every SESSION_TIMEOUT_CHECK_INTERVAL_SECONDS; retention runs hourly. Both are
 * guarded by PostgreSQL advisory locks, so running several instances is safe. Intervals are
 * cleared by @nestjs/schedule on shutdown.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly config: AppConfig,
    private readonly scheduler: SchedulerRegistry,
    private readonly reconciliation: SessionReconciliationService,
    private readonly retention: AuditRetentionService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('JOBS_ENABLED')) {
      this.logger.warn('Background jobs disabled (JOBS_ENABLED=false)');
      return;
    }
    const sweepMs = this.config.get('SESSION_TIMEOUT_CHECK_INTERVAL_SECONDS') * 1000;
    this.schedule('session-timeout-sweep', sweepMs, () => this.reconciliation.sweepTimeouts());
    if (this.config.get('AUDIT_RETENTION_DAYS') > 0) {
      this.schedule('audit-retention', RETENTION_INTERVAL_MS, () => this.retention.run());
    }
    void this.runOnce('session-timeout-sweep', () => this.reconciliation.sweepTimeouts());
  }

  private schedule(name: string, everyMs: number, job: () => Promise<unknown>): void {
    const handle = setInterval(() => void this.runOnce(name, job), everyMs);
    this.scheduler.addInterval(name, handle);
    this.logger.log({ job: name, everySeconds: everyMs / 1000 }, 'Job scheduled');
  }

  /** Never overlaps a run of the same job inside this process; errors are logged, not thrown. */
  private async runOnce(name: string, job: () => Promise<unknown>): Promise<void> {
    if (this.running.has(name)) return;
    this.running.add(name);
    try {
      await job();
    } catch (err) {
      this.logger.error({ err, job: name }, 'Job failed');
    } finally {
      this.running.delete(name);
    }
  }
}
