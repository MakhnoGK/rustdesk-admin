import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/** `?current=1&pageSize=100` — the client loops while `current * pageSize < total`. */
export class RustdeskPageQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  current: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  pageSize: number = 100;
}

export class AbPeersQueryDto extends RustdeskPageQueryDto {
  /** Address book guid. */
  @IsString()
  @Length(1, 64)
  ab!: string;
}

/**
 * One address-book peer (flutter/lib/models/peer_model.dart). Personal books carry `hash`,
 * shared books carry `password`. Unknown fields are stored and returned verbatim.
 */
export class AbPeerDto {
  /** RustDesk ID of the peer. */
  id!: string;
  alias?: string;
  tags?: string[];
  note?: string;
  username?: string;
  hostname?: string;
  platform?: string;
  /** Saved-password hash (personal books). A credential: stored encrypted. */
  hash?: string;
  /** Shared password (shared books). A credential: stored encrypted. */
  password?: string;

  @ApiPropertyOptional({ type: String, description: '"true" or "false" — a string in the client' })
  forceAlwaysRelay?: string;

  rdpPort?: string;
  rdpUsername?: string;
  loginName?: string;
  device_group_name?: string;

  @ApiPropertyOptional({ type: Boolean })
  same_server?: boolean;
}

export class AbPeerPageDto {
  total!: number;

  @ApiProperty({ type: () => [AbPeerDto] })
  data!: AbPeerDto[];
}

export class AbPersonalResponseDto {
  /** Guid of the caller's personal address book. */
  guid!: string;
}

export class AbSettingsResponseDto {
  /** Maximum peers per address book; 0 = unlimited. */
  max_peer_one_ab!: number;
}

export class AbProfileDto {
  guid!: string;
  name!: string;
  /** Owner's login name. */
  owner!: string;
  note!: string;

  @ApiProperty({ enum: [1, 2, 3], description: '1 read-only, 2 read/write, 3 full control' })
  rule!: 1 | 2 | 3;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Opaque to the client' })
  info!: Record<string, unknown>;
}

export class AbProfilePageDto {
  total!: number;

  @ApiProperty({ type: () => [AbProfileDto] })
  data!: AbProfileDto[];
}

export class AbTagDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  /** 32-bit ARGB color. */
  @ApiProperty({ type: Number, minimum: -2147483648, maximum: 4294967295, example: 4283215696 })
  @Type(() => Number)
  @IsInt()
  @Min(-2147483648)
  @Max(4294967295)
  color!: number;
}

export class AbTagRenameDto {
  @IsString()
  @Length(1, 100)
  old!: string;

  @IsString()
  @Length(1, 100)
  new!: string;
}

/** Legacy address book (`GET/POST /api/ab`). */
export class LegacyAbDto {
  @ApiProperty({
    type: String,
    description:
      'JSON string of {"tags": [string], "peers": [AbPeer], "tag_colors": "<JSON string of {tag: color}>"}',
  })
  @IsString()
  data!: string;
}
