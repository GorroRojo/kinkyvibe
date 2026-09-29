/**
 * Entradas "a la gorra" de un evento online (TICKETS_DEV_FIXTURE_GORRA): monto elegido con
 * mínimo y sugerido, sin fondo ni códigos, link de la transmisión en lugar de QR y "Enviar el
 * link a todes" idempotente.
 */
import { expect, test } from '@playwright/test';
import { computePrice } from '../../src/lib/utils/tickets.js';
import { MP_FEE_PERCENT, ticketsE2EGorraEvent } from './event.js';
import { AGE_OK, ars, fakeDni, shots } from './helpers.js';

const EVENT = ticketsE2EGorraEvent();
const BUY_URL = `/calendario/${EVENT}/entradas`;
const FEE_BP = Math.round(Number(MP_FEE_PERCENT) * 100);

test.beforeEach(async ({ page }) => {
	await page.addInitScript(AGE_OK);
});

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ type?: RegExp, amount?: string, quantity?: number }} [o]
 */
async function fill(page, o = {}) {
	const id = Math.random().toString(36).slice(2, 8);
	await page.goto(BUY_URL, { waitUntil: 'networkidle' });
	const block = page.locator('#entradas');
	await block.getByRole('radio', { name: o.type ?? /^A la gorra/ }).check();
	if (o.amount !== undefined)
		await block.getByLabel('¿Cuánto querés pagar por entrada?').fill(o.amount);
	if (o.quantity) await block.getByLabel('Cantidad').fill(String(o.quantity));
	await block.getByLabel('Tu nombre').fill(`Gorra E2E ${id}`);
	await block.getByLabel('Tus pronombres').fill('elle');
	await block.getByLabel(/^Email/).fill(`gorra-${id}@example.com`);
	await block.getByLabel(/^DNI/).fill(fakeDni());
	const holders = block.locator('fieldset.holder');
	for (let i = 1; i < (o.quantity ?? 1); i++) {
		await holders.nth(i).getByLabel('Nombre', { exact: true }).fill(`Acompañante ${id}-${i}`);
		await holders
			.nth(i)
			.getByLabel(/^Pronombres/)
			.fill('ella');
	}
	await block.getByLabel(/18 años/).check();
	return { block, id };
}

