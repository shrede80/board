import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('health', () => {
  it('reaches D1 and R2', async () => {
    const res = await exports.default.fetch('http://x/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: true, r2: true });
  });
});
