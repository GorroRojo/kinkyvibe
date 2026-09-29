import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { computePrice } from '../../src/lib/utils/tickets.js';
import { MP_FEE_PERCENT, TRANSFER_INFO, ticketsE2EEvent } from './event.js';

const EVENT = ticketsE2EEvent();
const FEE_BP = Math.round(Number(MP_FEE_PERCENT) * 100);
const TYPES = {
	general: { label: /General/, price: 8000, fondo: 0 },
	fondo: { label: /Con fondo/, price: 10000, fondo: 2000 }
};
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

/** DNI inventado de 8 dígitos (distinto en cada corrida). */
function fakeDni() {
	return String(10000000 + Math.floor(Math.random() * 89999999));
}

/** @param {number} n */
function ars(n) {
	return `$ ${n.toLocaleString('es-AR')}`;
}

/** @param {string} dni */
function dotted(dni) {
	return Number(dni).toLocaleString('es-AR');
}

/**
 * Total que tiene que calcular el servidor (misma función que usa el sitio).
 *
 * @param {keyof typeof TYPES} type
 * @param {number} quantity
 * @param {'mercadopago' | 'transferencia'} method
 * @param {{ kind: 'percent' | 'fixed', value: number } | null} [discount]
 * @param {import('../../src/lib/utils/tickets.js').FondoOption} [option]
 */
function expected(type, quantity, method, discount = null, option = undefined) {
	const t = TYPES[type];
	return computePrice({
		price: t.price,
		fondo: t.fondo,
		option,
		quantity,
		discount,
		method,
		feeBasisPoints: FEE_BP
	});
}

/**
 * Completa el bloque de compra (quien compra + cada entrada) y lo envía.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{
 *   quantity?: number,
 *   type?: keyof typeof TYPES,
 *   method?: 'mercadopago' | 'transferencia',
 *   code?: string,
 *   discount?: { kind: 'percent' | 'fixed', value: number },
 *   option?: import('../../src/lib/utils/tickets.js').FondoOption,
 *   optionLabel?: RegExp,
 *   screenshot?: string,
 *   submit?: boolean
 * }} [o]
 */
async function buy(page, o = {}) {
	const { quantity = 1, type = 'general', method = 'mercadopago' } = o;
	const id = Math.random().toString(36).slice(2, 8);
	const buyer = { name: `Persona E2E ${id}`, email: `e2e-${id}@example.com`, dni: fakeDni() };
	// Esperamos la hidratación: si no, Svelte puede pisar lo que ya se completó.
	await page.goto(`/calendario/${EVENT}`, { waitUntil: 'networkidle' });
	const block = page.locator('#entradas');
	await expect(block.getByRole('heading', { name: 'Comprar entradas' })).toBeVisible();
	await block.getByLabel(TYPES[type].label).check();
	if (o.optionLabel) await block.getByLabel(o.optionLabel).check();
	await block.getByLabel('Cantidad').selectOption(String(quantity));
	await block.getByLabel('Tu nombre').fill(buyer.name);
	await block.getByLabel(/^Email/).fill(buyer.email);
	// Con puntos, como lo escribiría una persona: el servidor guarda solo los dígitos.
	await block.getByLabel(/^DNI/).fill(dotted(buyer.dni));
	const holders = block.locator('fieldset.holder');
	await expect(holders).toHaveCount(quantity);
	// La entrada 1 viene con el nombre de quien compra.
	await expect(holders.nth(0).getByLabel('Nombre', { exact: true })).toHaveValue(buyer.name);
	const people = [{ name: buyer.name, pronouns: 'elle' }];
	await holders
		.nth(0)
		.getByLabel(/^Pronombres/)
		.fill('elle');
	for (let i = 1; i < quantity; i++) {
		// Los pronombres son obligatorios en todas las entradas.
		const person = { name: `Acompañante ${id}-${i + 1}`, pronouns: i === 1 ? 'ella' : 'él' };
		people.push(person);
		await holders.nth(i).getByLabel('Nombre', { exact: true }).fill(person.name);
		await holders
			.nth(i)
			.getByLabel(/^Pronombres/)
			.fill(person.pronouns);
	}
	if (o.code) {
		await block.getByLabel(/Código de descuento/).fill(o.code.toLowerCase());
		await block.getByRole('button', { name: 'Aplicar' }).click();
		await expect(block.getByText(/✓ Código/)).toBeVisible();
	}
	const prices = expected(type, quantity, method, o.discount, o.option);
	if (prices.subtotal - prices.discount > 0) {
		await block
			.getByLabel(method === 'transferencia' ? /Transferencia bancaria/ : /Mercado Pago/)
			.check();
	}
	await block.getByLabel(/18 años/).check();
	await expect(block.getByText(`Total: ${ars(prices.total)}`)).toBeVisible();
	if (o.screenshot) await shots(page, o.screenshot, block);
	if (o.submit !== false) {
		await block.locator('.pay button[type="submit"]').click();
		if (method === 'mercadopago' && prices.total > 0) {
			await expect(page).toHaveURL(/\/entradas\/simular-pago\/[0-9a-f-]{36}$/);
		}
	}
	return { id, buyer, people, prices };
}

