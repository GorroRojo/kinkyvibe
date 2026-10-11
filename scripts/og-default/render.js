// Dibuja las tarjetas de la vista previa al compartir (scripts/og-default/card.html): la por
// defecto y una por sección, cada una en static/<archivo>.png, 1200 × 630 (docs/compartir.md).
// Los textos y los nombres de archivo salen de src/lib/utils/ogCards.js.
// Uso: `node scripts/og-default/render.js` (con los navegadores de Playwright instalados; si
// están en otra carpeta, PLAYWRIGHT_BROWSERS_PATH).
import { chromium } from '@playwright/test';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OG_CARDS, OG_CARD_SIZE, SITE_TAGLINE } from '../../src/lib/utils/ogCards.js';

/** Que cada PNG entre holgado en lo que WhatsApp muestra (unos 300 KB). */
const MAX_BYTES = 150 * 1024;

const browser = await chromium.launch();
let tooBig = false;
try {
	const page = await browser.newPage({ viewport: OG_CARD_SIZE, colorScheme: 'light' });
	for (const { name, file } of Object.values(OG_CARDS)) {
		const card = new URL('./card.html', import.meta.url);
		card.searchParams.set('section', name);
		card.searchParams.set('tagline', SITE_TAGLINE);
		await page.goto(card.href);
		await page.evaluate(() => document.fonts.ready);
		// La frase se achica hasta que entra en su lugar: una o dos líneas quedan grandes; una
		// frase larga, más chica (y nunca se sale de la tarjeta).
		await page.evaluate((withSection) => {
			const p = /** @type {HTMLElement} */ (document.getElementById('tagline'));
			const room = withSection ? 250 : 320;
			let size = parseFloat(getComputedStyle(p).fontSize);
			while (p.offsetHeight > room && size > 24) {
				size -= 2;
				p.style.fontSize = `${size}px`;
			}
		}, Boolean(name));
		const out = fileURLToPath(new URL(`../../static/${file}`, import.meta.url));
		await page.locator('.card').screenshot({ path: out });
		const bytes = statSync(out).size;
		console.log(`${file}: ${Math.round(bytes / 1024)} KB`);
		if (bytes > MAX_BYTES) tooBig = true;
	}
} finally {
	await browser.close();
}
if (tooBig) {
	console.error(`Alguna tarjeta pasa de ${MAX_BYTES / 1024} KB: simplificala (colores planos).`);
	process.exitCode = 1;
}
