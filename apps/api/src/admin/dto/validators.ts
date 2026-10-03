import { Transform } from 'class-transformer';
import { ValidateBy, type ValidationOptions } from 'class-validator';
import { isIsoDateTime } from '../../common/time/time';

/** ISO-8601 date-time with an explicit zone (`Z` or an offset). */
export function IsIsoDateTime(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isIsoDateTime',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isIsoDateTime(value),
        defaultMessage: () =>
          '$property must be an ISO-8601 date-time with a zone, e.g. 2026-10-01T00:00:00Z',
      },
    },
    options,
  );
}

/** Query-string booleans: only the literals `true` and `false` are accepted. */
export const QueryBoolean = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  );

/** A repeated query parameter arrives as an array, a single one as a string: always an array. */
export const QueryArray = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? [value] : value));

/** Trims strings; empty becomes null (for nullable text fields). */
export const TrimToNull = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });
