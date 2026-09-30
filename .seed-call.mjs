import { chromium } from '@playwright/test';
const BASE = 'https://demo.kinkyvibe.pages.dev';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ ignoreHTTPSErrors: true });
const p = await ctx.newPage();
for (let i = 0; i < 40; i++) {
  const r = await p.request.post(BASE + '/api/preview-seed', { headers: { origin: BASE } });
  if (r.status() !== 404) break;
  await new Promise((r) => setTimeout(r, 20000));
}
await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
await p.getByRole('button', { name: /admin de prueba/ }).click();
await p.waitForLoadState('networkidle');
const res = await p.evaluate(async () => { const r = await fetch('/api/preview-seed', { method: 'POST' }); return r.status + ' ' + (await r.text()); });
console.log(res);
await b.close();
