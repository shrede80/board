import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { LOCK_ATTEMPTS } from '../src/auth';
import { call, cookieFrom, PASSWORD, setupAndLogin, SETUP_TOKEN } from './helpers';


describe('one-time setup', () => {
  it('starts without a password and with the equipment loaded', async () => {
    const st = await (await call('/api/auth/status')).json();
    expect(st).toMatchObject({ setupDone: false, authed: false });
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM equipment').first<{ n: number }>();
    expect(n?.n).toBe(74); // 72 items + 2 virtual supports
    const p = await env.DB.prepare('SELECT COUNT(*) AS n FROM projects').first<{ n: number }>();
    expect(p?.n).toBe(0);
  });

  it('rejects a wrong token and a weak password', async () => {
    expect((await call('/api/setup', { method: 'POST', json: { token: 'nope', password: PASSWORD } })).status).toBe(401);
    expect((await call('/api/setup', { method: 'POST', json: { token: SETUP_TOKEN, password: 'short' } })).status).toBe(400);
  });

  it('works once, stores only a PBKDF2 hash, then closes', async () => {
    const cookie = await setupAndLogin();
    expect(cookie).toMatch(/^sb_session=/);
    const row = await env.DB.prepare('SELECT password_hash FROM settings').first<{ password_hash: string }>();
    expect(row?.password_hash).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(row?.password_hash).not.toContain(PASSWORD);
    const again = await call('/api/setup', { method: 'POST', json: { token: SETUP_TOKEN, password: 'another password' } });
    expect(again.status).toBe(409);
  });

  it('sets a secure, http-only, year-long cookie', async () => {
    const res = await call('/api/setup', { method: 'POST', json: { token: SETUP_TOKEN, password: PASSWORD } });
    const sc = res.headers.get('Set-Cookie')!;
    expect(sc).toContain('HttpOnly');
    expect(sc).toContain('Secure');
    expect(sc).toContain('SameSite=Lax');
    expect(sc).toContain('Max-Age=31536000');
  });
});

describe('login', () => {
  it('accepts the right password and remembers the device', async () => {
    await setupAndLogin();
    const res = await call('/api/auth/login', { method: 'POST', json: { password: PASSWORD } });
    expect(res.status).toBe(200);
    const st = await (await call('/api/auth/status', { cookie: cookieFrom(res) })).json();
    expect(st).toMatchObject({ setupDone: true, authed: true });
  });

  it('rejects a tampered cookie', async () => {
    const cookie = await setupAndLogin();
    const bad = cookie.slice(0, -2) + (cookie.endsWith('A') ? 'BB' : 'AA');
    expect((await call('/api/projects', { cookie: bad })).status).toBe(401);
  });

  it('locks for 15 minutes after 10 wrong attempts', async () => {
    await setupAndLogin();
    for (let i = 0; i < LOCK_ATTEMPTS - 1; i++) {
      expect((await call('/api/auth/login', { method: 'POST', json: { password: 'wrong' } })).status).toBe(401);
    }
    const tenth = await call('/api/auth/login', { method: 'POST', json: { password: 'wrong' } });
    expect(tenth.status).toBe(429);
    // Even the right password is refused while locked.
    const right = await call('/api/auth/login', { method: 'POST', json: { password: PASSWORD } });
    expect(right.status).toBe(429);
    const { lockedMs } = (await right.json()) as { lockedMs: number };
    expect(lockedMs).toBeGreaterThan(14 * 60 * 1000);
    expect(lockedMs).toBeLessThanOrEqual(15 * 60 * 1000);
    // Once the failures are older than the window the lock lifts.
    await env.DB.prepare('UPDATE login_failures SET at = at - ?').bind(16 * 60 * 1000).run();
    expect((await call('/api/auth/login', { method: 'POST', json: { password: PASSWORD } })).status).toBe(200);
  });

  it('changing the password signs out other devices', async () => {
    const other = await setupAndLogin();
    const mine = cookieFrom(await call('/api/auth/login', { method: 'POST', json: { password: PASSWORD } }));
    expect((await call('/api/auth/password', { method: 'POST', cookie: mine, json: { current: 'wrong', next: 'new password 123' } })).status).toBe(401);
    const res = await call('/api/auth/password', { method: 'POST', cookie: mine, json: { current: PASSWORD, next: 'new password 123' } });
    expect(res.status).toBe(200);
    const renewed = cookieFrom(res);
    expect((await call('/api/projects', { cookie: other })).status).toBe(401);
    expect((await call('/api/projects', { cookie: renewed })).status).toBe(200);
    expect((await call('/api/auth/login', { method: 'POST', json: { password: PASSWORD } })).status).toBe(401);
    expect((await call('/api/auth/login', { method: 'POST', json: { password: 'new password 123' } })).status).toBe(200);
  });
});

describe('everything private needs a session', () => {
  it('refuses API and images without a session', async () => {
    await setupAndLogin();
    for (const path of ['/api/projects', '/api/settings', '/api/trash', '/api/health', '/api/equipment', '/api/images/img-x', '/api/images/img-x/thumb', '/api/projects/p/changes?since=0', '/api/projects/p/export']) {
      expect((await call(path)).status, path).toBe(401);
    }
    for (const [method, path] of [['POST', '/api/ops'], ['POST', '/api/images'], ['POST', '/api/import'], ['PATCH', '/api/scenes/x'], ['DELETE', '/api/scenes/x']]) {
      expect((await call(path, { method, json: {} })).status, `${method} ${path}`).toBe(401);
    }
  });

  it('rejects cross-site writes', async () => {
    const cookie = await setupAndLogin();
    const res = await call('/api/ops', { method: 'POST', cookie, json: { ops: [] }, headers: { Origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
  });
});
