/**
 * Red de seguridad del mapa del panel (paso 2): cada link del menú lateral abre una página.
 * Las URLs del panel se mudaron sin redirecciones, así que un link viejo daría 404; esta prueba
 * entra a todos (las 8 secciones de la barra y las pestañas de cada una) con la sesión de admin falsa de
 * `npm run dev:tickets`. Lo que viene ("Próximamente") no es un link: se ve gris y punteado. La otra mitad de la red es `src/lib/admin/adminPaths.test.js`
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
	// Opción C (decisión 0038): la barra lateral tiene las 8 secciones, sin sub-ítems ni acciones;
	// las demás páginas de cada sección son sus pestañas («Secciones de …»).
	const sections = await menu
		.locator('a.sec')
		.evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
	expect(sections).toEqual([
		'/admin',
		'/admin/checkin',
		'/admin/eventos',
		'/admin/ventas',
		'/admin/comunidad/personas',
		'/admin/contenido/material',
		'/admin/estadisticas/ventas',
		'/admin/ajustes/cobros'
	]);
	await expect(menu.getByRole('link', { name: 'Cargar evento' })).toHaveCount(0);
	// Crear un evento sigue siendo un botón de la página de Eventos.
	await page.goto('/admin/eventos', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('main').getByRole('link', { name: 'Cargar evento' })).toHaveAttribute(
		'href',
		'/admin/eventos/nuevo'
	);

	/** @type {string[]} */
	const broken = [];
	const queue = [...sections];
	const seen = new Set(queue);
	while (queue.length) {
		const href = /** @type {string} */ (queue.shift());
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
		// Las pestañas de la sección también son links del menú: se entra a cada una.
		const tabs = await page
			.locator('nav[aria-label^="Secciones de "] a[href^="/admin"]')
			.evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
		for (const t of tabs) {
			if (!seen.has(t)) {
				seen.add(t);
				queue.push(t);
			}
		}
	}
	expect(broken).toEqual([]);
	// Inicio, las secciones y todas sus pestañas.
	expect(seen.size).toBeGreaterThan(20);
	for (const h of [
		'/admin/eventos/agenda',
		'/admin/ventas/transferencias',
		'/admin/comunidad/perfiles',
		'/admin/mensajes/plantillas',
		'/admin/etiquetas',
		'/admin/ajustes/actividad'
	]) {
		expect(seen, h).toContain(h);
	}
});

test('lo que viene sigue en el panel «Más» del celu, sin link', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/admin', { waitUntil: 'networkidle' });
	await page
		.getByRole('navigation', { name: 'Secciones principales' })
		.getByRole('button', { name: 'Más' })
		.click();
	const sheet = page.getByRole('dialog', { name: 'Todas las secciones' });
	await sheet.getByRole('button', { name: /Ventas/ }).click();
	const soon = sheet.locator('[aria-disabled="true"]', { hasText: 'Próximamente' });
	expect(await soon.count()).toBeGreaterThan(0);
	expect(await sheet.locator('a', { hasText: 'Próximamente' }).count()).toBe(0);
});

test('«Ir a…» (Ctrl+K) abre el buscador, encuentra una página y va con Enter', async ({ page }) => {
	await page.goto('/admin', { waitUntil: 'networkidle' });
	await page.keyboard.press('Control+k');
	const dialog = page.getByRole('dialog', { name: 'Ir a… o buscar en el panel' });
	await expect(dialog).toBeVisible();
	const input = dialog.getByRole('combobox');
	await expect(input).toBeFocused();
	await input.fill('transferencias');
	await expect(dialog.getByRole('option').first()).toContainText('Transferencias');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/admin\/ventas\/transferencias$/);
	await expect(dialog).toBeHidden();
	// Esc lo cierra.
	await page.keyboard.press('Control+k');
	await expect(dialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
});

