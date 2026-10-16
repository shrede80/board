// Manual check of the offline start (UPDATE-1 ج8) against a production build:
//   npx vite build && npx vite preview --port 5300   (local dev data, password dev-password)
//   node scripts/check-offline.mjs
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar' });
const pg = await ctx.newPage();
const errs=[]; pg.on('pageerror', e=>errs.push(e.message));
const out = (k,v)=>console.log(k, JSON.stringify(v));
await pg.goto('http://localhost:5300/');
await pg.getByTestId('login-password').fill('dev-password'); await pg.keyboard.press('Enter');
await pg.getByTestId('m-home').waitFor({timeout:15000});
await pg.evaluate(() => navigator.serviceWorker.ready.then(() => true));
await pg.reload(); await pg.getByTestId('m-home').waitFor();
out('controlled', await pg.evaluate(() => !!navigator.serviceWorker.controller));
out('cache keys', await pg.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return { caches: ks, n: (await c.keys()).length, api: (await c.keys()).filter(r => r.url.includes('/api')).length }; }));
await ctx.setOffline(true);
await pg.reload();
await pg.getByTestId('m-home').waitFor({timeout:10000});
out('offline home shown', await pg.getByTestId('m-offline-home').isVisible());
out('banner', await pg.getByTestId('offline-banner').isVisible());
await pg.getByTestId('m-add').click();
await pg.getByTestId('m-add-text').fill('فكرة من تشغيل بدون نت');
await pg.getByTestId('m-add-save').click();
await pg.getByTestId('m-tab-ideas').click();
out('pending', await pg.getByTestId('idea-pending').count());
await pg.getByTestId('m-tab-project').click();
out('project msg', await pg.getByText('المشروع يحتاج اتصال').isVisible());
await pg.screenshot({ path: '/tmp/claude-0/shots/offline-start.png' });
await ctx.setOffline(false);
await pg.evaluate(() => window.dispatchEvent(new Event('online')));
await pg.getByTestId('m-tab-ideas').click();
await pg.waitForTimeout(4000);
out('pending after', await pg.getByTestId('idea-pending').count());
out('sent', await pg.evaluate(() => fetch('/api/home').then(r=>r.json()).then(h=>h.rows.ideas.filter(i=>i.text==='فكرة من تشغيل بدون نت').length)));
out('errors', errs);
await b.close();
