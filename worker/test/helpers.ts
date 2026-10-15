import { exports } from 'cloudflare:workers';
import { expect } from 'vitest';
import { resetBootstrapCache } from '../src/bootstrap';

export const BASE = 'https://board.test';
export const SETUP_TOKEN = 'test-setup-token';
export const PASSWORD = 'correct horse battery';

export async function call(path: string, init: RequestInit & { cookie?: string; json?: unknown } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('Cookie', init.cookie);
  let bodyInit = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    bodyInit = JSON.stringify(init.json);
  }
  return exports.default.fetch(new Request(BASE + path, { ...init, headers, body: bodyInit }));
}

export function cookieFrom(res: Response): string {
  const sc = res.headers.get('Set-Cookie') ?? '';
  return sc.split(';')[0];
}

/** Sets the password through the one-time setup page and returns a session cookie. */
export async function setupAndLogin(): Promise<string> {
  resetBootstrapCache();
  const res = await call('/api/setup', { method: 'POST', json: { token: SETUP_TOKEN, password: PASSWORD } });
  if (res.status !== 200) throw new Error(`setup failed ${res.status} ${await res.text()}`);
  return cookieFrom(res);
}

export async function ops(cookie: string, list: unknown[]) {
  const res = await call('/api/ops', { method: 'POST', cookie, json: { ops: list } });
  if (res.status !== 200) throw new Error(`ops failed ${res.status} ${await res.text()}`);
  return (await res.json()) as { now: number; trashIds: (string | null)[] };
}

export async function getJson<T = any>(path: string, cookie: string): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await call(path, { cookie });
  if (res.status !== 200) throw new Error(`${path} ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

// Minimal valid WebP header (RIFF....WEBP) — enough for the server's magic-byte check.
export function webp(bytes = 64): Blob {
  const b = new Uint8Array(bytes);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  return new Blob([b], { type: 'image/webp' });
}

export async function upload(cookie: string): Promise<string> {
  const fd = new FormData();
  fd.set('file', new File([webp(2000)], 'a.webp', { type: 'image/webp' }));
  fd.set('thumb', new File([webp(200)], 't.webp', { type: 'image/webp' }));
  fd.set('width', '2400');
  fd.set('height', '1350');
  const res = await call('/api/images', { method: 'POST', cookie, body: fd });
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: string }).id;
}
