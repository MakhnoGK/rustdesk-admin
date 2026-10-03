import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from './domain-error';

export class ErrorDetailDto {
  @ApiProperty({ type: String, example: 'username' })
  field!: string;

  @ApiProperty({ type: String, example: 'username must be longer than or equal to 2 characters' })
  message!: string;
}

export class AdminErrorBodyDto {
  @ApiProperty({ enum: ErrorCode, enumName: 'ErrorCode', example: ErrorCode.NOT_FOUND })
  code!: ErrorCode;

  @ApiProperty({ type: String, example: 'User not found' })
  message!: string;

  @ApiPropertyOptional({ type: () => [ErrorDetailDto] })
  details?: ErrorDetailDto[];
}

/** Error envelope of every `/api/admin/*` endpoint. */
export class AdminErrorDto {
  @ApiProperty({ type: () => AdminErrorBodyDto })
  error!: AdminErrorBodyDto;
}

/** Error envelope of every RustDesk-facing endpoint: the client shows the string to the user. */
export class RustdeskErrorDto {
  @ApiProperty({ type: String, example: 'Wrong username or password' })
  error!: string;
}
