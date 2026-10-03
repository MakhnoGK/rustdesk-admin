import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { makeAdminSession } from '@/test/fixtures';
import { dashboardHandlers, devicesHandler, signedOutHandlers } from '@/test/handlers';
import { locationOf, renderApp } from '@/test/render';
import { apiError, apiUrl, server } from '@/test/server';

async function signIn(user: ReturnType<typeof renderApp>['user'], password = 'correct horse') {
  await user.type(await screen.findByLabelText('Username'), 'admin');
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('authentication', () => {
  it('shows the login page when there is no session, remembering the target', async () => {
    server.use(...signedOutHandlers(), devicesHandler());
    const { router } = renderApp('/devices?q=pc');
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(locationOf(router)).toBe('/login?redirect=%2Fdevices%3Fq%3Dpc');
    // No flash of protected content.
    expect(screen.queryByRole('heading', { name: 'Devices' })).not.toBeInTheDocument();
  });

  it('starts in the app when the session cookie is valid', async () => {
    server.use(...dashboardHandlers);
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'admin' })).toBeInTheDocument();
  });

  it('signs in and returns to the redirect target', async () => {
    server.use(...signedOutHandlers(), devicesHandler());
    const { user, router } = renderApp('/login?redirect=%2Fdevices');
    await signIn(user);
    expect(await screen.findByRole('heading', { name: 'Devices' })).toBeInTheDocument();
    expect(locationOf(router)).toBe('/devices');
  });

  it('ignores an external redirect target', async () => {
    server.use(...signedOutHandlers(), ...dashboardHandlers);
    const { user, router } = renderApp('/login?redirect=https%3A%2F%2Fevil.example.com%2F');
    await signIn(user);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('shows the API message for invalid credentials and clears the password', async () => {
    server.use(...signedOutHandlers());
    const { user, router, queryClient } = renderApp('/login');
    await signIn(user, 'wrong password');
    expect(await screen.findByText('Invalid username or password')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(router.state.location.pathname).toBe('/login');
    // The password does not stay in the mutation cache.
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0));
  });

  it('validates the form before calling the API', async () => {
    let calls = 0;
    server.use(
      http.post(apiUrl('/auth/login'), () => {
        calls += 1;
        return HttpResponse.json({});
      }),
      ...signedOutHandlers(),
    );
    const { user } = renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your username')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(calls).toBe(0);
  });

  it('shows the API message on 429 with Retry-After', async () => {
    // The first matching handler wins: the override goes first.
    server.use(
      http.post(apiUrl('/auth/login'), () =>
        apiError(429, 'RATE_LIMITED', 'Too many login attempts', undefined, {
          'Retry-After': '42',
        }),
      ),
      ...signedOutHandlers(),
    );
    const { user } = renderApp('/login');
    await signIn(user);
    expect(await screen.findByText('Too many requests. Try again in 42 s.')).toBeInTheDocument();
  });

  it('goes to the login page on a 401 in the middle of a session', async () => {
    let revoked = false;
    server.use(
      http.get(apiUrl('/devices'), () => {
        revoked = true;
        return apiError(401, 'UNAUTHORIZED', 'Session expired');
      }),
      http.get(apiUrl('/auth/me'), () =>
        revoked
          ? apiError(401, 'UNAUTHORIZED', 'Session expired')
          : HttpResponse.json(makeAdminSession()),
      ),
    );
    const { router } = renderApp('/devices');
    await waitFor(() =>
      expect(locationOf(router)).toBe('/login?redirect=%2Fdevices&reason=expired'),
    );
    // The login route may render twice while the cache is cleared: assert on the settled page.
    await waitFor(() => expect(screen.getByText('Session expired')).toBeInTheDocument());
  });

  it('does not bounce back when only one endpoint answers 401', async () => {
    server.use(http.get(apiUrl('/devices'), () => apiError(401, 'UNAUTHORIZED', 'Token revoked')));
    const { router } = renderApp('/devices');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('renders "No access" on 403', async () => {
    server.use(
      http.get(apiUrl('/devices'), () => apiError(403, 'FORBIDDEN', 'Administrator role required')),
    );
    renderApp('/devices');
    expect(await screen.findByText('No access')).toBeInTheDocument();
  });

  it('signs out, clears the cache, and lands on the login page', async () => {
    let signedIn = true;
    server.use(
      ...dashboardHandlers,
      http.get(apiUrl('/auth/me'), () =>
        signedIn
          ? HttpResponse.json(makeAdminSession())
          : apiError(401, 'UNAUTHORIZED', 'Not signed in'),
      ),
      http.post(apiUrl('/auth/logout'), () => {
        signedIn = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user, router, queryClient } = renderApp('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'admin' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    await waitFor(() =>
      expect(queryClient.getQueryCache().findAll({ queryKey: ['stats'] })).toHaveLength(0),
    );
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
