import { describe, expect, it } from 'vitest';
import { withEmbeddedAssets, type EmbeddedFile } from '../src/embedded';

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const files: Record<string, EmbeddedFile> = {
  '/index.html': { body: enc('<html>app</html>'), etag: '"i1"' },
  '/assets/index-abc.js': { body: enc('console.log(1)'), etag: '"a1"' },
  '/fonts/x.woff2': { body: enc('font'), etag: '"f1"' },
};
const headers = `/*
  X-Frame-Options: DENY

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
const app = { fetch: async () => new Response('api', { status: 418 }) } as ExportedHandler<unknown>;
const h = withEmbeddedAssets(app, files, headers);
const ctx = {} as ExecutionContext;
const get = (path: string, init?: RequestInit) => h.fetch!(new Request(`https://x.dev${path}`, init) as never, {}, ctx);

describe('embedded web app files', () => {
  it('sends /api/* and non-GET requests to the app', async () => {
    expect((await get('/api/auth/status')).status).toBe(418);
    expect((await get('/anything', { method: 'POST' })).status).toBe(418);
  });

  it('serves files with type, _headers rules and caching', async () => {
    const js = await get('/assets/index-abc.js');
    expect(js.status).toBe(200);
    expect(js.headers.get('Content-Type')).toContain('text/javascript');
    expect(js.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(js.headers.get('X-Frame-Options')).toBe('DENY');
    expect(await js.text()).toBe('console.log(1)');
    expect((await get('/fonts/x.woff2')).headers.get('Content-Type')).toBe('font/woff2');
  });

  it('falls back to index.html for app routes (SPA), and / is index.html', async () => {
    for (const p of ['/', '/setup', '/p/123']) {
      const r = await get(p);
      expect(r.status).toBe(200);
      expect(r.headers.get('Content-Type')).toContain('text/html');
      expect(r.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
      expect(await r.text()).toBe('<html>app</html>');
    }
  });

  it('answers 304 to a matching ETag and HEAD without a body', async () => {
    expect((await get('/', { headers: { 'If-None-Match': '"i1"' } })).status).toBe(304);
    const head = await get('/', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });
});
