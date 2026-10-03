import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Paginated, PageQueryDto } from '../../common/pagination/pagination';
import { QueryBoolean } from './validators';

export class DeviceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  /** Machine UUID (base64) sent by the client; the device's stable key. */
  uuid!: string;

  /** Current RustDesk ID. */
  rustdeskId!: string;

  @ApiProperty({ type: String, nullable: true })
  hostname!: string | null;

  @ApiProperty({ type: String, nullable: true })
  username!: string | null;

  @ApiProperty({ type: String, nullable: true })
  os!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Client version from sysinfo, e.g. "1.4.2"',
  })
  version!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Numeric client version from heartbeats (decimal string)',
  })
  heartbeatVersion!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastHeartbeatAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastIp!: string | null;

  /** Last heartbeat newer than DEVICE_ONLINE_THRESHOLD_SECONDS. */
  online!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  sysinfoUpdatedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class DeviceIdChangeDto {
  oldRustdeskId!: string;
  newRustdeskId!: string;

  @ApiProperty({ format: 'date-time' })
  changedAt!: string;
}

export class DeviceDetailDto extends DeviceDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Raw system info (credential-like fields redacted)',
  })
  sysinfo!: Record<string, unknown> | null;

  @ApiProperty({
    type: () => [DeviceIdChangeDto],
    description: 'RustDesk ID changes, newest first (at most 100)',
  })
  idChanges!: DeviceIdChangeDto[];
}

export class DevicePageDto extends Paginated(DeviceDto) {}

export class DeviceListQueryDto extends PageQueryDto {
  /** Matches RustDesk ID, hostname or username. Sort fields: rustdeskId, hostname, lastHeartbeatAt, createdAt. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  online?: boolean;
}
