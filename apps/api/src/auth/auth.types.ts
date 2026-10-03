import type { TokenKind, UserRole, UserStatus } from '../generated/prisma/client';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  note: string | null;
  role: UserRole;
  status: UserStatus;
}

/** Attached to the request by the auth guards. */
export interface AuthContext {
  user: AuthUser;
  tokenId: string;
  kind: TokenKind;
  expiresAt: Date;
}

export interface AuthenticatedRequest {
  auth?: AuthContext;
}

export const ADMIN_COOKIE_NAME = 'rd_admin_session';
export const ADMIN_COOKIE_PATH = '/api/admin';