test('compra de 3 con datos por entrada → pago aprobado → QR → admin con DNI → check-in', async ({
	page
}) => {
	const { buyer, people, prices } = await buy(page, { quantity: 3, screenshot: '1-comprar' });
	await expect(page.getByRole('heading', { name: `Pagar ${ars(prices.total)}` })).toBeVisible();
	await shots(page, '2-checkout-simulado');
	await page.getByRole('button', { name: 'Aprobar pago', exact: true }).click();

	await expect(page).toHaveURL(/\/entradas\/[0-9a-f-]{36}\/estado\?/);
	await expect(page.getByRole('heading', { name: /ya tenés tus entradas/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /Ver entrada/ })).toHaveCount(3);
	await expect(page.getByText(`+${ars(prices.surcharge)}`)).toBeVisible();
	await shots(page, '3-compra-exitosa');

	await page.getByRole('link', { name: 'Ver entrada 2 con su QR' }).click();
	await expect(page).toHaveURL(/\/entradas\/t\/[A-Za-z0-9_-]{43}$/);
	await expect(page.locator('.qr svg')).toBeVisible();
	await expect(page.getByText('Válida')).toBeVisible();
	// Nombre y pronombres de esa entrada; el DNI nunca en la página pública.
	await expect(page.getByText(people[1].name)).toBeVisible();
	await expect(page.getByText('ella', { exact: true })).toBeVisible();
	const html = await page.content();
	expect(html).not.toContain(buyer.dni);
	expect(html).not.toContain(dotted(buyer.dni));
	const ticketUrl = page.url();
	await shots(page, '4-entrada');

	// El GIF del QR para el email.
	const gif = await page.request.get(`${ticketUrl}/qr.gif`);
	expect(gif.status()).toBe(200);
	expect(gif.headers()['content-type']).toBe('image/gif');

	await page.goto('/admin/entradas');
	const card = page.locator('.event', { hasText: 'General' }).first();
	await expect(card).toBeVisible();
	await expect(card).toContainText('Fondo usado');
	await expect(card).toContainText('Aportes al fondo');
	await shots(page, '5-admin-lista');

	// El admin del evento muestra cada entrada y el DNI de quien compró.
	await page.goto(`/admin/entradas/${EVENT}`);
	const order = page.locator('.order', { hasText: buyer.email });
	await expect(order.getByText(`DNI ${dotted(buyer.dni)}`)).toBeVisible();
	for (const p of people) await expect(order.getByRole('cell', { name: p.name })).toBeVisible();
	await expect(order).toContainText(`recargo MP +${ars(prices.surcharge)}`);

	// El CSV tiene una fila por entrada, con el DNI de quien compró.
	const csv = await (await page.request.get(`/admin/entradas/${EVENT}/ordenes.csv`)).text();
	expect(csv).toContain(`"${buyer.dni}"`);
	for (const p of people) expect(csv).toContain(`"${p.name}"`);

	await page.goto(`/admin/entradas/${EVENT}/ingreso`);
	await page.getByLabel(/Código de la entrada/).fill(ticketUrl);
	await page.getByRole('button', { name: 'Validar' }).click();
	await expect(page.getByText('✅ Adelante')).toBeVisible();
	await expect(page.getByText(people[1].name)).toBeVisible();
	await expect(page.getByText(`DNI ${dotted(buyer.dni)}`)).toBeVisible();
	await shots(page, '6-checkin-ok');

	await page.getByLabel(/Código de la entrada/).fill(ticketUrl);
	await page.getByRole('button', { name: 'Validar' }).click();
	await expect(page.getByText('⚠️ Ya ingresó')).toBeVisible();
	await shots(page, '7-checkin-ya-ingreso');

	await page.getByLabel(/Código de la entrada/).fill('A'.repeat(43));
	await page.getByRole('button', { name: 'Validar' }).click();
	await expect(page.getByText('❌ QR inválido')).toBeVisible();

	// Búsqueda manual por DNI de quien compró: aparecen sus 3 entradas.
	await page.getByLabel('Buscar entrada').fill(buyer.dni);
	await page.getByRole('button', { name: 'Buscar' }).click();
	await expect(page.locator('.results li')).toHaveCount(3);

	// La entrada ahora figura como usada.
	await page.goto(ticketUrl);
	await expect(page.getByText('Ya se usó para ingresar')).toBeVisible();

	// Accesos de admin: panel y menú de usuario en la página del evento.
	await page.goto('/admin');
	await expect(page.getByRole('link', { name: 'Venta de entradas', exact: true })).toHaveAttribute(
		'href',
		'/admin/entradas'
	);
	await expect(
		page.getByRole('link', { name: 'Códigos de descuento', exact: true })
	).toHaveAttribute('href', '/admin/entradas/codigos');
	await page.goto(`/calendario/${EVENT}`, { waitUntil: 'networkidle' });
	await page.getByText('GorroRojo').first().click();
	await expect(page.getByRole('menuitem', { name: 'Entradas de este evento' })).toHaveAttribute(
		'href',
		`/admin/entradas/${EVENT}`
	);
});

