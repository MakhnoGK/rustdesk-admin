import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Paginated, PageQueryDto } from '../../common/pagination/pagination';
import { AddressBookKind } from '../../generated/prisma/enums';
import { QueryArray, TrimToNull } from './validators';

export class AddressBookDto {
  @ApiProperty({ format: 'uuid' })
  guid!: string;

  name!: string;

  @ApiProperty({ enum: AddressBookKind, enumName: 'AddressBookKind' })
  kind!: AddressBookKind;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  ownerId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  ownerUsername!: string | null;

  peerCount!: number;
  shareCount!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class AddressBookPageDto extends Paginated(AddressBookDto) {}

export class AddressBookListQueryDto extends PageQueryDto {
  /** Sort fields: name, createdAt, updatedAt. */
  @ApiPropertyOptional({ enum: AddressBookKind, enumName: 'AddressBookKind' })
  @IsOptional()
  @IsEnum(AddressBookKind)
  kind?: AddressBookKind;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  /** Matches the book name. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class CreateAddressBookDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class UpdateAddressBookDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class ShareInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: [1, 2, 3], description: '1 read-only, 2 read/write, 3 full control' })
  @IsIn([1, 2, 3])
  rule!: 1 | 2 | 3;
}

export class ShareDto extends ShareInputDto {
  username!: string;
}

export class AdminPeerDto {
  /** RustDesk ID of the peer. */
  peerId!: string;
  alias!: string;
  note!: string;
  tags!: string[];
  username!: string;
  hostname!: string;
  platform!: string;
  /** A shared password is stored (the value itself is never returned). */
  hasPassword!: boolean;
  /** A saved-password hash is stored (personal books; never returned). */
  hasHash!: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Other client fields (forceAlwaysRelay, rdpPort, ...)',
  })
  extra!: Record<string, unknown>;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class AdminPeerPageDto extends Paginated(AdminPeerDto) {}

export class PeerListQueryDto {
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

  /** Matches RustDesk ID, alias, hostname, username or note. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Only peers carrying these tags (repeat the parameter: `tag=a&tag=b`); see `tagMode`. */
  @ApiPropertyOptional({ type: [String], maxItems: 50 })
  @IsOptional()
  @QueryArray()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  tag?: string[];

  /** `any` (default): peers with at least one of the tags; `all`: peers with every tag. */
  @ApiPropertyOptional({ enum: ['any', 'all'], default: 'any' })
  @IsOptional()
  @IsIn(['any', 'all'])
  tagMode: 'any' | 'all' = 'any';
}

class PeerWritableFields {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  alias?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  hostname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  platform?: string;

  /** Shared books only. Write-only: never returned; empty string clears it. */
  @ApiPropertyOptional({ writeOnly: true, maxLength: 1024 })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  password?: string;
}

export class CreatePeerDto extends PeerWritableFields {
  /** RustDesk ID of the peer. */
  @IsString()
  @Length(1, 64)
  peerId!: string;
}

export class UpdatePeerDto extends PeerWritableFields {}

export class AdminTagDto {
  name!: string;

  /** 32-bit ARGB color (unsigned). */
  @ApiProperty({ minimum: 0, maximum: 4294967295 })
  color!: number;

  /** Peers carrying the tag. */
  peerCount!: number;
}

export class CreateTagDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ minimum: 0, maximum: 4294967295, example: 4283215696 })
  @IsInt()
  @Min(0)
  @Max(4294967295)
  color!: number;
}

export class UpdateTagDto {
  /** New name (rename); peers follow. */
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 4294967295 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4294967295)
  color?: number;
}
