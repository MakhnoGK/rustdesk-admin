import request from 'supertest';
import { AddressBookKind } from '../src/generated/prisma/client';
import {
  createTestApp,
  createUser,
  resetDatabase,
  rustdeskLogin,
  type TestApp,
} from './utils/test-app';

type Peer = Record<string, unknown> & { id: string; tags: string[] };

describe('RustDesk address book', () => {
  let t: TestApp;
  let token: string;
  let guid: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await createUser(t, 'owner');
    token = await rustdeskLogin(t, 'owner');
    const res = await request(t.http).post('/api/ab/personal').set(auth()).expect(200);
    guid = (res.body as { guid: string }).guid;
  });
  afterAll(async () => {
    await t.close();
  });

  const listPeers = async (g = guid, query = 'current=1&pageSize=100') =>
    (await request(t.http).post(`/api/ab/peers?${query}&ab=${g}`).set(auth()).expect(200)).body as {
      total: number;
      data: Peer[];
    };

  it('creates the personal book once and returns the same guid', async () => {
    const again = await request(t.http).post('/api/ab/personal').set(auth()).expect(200);
    expect(again.body).toEqual({ guid });
    expect(await t.prisma.addressBook.count({ where: { kind: AddressBookKind.PERSONAL } })).toBe(1);
  });

  it('requires a bearer token', async () => {
    const res = await request(t.http).post('/api/ab/personal').expect(401);
    expect(typeof (res.body as { error: unknown }).error).toBe('string');
  });

  it('adds, updates and deletes peers with empty 200 bodies; credentials are encrypted at rest', async () => {
    const add = await request(t.http)
      .post(`/api/ab/peer/add/${guid}`)
      .set(auth())
      .set('Content-Type', 'text/plain')
      .send(
        JSON.stringify({
          id: '987654321',
          alias: 'Front desk',
          tags: ['office'],
          hash: 'saved-hash',
          forceAlwaysRelay: 'false',
          rdpPort: '3389',
          note: 'n',
        }),
      )
      .expect(200);
    expect(add.text).toBe('');
    expect(add.headers['content-length']).toBe('0');

    const stored = await t.prisma.abPeer.findFirstOrThrow();
    expect(stored.hashEnc).toMatch(/^v1:k1:/);
    expect(stored.hashEnc).not.toContain('saved-hash');

    let page = await listPeers();
    expect(page.total).toBe(1);
    expect(page.data[0]).toEqual({
      id: '987654321',
      alias: 'Front desk',
      tags: ['office'],
      note: 'n',
      username: '',
      hostname: '',
      platform: '',
      hash: 'saved-hash',
      forceAlwaysRelay: 'false',
      rdpPort: '3389',
    });

    const update = await request(t.http)
      .put(`/api/ab/peer/update/${guid}`)
      .set(auth())
      .send({ id: '987654321', alias: 'Reception', tags: [] })
      .expect(200);
    expect(update.text).toBe('');
    page = await listPeers();
    expect(page.data[0]).toMatchObject({
      alias: 'Reception',
      tags: [],
      hash: 'saved-hash',
      rdpPort: '3389',
    });

    await request(t.http)
      .post(`/api/ab/peer/add/${guid}`)
      .set(auth())
      .send({ id: '987654321' })
      .expect(409);
    await request(t.http)
      .put(`/api/ab/peer/update/${guid}`)
      .set(auth())
      .send({ id: '111' })
      .expect(404);

    const del = await request(t.http)
      .delete(`/api/ab/peer/${guid}`)
      .set(auth())
      .send(['987654321', 'missing'])
      .expect(200);
    expect(del.text).toBe('');
    expect((await listPeers()).total).toBe(0);
  });

  it('paginates peers with total/data', async () => {
    for (let i = 0; i < 5; i++) {
      await request(t.http)
        .post(`/api/ab/peer/add/${guid}`)
        .set(auth())
        .send({ id: `10000000${i}` })
        .expect(200);
    }
    const p1 = await listPeers(guid, 'current=1&pageSize=2');
    const p3 = await listPeers(guid, 'current=3&pageSize=2');
    expect(p1.total).toBe(5);
    expect(p1.data.map((p) => p.id)).toEqual(['100000000', '100000001']);
    expect(p3.data.map((p) => p.id)).toEqual(['100000004']);
  });

  it('manages tags and propagates rename/delete to peers', async () => {
    await request(t.http)
      .post(`/api/ab/tag/add/${guid}`)
      .set(auth())
      .send({ name: 'office', color: 4283215696 })
      .expect(200);
    await request(t.http)
      .post(`/api/ab/tag/add/${guid}`)
      .set(auth())
      .send({ name: 'office', color: 1 })
      .expect(200); // idempotent
    await request(t.http)
      .post(`/api/ab/tag/add/${guid}`)
      .set(auth())
      .send({ name: 'home', color: -16777216 })
      .expect(200); // signed ARGB
    await request(t.http)
      .post(`/api/ab/peer/add/${guid}`)
      .set(auth())
      .send({ id: '1', tags: ['office', 'home'] })
      .expect(200);

    let tags = (await request(t.http).post(`/api/ab/tags/${guid}`).set(auth()).expect(200))
      .body as Array<{ name: string; color: number }>;
    expect(tags).toEqual([
      { name: 'home', color: 0xff000000 },
      { name: 'office', color: 4283215696 },
    ]);

    const rename = await request(t.http)
      .put(`/api/ab/tag/rename/${guid}`)
      .set(auth())
      .send({ old: 'office', new: 'work' })
      .expect(200);
    expect(rename.text).toBe('');
    expect((await listPeers()).data[0]?.tags).toEqual(['home', 'work']);

    await request(t.http)
      .put(`/api/ab/tag/update/${guid}`)
      .set(auth())
      .send({ name: 'work', color: 255 })
      .expect(200);
    tags = (await request(t.http).post(`/api/ab/tags/${guid}`).set(auth()).expect(200))
      .body as typeof tags;
    expect(tags.find((x) => x.name === 'work')?.color).toBe(255);

    const del = await request(t.http)
      .delete(`/api/ab/tag/${guid}`)
      .set(auth())
      .send(['home'])
      .expect(200);
    expect(del.text).toBe('');
    expect((await listPeers()).data[0]?.tags).toEqual(['work']);
    await request(t.http)
      .put(`/api/ab/tag/rename/${guid}`)
      .set(auth())
      .send({ old: 'nope', new: 'x' })
      .expect(404);
  });

  it('enforces share rules on shared books and hides books without access', async () => {
    const admin = await createUser(t, 'admin2');
    const reader = await t.prisma.user.findUniqueOrThrow({ where: { username: 'owner' } });
    const ro = await t.prisma.addressBook.create({
      data: { name: 'Team RO', kind: AddressBookKind.SHARED, ownerId: admin.id },
    });
    const rw = await t.prisma.addressBook.create({
      data: { name: 'Team RW', kind: AddressBookKind.SHARED, ownerId: admin.id },
    });
    const hidden = await t.prisma.addressBook.create({
      data: { name: 'Hidden', kind: AddressBookKind.SHARED, ownerId: admin.id },
    });
    await t.prisma.addressBookShare.createMany({
      data: [
        { bookGuid: ro.guid, userId: reader.id, rule: 1 },
        { bookGuid: rw.guid, userId: reader.id, rule: 2 },
      ],
    });

    const profiles = (
      await request(t.http)
        .post('/api/ab/shared/profiles?current=1&pageSize=100')
        .set(auth())
        .expect(200)
    ).body as {
      total: number;
      data: Array<{
        guid: string;
        name: string;
        owner: string;
        rule: number;
        note: string;
        info: unknown;
      }>;
    };
    expect(profiles.total).toBe(2);
    expect(profiles.data).toEqual([
      { guid: ro.guid, name: 'Team RO', owner: 'admin2', note: '', rule: 1, info: {} },
      { guid: rw.guid, name: 'Team RW', owner: 'admin2', note: '', rule: 2, info: {} },
    ]);

    const denied = await request(t.http)
      .post(`/api/ab/peer/add/${ro.guid}`)
      .set(auth())
      .send({ id: '5' })
      .expect(403);
    expect(denied.body).toEqual({ error: 'This address book is read-only for you' });
    await request(t.http)
      .post(`/api/ab/tag/add/${ro.guid}`)
      .set(auth())
      .send({ name: 'x', color: 1 })
      .expect(403);
    await listPeers(ro.guid);

    // Shared books carry `password`, not `hash`.
    await request(t.http)
      .post(`/api/ab/peer/add/${rw.guid}`)
      .set(auth())
      .send({ id: '6', password: 'shared-pw', hash: 'ignored' })
      .expect(200);
    const peer = (await listPeers(rw.guid)).data[0];
    expect(peer).toMatchObject({ id: '6', password: 'shared-pw' });
    expect(peer).not.toHaveProperty('hash');

    await request(t.http)
      .post(`/api/ab/peers?current=1&pageSize=100&ab=${hidden.guid}`)
      .set(auth())
      .expect(404);
    await request(t.http)
      .post('/api/ab/peers?current=1&pageSize=100&ab=not-a-guid')
      .set(auth())
      .expect(404);
  });

  it('round-trips the legacy GET/POST /api/ab against the personal book', async () => {
    const book = {
      tags: ['office', 'vip'],
      peers: [
        {
          id: '987654321',
          alias: 'Front desk',
          tags: ['office'],
          hash: 'h1',
          username: 'u',
          hostname: 'h',
          platform: 'Windows',
        },
        { id: '123123123', alias: '', tags: ['vip', 'new-tag'], hash: '' },
      ],
      tag_colors: JSON.stringify({ office: 4283215696, vip: 4294198070 }),
    };
    const post = await request(t.http)
      .post('/api/ab')
      .set(auth())
      .send({ data: JSON.stringify(book) })
      .expect(200);
    expect(post.text).toBe('');

    const res = await request(t.http).get('/api/ab').set(auth()).expect(200);
    const data = JSON.parse((res.body as { data: string }).data) as {
      tags: string[];
      peers: Peer[];
      tag_colors: string;
    };
    expect(data.tags).toEqual(['new-tag', 'office', 'vip']);
    expect(JSON.parse(data.tag_colors)).toMatchObject({ office: 4283215696, vip: 4294198070 });
    expect(data.peers.map((p) => [p.id, p.tags, p.hash])).toEqual([
      ['123123123', ['new-tag', 'vip'], ''],
      ['987654321', ['office'], 'h1'],
    ]);

    // The current API sees the same data.
    expect((await listPeers()).total).toBe(2);

    // Replacing again drops what is not in the new book.
    await request(t.http)
      .post('/api/ab')
      .set(auth())
      .send({ data: JSON.stringify({ tags: [], peers: [], tag_colors: '{}' }) })
      .expect(200);
    expect((await listPeers()).total).toBe(0);
    await request(t.http).post('/api/ab').set(auth()).send({ data: 'not json' }).expect(400);
  });

  it('reports settings and returns 400 on malformed bodies', async () => {
    const settings = await request(t.http).post('/api/ab/settings').set(auth()).expect(200);
    expect(settings.body).toEqual({ max_peer_one_ab: 0 });
    const bad = await request(t.http)
      .post(`/api/ab/peer/add/${guid}`)
      .set(auth())
      .send({ alias: 'no id' })
      .expect(400);
    expect(typeof (bad.body as { error: unknown }).error).toBe('string');
    await request(t.http)
      .delete(`/api/ab/peer/${guid}`)
      .set(auth())
      .send({ not: 'an array' })
      .expect(400);
  });
});

