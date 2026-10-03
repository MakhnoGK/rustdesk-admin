import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { AppConfig } from '../../src/config/app-config.service';
import type { Env } from '../../src/config/env.schema';
import { UserRole, UserStatus } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { type UserRecord, UsersService } from '../../src/users/users.service';

export const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'correct horse battery';

/** AppConfig with per-suite overrides on top of the validated environment. */
class TestConfig extends AppConfig {
  constructor(
    config: ConfigService<Env, true>,
    private readonly overrides: Partial<Env>,
  ) {
    super(config);
  }

  override get<K extends keyof Env>(key: K): Env[K] {
    return key in this.overrides ? (this.overrides[key] as Env[K]) : super.get(key);
  }
}

export interface TestApp {
  app: NestExpressApplication;
  http: App;
  prisma: PrismaService;
  users: UsersService;
  close(): Promise<void>;
}

export async function createTestApp(overrides: Partial<Env> = {}): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AppConfig)
    .useFactory({
      factory: (config: ConfigService<Env, true>) => new TestConfig(config, overrides),
      inject: [ConfigService],
    })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  configureApp(app);
  await app.init();
  return {
    app,
    http: app.getHttpServer() as App,
    prisma: app.get(PrismaService),
    users: app.get(UsersService),
    close: () => app.close(),
  };
}

/** Empties every table except migrations and server settings. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE audit_events, pending_disconnects, sessions, device_id_changes, devices,
      ab_peer_tags, ab_tags, ab_peers, address_book_shares, address_books, auth_tokens, users
    RESTART IDENTITY CASCADE`);
}

export function createUser(
  t: TestApp,
  username: string,
  opts: { role?: UserRole; status?: UserStatus; password?: string } = {},
): Promise<UserRecord> {
  return t.users.create({
    username,
    password: opts.password ?? PASSWORD,
    role: opts.role ?? UserRole.USER,
    status: opts.status ?? UserStatus.ACTIVE,
  });
}

/** Logs in like the RustDesk client: no Content-Type header, JSON body. */
export async function rustdeskLogin(
  t: TestApp,
  username: string,
  password = PASSWORD,
): Promise<string> {
  const res = await request(t.http)
    .post('/api/login')
    .set('Content-Type', 'text/plain')
    .send(
      JSON.stringify({
        username,
        password,
        id: '123456789',
        uuid: 'Y2xpZW50LXV1aWQ=',
        type: 'account',
        deviceInfo: { os: 'linux' },
      }),
    )
    .expect(200);
  return (res.body as { access_token: string }).access_token;
}

/** Signs in to the admin API and returns the Cookie header value. */
export async function adminLogin(
  t: TestApp,
  username: string,
  password = PASSWORD,
): Promise<string> {
  const res = await request(t.http)
    .post('/api/admin/auth/login')
    .set('Origin', ORIGIN)
    .send({ username, password })
    .expect(200);
  const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = setCookie?.find((c) => c.startsWith('rd_admin_session='));
  if (!cookie) throw new Error('No session cookie');
  return cookie.split(';')[0] as string;
}

/** POSTs a JSON body to a RustDesk device endpoint the way the client does (no auth). */
export function devicePost(t: TestApp, path: string, body: unknown) {
  return request(t.http)
    .post(path)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(body));
}
