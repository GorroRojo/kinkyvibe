/**
 * Red de seguridad del mapa del panel (paso 2): cada link del menú lateral abre una página.
 * Las URLs del panel se mudaron sin redirecciones, así que un link viejo daría 404; esta prueba
 * entra a todos (también a los de los grupos cerrados) con la sesión de admin falsa de
 * `npm run dev:tickets`. Lo que viene ("Próximamente") no es un link: se ve gris y punteado. La otra mitad de la red es `src/lib/admin/adminPaths.test.js`
 * (cada '/admin/…' escrito en el código lleva a una ruta que existe).
 */
import { expect, test } from '@playwright/test';
import { AGE_OK } from './helpers.js';
import { ticketsE2EEvent } from './event.js';

const EVENT = ticketsE2EEvent();

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
	// Inicio y al menos una sección por área.
	expect(hrefs.length).toBeGreaterThan(20);
	// Lo que viene está en el menú, pero sin link.
	const soon = menu.locator('[aria-disabled="true"]', { hasText: 'Próximamente' });
	expect(await soon.count()).toBeGreaterThan(0);
	expect(await menu.locator('a', { hasText: 'Próximamente' }).count()).toBe(0);
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

test('ficha del evento: 7 pestañas, Ventas y Mails con sus vistas, y la lista ▾ en el celu', async ({
	page
}) => {
	await page.goto(`/admin/eventos/${EVENT}/ordenes`, { waitUntil: 'networkidle' });
	const tabs = page.getByRole('navigation', { name: 'Pestañas' });
	await expect(tabs.getByRole('link')).toHaveText([
		'Resumen',
		'Editar',
		/^Ventas/,
		'Puerta',
		'Códigos',
		'Mails',
		/^Preguntas/
	]);
	// Órdenes es una vista de Ventas: la pestaña Ventas queda marcada.
	await expect(tabs.getByRole('link', { name: /^Ventas/ })).toHaveAttribute('aria-current', 'page');
	const views = page.getByRole('navigation', { name: 'Vistas de Ventas' });
	await expect(views.getByRole('link', { name: /^Órdenes/ })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await views.getByRole('link', { name: /^Transferencias/ }).click();
	await expect(page).toHaveURL(new RegExp(`/admin/eventos/${EVENT}/transferencias$`));

	// Las direcciones de siempre de Mails siguen andando, cada una en su vista.
	await page.goto(`/admin/eventos/${EVENT}/mails`, { waitUntil: 'networkidle' });
	await expect(tabs.getByRole('link', { name: 'Mails' })).toHaveAttribute('aria-current', 'page');
	await expect(
		page
			.getByRole('navigation', { name: 'Vistas de Mails' })
			.getByRole('link', { name: 'Plantillas' })
	).toHaveAttribute('aria-current', 'page');

	// En el celu: un botón con la pestaña actual que abre la lista entera.
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(tabs.getByRole('link', { name: 'Resumen', exact: true })).toBeHidden();
	const toggle = page.getByRole('button', { name: /^Mails/ });
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	const list = page.getByRole('navigation', { name: 'Pestañas' }).getByRole('listitem');
	await expect(list).toHaveCount(7);
	await expect(page.getByRole('link', { name: 'Mails' })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(toggle).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await page.getByRole('link', { name: 'Códigos' }).click();
	await expect(page).toHaveURL(new RegExp(`/admin/eventos/${EVENT}/codigos$`));
	await expect(page.getByRole('button', { name: /^Códigos/ })).toHaveAttribute(
		'aria-expanded',
		'false'
	);
});