describe('RustDesk address book peer limit', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ AB_MAX_PEERS: 2 });
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  it('enforces max_peer_one_ab server-side, including the legacy API', async () => {
    await createUser(t, 'limited');
    const token = await rustdeskLogin(t, 'limited');
    const auth = { Authorization: `Bearer ${token}` };
    const { guid } = (await request(t.http).post('/api/ab/personal').set(auth).expect(200))
      .body as { guid: string };

    expect((await request(t.http).post('/api/ab/settings').set(auth).expect(200)).body).toEqual({
      max_peer_one_ab: 2,
    });
    await request(t.http).post(`/api/ab/peer/add/${guid}`).set(auth).send({ id: '1' }).expect(200);
    await request(t.http).post(`/api/ab/peer/add/${guid}`).set(auth).send({ id: '2' }).expect(200);
    const res = await request(t.http)
      .post(`/api/ab/peer/add/${guid}`)
      .set(auth)
      .send({ id: '3' })
      .expect(403);
    expect(res.body).toEqual({ error: 'An address book may hold at most 2 peers' });

    const legacy = { tags: [], peers: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], tag_colors: '{}' };
    await request(t.http)
      .post('/api/ab')
      .set(auth)
      .send({ data: JSON.stringify(legacy) })
      .expect(403);
  });
});
