import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfig } from './app-config.service';
import { parseEnv } from './env.schema';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      // Repo-level .env for local development; containers pass variables directly.
      envFilePath: ['.env', '../../.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      cache: true,
      validate: parseEnv,
    }),
  ],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class AppConfigModule {}
