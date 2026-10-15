// Serves the built web app (dist/client) from inside the Worker bundle.
//
// Production deploys can't use Workers static assets from the Claude Code cloud
// session (the network proxy replaces wrangler's asset-upload token), so
// scripts/deploy.mjs embeds every client file into the Worker and wraps it with
// this handler. It mirrors what the `assets` config does: /api/* goes to the
// app, everything else is a file or, when no file matches, index.html (SPA),
// with the rules from web/public/_headers applied. Local dev and tests keep
// using the normal `assets` config and never load this file.

export interface EmbeddedFile {
  body: ArrayBuffer;
  etag: string;
}

interface HeaderRule {
  pattern: RegExp;
  headers: [string, string][];
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  webmanifest: 'application/manifest+json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
  txt: 'text/plain; charset=utf-8',
};

export function contentType(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return TYPES[ext] ?? 'application/octet-stream';
}

/** Parses the subset of the Cloudflare `_headers` format we use: a path line (`*` = wildcard) then indented `Name: value` lines. */
export function parseHeaders(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const re = line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      rules.push({ pattern: new RegExp(`^${re}$`), headers: [] });
    } else if (rules.length) {
      const i = line.indexOf(':');
      if (i > 0) rules[rules.length - 1].headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return rules;
}

export function withEmbeddedAssets<E>(
  app: ExportedHandler<E>,
  files: Record<string, EmbeddedFile>,
  headersText: string,
): ExportedHandler<E> {
  const rules = parseHeaders(headersText);
  return {
    ...app,
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      const method = request.method;
      if (url.pathname.startsWith('/api/') || url.pathname === '/api' || (method !== 'GET' && method !== 'HEAD')) {
        return app.fetch!(request, env, ctx);
      }
      let path = url.pathname;
      if (path.endsWith('/')) path += 'index.html';
      // Like the assets SPA mode: unknown paths get the app shell with 200.
      if (!files[path]) path = '/index.html';
      const file = files[path];
      const headers = new Headers({
        'Content-Type': contentType(path),
        ETag: file.etag,
        'Cache-Control': 'public, max-age=0, must-revalidate',
      });
      for (const r of rules) if (r.pattern.test(url.pathname)) for (const [k, v] of r.headers) headers.set(k, v);
      const inm = request.headers.get('If-None-Match');
      if (inm && inm.split(',').some((t) => t.trim().replace(/^W\//, '') === file.etag)) {
        return new Response(null, { status: 304, headers });
      }
      return new Response(method === 'HEAD' ? null : file.body, { headers });
    },
  };
}
