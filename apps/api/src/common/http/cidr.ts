import ipaddr from 'ipaddr.js';

type ParsedCidr = [ipaddr.IPv4 | ipaddr.IPv6, number];

/** Parses `10.0.0.0/8`, `2001:db8::/32` or a bare address (treated as /32 or /128). */
export function parseCidr(value: string): ParsedCidr {
  if (value.includes('/')) return ipaddr.parseCIDR(value);
  const addr = ipaddr.parse(value);
  return [addr, addr.kind() === 'ipv4' ? 32 : 128];
}

function normalize(ip: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
  if (!ipaddr.isValid(ip)) return null;
  const addr = ipaddr.parse(ip);
  // ::ffff:192.0.2.1 → 192.0.2.1 so IPv4 ranges match dual-stack sockets.
  if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    return (addr as ipaddr.IPv6).toIPv4Address();
  }
  return addr;
}

/** True when `ip` is inside any of the ranges. An empty list allows everything. */
export function ipAllowed(ip: string | undefined, ranges: ParsedCidr[]): boolean {
  if (ranges.length === 0) return true;
  if (!ip) return false;
  const addr = normalize(ip);
  if (!addr) return false;
  return ranges.some(([range, bits]) => addr.kind() === range.kind() && addr.match(range, bits));
}
