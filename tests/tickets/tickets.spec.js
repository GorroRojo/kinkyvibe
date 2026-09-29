import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ticketsE2EEvent } from './event.js';

const EVENT = ticketsE2EEvent();
const SHOTS = process.env.TICKETS_SHOTS_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// Sin esto el cartel "¿Sos mayor de 18 años?" tapa la página.
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('mayorDeEdad', 'true'));
});

/**
 * Captura en escritorio y a 390px de ancho (si TICKETS_SHOTS_DIR está definido).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {import('@playwright/test').Locator} [locator] recorte opcional (si no, página completa)
 */
async function shots(page, name, locator) {
	if (!SHOTS) return;
	const size = page.viewportSize();
	await page.setViewportSize({ width: 1280, height: 900 });
	if (locator) await locator.screenshot({ path: path.join(SHOTS, `${name}-desktop.png`) });
	else await page.screenshot({ path: path.join(SHOTS, `${name}-desktop.png`), fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	if (locator) await locator.screenshot({ path: path.join(SHOTS, `${name}-390.png`) });
	else await page.screenshot({ path: path.join(SHOTS, `${name}-390.png`), fullPage: true });
	if (size) await page.setViewportSize(size);
}

/**
 * Completa el bloque de compra y va al checkout simulado.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ quantity?: number, screenshot?: boolean }} [o]
 */
async function buy(page, { quantity = 1, screenshot = false } = {}) {
	const id = Math.random().toString(36).slice(2, 8);
	// Esperamos la hidratación: si no, Svelte puede pisar lo que ya se completó.
	await page.goto(`/calendario/${EVENT}`, { waitUntil: 'networkidle' });
	const block = page.locator('#entradas');
	await expect(block.getByRole('heading', { name: 'Comprar entradas' })).toBeVisible();
	await block.getByLabel(/General/).check();
	await block.getByLabel('Cantidad').selectOption(String(quantity));
	await block.getByLabel(/^Nombre/).fill(`Persona E2E ${id}`);
	await block.getByLabel(/^Email/).fill(`e2e-${id}@example.com`);
	await block.getByLabel(/18 años/).check();
	await expect(
		block.getByText(`Total: $ ${(8000 * quantity).toLocaleString('es-AR')}`)
	).toBeVisible();
	if (screenshot) await shots(page, '1-comprar', block);
	await block.getByRole('button', { name: 'Ir a pagar con Mercado Pago' }).click();
	await expect(page).toHaveURL(/\/entradas\/simular-pago\/[0-9a-f-]{36}$/);
	return id;
}

test('compra → pago aprobado → entrada con QR → check-in (y segundo check-in)', async ({
	page
}) => {
	await buy(page, { quantity: 2, screenshot: true });
	await expect(page.getByRole('heading', { name: 'Pagar $ 16.000' })).toBeVisible();
	await shots(page, '2-checkout-simulado');
	await page.getByRole('button', { name: 'Aprobar pago', exact: true }).click();

	await expect(page).toHaveURL(/\/entradas\/[0-9a-f-]{36}\/estado\?/);
	await expect(page.getByRole('heading', { name: /ya tenés tus entradas/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /Ver entrada/ })).toHaveCount(2);
	await shots(page, '3-compra-exitosa');

	await page.getByRole('link', { name: 'Ver entrada 1 con su QR' }).click();
	await expect(page).toHaveURL(/\/entradas\/t\/[A-Za-z0-9_-]{43}$/);
	await expect(page.locator('.qr svg')).toBeVisible();
	await expect(page.getByText('Válida')).toBeVisible();
	const ticketUrl = page.url();
	await shots(page, '4-entrada');

	// El GIF del QR para el email.
	const gif = await page.request.get(`${ticketUrl}/qr.gif`);
	expect(gif.status()).toBe(200);
	expect(gif.headers()['content-type']).toBe('image/gif');

	await page.goto('/admin/entradas');
	const card = page.locator('.event', { hasText: 'General' }).first();
	await expect(card).toBeVisible();
	await shots(page, '5-admin-lista');

	await page.goto(`/admin/entradas/${EVENT}/ingreso`);
	await page.getByLabel(/Código de la entrada/).fill(ticketUrl);
	await page.getByRole('button', { name: 'Validar' }).click();
	await expect(page.getByText('✅ Adelante')).toBeVisible();
	await shots(page, '6-checkin-ok');

	await page.getByLabel(/Código de la entrada/).fill(ticketUrl);
	await page.getByRole('button', { name: 'Validar' }).click();
	await expect(page.getByText('⚠️ Ya ingresó')).toBeVisible();
	await shots(page, '7-checkin-ya-ingreso');

	await page.getByLabel(/Código de la entrada/).fill('A'.repeat(43));
	await page.getByRole('button', { name: 'Validar' }).click();
	await expect(page.getByText('❌ QR inválido')).toBeVisible();

	// La entrada ahora figura como usada.
	await page.goto(ticketUrl);
	await expect(page.getByText('Ya se usó para ingresar')).toBeVisible();

	// Accesos de admin: panel y menú de usuario en la página del evento.
	await page.goto('/admin');
	await expect(page.getByRole('link', { name: 'Venta de entradas' })).toHaveAttribute(
		'href',
		'/admin/entradas'
	);
	await page.goto(`/calendario/${EVENT}`, { waitUntil: 'networkidle' });
	await page.getByText('GorroRojo').first().click();
	await expect(page.getByRole('menuitem', { name: 'Entradas de este evento' })).toHaveAttribute(
		'href',
		`/admin/entradas/${EVENT}`
	);
});

test('pago rechazado muestra el error y no emite entradas', async ({ page }) => {
	await buy(page);
	await page.getByRole('button', { name: 'Rechazar pago' }).click();
	await expect(page.getByRole('heading', { name: 'El pago fue rechazado' })).toBeVisible();
	await expect(page.getByRole('link', { name: /Ver entrada/ })).toHaveCount(0);
});

test('si el webhook llega tarde, la página de estado consulta el pago sola', async ({ page }) => {
	await buy(page);
	await page.getByRole('button', { name: /Aprobar sin webhook/ }).click();
	await expect(page.getByRole('heading', { name: /ya tenés tus entradas/ })).toBeVisible();
});

test('el webhook rechaza notificaciones sin firma válida', async ({ request }) => {
	const res = await request.post('/api/mercadopago/webhook?data.id=123&type=payment', {
		data: { type: 'payment', data: { id: '123' } },
		headers: { 'x-signature': 'ts=1,v1=' + '0'.repeat(64), 'x-request-id': 'x' }
	});
	expect(res.status()).toBe(401);
});

test('el precio lo pone el servidor aunque el formulario mande otro', async ({ page }) => {
	await page.goto(`/calendario/${EVENT}`);
	const res = await page.request.post(`/calendario/${EVENT}?/buy`, {
		form: {
			type: 'general',
			quantity: '1',
			name: 'Persona Tramposa',
			email: 'tramposa@example.com',
			accept: 'on',
			price: '1',
			unit_price: '1',
			total: '1'
		},
		headers: { origin: 'http://localhost:5371' },
		maxRedirects: 0
	});
	// Form action: SvelteKit contesta con la redirección al checkout simulado.
	const location = res.headers()['location'] ?? (await res.json()).location;
	expect(location).toMatch(/\/entradas\/simular-pago\//);
	await page.goto(location);
	await expect(page.getByRole('heading', { name: 'Pagar $ 8.000' })).toBeVisible();
});
