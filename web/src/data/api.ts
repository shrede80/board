/** Thin fetch wrapper. Throws ApiError with the HTTP status (0 = network failure). */
export class ApiError extends Error {
  constructor(public status: number, public body: Record<string, unknown> = {}) {
    super(`API ${status}`);
  }
}

import { APP_VERSION, VERSION_HEADER } from '../../../shared/version';

type Handler = () => void;
let onUnauthorized: Handler = () => {};
export function setUnauthorizedHandler(h: Handler) {
  onUnauthorized = h;
}
let onNewVersion: Handler = () => {};
/** Called once the server reports a different build than this tab runs (UPDATE-1 أ10). */
export function setNewVersionHandler(h: Handler) {
  onNewVersion = h;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, body, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0);
  }
  const v = res.headers.get(VERSION_HEADER);
  if (v && v !== APP_VERSION) onNewVersion();
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/') && !path.startsWith('/api/setup')) onUnauthorized();
    throw new ApiError(res.status, data);
  }
  return data as T;
}

export interface AuthStatus {
  setupDone: boolean;
  authed: boolean;
  lockedMs: number;
}
