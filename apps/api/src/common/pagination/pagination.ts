import { type Type as ClassType } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { ValidationFailedError } from '../errors/domain-error';

export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

/** `?page=1&pageSize=50&sort=field:asc|desc` — shared by every admin list endpoint. */
export class PageQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({
    description: '`field:asc` or `field:desc`; allowed fields are listed per endpoint',
    example: 'createdAt:desc',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]+:(asc|desc)$/, { message: 'sort must look like field:asc or field:desc' })
  sort?: string;
}

export interface SortSpec<F extends string> {
  field: F;
  direction: 'asc' | 'desc';
}

/** Validates `sort` against a per-endpoint allowlist; unknown fields are a 422. */
export function parseSort<F extends string>(
  sort: string | undefined,
  allowed: readonly F[],
  fallback: SortSpec<F>,
): SortSpec<F> {
  if (!sort) return fallback;
  const [field, direction] = sort.split(':') as [string, 'asc' | 'desc'];
  if (!(allowed as readonly string[]).includes(field)) {
    throw new ValidationFailedError([
      { field: 'sort', message: `must be one of ${allowed.join(', ')}` },
    ]);
  }
  return { field: field as F, direction };
}

/**
 * Prisma `orderBy` for a validated sort. Nullable columns put nulls last in both directions;
 * Prisma rejects the `nulls` option on non-nullable columns, so they get a plain direction.
 */
export function orderBy<F extends string>(
  sort: SortSpec<F>,
  nullable: readonly F[],
): Record<string, 'asc' | 'desc' | { sort: 'asc' | 'desc'; nulls: 'last' }> {
  return {
    [sort.field]: nullable.includes(sort.field)
      ? { sort: sort.direction, nulls: 'last' }
      : sort.direction,
  };
}

export function skipTake(query: { page: number; pageSize: number }): {
  skip: number;
  take: number;
} {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function toPage<T>(
  data: T[],
  total: number,
  query: { page: number; pageSize: number },
): Page<T> {
  return { data, total, page: query.page, pageSize: query.pageSize };
}

/** Builds a concrete paginated response class for OpenAPI: `class UserPageDto extends Paginated(UserDto) {}`. */
export function Paginated<T>(item: ClassType<T>): ClassType<Page<T>> {
  class PageDto implements Page<T> {
    @ApiProperty({ type: () => [item] })
    data!: T[];

    @ApiProperty({ type: Number, example: 1 })
    total!: number;

    @ApiProperty({ type: Number, example: 1 })
    page!: number;

    @ApiProperty({ type: Number, example: DEFAULT_PAGE_SIZE })
    pageSize!: number;
  }
  return PageDto;
}
