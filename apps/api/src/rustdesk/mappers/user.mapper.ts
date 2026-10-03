// UserPayload as read by the client: flutter/lib/common/hbbs/hbbs.dart (UserPayload.fromJson),
// rustdesk master e5bc204.

import type { AuthUser } from '../../auth/auth.types';
import { UserRole, UserStatus } from '../../generated/prisma/client';
import type { UserPayloadDto } from '../dto/auth.dto';

/** `status`: 1 normal, 0 disabled, -1 unverified (unused: this server has no email verification). */
export function toUserPayload(user: AuthUser): UserPayloadDto {
  return {
    name: user.username,
    display_name: user.displayName ?? '',
    email: user.email ?? '',
    note: user.note ?? '',
    avatar: '',
    status: user.status === UserStatus.ACTIVE ? 1 : 0,
    is_admin: user.role === UserRole.ADMIN,
  };
}
