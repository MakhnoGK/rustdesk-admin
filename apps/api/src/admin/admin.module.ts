import { Module } from '@nestjs/common';
import { AddressBooksModule } from '../address-books/address-books.module';
import { AuditModule } from '../audit/audit.module';
import { DevicesModule } from '../devices/devices.module';
import { DisconnectsModule } from '../disconnects/disconnects.module';
import { SessionsModule } from '../sessions/sessions.module';
import { StatsModule } from '../stats/stats.module';
import { UsersModule } from '../users/users.module';
import { AdminAddressBooksController } from './address-books.controller';
import { AdminAuditEventsController } from './audit-events.controller';
import { AdminAuthController } from './auth.controller';
import { AdminDevicesController } from './devices.controller';
import { AdminSessionsController } from './sessions.controller';
import { AdminStatsController } from './stats.controller';
import { AdminSystemController } from './system.controller';
import { AdminTokensController, AdminUsersController } from './users.controller';

/** `/api/admin/*`, consumed by the admin panel through the generated contract. */
@Module({
  imports: [
    UsersModule,
    AddressBooksModule,
    AuditModule,
    DevicesModule,
    SessionsModule,
    DisconnectsModule,
    StatsModule,
  ],
  controllers: [
    AdminAuthController,
    AdminUsersController,
    AdminTokensController,
    AdminDevicesController,
    AdminAddressBooksController,
    AdminSessionsController,
    AdminStatsController,
    AdminAuditEventsController,
    AdminSystemController,
  ],
})
export class AdminModule {}
