// Renderiza la imagen por defecto de la vista previa al compartir (scripts/og-default/card.html)
// a static/og-default.png, 1200 × 630 (docs/compartir.md). Uso: `node scripts/og-default/render.js`
// (con los navegadores de Playwright instalados; si están en otra carpeta, PLAYWRIGHT_BROWSERS_PATH).
// Si cambiás el tamaño, cambiá también DEFAULT_IMAGE en src/lib/utils/seo.js.
import { chromium } from '@playwright/test';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const card = new URL('./card.html', import.meta.url);
const out = fileURLToPath(new URL('../../static/og-default.png', import.meta.url));

const browser = await chromium.launch();
try {
	const page = await browser.newPage({
		viewport: { width: 1200, height: 630 },
		colorScheme: 'light'
	});
	await page.goto(card.href);
	await page.evaluate(() => document.fonts.ready);
	await page.locator('.card').screenshot({ path: out });
	console.log(`${out}: ${Math.round(statSync(out).size / 1024)} KB`);
} finally {
	await browser.close();
}