test('a la gorra: sugerido preseleccionado, mínimo, sin fondo ni código, y el total con recargo', async ({
	page
}) => {
	// Sin link de transmisión (la base local guarda el de corridas anteriores).
	await page.goto(`/admin/entradas/${EVENT}`);
	const cleared = await page.request.post(`/admin/entradas/${EVENT}?/setLink`, {
		form: { link: '' },
		headers: { origin: 'http://localhost:5371', 'x-sveltekit-action': 'true' }
	});
	expect(await cleared.text()).toContain('Link borrado');
	// La página del evento ofrece el botón "a la gorra".
	await page.goto(`/calendario/${EVENT}`, { waitUntil: 'networkidle' });
	await expect(page.locator('.buy-button')).toContainText('a la gorra');

	const { block } = await fill(page);
	const amount = block.getByLabel('¿Cuánto querés pagar por entrada?');
	// Vacío = el sugerido; el chip del sugerido aparece marcado.
	await expect(amount).toHaveAttribute('placeholder', '5000');
	await expect(block.getByRole('button', { name: /\$ 5\.000 · sugerido/ })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(block.getByText('Total:')).toContainText(
		ars(
			computePrice({
				price: 5000,
				option: 'gorra',
				quantity: 1,
				method: 'mercadopago',
				feeBasisPoints: FEE_BP
			}).total
		)
	);
	// No aparecen las opciones del fondo ni el código, y se explica por qué.
	await expect(block.locator('fieldset.options')).toHaveCount(0);
	await expect(block.getByLabel(/Código de descuento/)).toHaveCount(0);
	await expect(block).toContainText(
		'no se aplican el descuento del Fondo KinkyVibe ni los códigos de descuento'
	);

	// Menos que el mínimo: se marca y no deja comprar.
	await amount.fill('500');
	await expect(block.getByText(/desde \$\s1\.000/)).toBeVisible();
	await expect(block.locator('.pay button[type="submit"]')).toBeDisabled();

	// 7.000 × 2 con Mercado Pago.
	await amount.fill('7.000');
	await block.getByRole('button', { name: 'Una entrada más' }).click();
	await block
		.locator('fieldset.holder')
		.nth(1)
		.getByLabel('Nombre', { exact: true })
		.fill('Otra Persona');
	await block
		.locator('fieldset.holder')
		.nth(1)
		.getByLabel(/^Pronombres/)
		.fill('ella');
	const prices = computePrice({
		price: 7000,
		option: 'gorra',
		quantity: 2,
		method: 'mercadopago',
		feeBasisPoints: FEE_BP
	});
	await expect(block.getByText(`Total: ${ars(prices.total)}`)).toBeVisible();
	await shots(page, '11-gorra-compra', block);
	await block.locator('.pay button[type="submit"]').click();
	await expect(page).toHaveURL(/\/entradas\/simular-pago\/[0-9a-f-]{36}$/);
	await expect(page.getByRole('heading', { name: `Pagar ${ars(prices.total)}` })).toBeVisible();
	await page.getByRole('button', { name: 'Aprobar pago', exact: true }).click();
	await expect(page.getByRole('heading', { name: /ya tenés tus entradas/ })).toBeVisible();
	await expect(page.getByText(`${ars(7000)} por entrada`)).toBeVisible();

	// Evento online: sin QR; el link todavía no está.
	await page.getByRole('link', { name: 'Ver entrada 1' }).click();
	await expect(page).toHaveURL(/\/entradas\/t\/[A-Za-z0-9_-]{43}$/);
	await expect(page.locator('.qr svg')).toHaveCount(0);
	await expect(page.getByText('Todavía no está el link de la transmisión')).toBeVisible();
});

test('el servidor valida el monto aunque el formulario mande otro', async ({ page }) => {
	await page.goto(BUY_URL);
	/** @param {Record<string, string>} extra */
	const post = (extra) =>
		page.request.post(`${BUY_URL}?/buy`, {
			form: {
				type: 'gorra',
				quantity: '1',
				name: 'Persona Tramposa',
				pronouns: 'elle',
				email: 'tramposa@example.com',
				dni: '12345678',
				holder_name_0: 'Persona Tramposa',
				holder_pronouns_0: 'elle',
				method: 'mercadopago',
				accept: 'on',
				option: 'sugar',
				...extra
			},
			headers: { origin: 'http://localhost:5371', 'x-sveltekit-action': 'true' },
			maxRedirects: 0
		});
	for (const amount of ['999', '-1', '9999999', 'mucho']) {
		const body = await (await post({ amount })).text();
		expect(body).toContain('Revisá los datos marcados');
	}
	const ok = await (await post({ amount: '1000', code: 'NOEXISTE' })).json();
	expect(ok.type).toBe('redirect');
	await page.goto(ok.location);
	const { total } = computePrice({
		price: 1000,
		option: 'gorra',
		quantity: 1,
		method: 'mercadopago',
		feeBasisPoints: FEE_BP
	});
	await expect(page.getByRole('heading', { name: `Pagar ${ars(total)}` })).toBeVisible();
});

test('a la gorra con $ 0 (mínimo 0): se emite sin pagar', async ({ page }) => {
	const { block } = await fill(page, { type: /^Libre/ });
	await block.getByRole('button', { name: 'Sin cargo' }).click();
	const submit = block.locator('.pay button[type="submit"]');
	await expect(submit).toHaveText('Confirmar entradas sin cargo');
	await expect(block.locator('fieldset.methods')).toHaveCount(0);
	await submit.click();
	await expect(page).toHaveURL(/\/entradas\/[0-9a-f-]{36}\/estado$/);
	await expect(page.getByRole('heading', { name: /ya tenés tus entradas/ })).toBeVisible();
	await expect(page.getByText('Sin cargo')).toBeVisible();
});

test('link de la transmisión: se guarda en el admin y "Enviar el link a todes" es idempotente', async ({
	page
}) => {
	// Al menos una compra aprobada.
	const { block } = await fill(page, { type: /^Libre/, amount: '0' });
	await block.locator('.pay button[type="submit"]').click();
	await expect(page.getByRole('heading', { name: /ya tenés tus entradas/ })).toBeVisible();
	await page.getByRole('link', { name: 'Ver entrada 1' }).click();
	await expect(page).toHaveURL(/\/entradas\/t\/[A-Za-z0-9_-]{43}$/);
	const ticketUrl = page.url();

	await page.goto(`/admin/entradas/${EVENT}`, { waitUntil: 'networkidle' });
	// Online: no hay control de ingreso.
	await expect(page.getByRole('link', { name: /Control de ingreso/ })).toHaveCount(0);
	const section = page.locator('section.stream');
	const input = section.getByLabel(/Link \(https/);
	await input.fill('meet.example.com/sin-https');
	await section.getByRole('button', { name: 'Guardar link' }).click();
	await expect(section.getByText(/empezando con https/)).toBeVisible();

	const link = `https://meet.example.com/e2e-${Math.random().toString(36).slice(2, 8)}`;
	await input.fill(link);
	await section.getByRole('button', { name: 'Guardar link' }).click();
	await expect(section.getByText('Link guardado.')).toBeVisible();
	const send = section.getByRole('button', { name: /Enviar el link a todes \((\d+) personas?\)/ });
	await expect(send).toBeVisible();
	const pending = Number((await send.innerText()).match(/\((\d+)/)?.[1]);
	expect(pending).toBeGreaterThanOrEqual(1);
	await shots(page, '12-gorra-admin-link', section);
	page.once('dialog', (d) => d.accept());
	await send.click();
	await expect(section.getByText(new RegExp(`Link enviado a ${pending} persona`))).toBeVisible();
	await expect(
		section.getByRole('button', { name: '✓ Todes ya recibieron este link' })
	).toBeDisabled();

	// Otra vez (p. ej. desde otra pestaña): no manda nada.
	const again = await page.request.post(`/admin/entradas/${EVENT}?/sendLink`, {
		form: {},
		headers: { origin: 'http://localhost:5371', 'x-sveltekit-action': 'true' }
	});
	expect(await again.text()).toContain('no se mandó nada');

	// La entrada muestra el link.
	await page.goto(ticketUrl);
	await expect(page.getByRole('link', { name: 'Entrar a la transmisión' })).toHaveAttribute(
		'href',
		link
	);
	await shots(page, '12-gorra-entrada-con-link', page.locator('article.ticket'));

	// Cambiar el link: se puede mandar el nuevo a todes.
	await page.goto(`/admin/entradas/${EVENT}`, { waitUntil: 'networkidle' });
	await section.getByLabel(/Link \(https/).fill(`${link}-2`);
	await section.getByRole('button', { name: 'Guardar link' }).click();
	await expect(section.getByText('Link guardado.')).toBeVisible();
	await expect(section.locator('button.send-link')).toHaveText(
		new RegExp(`Enviar el link a todes \\(${pending} persona`)
	);
	await expect(section.locator('button.send-link')).toBeEnabled();
});
