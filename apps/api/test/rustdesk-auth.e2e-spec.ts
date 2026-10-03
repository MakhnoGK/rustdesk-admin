import request from 'supertest';
import { TokenKind, UserRole, UserStatus } from '../src/generated/prisma/client';
import {
  createTestApp,
  createUser,
  PASSWORD,
  resetDatabase,
  rustdeskLogin,
  type TestApp,
} from './utils/test-app';

describe('RustDesk client authentication', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  it('logs in with a text/plain body and returns the exact client shape', async () => {
    const user = await createUser(t, 'alice', { role: UserRole.ADMIN });
    await t.prisma.user.update({
      where: { id: user.id },
      data: { displayName: 'Alice A.', email: 'alice@example.test' },
    });

    const res = await request(t.http)
      .post('/api/login')
      .set('Content-Type', 'text/plain')
      .send(
        JSON.stringify({
          username: 'Alice',
          password: PASSWORD,
          id: '123456789',
          uuid: 'dXVpZA==',
          autoLogin: true,
          type: 'account',
          deviceInfo: { os: 'linux', type: 'client', name: 'pc' },
        }),
      )
      .expect(200);

    expect(Object.keys(res.body as object).sort()).toEqual(['access_token', 'type', 'user']);
    expect(res.body).toEqual({
      type: 'access_token',
      access_token: expect.any(String),
      user: {
        name: 'alice',
        display_name: 'Alice A.',
        email: 'alice@example.test',
        note: '',
        avatar: '',
        status: 1,
        is_admin: true,
      },
    });

    const token = await t.prisma.authToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(token).toMatchObject({
      kind: TokenKind.RUSTDESK_CLIENT,
      clientId: '123456789',
      clientUuid: 'dXVpZA==',
      deviceInfo: { os: 'linux', type: 'client', name: 'pc' },
    });
    expect(token.expiresAt.getTime() - token.issuedAt.getTime()).toBe(30 * 86_400_000);
  });

  it('parses a body sent with no Content-Type at all', async () => {
    await createUser(t, 'bob');
    const res = await request(t.http)
      .post('/api/login')
      .unset('Content-Type')
      .send(Buffer.from(JSON.stringify({ username: 'bob', password: PASSWORD })))
      .expect(200);
    expect((res.body as { type: string }).type).toBe('access_token');
  });

  it('rejects invalid credentials with a string error', async () => {
    await createUser(t, 'carol');
    const res = await request(t.http)
      .post('/api/login')
      .send({ username: 'carol', password: 'wrong-password' })
      .expect(401);
    expect(res.body).toEqual({ error: 'Wrong username or password' });
    await request(t.http)
      .post('/api/login')
      .send({ username: 'nobody', password: 'whatever' })
      .expect(401);
  });

  it('rejects a disabled user with 403 once the password is right', async () => {
    await createUser(t, 'dave', { status: UserStatus.DISABLED });
    await request(t.http)
      .post('/api/login')
      .send({ username: 'dave', password: 'wrong-password' })
      .expect(401);
    const res = await request(t.http)
      .post('/api/login')
      .send({ username: 'dave', password: PASSWORD })
      .expect(403);
    expect(res.body).toEqual({ error: 'This account is disabled' });
  });

  it('rejects 2FA fields and a malformed body with 400 string errors', async () => {
    await createUser(t, 'erin');
    const tfa = await request(t.http)
      .post('/api/login')
      .send({ username: 'erin', password: PASSWORD, tfaCode: '123456' })
      .expect(400);
    expect(typeof (tfa.body as { error: unknown }).error).toBe('string');
    const bad = await request(t.http)
      .post('/api/login')
      .set('Content-Type', 'text/plain')
      .send('{not json')
      .expect(400);
    expect(bad.body).toEqual({ error: 'Request body is not valid JSON' });
    const missing = await request(t.http).post('/api/login').send({}).expect(400);
    expect(typeof (missing.body as { error: unknown }).error).toBe('string');
  });

  it('serves currentUser for a valid token, 401 for expired and revoked ones', async () => {
    await createUser(t, 'frank');
    const token = await rustdeskLogin(t, 'frank');

    const me = await request(t.http)
      .post('/api/currentUser')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: '123456789', uuid: 'x' })
      .expect(200);
    expect(me.body).toMatchObject({ name: 'frank', status: 1, is_admin: false });

    await t.prisma.authToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await request(t.http)
      .post('/api/currentUser')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(typeof (expired.body as { error: unknown }).error).toBe('string');

    const fresh = await rustdeskLogin(t, 'frank');
    await t.prisma.authToken.updateMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    await request(t.http)
      .post('/api/currentUser')
      .set('Authorization', `Bearer ${fresh}`)
      .expect(401);

    await request(t.http).post('/api/currentUser').expect(401);
    await request(t.http)
      .post('/api/currentUser')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  it('logout revokes the token', async () => {
    await createUser(t, 'gina');
    const token = await rustdeskLogin(t, 'gina');
    const res = await request(t.http)
      .post('/api/logout')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: '1', uuid: 'u' })
      .expect(200);
    expect(res.text).toBe('');
    await request(t.http)
      .post('/api/currentUser')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    const row = await t.prisma.authToken.findFirstOrThrow();
    expect(row.revokedAt).not.toBeNull();
  });

  it('an admin web token is not accepted as a client token', async () => {
    await createUser(t, 'hank', { role: UserRole.ADMIN });
    const res = await request(t.http)
      .post('/api/admin/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ username: 'hank', password: PASSWORD })
      .expect(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0] as string;
    const jwt = cookie.split(';')[0]?.split('=')[1];
    await request(t.http)
      .post('/api/currentUser')
      .set('Authorization', `Bearer ${jwt}`)
      .expect(401);
  });

  it('answers login-options with an empty array', async () => {
    const res = await request(t.http).get('/api/login-options').expect(200);
    expect(res.body).toEqual([]);
  });
});

describe('RustDesk login rate limit', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ RATE_LIMIT_LOGIN_PER_USERNAME_PER_MINUTE: 3 });
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  it('limits attempts per username with 429 and a string error', async () => {
    for (let i = 0; i < 3; i++) {
      await request(t.http)
        .post('/api/login')
        .send({ username: 'target', password: 'x' })
        .expect(401);
    }
    const res = await request(t.http)
      .post('/api/login')
      .send({ username: 'target', password: 'x' })
      .expect(429);
    expect(typeof (res.body as { error: unknown }).error).toBe('string');
    // Another username from the same IP is still allowed.
    await request(t.http).post('/api/login').send({ username: 'other', password: 'x' }).expect(401);
  });
});
