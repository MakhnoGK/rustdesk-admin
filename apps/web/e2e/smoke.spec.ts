import { expect, test, type Page } from '@playwright/test';
import { mockApi, mockDisconnect } from './mock-api';

// Without E2E_BASE_URL the admin API is mocked in the browser. With it, the specs run against a real
// stack (docker compose) and sign in with E2E_USERNAME / E2E_PASSWORD; only the remote-disconnect
// step stays mocked, because a live RustDesk session cannot be produced on demand.
const real = !!process.env.E2E_BASE_URL;
const username = process.env.E2E_USERNAME ?? 'admin';
const password = process.env.E2E_PASSWORD ?? 'e2e-password';

/** A link in the sidebar navigation. */
const navLink = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });

test.beforeEach(async ({ page }) => {
  if (!real) await mockApi(page);
});

test('login → dashboard → session history → peer → disconnect', async ({ page }) => {
  // Sign in: the protected start page sends us to the login form first.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Sessions: / })).toBeVisible();

  // Filter the session history; the filter lands in the URL.
  await navLink(page, 'Session history').click();
  await expect(page.getByRole('heading', { name: 'Session history' })).toBeVisible();
  await page.getByLabel('Status').click();
  await page.getByRole('option', { name: 'Timeout' }).click();
  await expect(page).toHaveURL(/status=TIMEOUT/);
  if (!real) {
    await expect(page.getByText('≈ 2h 00m 00s')).toBeVisible();
    // The CLOSED session is filtered out by the API query.
    await expect(page.locator('[data-slot=badge]', { hasText: /^Closed$/ })).toHaveCount(0);
  }

  // Create a shared book, add a peer, delete it, clean up.
  const bookName = `E2E ${Date.now()}`;
  const peerId = String(100_000_000 + Math.floor(Math.random() * 800_000_000));
  await navLink(page, 'Address books').click();
  await page.getByRole('button', { name: 'Create shared book' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(bookName);
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: bookName })).toBeVisible();

  await page.getByRole('button', { name: 'Add peer' }).first().click();
  const peerDialog = page.getByRole('dialog');
  await peerDialog.getByLabel('RustDesk ID').fill(peerId);
  await peerDialog.getByLabel('Alias').fill('E2E peer');
  await peerDialog.getByRole('button', { name: 'Add peer' }).click();
  await expect(page.getByRole('cell', { name: 'E2E peer' })).toBeVisible();

  await page.getByRole('button', { name: `Actions for peer ${peerId}` }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText(peerId);
  await confirm.getByRole('button', { name: 'Delete peer' }).click();
  await expect(page.getByText('No peers in this address book')).toBeVisible();

  await page.getByRole('button', { name: `Actions for ${bookName}` }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete address book' }).click();
  await expect(page).toHaveURL(/\/address-books$/);

  // Remote disconnect (mocked): requested → delivered → closed.
  await mockDisconnect(page);
  await navLink(page, 'Active sessions').click();
  await page.getByRole('button', { name: 'Disconnect session on 987654321' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Request disconnect' }).click();
  await expect(page.getByText('Disconnect requested').first()).toBeVisible();
  await expect(page.getByText('Session closed')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('No active sessions')).toBeVisible({ timeout: 15_000 });
});

test('rejects an external redirect after login', async ({ page }) => {
  test.skip(real, 'mock-only: uses the mocked credentials');
  await page.goto('/login?redirect=https%3A%2F%2Fevil.example.com%2F');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('e2e-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/);
});
