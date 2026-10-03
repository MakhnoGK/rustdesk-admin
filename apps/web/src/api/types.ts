// Aliases for the generated contract types. Nothing here is defined by hand: every type comes from
// @rustdesk-admin/api-contract (packages/api-contract/src/schema.d.ts, generated from the API).
import type { operations, Schema } from '@rustdesk-admin/api-contract';

export type { paths } from '@rustdesk-admin/api-contract';

export type User = Schema<'UserDto'>;
export type UserRole = Schema<'UserRole'>;
export type UserStatus = Schema<'UserStatus'>;
export type CreateUserBody = Schema<'CreateUserDto'>;
export type UpdateUserBody = Schema<'UpdateUserDto'>;
export type Token = Schema<'TokenDto'>;
export type TokenKind = Schema<'TokenKind'>;
export type AdminSession = Schema<'AdminSessionDto'>;

export type Device = Schema<'DeviceDto'>;
export type DeviceDetail = Schema<'DeviceDetailDto'>;

export type AddressBook = Schema<'AddressBookDto'>;
export type AddressBookKind = Schema<'AddressBookKind'>;
export type CreateAddressBookBody = Schema<'CreateAddressBookDto'>;
export type UpdateAddressBookBody = Schema<'UpdateAddressBookDto'>;
export type Share = Schema<'ShareDto'>;
export type ShareInput = Schema<'ShareInputDto'>;
export type ShareRule = Schema<'ShareDto'>['rule'];
export type Peer = Schema<'AdminPeerDto'>;
export type CreatePeerBody = Schema<'CreatePeerDto'>;
export type UpdatePeerBody = Schema<'UpdatePeerDto'>;
export type Tag = Schema<'AdminTagDto'>;
export type CreateTagBody = Schema<'CreateTagDto'>;
export type UpdateTagBody = Schema<'UpdateTagDto'>;

export type Session = Schema<'SessionDto'>;
export type SessionDetail = Schema<'SessionDetailDto'>;
export type SessionStatus = Schema<'SessionStatus'>;
export type SessionCloseReason = Schema<'SessionCloseReason'>;
export type ConnTypeName = Schema<'ConnTypeName'>;
export type Disconnect = Schema<'DisconnectDto'>;
export type DisconnectState = Schema<'DisconnectState'>;

export type StatsSummary = Schema<'StatsSummaryDto'>;
export type TimeseriesPoint = Schema<'TimeseriesPointDto'>;
export type TopEntry = Schema<'TopEntryDto'>;

export type AuditEvent = Schema<'AuditEventDto'>;
export type AuditKind = AuditEvent['kind'];

export type SystemInfo = Schema<'SystemInfoDto'>;
export type ErrorCode = Schema<'ErrorCode'>;
export type ErrorBody = Schema<'AdminErrorDto'>;

type QueryOf<Op extends keyof operations> = NonNullable<operations[Op]['parameters']['query']>;

export type UserListQuery = QueryOf<'AdminUsers_list'>;
export type DeviceListQuery = QueryOf<'AdminDevices_list'>;
export type AddressBookListQuery = QueryOf<'AdminAddressBooks_list'>;
export type PeerListQuery = QueryOf<'AdminAddressBooks_listPeers'>;
export type SessionListQuery = QueryOf<'AdminSessions_list'>;
export type StatsRangeQuery = QueryOf<'AdminStats_summary'>;
export type TimeseriesQuery = QueryOf<'AdminStats_timeseries'>;
export type TopQuery = QueryOf<'AdminStats_top'>;
export type AuditEventListQuery = QueryOf<'AdminAuditEvents_list'>;
export type TokenListQuery = QueryOf<'AdminUsers_listTokens'>;