test('datos inválidos: se marcan y no se crea la orden', async ({ page }) => {
	await page.goto(`/calendario/${EVENT}`, { waitUntil: 'networkidle' });
	const block = page.locator('#entradas');
	await block.getByLabel(TYPES.general.label).check();
	await block.getByLabel('Cantidad').selectOption('2');
	await block.getByLabel('Tu nombre').fill('Persona Uno');
	await block.getByLabel(/^Email/).fill('e2e-invalido@example.com');
	await block.getByLabel(/^DNI/).fill('12.345');
	await block
		.locator('fieldset.holder')
		.nth(1)
		.getByLabel('Nombre', { exact: true })
		.fill('Persona Dos');
	await block.getByLabel(/18 años/).check();
	// Sin JavaScript de por medio (el navegador frenaría el envío por los `required`): así se ve
	// qué contesta el servidor con DNI inválido y pronombres vacíos.
	await block.locator('form').evaluate((f) => f.setAttribute('novalidate', ''));
	await block.locator('.pay button[type="submit"]').click();
	await expect(block.getByText('Revisá los datos marcados.')).toBeVisible();
	await expect(block.getByText(/Revisá el DNI/)).toBeVisible();
	await expect(block.getByText('Poné los pronombres de esta persona.')).toHaveCount(2);
	await expect(page).toHaveURL(new RegExp(`/calendario/${EVENT}`));
});

test('recargo de Mercado Pago y fondo: el total cambia en vivo con el medio de pago', async ({
	page
}) => {
	await buy(page, { type: 'fondo', quantity: 2, submit: false });
	const block = page.locator('#entradas');
	await expect(
		block.getByText('💜 Con el descuento del Fondo KinkyVibe ($ 2.000 menos)')
	).toBeVisible();
	const mp = expected('fondo', 2, 'mercadopago');
	const tr = expected('fondo', 2, 'transferencia');
	expect(mp.surcharge).toBeGreaterThan(0);
	await expect(block.getByText('Recargo Mercado Pago')).toBeVisible();
	await expect(block.getByText(`Total: ${ars(mp.total)}`)).toBeVisible();
	await shots(page, '9-recargo-mp', block.locator('.pay'));
	await block.getByLabel(/Transferencia bancaria/).check();
	await expect(block.getByText('Recargo Mercado Pago')).toHaveCount(0);
	await expect(block.getByText(`Total: ${ars(tr.total)}`)).toBeVisible();
	expect(tr.total).toBe(16000);
});

