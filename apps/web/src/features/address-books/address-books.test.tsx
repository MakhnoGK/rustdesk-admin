import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { AddressBook, Peer, Share, Tag, User } from '@/api/types';
import { makeBook, makePeer, makeShare, makeTag, makeUser, page, type Page } from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { apiError, apiUrl, server } from '@/test/server';

const book = makeBook();
const BOOK_URL = `/address-books/${book.guid}`;

/** A small in-memory book: peers and tags, with the API's conflict rules. */
function bookApi(initial: { peers?: Peer[]; tags?: Tag[] } = {}) {
  let peers = initial.peers ?? [makePeer()];
  let tags = initial.tags ?? [makeTag(), makeTag({ name: 'vip', color: 0xffef4444, peerCount: 0 })];
  const bodies: unknown[] = [];
  const queries: URLSearchParams[] = [];
  const countOf = (name: string) => peers.filter((p) => p.tags.includes(name)).length;
  const handlers = [
    http.get(apiUrl('/address-books/:guid'), () => HttpResponse.json<AddressBook>(book)),
    http.get(apiUrl('/address-books/:guid/tags'), () =>
      HttpResponse.json<Tag[]>(tags.map((t) => ({ ...t, peerCount: countOf(t.name) }))),
    ),
    http.get(apiUrl('/address-books/:guid/peers'), ({ request }) => {
      queries.push(new URL(request.url).searchParams);
      return HttpResponse.json<Page<Peer>>(page(peers));
    }),
    http.post(apiUrl('/address-books/:guid/peers'), async ({ request }) => {
      const body = (await request.json()) as Peer;
      bodies.push(body);
      if (peers.some((p) => p.peerId === body.peerId)) {
        return apiError(409, 'ALREADY_EXISTS', 'A peer with this ID already exists in the book');
      }
      const peer = makePeer({ ...body, hasPassword: false });
      peers = [...peers, peer];
      return HttpResponse.json<Peer>(peer, { status: 201 });
    }),
    http.patch(apiUrl('/address-books/:guid/peers/:peerId'), async ({ request, params }) => {
      const body = (await request.json()) as Partial<Peer>;
      bodies.push(body);
      peers = peers.map((p) => (p.peerId === params.peerId ? { ...p, ...body } : p));
      return HttpResponse.json<Peer>(peers.find((p) => p.peerId === params.peerId) ?? makePeer());
    }),
    http.patch(apiUrl('/address-books/:guid/tags/:name'), async ({ request, params }) => {
      const body = (await request.json()) as Partial<Tag>;
      bodies.push(body);
      const name = decodeURIComponent(String(params.name));
      tags = tags.map((t) => (t.name === name ? { ...t, ...body } : t));
      if (body.name)
        peers = peers.map((p) => ({
          ...p,
          tags: p.tags.map((t) => (t === name ? (body.name ?? t) : t)),
        }));
      return HttpResponse.json<Tag>(tags.find((t) => t.name === (body.name ?? name)) ?? makeTag());
    }),
    http.delete(apiUrl('/address-books/:guid/tags/:name'), ({ params }) => {
      const name = decodeURIComponent(String(params.name));
      tags = tags.filter((t) => t.name !== name);
      peers = peers.map((p) => ({ ...p, tags: p.tags.filter((t) => t !== name) }));
      return new HttpResponse(null, { status: 204 });
    }),
  ];
  return {
    handlers,
    bodies,
    peers: () => peers,
    tags: () => tags,
    lastQuery: () => queries[queries.length - 1],
  };
}

