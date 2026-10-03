import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { Token, User } from '@/api/types';
import { ADMIN, makeAdminSession, makeToken, makeUser, page, type Page } from '@/test/fixtures';
import { renderApp } from '@/test/render';
import { apiError, apiUrl, server } from '@/test/server';

const bob = makeUser({
  id: '00000000-0000-4000-8000-000000000002',
  username: 'bob',
  role: 'USER',
  displayName: 'Bob',
});

function usersApi() {
  let users = [ADMIN, bob];
  const bodies: unknown[] = [];
  return {
    bodies,
    handlers: [
      http.get(apiUrl('/users'), () => HttpResponse.json<Page<User>>(page(users))),
      http.get(apiUrl('/users/:id'), ({ params }) =>
        HttpResponse.json<User>(users.find((u) => u.id === params.id) ?? bob),
      ),
      http.post(apiUrl('/users'), async ({ request }) => {
        const body = (await request.json()) as User & { password: string };
        bodies.push(body);
        // Like the API: the password is never echoed back.
        const { password: _password, ...rest } = body;
        const created = makeUser({ ...rest, id: '00000000-0000-4000-8000-0000000000ff' });
        users = [...users, created];
        return HttpResponse.json<User>(created, { status: 201 });
      }),
    ],
  };
}

describe('users', () => {
  it('creates a user and keeps no password in the TanStack caches', async () => {
    const api = usersApi();
    server.use(...api.handlers);
    const { user, queryClient } = renderApp('/users');
    await user.click(await screen.findByRole('button', { name: 'Create user' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Username'), 'carol');
    await user.type(within(dialog).getByLabelText('Password'), 'a-long-password');
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));

    expect(await screen.findByText('User carol created')).toBeInTheDocument();
    expect(api.bodies[0]).toMatchObject({
      username: 'carol',
      password: 'a-long-password',
      role: 'USER',
    });
    expect(await screen.findByRole('link', { name: 'carol' })).toBeInTheDocument();
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0));
    const cached = JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
    );
    expect(cached).not.toContain('a-long-password');
  });

  it('validates the create form', async () => {
    server.use(...usersApi().handlers);
    const { user } = renderApp('/users');
    await user.click(await screen.findByRole('button', { name: 'Create user' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Username'), 'b@d');
    await user.type(within(dialog).getByLabelText('Password'), 'short');
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }));
    expect(
      await within(dialog).findByText('Letters, digits, “.”, “_” and “-” only'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('At least 8 characters')).toBeInTheDocument();
  });

  it('does not let you demote, disable or delete yourself', async () => {
    server.use(...usersApi().handlers);
    const { user } = renderApp('/users');
    await user.click(await screen.findByRole('button', { name: 'Actions for admin' }));
    expect(await screen.findByRole('menuitem', { name: /Delete/ })).toHaveAttribute(
      'data-disabled',
    );
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('combobox', { name: 'Role' })).toBeDisabled();
    expect(within(dialog).getByRole('combobox', { name: 'Status' })).toBeDisabled();
    expect(
      within(dialog).getByText('You cannot change your own role or status.'),
    ).toBeInTheDocument();
  });

  it('shows the API message when the last administrator would be removed', async () => {
    server.use(
      http.patch(apiUrl('/users/:id'), () =>
        apiError(409, 'LAST_ADMIN', 'At least one active administrator must remain'),
      ),
      http.delete(apiUrl('/users/:id'), () =>
        apiError(409, 'LAST_ADMIN', 'At least one active administrator must remain'),
      ),
      ...usersApi().handlers,
    );
    const otherAdmin = makeUser({ ...bob, role: 'ADMIN' });
    server.use(
      http.get(apiUrl('/users'), () => HttpResponse.json<Page<User>>(page([ADMIN, otherAdmin]))),
    );
    const { user } = renderApp('/users');

    // Demotion: the form shows it (no toast as well).
    await user.click(await screen.findByRole('button', { name: 'Actions for bob' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'Role' }));
    await user.click(await screen.findByRole('option', { name: 'User' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText('At least one active administrator must remain'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('At least one active administrator must remain')).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    // Deletion: a toast.
    await user.click(screen.getByRole('button', { name: 'Actions for bob' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete user' }),
    );
    expect(
      await screen.findByText('At least one active administrator must remain'),
    ).toBeInTheDocument();
  });

  it('lists tokens and revokes one', async () => {
    let tokens: Token[] = [
      makeToken(),
      makeToken({
        id: '50000000-0000-4000-8000-000000000002',
        active: false,
        revokedAt: '2026-10-01T00:00:00.000Z',
      }),
    ];
    let revoked: string | undefined;
    server.use(
      ...usersApi().handlers,
      http.get(apiUrl('/users/:id/tokens'), () => HttpResponse.json<Page<Token>>(page(tokens))),
      http.delete(apiUrl('/tokens/:id'), ({ params }) => {
        revoked = String(params.id);
        tokens = tokens.map((t) =>
          t.id === params.id ? { ...t, active: false, revokedAt: '2026-10-03T12:00:00.000Z' } : t,
        );
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp(`/users/${bob.id}`);
    expect(await screen.findByRole('heading', { name: 'bob' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Tokens of bob' });
    expect(within(table).getByText('Revoked')).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: 'Revoke' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/123456789 is signed out/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(revoked).toBe('50000000-0000-4000-8000-000000000001'));
    await waitFor(() =>
      expect(within(table).queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument(),
    );
  });

  it('marks the current admin session and signs out when it is revoked', async () => {
    const tokens: Token[] = [
      makeToken({
        id: '50000000-0000-4000-8000-0000000000c1',
        userId: ADMIN.id,
        kind: 'ADMIN_WEB',
        clientId: null,
        clientUuid: null,
        userAgent: 'Firefox',
        current: true,
      }),
    ];
    let revoked: string | undefined;
    server.use(
      ...usersApi().handlers,
      http.get(apiUrl('/users/:id/tokens'), () => HttpResponse.json<Page<Token>>(page(tokens))),
      http.delete(apiUrl('/tokens/:id'), ({ params }) => {
        revoked = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
      // The cookie's token is gone from here on.
      http.get(apiUrl('/auth/me'), () =>
        revoked
          ? apiError(401, 'UNAUTHORIZED', 'Token revoked')
          : HttpResponse.json(makeAdminSession()),
      ),
    );
    const { user, router } = renderApp(`/users/${ADMIN.id}`);
    const table = await screen.findByRole('table', { name: `Tokens of ${ADMIN.username}` });
    expect(await within(table).findByText('This session')).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: 'Revoke' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/This is your current session/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Revoke and sign out' }));
    await waitFor(() => expect(revoked).toBe('50000000-0000-4000-8000-0000000000c1'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});
