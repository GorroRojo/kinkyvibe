import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// El mail de las entradas (presencial) tal como sale de buildTicketEmail: `email.golden.json`
// es byte a byte la salida de los builders (lo comprueba templates.test.js).
const golden = JSON.parse(
	readFileSync(new URL('../src/lib/server/tickets/email.golden.json', import.meta.url), 'utf8')
);
const html = golden['tickets-presencial'].html;

for (const width of [390, 320, 600]) {
	test(`mail de entradas a ${width} px: el QR y el código entran en su recuadro`, async ({
		browser
	}) => {
		const context = await browser.newContext({ viewport: { width, height: 900 } });
		const page = await context.newPage();
		// Sin red: el QR es una imagen de 200 × 200 con width/height, alcanza para el tamaño.
		await page.route('**/*', (route) => route.abort());
		await page.setContent(html);
		const boxes = page.locator('div[style*="dashed"]');
		await expect(boxes).toHaveCount(2);
		for (let i = 0; i < 2; i++) {
			const box = boxes.nth(i);
			const outer = await box.boundingBox();
			const qr = await box.locator('img').boundingBox();
			const code = await box.getByText(/^[0-9A-Z]{3} [0-9A-Z]{3}$/).boundingBox();
			expect(outer && qr && code).toBeTruthy();
			if (!outer || !qr || !code) return;
			for (const inner of [qr, code]) {
				expect(inner.x).toBeGreaterThanOrEqual(outer.x);
				expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
			}
			// Nada desborda: ni la página ni el recuadro tienen scroll horizontal.
			expect(await box.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
		}
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
		// En pantallas anchas siguen uno al lado del otro.
		if (width >= 600) {
			const qr = await boxes.first().locator('img').boundingBox();
			const code = await boxes
				.first()
				.getByText(/^[0-9A-Z]{3} [0-9A-Z]{3}$/)
				.boundingBox();
			expect(code && qr && code.x > qr.x + qr.width).toBe(true);
		}
		await context.close();
	});
}
