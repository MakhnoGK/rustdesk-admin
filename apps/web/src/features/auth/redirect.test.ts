import { loginPath, safeRedirect } from './redirect';

describe('safeRedirect', () => {
  it.each([
    ['/sessions?status=ACTIVE', '/sessions?status=ACTIVE'],
    ['/devices/abc%2Fdef#top', '/devices/abc%2Fdef#top'],
  ])('keeps same-origin path %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });

  it.each([
    'https://evil.example.com/',
    '//evil.example.com/path',
    '/\\evil.example.com',
    'javascript:alert(1)',
    'evil.example.com',
    '/login?redirect=/x',
    '',
  ])('rejects %s', (input) => {
    expect(safeRedirect(input)).toBe('/');
  });

  it('falls back to / when missing', () => {
    expect(safeRedirect(null)).toBe('/');
  });
});

describe('loginPath', () => {
  it('remembers the current location', () => {
    expect(loginPath({ pathname: '/devices', search: '?q=pc' })).toBe(
      '/login?redirect=%2Fdevices%3Fq%3Dpc',
    );
  });

  it('adds the reason and skips a redirect to /', () => {
    expect(loginPath({ pathname: '/', search: '' }, 'expired')).toBe('/login?reason=expired');
  });
});
