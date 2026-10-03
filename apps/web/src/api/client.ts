import createClient, { type Middleware } from 'openapi-fetch';
import { config } from '@/lib/config';
import { ApiError, toApiError } from './errors';
import type { paths } from './types';

const requestId: Middleware = {
  onRequest({ request }) {
    request.headers.set('X-Request-Id', crypto.randomUUID());
    return request;
  },
};

/**
 * The only HTTP client of the panel. Same-origin cookie auth: the browser attaches the httpOnly
 * session cookie; no token is ever read or stored in JavaScript.
 */
export const api = createClient<paths>({
  // An empty base URL means same origin; openapi-fetch needs an absolute URL to build requests.
  baseUrl: config.apiBaseUrl || window.location.origin,
  credentials: 'same-origin',
});
api.use(requestId);

type FetchResult<T> = { data?: T; error?: unknown; response: Response };

/** Resolves to the response data, or throws an ApiError (HTTP error or network failure). */
export async function unwrap<T>(call: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await call;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw ApiError.network();
  }
  if (!result.response.ok) throw toApiError(result.response, result.error);
  return result.data as T;
}
