import { Injectable, type PipeTransform } from '@nestjs/common';
import { DomainError } from '../errors/domain-error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * Path parameters that are UUIDs: a malformed value cannot name an existing resource, so it is
 * answered like an unknown one (404) instead of reaching the database.
 */
@Injectable()
export class UuidParamPipe implements PipeTransform<unknown, string> {
  constructor(private readonly what: string) {}

  transform(value: unknown): string {
    if (!isUuid(value)) throw DomainError.notFound(this.what);
    return value.toLowerCase();
  }
}
