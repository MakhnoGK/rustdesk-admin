import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, Length, MaxLength } from 'class-validator';

/** `POST /api/login` body (flutter/lib/models/user_model.dart). Posted without a Content-Type. */
export class LoginRequestDto {
  @IsString()
  @Length(1, 64)
  username!: string;

  @IsString()
  @Length(1, 256)
  password!: string;

  /** The client's RustDesk ID. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  /** The client's machine UUID (base64). */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  uuid?: string;

  /** Ignored by this server. */
  @IsOptional()
  @IsBoolean()
  autoLogin?: boolean;

  /** Always `account` for username/password login. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  type?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { os: 'linux', type: 'client', name: 'laptop' },
  })
  @IsOptional()
  @IsObject()
  deviceInfo?: Record<string, unknown>;

  /** Email verification code (RustDesk Pro; rejected). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  verificationCode?: string;

  /** 2FA code (RustDesk Pro; rejected). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tfaCode?: string;

  /** 2FA secret (RustDesk Pro; rejected). */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  secret?: string;
}

/** `POST /api/currentUser` and `POST /api/logout` body. */
export class ClientIdentityDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  uuid?: string;
}

export class UserPayloadDto {
  /** Login name. */
  name!: string;
  display_name!: string;
  email!: string;
  note!: string;
  /** Always empty: avatars are not supported. */
  avatar!: string;

  @ApiProperty({ enum: [1, 0, -1], description: '1 normal, 0 disabled, -1 unverified' })
  status!: 1 | 0 | -1;

  is_admin!: boolean;
}

export class LoginResponseDto {
  @ApiProperty({ enum: ['access_token'] })
  type!: 'access_token';

  access_token!: string;

  user!: UserPayloadDto;
}
