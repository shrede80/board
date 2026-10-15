import { describe, expect, it } from 'vitest';
import { call, setupAndLogin } from './helpers';

describe('health', () => {
  it('reaches D1 and R2 with a session', async () => {
    const cookie = await setupAndLogin();
    const res = await call('/api/health', { cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