test('código de descuento: 20% con un solo uso, y 100% sin pasar por Mercado Pago', async ({
	page
}) => {
	const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
	const veinte = `E2E20${suffix}`;
	const gratis = `E2EGRATIS${suffix}`;

	await page.goto('/admin/entradas');
	await page.getByRole('link', { name: /Códigos de descuento/ }).click();
	await expect(page).toHaveURL(/\/admin\/entradas\/codigos$/);
	for (const [code, value, max] of [
		[veinte, '20', '1'],
		[gratis, '100', '']
	]) {
		await page.getByRole('textbox', { name: /^Código/ }).fill(code);
		await page.getByLabel('Porcentaje del total').check();
		await page.getByLabel(/^Porcentaje \(1 a 100\)/).fill(value);
		await page.getByLabel('Evento').selectOption(EVENT);
		await page.getByLabel(/Usos máximos/).fill(max);
		await page.getByRole('button', { name: 'Crear código' }).click();
		await expect(page.getByText(`Código ${code} creado.`)).toBeVisible();
	}
	await expect(page.locator('.code', { hasText: veinte })).toContainText('de 1');

	// 20% sobre 2 × $ 8.000, y después el recargo de MP.
	const discount = { kind: /** @type {const} */ ('percent'), value: 20 };
	const { prices } = await buy(page, {
		quantity: 2,
		code: veinte,
		discount,
		screenshot: '8-comprar-con-codigo'
	});
	await expect(page.getByRole('heading', { name: `Pagar ${ars(prices.total)}` })).toBeVisible();
	await page.getByRole('button', { name: 'Aprobar pago', exact: true }).click();
	await expect(page.getByRole('heading', { name: /ya tenés tus entradas/ })).toBeVisible();
	await expect(page.getByText(`−${ars(prices.discount)} (código ${veinte})`)).toBeVisible();

	// Ya se usó su único uso.
	await page.goto(`/calendario/${EVENT}`, { waitUntil: 'networkidle' });
	const block = page.locator('#entradas');
	await block.getByLabel(/Código de descuento/).fill(veinte);
	await block.getByRole('button', { name: 'Aplicar' }).click();
	await expect(block.getByText('Ese código ya se usó todas las veces posibles.')).toBeVisible();

	// 100%: se emiten sin Mercado Pago (y sin recargo).
	await buy(page, {
		quantity: 1,
		code: gratis,
		discount: { kind: 'percent', value: 100 },
		submit: false
	});
	const submit = page.locator('#entradas .pay button[type="submit"]');
	await expect(submit).toHaveText('Confirmar entradas sin cargo');
	await submit.click();
	await expect(page).toHaveURL(/\/entradas\/[0-9a-f-]{36}\/estado$/);
	await expect(page.getByRole('heading', { name: /ya tenés tus entradas/ })).toBeVisible();
	await expect(page.getByText('Sin cargo')).toBeVisible();
	await expect(page.getByRole('link', { name: /Ver entrada/ })).toHaveCount(1);

	await page.goto('/admin/entradas/codigos');
	await expect(page.locator('.code', { hasText: veinte })).toContainText('1 aprobados');
	await expect(page.locator('.code', { hasText: veinte })).toContainText('Sin usos disponibles');
	await shots(page, '10-admin-codigos');
});

test('transferencia (con fondo): datos para transferir → admin confirma → la entrada funciona', async ({
	page
}) => {
	const { people, prices } = await buy(page, {
		type: 'fondo',
		quantity: 2,
		method: 'transferencia',
		screenshot: '11-comprar-transferencia'
	});
	expect(prices).toMatchObject({ fondo: 4000, surcharge: 0, total: 16000 });
	await expect(page).toHaveURL(/\/entradas\/[0-9a-f-]{36}\/estado$/);
	await expect(page.getByRole('heading', { name: /falta la transferencia/ })).toBeVisible();
	await expect(page.getByText(TRANSFER_INFO.split('\\n')[0])).toBeVisible();
	await expect(page.locator('.amount')).toHaveText(ars(16000));
	const reference = await page.locator('.reference').innerText();
	expect(reference).toMatch(/^KV-[0-9A-F]{8}$/);
	const statusUrl = page.url();
	await shots(page, '12-datos-transferencia');

	await page.goto(`/admin/entradas/${EVENT}`);
	const pending = page.locator('.transfers .order', { hasText: reference });
	await expect(pending).toBeVisible();
	await shots(page, '13-transferencias-pendientes', page.locator('.transfers'));
	await pending.getByRole('button', { name: 'Confirmar pago' }).click();
	await expect(page.getByText(`Pago de ${reference} confirmado`)).toBeVisible();
	await expect(page.locator('.transfers .order', { hasText: reference })).toHaveCount(0);

	// Confirmar de nuevo (p. ej. desde otra pestaña): no emite nada.
	const res = await page.request.post(`/admin/entradas/${EVENT}?/confirm`, {
		form: { order: statusUrl.split('/').at(-2) ?? '' },
		headers: { origin: 'http://localhost:5371', 'x-sveltekit-action': 'true' }
	});
	expect(await res.text()).toContain('ya estaba confirmada');

	await page.goto(statusUrl);
	await expect(page.getByRole('heading', { name: /ya tenés tus entradas/ })).toBeVisible();
	await expect(page.getByText('−$ 4.000 💜')).toBeVisible();
	await expect(page.getByRole('link', { name: /Ver entrada/ })).toHaveCount(2);
	await page.getByRole('link', { name: 'Ver entrada 2 con su QR' }).click();
	await expect(page.getByText('Válida')).toBeVisible();
	await expect(page.getByText(people[1].name)).toBeVisible();
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
			dni: '12345678',
			holder_name_0: 'Persona Tramposa',
			holder_pronouns_0: 'elle',
			method: 'mercadopago',
			accept: 'on',
			price: '1',
			unit_price: '1',
			total: '1',
			discount_amount: '8000',
			surcharge_amount: '0',
			fondo_amount: '8000',
			fondo_contribution: '-5000'
		},
		headers: { origin: 'http://localhost:5371' },
		maxRedirects: 0
	});
	// Form action: SvelteKit contesta con la redirección al checkout simulado.
	const location = res.headers()['location'] ?? (await res.json()).location;
	expect(location).toMatch(/\/entradas\/simular-pago\//);
	await page.goto(location);
	const { total } = expected('general', 1, 'mercadopago');
	await expect(page.getByRole('heading', { name: `Pagar ${ars(total)}` })).toBeVisible();
});

