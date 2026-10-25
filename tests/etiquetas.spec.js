// @ts-nocheck -- test code: loose fixtures, no need for strict JSDoc types
// El árbol de etiquetas en las páginas (docs/etiquetas.md): el layout raíz manda el árbol liviano y
// las páginas que muestran descripciones o la Kinkipedia mandan los detalles aparte. Con la semilla
// pública (src/lib/server/semilla/).
import { expect, test } from '@playwright/test';

/** Mark the age gate as accepted so it doesn't cover the page. */
async function acceptAgeGate(page) {
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('mayorDeEdad', 'true');
		} catch (e) {
			/* ignore */
		}
	});
}

/** Collects console errors and uncaught exceptions of the page. */
function collectErrors(page, baseURL) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('console', (m) => {
		if (m.type() !== 'error') return;
		// Lo de afuera (imágenes, analíticas) falla o lo bloquea CORS según la red: como en
		// smoke.spec.js, solo cuentan los errores de recursos del sitio (la primera URL del
		// mensaje, o dónde se registró).
		const own = (/** @type {string} */ u) => !!baseURL && u.startsWith(baseURL);
		const url = m.location()?.url ?? '';
		const resource = m.text().match(/https?:\/\/[^\s'")]+/)?.[0];
		if (url && !own(url)) return;
		if (resource && !own(resource)) return;
		// una imagen de la semilla que no está en el entorno de pruebas
		if (m.text().startsWith('Failed to load resource')) return;
		errors.push(m.text());
	});
	return errors;
}

test.beforeEach(async ({ page }) => acceptAgeGate(page));

test('el layout de todas las páginas manda el árbol sin descripciones ni páginas de la wiki', async ({
	request
}) => {
	const data = await (await request.get('/calendario/__data.json')).text();
	// el árbol sí (los nombres de las etiquetas)…
	expect(data).toContain('"impacto"');
	// …pero no la descripción de impacto ni las páginas de la wiki
	expect(data).not.toContain('impactar físicamente');
	expect(data).not.toContain('/wiki/BDSM');
});

test('buscador de etiquetas: escribir, elegir con Enter y con un clic', async ({
	page,
	baseURL
}) => {
	const errors = collectErrors(page, baseURL);
	await page.goto('/material', { waitUntil: 'networkidle' });
	const input = page.getByRole('combobox', { name: 'Buscar por etiquetas o texto' });
	await input.click();
	await input.fill('impac');
	// «impacto» se muestra con su nombre visible
	const option = page.getByRole('option', { name: /Juegos de Impacto/ });
	await expect(option).toBeVisible();
	await input.press('Enter');
	const chips = page.locator('.tag-search .chip');
	await expect(chips).toHaveCount(1);
	await expect(chips.first()).toContainText('Juegos de Impacto');
	await expect(input).toHaveValue('');
	await expect(page).toHaveURL(/[?&]tags=impacto/);
	// El chip tiene el color de su etiqueta (heredado: sale del árbol liviano).
	const color = await chips
		.first()
		.locator('.kv-tag')
		.evaluate((el) => el.style.getPropertyValue('--tag-color'));
	expect(color).not.toBe('');
	// La descripción de la etiqueta elegida y su «Es más complejo» (detalles de la página).
	await expect(
		page.locator('dl').getByText('impactar físicamente', { exact: false })
	).toBeVisible();
	await expect(page.locator('a.gotowiki[href="/wiki/impacto"]')).toBeVisible();

	// Con el mouse: otra sugerencia, elegida con un clic.
	await input.pressSequentially('esp');
	const another = page.getByRole('option', { name: /español/ });
	await expect(another).toBeVisible();
	await another.click();
	await expect(chips).toHaveCount(2);
	await expect(chips.nth(1)).toContainText('español');
	await expect(input).toHaveValue('');
	// el foco sigue en el campo
	await expect(input).toBeFocused();
	expect(errors).toEqual([]);
});

test('la Kinkipedia: el glosario muestra descripciones y «Ver también»', async ({
	page,
	baseURL
}) => {
	const errors = collectErrors(page, baseURL);
	await page.goto('/wiki/BDSM', { waitUntil: 'networkidle' });
	const self = page.locator('.all.single .self');
	await expect(self).toContainText('Una conjunción de');
	await expect(self).toContainText('Ver también');
	expect(errors).toEqual([]);
});

test('al navegar desde una página sin detalles, la Kinkipedia los recibe con su página', async ({
	page,
	baseURL
}) => {
	const errors = collectErrors(page, baseURL);
	await page.goto('/calendario', { waitUntil: 'networkidle' });
	// navegación del lado del cliente (sin recargar): el layout raíz no se vuelve a pedir
	await page.locator('nav a[href="/wiki"]').first().click();
	await expect(page).toHaveURL(/\/wiki$/);
	await expect(page.locator('dl').getByText('Una conjunción de', { exact: false })).toBeVisible();
	await page.getByRole('link', { name: 'BDSM', exact: true }).first().click();
	await expect(page).toHaveURL(/\/wiki\/BDSM$/);
	await expect(page.locator('.all.single .self')).toContainText('Ver también');
	// y de vuelta en una lista, la descripción de una etiqueta elegida
	await page.goto('/calendario', { waitUntil: 'networkidle' });
	await page.locator('nav a[href="/material"]').first().click();
	await expect(page).toHaveURL(/\/material$/);
	const input = page.getByRole('combobox', { name: 'Buscar por etiquetas o texto' });
	await input.click();
	await input.fill('impacto');
	await expect(page.getByRole('option', { name: /Juegos de Impacto/ })).toBeVisible();
	await input.press('Enter');
	await expect(
		page.locator('dl').getByText('impactar físicamente', { exact: false })
	).toBeVisible();
	expect(errors).toEqual([]);
});
