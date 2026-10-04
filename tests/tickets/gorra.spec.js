/**
 * Entradas "a la gorra" de un evento online (TICKETS_DEV_FIXTURE_GORRA): monto elegido con
 * mínimo y sugerido, sin fondo ni códigos, link de la transmisión en lugar de QR y "Enviar el
 * link a todes" idempotente.
 */
import { expect, test } from '@playwright/test';
import { computePrice } from '../../src/lib/utils/tickets.js';
import { MP_FEE_PERCENT, ticketsE2EGorraEvent } from './event.js';
import { AGE_OK, ars, fakeDni, goToStep, nextStep, shots } from './helpers.js';

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
	await nextStep(block, 'Tus datos');
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
	await nextStep(block, 'Pagar');
	await block.getByLabel(/18 años/).check();
	return { block, id };
}

test('a la gorra: sugerido preseleccionado, mínimo, sin fondo ni código, y el total con recargo', async ({
	page
}) => {
	// Sin link de transmisión (la base local guarda el de corridas anteriores).
	await page.goto(`/admin/eventos/${EVENT}`);
	const cleared = await page.request.post(`/admin/eventos/${EVENT}?/setLink`, {
		form: { link: '' },
		headers: { origin: 'http://localhost:5371', 'x-sveltekit-action': 'true' }
	});
	expect(await cleared.text()).toContain('Link borrado');
	// La página del evento ofrece el botón "a la gorra".
	await page.goto(`/calendario/${EVENT}`, { waitUntil: 'networkidle' });
	await expect(page.locator('.buy-button')).toContainText('a la gorra');

	const { block } = await fill(page);
	// El monto está en el paso «Entradas».
	await goToStep(block, 'Entradas');
	const amount = block.getByLabel('¿Cuánto querés pagar por entrada?');
	// Vacío = el sugerido; el chip del sugerido aparece marcado.
	await expect(amount).toHaveAttribute('placeholder', 'Sugerido: 5000');
	await expect(block.getByRole('button', { name: /\$ 5\.000 · sugerido/ })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	// Botones rápidos: mínimo, sugerido, 1,5 × y 2 × el sugerido (sin "mitad").
	await expect(block.getByRole('group', { name: 'Montos rápidos' }).getByRole('button')).toHaveText(
		[/^\$\s1\.000$/, /^\$\s5\.000\s·\ssugerido$/, /^\$\s7\.500$/, /^\$\s10\.000$/]
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

	// Sin monto máximo: solo el tope técnico de la orden ($ 100.000.000) contra errores de tipeo.
	await amount.fill('2.000.000');
	await expect(block.locator('.pay button[type="submit"]')).toBeEnabled();
	await amount.fill('1000000000');
	await expect(block.getByText(/parece un error de tipeo/)).toBeVisible();
	await expect(block.locator('.pay button[type="submit"]')).toBeDisabled();

	// Menos que el mínimo: se marca y no deja comprar.
	await amount.fill('500');
	await expect(block.getByText(/desde \$\s1\.000/)).toBeVisible();
	await expect(block.locator('.pay button[type="submit"]')).toBeDisabled();

	// 7.000 × 2 con Mercado Pago.
	await amount.fill('7.000');
	await block.getByRole('button', { name: 'Una entrada más' }).click();
	await nextStep(block, 'Tus datos');
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
	await nextStep(block, 'Pagar');
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
				email: `tramposa-${Date.now()}@example.com`,
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
	// 1.000.000.000 pasa el tope técnico de la orden ($ 100.000.000), no un máximo de producto.
	for (const amount of ['999', '-1', '1000000000', 'mucho']) {
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

test('evento sin la etiqueta KinkyVibe: sin opciones del Fondo, y un POST armado no baja el precio', async ({
	page
}) => {
	const { block } = await fill(page, { type: /^Precio fijo/ });
	// Precio de lista, sin "¿Cómo querés pagar tu entrada?" ni textos del Fondo.
	await expect(block.locator('fieldset.options')).toHaveCount(0);
	await expect(block).not.toContainText('Fondo KinkyVibe');
	const list = computePrice({
		price: 6000,
		option: 'completo',
		quantity: 1,
		method: 'mercadopago',
		feeBasisPoints: FEE_BP
	});
	await expect(block.getByText('Total:')).toContainText(ars(list.total));

	// Un POST con "con el descuento del fondo" (o una solidaria) se cobra al precio de lista.
	for (const option of ['fondo', 'solidaria']) {
		const id = Math.random().toString(36).slice(2, 8);
		const res = await page.request.post(`${BUY_URL}?/buy`, {
			form: {
				type: 'fijo',
				quantity: '1',
				name: 'Persona Sin Fondo',
				pronouns: 'elle',
				email: `sin-fondo-${id}@example.com`,
				dni: fakeDni(),
				holder_name_0: 'Persona Sin Fondo',
				holder_pronouns_0: 'elle',
				method: 'mercadopago',
				accept: 'on',
				option
			},
			headers: { origin: 'http://localhost:5371', 'x-sveltekit-action': 'true' },
			maxRedirects: 0
		});
		const body = await res.json();
		expect(body.type).toBe('redirect');
		await page.goto(body.location);
		await expect(page.getByRole('heading', { name: `Pagar ${ars(list.total)}` })).toBeVisible();
	}
});

test('a la gorra con $ 0 (mínimo 0): se emite sin pagar', async ({ page }) => {
	const { block } = await fill(page, { type: /^Libre/ });
	await goToStep(block, 'Entradas');
	// Los botones rápidos se ven (así el "no hay botón" de abajo no es por estar en otro paso).
	await expect(block.getByRole('group', { name: 'Montos rápidos' })).toBeVisible();
	// Con mínimo 0 no hay botón del mínimo: se escribe 0.
	await expect(block.getByRole('button', { name: 'Sin cargo' })).toHaveCount(0);
	await block.getByLabel('¿Cuánto querés pagar por entrada?').fill('0');
	await goToStep(block, 'Pagar');
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

	// Resumen de la ficha del evento (el link de la transmisión está ahí).
	await page.goto(`/admin/eventos/${EVENT}`, { waitUntil: 'networkidle' });
	// Online: no hay control de ingreso (ni la pestaña Puerta).
	const tabs = page.getByRole('navigation', { name: 'Pestañas' });
	await expect(tabs.getByRole('link', { name: 'Resumen', exact: true })).toBeVisible();
	await expect(tabs.getByRole('link', { name: 'Puerta', exact: true })).toHaveCount(0);
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
	// Pregunta con el diálogo de la página (ConfirmDialog), no con window.confirm.
	await send.click();
	const ask = page.getByRole('dialog', { name: /¿Mandar el link por mail a/ });
	await expect(ask).toBeVisible();
	await ask.getByRole('button', { name: 'Mandar' }).click();
	await expect(section.getByText(new RegExp(`Link enviado a ${pending} persona`))).toBeVisible();
	await expect(
		section.getByRole('button', { name: '✓ Todes ya recibieron este link' })
	).toBeDisabled();

	// Otra vez (p. ej. desde otra pestaña): no manda nada.
	const again = await page.request.post(`/admin/eventos/${EVENT}?/sendLink`, {
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
	await page.goto(`/admin/eventos/${EVENT}`, { waitUntil: 'networkidle' });
	await section.getByLabel(/Link \(https/).fill(`${link}-2`);
	await section.getByRole('button', { name: 'Guardar link' }).click();
	await expect(section.getByText('Link guardado.')).toBeVisible();
	await expect(section.locator('button.send-link')).toHaveText(
		new RegExp(`Enviar el link a todes \\(${pending} persona`)
	);
	await expect(section.locator('button.send-link')).toBeEnabled();
});
