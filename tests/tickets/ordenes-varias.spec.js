/**
 * Ventas › Órdenes, «Compras»: elegir varias compras (las que se ven con el buscador), marcarlas
 * facturadas desde la barra (la cortesía se saltea y el resultado lo dice) y el aviso «1 compra
 * nueva · Mostrar», que trae la compra nueva sin perder la selección. Datos inventados.
 */
import { expect, test } from '@playwright/test';
import { ticketsE2EGorraEvent } from './event.js';
import { shots } from './helpers.js';

const SLUG = ticketsE2EGorraEvent();
const ORIGIN = 'http://localhost:5371';
const HEADERS = { origin: ORIGIN, 'x-sveltekit-action': 'true' };

test.use({ deviceScaleFactor: 2 });

/**
 * Una compra cargada a mano.
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} name
 * @param {string} email
 * @param {'efectivo' | 'cortesia'} method
 */
async function load(request, name, email, method) {
	const res = await request.post(`/admin/eventos/${SLUG}/ordenes/cargar`, {
		form: { type: 'fijo', quantity: '1', name, email, method, amount: '5000', holder_0: name },
		headers: HEADERS
	});
	expect(res.ok()).toBe(true);
}

test('varias compras a la vez y el aviso de compras nuevas', async ({ page }) => {
	const id = Math.random().toString(36).slice(2, 8);
	await load(page.request, `Persona Uno ${id}`, `uno-${id}@example.com`, 'efectivo');
	await load(page.request, `Persona Dos ${id}`, `dos-${id}@example.com`, 'efectivo');
	await load(page.request, `Persona Tres ${id}`, `tres-${id}@example.com`, 'cortesia');

	// El reloj de la página, para no esperar 30 segundos la pregunta por compras nuevas.
	await page.clock.install();
	await page.goto(`/admin/eventos/${SLUG}/ordenes?estado=todas`, { waitUntil: 'networkidle' });
	const tip = page.getByRole('button', { name: 'Entendido' });
	if (await tip.isVisible()) await tip.click();
	await page.getByPlaceholder('Nombre, email, DNI, KV-… o respuesta').fill(id);
	await expect(page.locator('.order')).toHaveCount(3);

	await page.getByLabel('Elegir todas las que se ven').check();
	const bar = page.getByRole('region', { name: 'Compras elegidas' });
	await expect(bar).toContainText('3 elegidas');
	await bar.getByRole('button', { name: 'Marcar facturadas (2)' }).click();
	await expect(bar).toContainText('2 hechas, 1 salteada (1 sin pago para facturar).');
	await expect(page.locator('.order', { hasText: `uno-${id}@` })).toContainText('Facturada el ');

	// Llega otra compra mientras la página está abierta: aviso, la lista no cambia.
	await load(page.request, `Persona Cuatro ${id}`, `cuatro-${id}@example.com`, 'efectivo');
	await page.clock.fastForward(31_000);
	const notice = page.getByRole('status').filter({ hasText: '1 compra nueva' });
	await expect(notice).toBeVisible();
	await expect(page.locator('.order')).toHaveCount(3);
	await shots(page, 'ordenes-varias', undefined, { fullPage: false });

	await notice.getByRole('button', { name: 'Mostrar' }).click();
	await expect(page.locator('.order')).toHaveCount(4);
	await expect(notice).toBeHidden();
	await expect(bar).toContainText('3 elegidas');
});
