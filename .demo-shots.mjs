import { chromium } from '@playwright/test';
const BASE = process.env.BASE || 'https://demo.kinkyvibe.pages.dev';
const OUT = '/tmp/claude-0/-home-user-kinkyvibe/256d6ec8-9f1b-544f-83ec-6e97ce1482c1/scratchpad/night/report/shots';
const EV = 'demo-noche-latex-2026-09-30';
const pages = [
  ['inicio', '/admin'],
  ['eventos', '/admin/eventos'],
  ['agenda', '/admin/eventos/agenda'],
  ['ficha-ventas', `/admin/eventos/${EV}/ventas`],
  ['ficha-ordenes', `/admin/eventos/${EV}/ordenes`],
  ['ficha-mail', `/admin/eventos/${EV}/mail`],
  ['ficha-editar', `/admin/eventos/${EV}/editar`],
  ['puerta', `/admin/eventos/${EV}/ingreso`],
  ['checkin', '/admin/checkin'],
  ['entradas', '/admin/entradas'],
  ['transferencias', '/admin/entradas/transferencias'],
  ['plantillas', '/admin/ajustes/mails'],
  ['personas', '/admin/personas'],
  ['estadisticas', '/admin/estadisticas'],
  ['actividad', '/admin/actividad'],
  ['material', '/admin/material'],
  ['amigues', '/admin/amigues'],
  ['etiquetas', '/admin/etiquetas'],
];
const only = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [vw, tag] of [[390, 'm'], [1280, 'd']]) {
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: vw, height: vw < 500 ? 844 : 860 }, deviceScaleFactor: vw < 500 ? 2 : 1 });
  const p = await ctx.newPage();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /admin de prueba/ }).click();
  await p.waitForLoadState('networkidle');
  for (const [name, path] of pages) {
    if (only.length && !only.includes(name)) continue;
    const r = await p.goto(BASE + path, { waitUntil: 'networkidle' }).catch((e) => null);
    await p.waitForTimeout(700);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    await p.screenshot({ path: `${OUT}/${name}-${tag}.png` });
    console.log(tag, name, r?.status(), 'sw', sw);
  }
  await ctx.close();
}
await b.close();
