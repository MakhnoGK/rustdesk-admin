import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Paginated, PageQueryDto } from '../../common/pagination/pagination';
import { MIN_PASSWORD_LENGTH } from '../../auth/password.service';
import { TokenKind, UserRole, UserStatus } from '../../generated/prisma/enums';
import { TrimToNull } from './validators';

const USERNAME = /^[A-Za-z0-9._-]{2,64}$/;

export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  /** Lower-cased login name. */
  username!: string;

  @ApiProperty({ type: String, nullable: true })
  displayName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  role!: UserRole;

  @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' })
  status!: UserStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class UserPageDto extends Paginated(UserDto) {}

export class UserListQueryDto extends PageQueryDto {
  /** Matches username, display name or email (case-insensitive substring). Sort fields: username, createdAt, updatedAt, role, status. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: UserRole, enumName: 'UserRole' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus, enumName: 'UserStatus' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class CreateUserDto {
  /** 2-64 characters: letters, digits, `.`, `_`, `-`. Stored lower-cased. */
  @ApiProperty({ example: 'jdoe' })
  @Matches(USERNAME, {
    message: 'username must be 2-64 characters: letters, digits, ".", "_" or "-"',
  })
  username!: string;

  @ApiProperty({ minLength: MIN_PASSWORD_LENGTH, maxLength: 256, writeOnly: true })
  @IsString()
  @Length(MIN_PASSWORD_LENGTH, 256)
  password!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 100 })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  displayName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'email' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v !== null)
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @ApiPropertyOptional({ enum: UserRole, enumName: 'UserRole', default: UserRole.USER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus, enumName: 'UserStatus', default: UserStatus.ACTIVE })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 100 })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  displayName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'email' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v !== null)
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @ApiPropertyOptional({ enum: UserRole, enumName: 'UserRole' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus, enumName: 'UserStatus' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class ResetPasswordDto {
  @ApiProperty({ minLength: MIN_PASSWORD_LENGTH, maxLength: 256, writeOnly: true })
  @IsString()
  @Length(MIN_PASSWORD_LENGTH, 256)
  password!: string;
}

export class TokenDto {
  /** The token's `jti`. */
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: TokenKind, enumName: 'TokenKind' })
  kind!: TokenKind;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'RustDesk ID of the client that logged in',
  })
  clientId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Machine UUID of the client that logged in',
  })
  clientUuid!: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  deviceInfo!: Record<string, unknown> | null;

  @ApiProperty({ type: String, nullable: true })
  ip!: string | null;

  @ApiProperty({ type: String, nullable: true })
  userAgent!: string | null;

  @ApiProperty({ format: 'date-time' })
  issuedAt!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastUsedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  revokedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  revokedReason!: string | null;

  /** Neither revoked nor expired. */
  active!: boolean;

  /** The token of the request that fetched this list (the caller's own admin session). */
  current!: boolean;
}

export class TokenPageDto extends Paginated(TokenDto) {}

export class AdminLoginDto {
  @IsString()
  @Length(1, 64)
  username!: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @Length(1, 256)
  password!: string;
}

export class AdminSessionDto {
  user!: UserDto;

  /** When the session cookie expires. */
  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}