test('el evento de prueba muestra el aviso, el fondo y los dos medios de pago', async ({
	page
}) => {
	await page.goto('/calendario/prueba-entradas-2026-12', { waitUntil: 'networkidle' });
	await expect(page.getByText(/BORRAR ANTES DE VENDER DE VERDAD/)).toBeVisible();
	const block = page.locator('#entradas');
	// fondo_percent: 20 → General $ 10.000 se ve a $ 8.000 (el completo, tachado).
	const general = block.locator('label.type', { hasText: 'General' });
	await expect(general.locator('s')).toHaveText('$ 10.000');
	await expect(general.locator('strong')).toHaveText('$ 8.000');
	await block.getByLabel(/General/).check();
	const options = block.locator('fieldset.options');
	await expect(options.getByRole('radio')).toHaveCount(5);
	await expect(options.getByLabel(/Con el descuento del fondo/)).toBeChecked();
	await expect(options.locator('label.option', { hasText: 'Entrada Sugar' })).toContainText(
		'$ 15.000'
	);
	// Reducida tiene `fondo: 0`: no se ofrece el descuento del fondo.
	await block.getByLabel(/Reducida/).check();
	await expect(options.getByRole('radio')).toHaveCount(4);
	await expect(options.getByLabel(/Precio completo/)).toBeChecked();
	await block.getByLabel(/General/).check();
	await expect(block.getByLabel(/Transferencia bancaria/)).toBeVisible();
	await expect(block.locator('label.method', { hasText: 'Transferencia' })).toContainText(
		'te reservamos el lugar 48 horas mientras mandás el comprobante por mail'
	);
	await block.getByText('Condiciones de compra y devoluciones').click();
	await expect(block.getByText(/5 días hábiles previos al evento/)).toBeVisible();
	await shots(page, '0-evento-de-prueba');
});

test('entrada solidaria: +10 % para el fondo, en el total y en "Aportes al fondo" del admin', async ({
	page
}) => {
	const card = page.locator(`a.event[href="/admin/entradas/${EVENT}"]`);
	/** @returns {Promise<number>} */
	const contributions = async () => {
		await page.goto('/admin/entradas');
		const text = await card.locator('.fondo-contribution').innerText();
		return Number(text.replace(/[^0-9]/g, ''));
	};
	const before = await contributions();

	// Con fondo ($ 10.000, fondo $ 2.000), 2 entradas solidarias: 2 × $ 11.000 + recargo MP.
	const { prices } = await buy(page, {
		type: 'fondo',
		quantity: 2,
		option: 'solidaria',
		optionLabel: /Entrada solidaria/,
		submit: false
	});
	expect(prices).toMatchObject({ fondo: 0, contribution: 2000, subtotal: 22000 });
	const block = page.locator('#entradas');
	await expect(block.getByText('💜 Incluye $ 2.000 de aporte al Fondo KinkyVibe')).toBeVisible();
	await expect(block.locator('fieldset.options')).toContainText(
		'lo que pagás de más va entero al fondo'
	);
	await shots(page, '14-checkout-solidaria', block);
	await block.locator('.pay button[type="submit"]').click();
	await expect(page).toHaveURL(/\/entradas\/simular-pago\/[0-9a-f-]{36}$/);
	await expect(page.getByRole('heading', { name: `Pagar ${ars(prices.total)}` })).toBeVisible();
	await page.getByRole('button', { name: 'Aprobar pago', exact: true }).click();
	await expect(page.getByRole('heading', { name: /ya tenés tus entradas/ })).toBeVisible();
	await expect(page.getByText('+$ 2.000 💜 · Entrada solidaria (+10 %)')).toBeVisible();

	expect(await contributions()).toBe(before + 2000);
	await expect(card).toContainText('Fondo usado');
	await shots(page, '15-admin-totales', card);
	await page.goto(`/admin/entradas/${EVENT}`);
	await expect(page.locator('table.summary')).toContainText('Aportes al fondo');
	await shots(page, '16-admin-evento-totales', page.locator('table.summary'));
});

