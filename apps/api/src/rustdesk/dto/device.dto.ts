// Documentation-only request/response shapes for the unauthenticated device endpoints.
// Bodies are decoded leniently by the mappers (unknown fields kept), not by class-validator.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HeartbeatRequestDto {
  /** RustDesk ID. */
  id!: string;
  /** Machine UUID (base64). */
  uuid!: string;
  /** Numeric client version. */
  ver!: number;

  @ApiPropertyOptional({
    type: [Number],
    description: 'Conn IDs alive on the device; omitted when there are none',
  })
  conns?: number[];

  /** RustDesk Pro strategy timestamp; ignored. */
  modified_at!: number;
}

export class HeartbeatResponseDto {
  @ApiPropertyOptional({
    type: [Number],
    description: 'Conn IDs the client must close (remote disconnect)',
  })
  disconnect?: number[];

  @ApiPropertyOptional({
    type: Number,
    enum: [1],
    description: 'Present when the server needs system info re-uploaded',
  })
  sysinfo?: 1;
}

export class SysinfoRequestDto {
  id!: string;
  uuid!: string;
  version!: string;
  hostname?: string;
  username?: string;
  os?: string;
}

export class AuditConnRequestDto {
  /** RustDesk ID of the controlled device that posts the record. */
  id!: string;
  uuid!: string;
  conn_id!: number;

  @ApiProperty({
    oneOf: [{ type: 'integer' }, { type: 'string' }],
    description: 'u64; may be 0 on "new"',
  })
  session_id!: number | string;

  /** Unique per record; retries reuse it. */
  nonce!: string;

  @ApiPropertyOptional({ enum: ['new', 'close'], description: 'Absent on the "peer" record' })
  action?: 'new' | 'close';

  /** Initiator IP ("new" only). */
  ip?: string;

  @ApiPropertyOptional({
    type: [String],
    description: '[initiator RustDesk ID, initiator name] ("peer" only)',
  })
  peer?: [string, string];

  /** Connection type ("peer" only). */
  type?: number;
}

export class AuditFileRequestDto {
  id!: string;
  uuid!: string;
  peer_id!: string;
  conn_id!: number;
  type!: number;
  path!: string;
  is_file!: boolean;
  /** JSON string. */
  info!: string;
  nonce!: string;
}

export class AuditAlarmRequestDto {
  id!: string;
  uuid!: string;
  typ!: number;
  /** JSON string. */
  info!: string;
  conn_id!: number;
  nonce!: string;
  conn_audit_ref?: string;
}
