// Types generated from openapi.json by openapi-typescript. Do not edit schema.d.ts by hand:
// run `pnpm openapi` at the repo root.
import type { components, operations, paths } from './schema';

export type { components, operations, paths };

/** Shorthand for a named schema: `Schema<'AdminUserDto'>`. */
export type Schema<Name extends keyof components['schemas']> = components['schemas'][Name];
