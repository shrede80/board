import { OWNER_ID } from './rows';

/**
 * Password hashing (PBKDF2-SHA256 via WebCrypto) and signed session cookies (HMAC-SHA256).
 * Workers cap PBKDF2 at 100,000 iterations, which is what we use.
 */
export const PBKDF2_ITERATIONS = 100_000;
export const COOKIE = 'sb_session';
const YEAR_S = 365 * 24 * 3600;
export const LOCK_ATTEMPTS = 10;
export const LOCK_WINDOW_MS = 15 * 60 * 1000;

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Constant-time comparison of two byte arrays. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
export function equalStrings(a: string, b: string): boolean {
  return equalBytes(enc.encode(a), enc.encode(b));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, it, salt, hash] = stored.split('$');
  if (alg !== 'pbkdf2-sha256' || !it || !salt || !hash) return false;
  const got = await pbkdf2(password, fromB64url(salt), Number(it));
  return equalBytes(got, fromB64url(hash));
}

export function validNewPassword(p: unknown): p is string {
  return typeof p === 'string' && p.length >= 8 && p.length <= 200;
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function makeSessionCookie(secret: string, sessionVersion: number): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ v: sessionVersion, iat: Math.floor(Date.now() / 1000) })));
  const value = `${payload}.${await hmac(secret, payload)}`;
  return `${COOKIE}=${value}; Path=/; Max-Age=${YEAR_S}; HttpOnly; Secure; SameSite=Lax`;
}

export const clearSessionCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/** Valid if the HMAC matches, it is under a year old, and its version matches settings.session_version. */
export async function checkSession(secret: string, cookieValue: string | null, sessionVersion: number): Promise<boolean> {
  if (!cookieValue || !secret) return false;
  const [payload, sig] = cookieValue.split('.');
  if (!payload || !sig) return false;
  if (!equalStrings(await hmac(secret, payload), sig)) return false;
  try {
    const { v, iat } = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { v: number; iat: number };
    return v === sessionVersion && Date.now() / 1000 - iat < YEAR_S;
  } catch {
    return false;
  }
}

/** ms until the login lock lifts, or 0 if not locked. */
export async function lockRemaining(db: D1Database, now = Date.now()): Promise<number> {
  const res = await db
    .prepare('SELECT at FROM login_failures WHERE at > ? ORDER BY at DESC LIMIT ?')
    .bind(now - LOCK_WINDOW_MS, LOCK_ATTEMPTS)
    .all<{ at: number }>();
  if (res.results.length < LOCK_ATTEMPTS) return 0;
  // Locked for 15 minutes after the 10th failure within the window.
  const tenth = res.results[0].at;
  return Math.max(0, tenth + LOCK_WINDOW_MS - now);
}

/** Failed (or in-flight) attempts inside the lock window. */
export async function recentFailures(db: D1Database, now = Date.now()): Promise<number> {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE at > ?').bind(now - LOCK_WINDOW_MS).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function recordFailure(db: D1Database, now = Date.now()) {
  await db.batch([
    db.prepare('INSERT INTO login_failures (at) VALUES (?)').bind(now),
    db.prepare('DELETE FROM login_failures WHERE at < ?').bind(now - 24 * 3600 * 1000),
  ]);
}

export async function clearFailures(db: D1Database) {
  await db.prepare('DELETE FROM login_failures').run();
}

export async function authRow(db: D1Database) {
  return db
    .prepare('SELECT password_hash, session_version FROM settings WHERE owner_id = ?')
    .bind(OWNER_ID)
    .first<{ password_hash: string | null; session_version: number }>();
}
