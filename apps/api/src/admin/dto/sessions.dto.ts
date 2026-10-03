import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Paginated, PageQueryDto } from '../../common/pagination/pagination';
import { SessionCloseReason, SessionStatus } from '../../generated/prisma/enums';
import { CONN_TYPE_NAMES, type ConnTypeName } from '../../sessions/conn-type';
import { IsIsoDateTime, QueryBoolean } from './validators';

export class SessionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  /** Target (controlled) device machine UUID. */
  deviceUuid!: string;

  /** Target RustDesk ID. */
  deviceId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Current hostname of the target device; null when the device has not reported it',
  })
  deviceHostname!: string | null;

  /** Conn ID on the target device. */
  connId!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'RustDesk session_id (u64, decimal string)',
  })
  rustdeskSessionId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Initiator RustDesk ID (null until the "peer" record arrives)',
  })
  initiatorId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  initiatorName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  initiatorIp!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Raw connection type from the "peer" record',
  })
  connType!: number | null;

  @ApiProperty({
    enum: CONN_TYPE_NAMES,
    enumName: 'ConnTypeName',
    nullable: true,
    description:
      'Name of connType as the RustDesk client assigns it (0 remote desktop, 1 file transfer, 2 port forward, ' +
      '3 view camera, 4 terminal); null when connType is null or unknown',
  })
  connTypeName!: ConnTypeName | null;

  authenticated!: boolean;

  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  authenticatedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastSeenAt!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Whole seconds; null while active or when unknown',
  })
  durationSeconds!: number | null;

  /** True when closedAt was inferred (reconciliation, timeout, supersede) rather than reported. */
  durationEstimated!: boolean;

  @ApiProperty({ enum: SessionStatus, enumName: 'SessionStatus' })
  status!: SessionStatus;

  @ApiProperty({ enum: SessionCloseReason, enumName: 'SessionCloseReason', nullable: true })
  closeReason!: SessionCloseReason | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class SessionPageDto extends Paginated(SessionDto) {}

export class SessionListQueryDto extends PageQueryDto {
  /** Sort fields: startedAt (default, desc), closedAt, durationSeconds, lastSeenAt. */
  @ApiPropertyOptional({ enum: SessionStatus, enumName: 'SessionStatus' })
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  /** Target RustDesk ID. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;

  /** Initiator RustDesk ID. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  initiatorId?: string;

  /** Sessions started at or after (ISO-8601). */
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsIsoDateTime()
  from?: string;

  /** Sessions started before (ISO-8601, exclusive). */
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsIsoDateTime()
  to?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minDurationSeconds?: number;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  authenticated?: boolean;
}

export class AuditEventDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['conn', 'file', 'alarm'] })
  kind!: 'conn' | 'file' | 'alarm';

  @ApiProperty({ type: String, nullable: true, description: 'RustDesk ID of the posting device' })
  deviceId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  deviceUuid!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  connId!: number | null;

  @ApiProperty({ type: String, nullable: true })
  rustdeskSessionId!: string | null;

  @ApiProperty({ type: String, nullable: true, enum: ['new', 'peer', 'close'] })
  action!: 'new' | 'peer' | 'close' | null;

  @ApiProperty({ type: String, nullable: true })
  sourceIp!: string | null;

  @ApiProperty({ format: 'date-time' })
  receivedAt!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sessionId!: string | null;

  malformed!: boolean;

  @ApiProperty({ type: String, nullable: true })
  nonce!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'The record exactly as received',
  })
  payload!: Record<string, unknown>;
}

export class AuditEventPageDto extends Paginated(AuditEventDto) {}

export class AuditEventListQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize: number = 50;

  /** `receivedAt:desc` (default) or `receivedAt:asc`. */
  @ApiPropertyOptional({ enum: ['receivedAt:asc', 'receivedAt:desc'] })
  @IsOptional()
  @IsIn(['receivedAt:asc', 'receivedAt:desc'])
  sort?: 'receivedAt:asc' | 'receivedAt:desc';

  @ApiPropertyOptional({ enum: ['conn', 'file', 'alarm'] })
  @IsOptional()
  @IsIn(['conn', 'file', 'alarm'])
  kind?: 'conn' | 'file' | 'alarm';

  /** RustDesk ID of the posting device. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsIsoDateTime()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Exclusive' })
  @IsOptional()
  @IsIsoDateTime()
  to?: string;
}

export class SessionDetailDto extends SessionDto {
  @ApiProperty({
    type: () => [AuditEventDto],
    description: 'Audit events linked to the session, oldest first',
  })
  events!: AuditEventDto[];
}

export class DisconnectRequesterDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  username!: string;
}

export class DisconnectDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  deviceUuid!: string;
  connId!: number;

  @ApiProperty({
    enum: ['REQUESTED', 'DELIVERED', 'EXPIRED'],
    enumName: 'DisconnectState',
    description:
      'REQUESTED: waiting for the next heartbeat; DELIVERED: handed to the device; EXPIRED: no heartbeat before expiresAt',
  })
  state!: 'REQUESTED' | 'DELIVERED' | 'EXPIRED';

  @ApiProperty({ format: 'date-time' })
  requestedAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deliveredAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: () => DisconnectRequesterDto, nullable: true })
  requestedBy!: DisconnectRequesterDto | null;
}
