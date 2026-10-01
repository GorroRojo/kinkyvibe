/**
 * Red de seguridad del mapa del panel (paso 2): cada link del menú lateral abre una página.
 * Las URLs del panel se mudaron sin redirecciones, así que un link viejo daría 404; esta prueba
 * entra a todos (también a los de las áreas cerradas y a los de "Próximamente") con la sesión de
 * admin falsa de `npm run dev:tickets`. La otra mitad de la red es `src/lib/admin/adminPaths.test.js`
 * (cada '/admin/…' escrito en el código lleva a una ruta que existe).
 */
import { expect, test } from '@playwright/test';
import { AGE_OK } from './helpers.js';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(AGE_OK);
	await page.setViewportSize({ width: 1280, height: 900 });
});

test('cada link del menú del panel abre su página', async ({ page }) => {
	await page.goto('/admin', { waitUntil: 'networkidle' });
	const menu = page.getByRole('navigation', { name: 'Secciones del panel' });
	await expect(menu).toBeVisible();
	// Todas las áreas están en la página aunque estén cerradas (`hidden`): se leen los href.
	const hrefs = await menu
		.locator('a[href^="/admin"]')
		.evaluateAll((links) => [...new Set(links.map((a) => a.getAttribute('href') ?? ''))]);
	// Inicio, al menos una sección por área y las URLs reservadas de lo que viene.
	expect(hrefs.length).toBeGreaterThan(20);
	expect(hrefs).toContain('/admin/ventas');
	expect(hrefs).toContain('/admin/comunidad/perfiles');
	expect(hrefs).toContain('/admin/mensajes/plantillas');

	/** @type {string[]} */
	const broken = [];
	for (const href of hrefs) {
		const res = await page.goto(href, { waitUntil: 'domcontentloaded' });
		const status = res?.status() ?? 0;
		// Sin redirecciones: una sección del menú abre en su propia URL.
		const landed = new URL(page.url()).pathname;
		if (status >= 400 || landed !== href.split(/[?#]/)[0]) {
			broken.push(`${href} → ${status} ${landed}`);
			continue;
		}
		// El panel (su menú) se dibujó: no es la página de error.
		await expect(menu, href).toBeVisible();
	}
	expect(broken).toEqual([]);
});
