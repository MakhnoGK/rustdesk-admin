import { ipAllowed, parseCidr } from './cidr';

describe('ipAllowed', () => {
  const ranges = ['10.0.0.0/8', '192.168.1.5', '2001:db8::/32'].map(parseCidr);

  it.each([
    ['10.1.2.3', true],
    ['::ffff:10.1.2.3', true],
    ['192.168.1.5', true],
    ['192.168.1.6', false],
    ['2001:db8::1', true],
    ['2001:db9::1', false],
    ['not-an-ip', false],
    [undefined, false],
  ])('%s → %s', (ip, expected) => {
    expect(ipAllowed(ip, ranges)).toBe(expected);
  });

  it('allows everything when no ranges are configured', () => {
    expect(ipAllowed('8.8.8.8', [])).toBe(true);
  });
});
