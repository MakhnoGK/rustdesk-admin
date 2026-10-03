import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LifecycleLogger } from './common/lifecycle.logger';
import { loggerParams } from './common/logging/logger.config';
import { throttlerOptions } from './common/throttling/throttling';
import { AppConfig } from './config/app-config.service';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { PrismaModule } from './prisma/prisma.module';
import { RustdeskModule } from './rustdesk/rustdesk.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({ inject: [AppConfig], useFactory: loggerParams }),
    ThrottlerModule.forRootAsync({ inject: [AppConfig], useFactory: throttlerOptions }),
    PrismaModule,
    AuthModule,
    RustdeskModule,
    AdminModule,
    JobsModule,
    HealthModule,
  ],
  providers: [
    LifecycleLogger,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
