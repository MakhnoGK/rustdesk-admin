import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthGuard, AdminOriginGuard, RustdeskAuthGuard } from './guards';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Global()
@Module({
  // Secrets are passed per call: RustDesk client and admin tokens are signed with different keys.
  imports: [JwtModule.register({})],
  providers: [PasswordService, TokenService, RustdeskAuthGuard, AdminAuthGuard, AdminOriginGuard],
  exports: [PasswordService, TokenService, RustdeskAuthGuard, AdminAuthGuard, AdminOriginGuard],
})
export class AuthModule {}
