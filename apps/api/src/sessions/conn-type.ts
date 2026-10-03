// The `type` of a RustDesk "peer" audit record, as the client assigns it in
// `Connection::on_auth_success` (src/server/connection.rs, rustdesk master e5bc204, 2026-10).

export const CONN_TYPE_NAMES = [
  'REMOTE_DESKTOP',
  'FILE_TRANSFER',
  'PORT_FORWARD',
  'VIEW_CAMERA',
  'TERMINAL',
] as const;
export type ConnTypeName = (typeof CONN_TYPE_NAMES)[number];

/** Index = the raw value; anything else is unknown and stays null. */
export function connTypeName(connType: number | null): ConnTypeName | null {
  if (connType === null || !Number.isInteger(connType)) return null;
  return CONN_TYPE_NAMES[connType] ?? null;
}