test('el formulario sobrevive a una recarga (sessionStorage) y se borra al comprar', async ({
	page
}) => {
	await page.goto(`/calendario/${EVENT}`, { waitUntil: 'networkidle' });
	const block = page.locator('#entradas');
	await block.getByLabel(TYPES.fondo.label).check();
	await block.getByLabel(/Entrada muy solidaria/).check();
	await block.getByLabel('Cantidad').selectOption('2');
	await block.getByLabel('Tu nombre').fill('Persona Recarga');
	await block.getByLabel(/^Email/).fill('e2e-recarga@example.com');
	await block.getByLabel(/^DNI/).fill('22.333.444');
	const holders = block.locator('fieldset.holder');
	await holders
		.nth(0)
		.getByLabel(/^Pronombres/)
		.fill('elle');
	await holders.nth(1).getByLabel('Nombre', { exact: true }).fill('Acompañante Recarga');
	await holders
		.nth(1)
		.getByLabel(/^Pronombres/)
		.fill('ella');

	// El "?" de pronombres abre pronombr.es en otra pestaña (no se pierde lo escrito).
	const help = holders.nth(0).getByRole('link', { name: /Qué son los pronombres/ });
	await expect(help).toHaveAttribute('href', 'https://pronombr.es');
	await expect(help).toHaveAttribute('target', '_blank');
	await expect(help).toHaveAttribute('rel', /noopener/);
	await shots(page, '17-checkout-pronombres', block);

	// Nunca en localStorage.
	expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('22.333.444');

	await page.reload({ waitUntil: 'networkidle' });
	await expect(block.getByLabel(TYPES.fondo.label)).toBeChecked();
	await expect(block.getByLabel(/Entrada muy solidaria/)).toBeChecked();
	await expect(block.getByLabel('Cantidad')).toHaveValue('2');
	await expect(block.getByLabel('Tu nombre')).toHaveValue('Persona Recarga');
	await expect(block.getByLabel(/^Email/)).toHaveValue('e2e-recarga@example.com');
	await expect(block.getByLabel(/^DNI/)).toHaveValue('22.333.444');
	await expect(holders.nth(0).getByLabel('Nombre', { exact: true })).toHaveValue('Persona Recarga');
	await expect(holders.nth(0).getByLabel(/^Pronombres/)).toHaveValue('elle');
	await expect(holders.nth(1).getByLabel('Nombre', { exact: true })).toHaveValue(
		'Acompañante Recarga'
	);
	await expect(holders.nth(1).getByLabel(/^Pronombres/)).toHaveValue('ella');
	// La casilla de +18 no se guarda.
	await expect(block.getByLabel(/18 años/)).not.toBeChecked();

	// Al comprar se borra el borrador.
	await block.getByLabel(/Transferencia bancaria/).check();
	await block.getByLabel(/18 años/).check();
	const { total } = expected('fondo', 2, 'transferencia', null, 'muy-solidaria');
	expect(total).toBe(26000);
	await expect(block.getByText(`Total: ${ars(total)}`)).toBeVisible();
	await block.locator('.pay button[type="submit"]').click();
	await expect(page).toHaveURL(/\/entradas\/[0-9a-f-]{36}\/estado$/);
	await expect(page.locator('.amount')).toHaveText(ars(26000));
	await expect(page.getByText(/te reservamos el lugar\s+48 horas/)).toBeVisible();
	await page.goto(`/calendario/${EVENT}`, { waitUntil: 'networkidle' });
	await expect(page.locator('#entradas').getByLabel('Tu nombre')).toHaveValue('');
});