describe('address book peers', () => {
  it('validates the peer form like the API schema', async () => {
    const api = bookApi();
    server.use(...api.handlers);
    const { user } = renderApp(BOOK_URL);
    await user.click(await screen.findByRole('button', { name: 'Add peer' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Platform'), 'x'.repeat(65));
    await user.click(within(dialog).getByRole('button', { name: 'Add peer' }));
    expect(await within(dialog).findByText('Enter the RustDesk ID')).toBeInTheDocument();
    expect(within(dialog).getByText('At most 64 characters')).toBeInTheDocument();
    expect(api.bodies).toHaveLength(0);
  });

  it('turns a 409 duplicate into a field error on the RustDesk ID', async () => {
    const api = bookApi();
    server.use(...api.handlers);
    const { user } = renderApp(BOOK_URL);
    await user.click(await screen.findByRole('button', { name: 'Add peer' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('RustDesk ID'), '555666777');
    await user.click(within(dialog).getByRole('button', { name: 'Add peer' }));
    expect(
      await within(dialog).findByText('A peer with this ID already exists in the book'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('RustDesk ID')).toHaveAttribute('aria-invalid', 'true');
  });

  it('creates a peer with tags picked in the multi-select, and a write-only password', async () => {
    const api = bookApi();
    server.use(...api.handlers);
    const { user } = renderApp(BOOK_URL);
    await user.click(await screen.findByRole('button', { name: 'Add peer' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('RustDesk ID'), '123123123');
    await user.type(within(dialog).getByLabelText('Alias'), 'Warehouse');
    await user.click(within(dialog).getByRole('combobox', { name: 'Tags' }));
    await user.click(await screen.findByRole('option', { name: 'vip' }));
    await user.click(await screen.findByRole('option', { name: 'office' }));
    // Remove one again from the chips.
    await user.click(within(dialog).getByRole('button', { name: 'Remove tag office' }));
    await user.type(within(dialog).getByLabelText('Set password'), 's3cret');
    await user.click(within(dialog).getByRole('button', { name: 'Add peer' }));

    await waitFor(() => expect(api.peers()).toHaveLength(2));
    expect(api.bodies[0]).toMatchObject({
      peerId: '123123123',
      alias: 'Warehouse',
      tags: ['vip'],
      password: 's3cret',
    });
    expect(await screen.findByText('Peer 123123123 added')).toBeInTheDocument();
  });

  it('removes a tag from an existing peer without touching the password', async () => {
    const api = bookApi();
    server.use(...api.handlers);
    const { user } = renderApp(BOOK_URL);
    await user.click(await screen.findByRole('button', { name: 'Actions for peer 555666777' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('RustDesk ID')).toHaveAttribute('readonly');
    await user.click(within(dialog).getByRole('button', { name: 'Remove tag office' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.bodies).toHaveLength(1));
    expect(api.bodies[0]).toMatchObject({ tags: [] });
    expect(api.bodies[0]).not.toHaveProperty('password');
  });
});

describe('peer tag filter', () => {
  it('filters by several tags, any or all of them, through the URL', async () => {
    const api = bookApi();
    server.use(...api.handlers);
    const { user, router } = renderApp(BOOK_URL);
    await screen.findByRole('button', { name: 'Actions for peer 555666777' });

    await user.click(screen.getByRole('combobox', { name: 'Tags' }));
    await user.click(await screen.findByRole('option', { name: 'office' }));
    // One tag: no mode is sent.
    await waitFor(() => expect(api.lastQuery()?.getAll('tag')).toEqual(['office']));
    expect(api.lastQuery()?.has('tagMode')).toBe(false);
    await user.click(await screen.findByRole('option', { name: 'vip' }));
    await waitFor(() => expect(api.lastQuery()?.getAll('tag')).toEqual(['office', 'vip']));
    // Two tags: "any" is the default and is sent explicitly.
    expect(api.lastQuery()?.get('tagMode')).toBe('any');
    expect(router.state.location.search).toBe('?tag=office&tag=vip');

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('combobox', { name: 'Match' }));
    await user.click(await screen.findByRole('option', { name: 'All of the tags' }));
    await waitFor(() => expect(api.lastQuery()?.get('tagMode')).toBe('all'));
    expect(router.state.location.search).toBe('?tag=office&tag=vip&tagMode=all');

    // Down to one tag: the mode no longer applies and leaves the URL.
    await user.click(screen.getByRole('button', { name: 'Remove tag vip' }));
    await waitFor(() => expect(router.state.location.search).toBe('?tag=office'));
    expect(screen.queryByRole('combobox', { name: 'Match' })).not.toBeInTheDocument();
  });

  it('restores the tags from a shared link', async () => {
    const api = bookApi();
    server.use(...api.handlers);
    renderApp(`${BOOK_URL}?tag=vip&tag=office&tag=vip&tagMode=all`);
    await waitFor(() => expect(api.lastQuery()?.getAll('tag')).toEqual(['vip', 'office']));
    expect(api.lastQuery()?.get('tagMode')).toBe('all');
    expect(await screen.findByRole('combobox', { name: 'Tags' })).toHaveTextContent('2 selected');
  });
});

describe('address book tags', () => {
  it('renames and recolors a tag (ARGB integer on the wire)', async () => {
    const api = bookApi();
    server.use(...api.handlers);
    const { user } = renderApp(`${BOOK_URL}?tab=tags`);
    await user.click(await screen.findByRole('button', { name: 'Edit tag office' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'hq');
    await user.click(within(dialog).getByRole('radio', { name: '#ef4444' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.bodies).toHaveLength(1));
    expect(api.bodies[0]).toEqual({ name: 'hq', color: 0xffef4444 });
    expect(await screen.findByRole('button', { name: 'Edit tag hq' })).toBeInTheDocument();
  });

  it('deletes a tag after confirming how many peers carry it', async () => {
    const api = bookApi();
    server.use(...api.handlers);
    const { user } = renderApp(`${BOOK_URL}?tab=tags`);
    await user.click(await screen.findByRole('button', { name: 'Delete tag office' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/It is removed from/)).toHaveTextContent(
      'It is removed from 1 peer.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Delete tag' }));
    await waitFor(() => expect(api.tags().map((t) => t.name)).toEqual(['vip']));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Edit tag office' })).not.toBeInTheDocument(),
    );
  });

  it('turns a 409 on create into a field error', async () => {
    const api = bookApi();
    server.use(
      http.post(apiUrl('/address-books/:guid/tags'), () =>
        apiError(409, 'ALREADY_EXISTS', 'A tag with this name already exists'),
      ),
      ...api.handlers,
    );
    const { user } = renderApp(`${BOOK_URL}?tab=tags`);
    await user.click(await screen.findByRole('button', { name: 'Create tag' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'office');
    await user.click(within(dialog).getByRole('button', { name: 'Create tag' }));
    expect(
      await within(dialog).findByText('A tag with this name already exists'),
    ).toBeInTheDocument();
  });
});

describe('sharing editor', () => {
  it('adds a user, changes a rule, removes a user and saves the whole list', async () => {
    const api = bookApi();
    let saved: unknown;
    const carol = makeUser({
      id: '00000000-0000-4000-8000-000000000003',
      username: 'carol',
      role: 'USER',
    });
    server.use(
      ...api.handlers,
      http.get(apiUrl('/address-books/:guid/shares'), () =>
        HttpResponse.json<Share[]>([
          makeShare(),
          makeShare({ userId: '00000000-0000-4000-8000-000000000004', username: 'dave', rule: 2 }),
        ]),
      ),
      http.get(apiUrl('/users'), () => HttpResponse.json<Page<User>>(page([carol]))),
      http.put(apiUrl('/address-books/:guid/shares'), async ({ request }) => {
        saved = await request.json();
        return HttpResponse.json<Share[]>([]);
      }),
    );
    const { user } = renderApp(BOOK_URL);
    await user.click(await screen.findByRole('button', { name: 'Share' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('bob');

    await user.click(within(dialog).getByRole('combobox', { name: 'Access of bob' }));
    await user.click(await screen.findByRole('option', { name: 'Full control' }));
    await user.click(within(dialog).getByRole('button', { name: 'Stop sharing with dave' }));
    await user.click(within(dialog).getByRole('combobox', { name: /Add a user/ }));
    await user.click(await screen.findByRole('option', { name: /carol/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save sharing' }));

    await waitFor(() =>
      expect(saved).toEqual([
        { userId: '00000000-0000-4000-8000-000000000002', rule: 3 },
        { userId: carol.id, rule: 1 },
      ]),
    );
  });
});
