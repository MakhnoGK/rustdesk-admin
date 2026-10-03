import { z } from 'zod';
import type { UserListQuery } from '@/api/types';
import { enumParam, pageParam, pageSizeParam, sortParam, textParam } from '@/lib/url-state';

export const USER_ROLES = ['ADMIN', 'USER'] as const;
export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export const USER_SORT_FIELDS = ['username', 'createdAt', 'updatedAt', 'role', 'status'] as const;

export const userSearchSchema = z.object({
  page: pageParam,
  pageSize: pageSizeParam(50),
  sort: sortParam(USER_SORT_FIELDS, 'username:asc'),
  q: textParam(100),
  role: enumParam(USER_ROLES),
  status: enumParam(USER_STATUSES),
});
export type UserSearch = z.output<typeof userSearchSchema>;

export function toUserListQuery(s: UserSearch): UserListQuery {
  return {
    page: s.page,
    pageSize: s.pageSize,
    sort: s.sort,
    search: s.q,
    role: s.role,
    status: s.status,
  };
}

export const tokenSearchSchema = z.object({ page: pageParam });

// Mirrors CreateUserDto / UpdateUserDto / ResetPasswordDto in the OpenAPI document.
const username = z
  .string()
  .trim()
  .min(2, 'At least 2 characters')
  .max(64, 'At most 64 characters')
  .regex(/^[A-Za-z0-9._-]+$/, 'Letters, digits, “.”, “_” and “-” only');
const password = z.string().min(8, 'At least 8 characters').max(256, 'At most 256 characters');
const optionalText = (max: number) => z.string().trim().max(max, `At most ${max} characters`);
const email = z
  .string()
  .trim()
  .max(254)
  .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email address');

export const createUserSchema = z.object({
  username,
  password,
  role: z.enum(USER_ROLES),
  displayName: optionalText(100),
  email,
});
export type CreateUserValues = z.infer<typeof createUserSchema>;

export const editUserSchema = z.object({
  displayName: optionalText(100),
  email,
  note: optionalText(2000),
  role: z.enum(USER_ROLES),
  status: z.enum(USER_STATUSES),
});
export type EditUserValues = z.infer<typeof editUserSchema>;

export const resetPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

/** Empty form strings become `null` (cleared) for nullable API fields. */
export const nullIfEmpty = (v: string): string | null => (v.trim() === '' ? null : v.trim());
