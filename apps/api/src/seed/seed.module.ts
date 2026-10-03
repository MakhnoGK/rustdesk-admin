import { Module } from '@nestjs/common';
import { AddressBooksModule } from '../address-books/address-books.module';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';

/** Minimal context for one-shot commands (seed, key rotation): no HTTP, no jobs. */
@Module({
  imports: [AppConfigModule, PrismaModule, AuthModule, UsersModule, AddressBooksModule],
})
export class CommandModule {}