test('«Recientes» en la barra lateral: las páginas que abriste', async ({ page }) => {
	await page.goto('/admin/ventas/transferencias', { waitUntil: 'networkidle' });
	await page.goto('/admin/eventos/agenda', { waitUntil: 'networkidle' });
	const menu = page.getByRole('navigation', { name: 'Secciones del panel' });
	const recent = menu.getByRole('list', { name: 'Recientes' });
	// La página actual no se muestra; la anterior, sí.
	await expect(recent.getByRole('link', { name: 'Transferencias' })).toBeVisible();
	await expect(recent.getByRole('link', { name: 'Agenda' })).toHaveCount(0);
	// Una sección de la barra no se repite en Recientes.
	await page.goto('/admin/ventas', { waitUntil: 'networkidle' });
	await expect(recent.getByRole('link', { name: 'Agenda' })).toBeVisible();
	await expect(recent.getByRole('link', { name: 'Todas las ventas' })).toHaveCount(0);
});

test('/admin/estadisticas (la única redirección del panel, gorrite 11/10) lleva a Ventas', async ({
	page
}) => {
	await page.goto('/admin/estadisticas?periodo=30d', { waitUntil: 'domcontentloaded' });
	const landed = new URL(page.url());
	expect(landed.pathname).toBe('/admin/estadisticas/ventas');
	expect(landed.searchParams.get('periodo')).toBe('30d');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ventas en el tiempo');
	// Las tres pestañas de Estadísticas, con la actual marcada.
	const tabs = page.getByRole('navigation', { name: 'Secciones de Estadísticas' });
	await expect(tabs.getByRole('link')).toHaveText([
		'Ventas en el tiempo',
		'Asistencia',
		'Visitas al sitio'
	]);
	await expect(tabs.getByRole('link', { name: 'Ventas en el tiempo' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(
		page.getByRole('navigation', { name: 'Período' }).getByRole('link', { name: '30 días' })
	).toHaveAttribute('aria-current', 'true');
});

test('una dirección del panel que no existe da 404 adentro del panel (con el menú)', async ({
	page
}) => {
	const res = await page.goto('/admin/no-existe/tampoco', { waitUntil: 'domcontentloaded' });
	expect(res?.status()).toBe(404);
	await expect(page.getByRole('navigation', { name: 'Secciones del panel' })).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('No encontramos esta página');
	await expect(page.getByRole('link', { name: 'Volver al Inicio' })).toHaveAttribute(
		'href',
		'/admin'
	);
});

test('cada admin elige cómo se ve su panel lateral (y se aplica al cargar)', async ({ page }) => {
	await page.goto('/admin', { waitUntil: 'networkidle' });
	const html = page.locator('html');
	const side = page.locator('aside#kv-side');
	await expect(html).not.toHaveAttribute('data-lateral', /.+/);

	// «Solo íconos»: la franja angosta; los links siguen teniendo su nombre.
	await page.locator('.usermenu summary').click();
	await page.getByRole('radio', { name: 'Solo íconos' }).check();
	await expect(html).toHaveAttribute('data-lateral', 'iconos');
	expect((await side.boundingBox())?.width ?? 999).toBeLessThan(80);
	const menu = page.getByRole('navigation', { name: 'Secciones del panel' });
	await expect(menu.getByRole('link', { name: 'Inicio' })).toBeVisible();

	// Al recargar, el script del <head> lo pone antes de que arranque la página.
	await page.reload({ waitUntil: 'commit' });
	await page.waitForSelector('aside#kv-side', { state: 'attached' });
	await expect(html).toHaveAttribute('data-lateral', 'iconos');

	// «Se oculta»: no se ve hasta tocar el botón de arriba, y Escape lo cierra.
	await page.waitForLoadState('networkidle');
	await page.locator('.usermenu summary').click();
	await page.getByRole('radio', { name: 'Se oculta' }).check();
	await expect(side).toBeHidden();
	await page.getByRole('button', { name: 'Abrir el panel lateral' }).click();
	await expect(side).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(side).toBeHidden();

	// Volver a «Siempre abierto» borra la elección.
	await page.locator('.usermenu summary').click();
	await page.getByRole('radio', { name: 'Siempre abierto' }).check();
	await expect(html).not.toHaveAttribute('data-lateral', /.+/);
	await expect(side).toBeVisible();
});
