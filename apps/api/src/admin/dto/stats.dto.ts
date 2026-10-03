import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsIsoDateTime } from './validators';

export class StatsRangeQueryDto {
  /** Range start, inclusive (ISO-8601). Applies to session `startedAt`. */
  @ApiProperty({ format: 'date-time', example: '2026-09-01T00:00:00Z' })
  @IsIsoDateTime()
  from!: string;

  /** Range end, exclusive (ISO-8601). At most STATS_MAX_RANGE_DAYS after `from`. */
  @ApiProperty({ format: 'date-time', example: '2026-10-01T00:00:00Z' })
  @IsIsoDateTime()
  to!: string;
}

export class TimeseriesQueryDto extends StatsRangeQueryDto {
  @ApiProperty({ enum: ['hour', 'day'] })
  @IsIn(['hour', 'day'])
  bucket!: 'hour' | 'day';
}

export class TopQueryDto extends StatsRangeQueryDto {
  @ApiProperty({ enum: ['initiator', 'target'] })
  @IsIn(['initiator', 'target'])
  by!: 'initiator' | 'target';

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}

export class StatsSummaryDto {
  totalSessions!: number;
  /** Sum of known durations, seconds. */
  totalDurationSeconds!: number;
  /** Mean of known durations, rounded seconds. */
  avgDurationSeconds!: number;
  timedOutSessions!: number;
  /** Sessions started in the range that are still active. */
  activeSessions!: number;
  unauthenticatedSessions!: number;
}

export class TimeseriesPointDto {
  /** UTC bucket start. */
  @ApiProperty({ format: 'date-time' })
  bucketStart!: string;

  sessions!: number;
  durationSeconds!: number;
}

export class TopEntryDto {
  /** Initiator or target RustDesk ID. */
  id!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Initiator name, or target hostname' })
  name!: string | null;

  sessions!: number;
  durationSeconds!: number;
}

export class SystemInfoDto {
  version!: string;
  sessionTimeoutMinutes!: number;
  heartbeatGraceSeconds!: number;
  deviceOnlineThresholdSeconds!: number;
  disconnectTtlSeconds!: number;
}
