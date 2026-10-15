import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { call, setupAndLogin, upload, webp } from './helpers';

describe('images', () => {
  it('stores full + thumbnail in R2 and serves them with a long cache', async () => {
    const cookie = await setupAndLogin();
    const id = await upload(cookie);
    const full = await call(`/api/images/${id}`, { cookie });
    expect(full.status).toBe(200);
    expect(full.headers.get('Cache-Control')).toContain('immutable');
    expect((await full.arrayBuffer()).byteLength).toBe(2000);
    const thumb = await call(`/api/images/${id}/thumb`, { cookie });
    expect((await thumb.arrayBuffer()).byteLength).toBe(200);
    const row = await env.DB.prepare('SELECT width, height, bytes FROM images WHERE id = ?').bind(id).first();
    expect(row).toEqual({ width: 2400, height: 1350, bytes: 2000 });
  });

  it('rejects non-images and oversized files', async () => {
    const cookie = await setupAndLogin();
    const fd = new FormData();
    fd.set('file', new File(['<script>alert(1)</script>'], 'x.webp', { type: 'image/webp' }));
    expect((await call('/api/images', { method: 'POST', cookie, body: fd })).status).toBe(400);
    const fd2 = new FormData();
    fd2.set('file', new File(['x'], 'x.svg', { type: 'image/svg+xml' }));
    expect((await call('/api/images', { method: 'POST', cookie, body: fd2 })).status).toBe(400);
    const fd3 = new FormData();
    fd3.set('file', new File([webp(15 * 1024 * 1024 + 10)], 'big.webp', { type: 'image/webp' }));
    expect((await call('/api/images', { method: 'POST', cookie, body: fd3 })).status).toBe(400);
  });
});
