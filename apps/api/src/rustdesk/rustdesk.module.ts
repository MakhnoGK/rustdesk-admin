import { Module } from '@nestjs/common';
import { AddressBooksModule } from '../address-books/address-books.module';
import { AuditModule } from '../audit/audit.module';
import { DevicesModule } from '../devices/devices.module';
import { DisconnectsModule } from '../disconnects/disconnects.module';
import { SessionsModule } from '../sessions/sessions.module';
import { UsersModule } from '../users/users.module';
import { DeviceCidrGuard } from '../common/http/device-cidr.guard';
import { RustdeskAbController } from './ab.controller';
import { RustdeskLegacyAbController } from './ab-legacy.controller';
import { RustdeskAuditController } from './audit.controller';
import { RustdeskAuthController } from './auth.controller';
import { RustdeskDeviceController } from './device.controller';

/** Everything the RustDesk client talks to. Wire formats live here and nowhere else. */
@Module({
  imports: [
    UsersModule,
    AddressBooksModule,
    AuditModule,
    DevicesModule,
    SessionsModule,
    DisconnectsModule,
  ],
  controllers: [
    RustdeskAuthController,
    RustdeskAbController,
    RustdeskLegacyAbController,
    RustdeskAuditController,
    RustdeskDeviceController,
  ],
  providers: [DeviceCidrGuard],
})
export class RustdeskModule {}
