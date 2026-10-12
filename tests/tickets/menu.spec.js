/**
 * Red de seguridad del mapa del panel (paso 2): cada link del menú lateral abre una página.
 * Las URLs del panel se mudaron sin redirecciones, así que un link viejo daría 404; esta prueba
 * entra a todos (las 7 secciones de la barra y las pestañas de cada una) con la sesión de admin falsa de
 * `npm run dev:tickets`. Lo que viene ("Próximamente") no es un link: se ve gris y punteado. La otra mitad de la red es `src/lib/admin/adminPaths.test.js`
 * (cada '/admin/…' escrito en el código lleva a una ruta que existe).
 */
import { expect, test } from '@playwright/test';
import { AGE_OK } from './helpers.js';
import { ticketsE2EEvent } from './event.js';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(AGE_OK);
	await page.setViewportSize({ width: 1280, height: 900 });
});

test('cada link del menú del panel abre su página', async ({ page }) => {
	await page.goto('/admin', { waitUntil: 'networkidle' });
	const menu = page.getByRole('navigation', { name: 'Secciones del panel' });
	await expect(menu).toBeVisible();
	// Opción C (decisión 0038): la barra lateral tiene las secciones, sin sub-ítems ni acciones;
	// las demás páginas de cada sección son sus pestañas («Secciones de …»). La Puerta salió de la
	// barra lateral en la parte 2 (sigue en la barra de abajo del celu).
	const sections = await menu
		.locator('a.sec')
		.evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
	expect(sections).toEqual([
		'/admin',
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
	// La Puerta, aunque no esté en la barra lateral, abre (barra de abajo del celu, «Ir a…»).
	const door = await page.goto('/admin/checkin', { waitUntil: 'domcontentloaded' });
	if ((door?.status() ?? 0) >= 400) broken.push(`/admin/checkin → ${door?.status()}`);
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

test('«+ Crear ▾»: un menú con todo lo que se crea, con teclado, Escape y el foco de vuelta', async ({
	page
}) => {
	await page.goto('/admin', { waitUntil: 'networkidle' });
	const top = page.locator('header.top');
	await expect(top.getByRole('link', { name: 'Cargar evento' })).toHaveCount(0);
	const button = top.getByRole('button', { name: 'Crear' });
	await expect(button).toHaveAttribute('aria-expanded', 'false');
	await button.focus();
	await page.keyboard.press('ArrowDown');
	const menu = top.getByRole('menu', { name: 'Crear' });
	await expect(menu).toBeVisible();
	await expect(button).toHaveAttribute('aria-expanded', 'true');
	const first = menu.getByRole('menuitem').first();
	await expect(first).toBeFocused();
	await expect(first).toContainText('Evento');
	// Lo que viene: deshabilitado, con «Próximamente».
	const soon = menu.locator('[role="menuitem"][aria-disabled="true"]');
	expect(await soon.count()).toBeGreaterThan(0);
	await expect(soon.first()).toContainText('Próximamente');
	// ↓ recorre; Escape cierra y vuelve al botón.
	await page.keyboard.press('ArrowDown');
	await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();
	await expect(button).toBeFocused();
	// Elegir uno navega.
	await button.click();
	await menu.getByRole('menuitem', { name: /Código de descuento/ }).click();
	await expect(page).toHaveURL(/\/admin\/ventas\/codigos#nuevo$/);
	await expect(menu).toBeHidden();
	// «Serie de eventos» abre el formulario de crear serie.
	await button.click();
	await menu.getByRole('menuitem', { name: /Serie de eventos/ }).click();
	await expect(page).toHaveURL(/\/admin\/eventos\/series\?crear$/);
	await expect(page.locator('#crear-serie')).toBeVisible();
});

test('«+ Crear» en el celu: el «+» del header abre el mismo menú', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/admin', { waitUntil: 'networkidle' });
	const button = page.locator('header.mtop').getByRole('button', { name: 'Crear' });
	await button.click();
	const menu = page.locator('header.mtop').getByRole('menu', { name: 'Crear' });
	await expect(menu).toBeVisible();
	expect((await menu.boundingBox())?.width ?? 0).toBeGreaterThan(300);
	await menu.locator('a[role="menuitem"][href="/admin/eventos/nuevo"]').click();
	await expect(page).toHaveURL(/\/admin\/eventos\/nuevo$/);
});

test('«Fijados»: se fija desde Recientes y desde «Ir a…», se reordena y se suelta', async ({
	page
}) => {
	await page.goto('/admin/ventas/transferencias', { waitUntil: 'networkidle' });
	await page.goto('/admin/eventos/agenda', { waitUntil: 'networkidle' });
	const menu = page.getByRole('navigation', { name: 'Secciones del panel' });
	const recent = menu.getByRole('list', { name: 'Recientes' });
	const pinned = menu.getByRole('list', { name: 'Fijados' });
	await expect(pinned).toHaveCount(0);
	// 📌 en una reciente (aparece con el mouse encima o con el foco).
	await recent.getByRole('link', { name: /Transferencias/ }).hover();
	await recent.getByRole('button', { name: 'Fijar «Transferencias»' }).click();
	await expect(pinned.getByRole('link', { name: /Transferencias/ })).toBeVisible();
	// Ya no se repite en Recientes.
	await expect(recent.getByRole('link', { name: /Transferencias/ })).toHaveCount(0);

	// 📌 desde «Ir a…» con Alt+F en el resultado elegido.
	await page.keyboard.press('Control+k');
	const dialog = page.getByRole('dialog', { name: 'Ir a… o buscar en el panel' });
	await dialog.getByRole('combobox').fill('codigos');
	await expect(dialog.getByRole('option').first()).toContainText('Códigos');
	await page.keyboard.press('Alt+f');
	await expect(dialog.getByRole('button', { name: 'Soltar «Códigos»' })).toBeVisible();
	// (El primer Escape borra lo escrito, como en todo campo de búsqueda; el segundo cierra.)
	await page.keyboard.press('Escape');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(pinned.getByRole('link')).toHaveCount(2);
	await expect(pinned.getByRole('link').nth(1)).toContainText('Códigos');

	// Subir con el teclado: con el foco en la fila aparecen sus botones (Tab) y Enter.
	await pinned.getByRole('link', { name: /Códigos/ }).focus();
	await page.keyboard.press('Tab');
	await expect(pinned.getByRole('button', { name: 'Subir «Códigos»' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(pinned.getByRole('link').first()).toContainText('Códigos');
	// Queda guardado en este navegador.
	await page.reload({ waitUntil: 'networkidle' });
	await expect(pinned.getByRole('link').first()).toContainText('Códigos');
	// Arrastrar la segunda arriba de la primera.
	await pinned.locator('li').nth(1).dragTo(pinned.locator('li').nth(0));
	await expect(pinned.getByRole('link').first()).toContainText('Transferencias');
	// Soltar (Códigos quedó segunda: Subir, Bajar desactivado, Soltar).
	await pinned.getByRole('link', { name: /Códigos/ }).focus();
	await page.keyboard.press('Tab');
	await page.keyboard.press('Tab');
	await expect(pinned.getByRole('button', { name: /^Soltar «Códigos»/ })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(pinned.getByRole('link')).toHaveCount(1);
});

test('las pestañas muestran lo que hay para revisar y lo que viene, gris y sin link', async ({
	page
}) => {
	await page.goto('/admin/ventas', { waitUntil: 'networkidle' });
	const tabs = page.getByRole('navigation', { name: 'Secciones de Ventas' });
	// Tienda viene (fase 8): se ve, pero no es un link.
	await expect(tabs.getByText('Tienda')).toBeVisible();
	await expect(tabs.getByRole('link', { name: /Tienda/ })).toHaveCount(0);
	// Con «Ocultar lo que viene», no.
	await page.locator('.usermenu summary').click();
	await page.getByRole('button', { name: 'Ocultar lo que viene' }).click();
	await expect(tabs.getByText('Tienda')).toHaveCount(0);
	await page.getByRole('button', { name: 'Mostrar lo que viene' }).click();
	// /admin/eventos ya no tiene los botones Agenda y Series (son pestañas).
	await page.goto('/admin/eventos', { waitUntil: 'networkidle' });
	const main = page.locator('main');
	await expect(main.locator('a.kv-btn', { hasText: /^\s*Agenda\s*$/ })).toHaveCount(0);
	await expect(main.locator('a.kv-btn', { hasText: /^\s*Series\s*$/ })).toHaveCount(0);
	await expect(
		page
			.getByRole('navigation', { name: 'Secciones de Eventos' })
			.getByRole('link', { name: 'Agenda' })
	).toBeVisible();
});

test('en el celu, toda barra de pestañas es una lista ▾ (sin scroll de costado)', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/admin/eventos/series', { waitUntil: 'networkidle' });
	const nav = page.getByRole('navigation', { name: 'Secciones de Eventos' });
	const toggle = nav.getByRole('button', { name: /Sección: Series/ });
	await expect(toggle).toBeVisible();
	// La tira que se desliza no se ve.
	await expect(page.locator('.tabs-wrap.has-menu').first()).toBeHidden();
	await toggle.click();
	await expect(nav.getByRole('link', { name: 'Series' })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(nav.getByRole('link', { name: 'Agenda' })).toBeHidden();
	await expect(toggle).toBeFocused();
	await toggle.click();
	await nav.getByRole('link', { name: 'Lugares' }).click();
	await expect(page).toHaveURL(/\/admin\/eventos\/lugares$/);
	await expect(
		page.getByRole('navigation', { name: 'Secciones de Eventos' }).getByRole('button', {
			name: /Sección: Lugares/
		})
	).toBeVisible();
});

test('mientras carga la página siguiente: barrita arriba y el link «cargando»', async ({
	page
}) => {
	await page.goto('/admin', { waitUntil: 'networkidle' });
	// La página siguiente tarda (se demora su `load`).
	await page.route('**/admin/eventos/agenda/__data.json*', async (route) => {
		await new Promise((r) => setTimeout(r, 1500));
		await route.continue();
	});
	await page.goto('/admin/eventos', { waitUntil: 'networkidle' });
	const agenda = page
		.getByRole('navigation', { name: 'Secciones de Eventos' })
		.getByRole('link', { name: 'Agenda' });
	await agenda.click();
	await expect(page.locator('.loadbar')).toBeVisible();
	await expect(agenda).toHaveAttribute('data-pending', '');
	await expect(agenda).toHaveAttribute('aria-busy', 'true');
	await expect(page).toHaveURL(/\/admin\/eventos\/agenda$/);
	await expect(page.locator('.loadbar')).toHaveCount(0);
	await expect(page.locator('[data-pending]')).toHaveCount(0);
});

test('ficha del evento en el celu: la pestaña ▾ arriba y las acciones, más chicas, debajo', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`/admin/eventos/${ticketsE2EEvent()}/transferencias`, {
		waitUntil: 'networkidle'
	});
	const toggle = page.getByRole('navigation', { name: 'Pestañas' }).getByRole('button', {
		name: /Pestaña: Transferencias/
	});
	await expect(toggle).toBeVisible();
	// Las acciones del encabezado no se ven; debajo de la pestaña: Editar y «⋯ Acciones».
	await expect(page.locator('.event-head .actions')).toBeHidden();
	const more = page.locator('.mactions');
	await expect(more.getByRole('link', { name: 'Editar' })).toBeVisible();
	const toggleBox = await toggle.boundingBox();
	const moreBox = await more.boundingBox();
	expect(moreBox?.y ?? 0).toBeGreaterThan(toggleBox?.y ?? 0);
	// El botón de la pestaña es más alto que los botones de acción.
	expect(toggleBox?.height ?? 0).toBeGreaterThan(
		(await more.getByRole('link', { name: 'Editar' }).boundingBox())?.height ?? 99
	);
	await more.getByText('Acciones').click();
	await expect(more.getByRole('link', { name: 'Duplicar' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(more.getByRole('link', { name: 'Duplicar' })).toBeHidden();
});
