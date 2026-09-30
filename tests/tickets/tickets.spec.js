import { expect, test } from '@playwright/test';
import { computePrice } from '../../src/lib/utils/tickets.js';
import { MP_FEE_PERCENT, TRANSFER_INFO, ticketsE2EEvent } from './event.js';
import { AGE_OK, ars, dotted, fakeDni, shots } from './helpers.js';

const EVENT = ticketsE2EEvent();
const BUY_URL = `/calendario/${EVENT}/entradas`;
const FEE_BP = Math.round(Number(MP_FEE_PERCENT) * 100);
// Fixture (TICKETS_DEV_FIXTURE): fondo_percent 20 en todos los tipos.
const TYPES = {
	general: { label: /General/, price: 10000, fondo: 2000 },
	anticipada: { label: /Anticipada/, price: 8000, fondo: 1600 }
};

test.beforeEach(async ({ page }) => {
	await page.addInitScript(AGE_OK);
});

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
	await page.goto(BUY_URL, { waitUntil: 'networkidle' });
	const block = page.locator('#entradas');
	await expect(block.getByRole('heading', { name: 'Comprar entradas' })).toBeVisible();
	await block.getByLabel(TYPES[type].label).check();
	if (o.optionLabel) await block.getByLabel(o.optionLabel).check();
	await block.getByLabel('Cantidad').fill(String(quantity));
	await block.getByLabel('Tu nombre').fill(buyer.name);
	await block.getByLabel('Tus pronombres').fill('elle');
	await block.getByLabel(/^Email/).fill(buyer.email);
	// Con puntos, como lo escribiría una persona: el servidor guarda solo los dígitos.
	await block.getByLabel(/^DNI/).fill(dotted(buyer.dni));
	const holders = block.locator('fieldset.holder');
	await expect(holders).toHaveCount(quantity);
	// La entrada 1 viene con el nombre y los pronombres de quien compra.
	await expect(holders.nth(0).getByLabel('Nombre', { exact: true })).toHaveValue(buyer.name);
	await expect(holders.nth(0).getByLabel(/^Pronombres/)).toHaveValue('elle');
	const people = [{ name: buyer.name, pronouns: 'elle' }];
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
		await block.getByLabel(method === 'transferencia' ? /Transferencia/ : /Mercado Pago/).check();
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
	const { buyer, people, prices } = await buy(page, { quantity: 3 });
	await expect(page.getByRole('heading', { name: `Pagar ${ars(prices.total)}` })).toBeVisible();
	await page.getByRole('button', { name: 'Aprobar pago', exact: true }).click();

	await expect(page).toHaveURL(/\/entradas\/[0-9a-f-]{36}\/estado\?/);
	await expect(page.getByRole('heading', { name: /ya tenés tus entradas/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /Ver entrada/ })).toHaveCount(3);
	await expect(page.getByText(`+${ars(prices.surcharge)}`)).toBeVisible();

	await page.getByRole('link', { name: 'Ver entrada 2 con su QR' }).click();
	await expect(page).toHaveURL(/\/entradas\/t\/[A-Za-z0-9_-]{43}$/);
	await expect(page.locator('.qr svg')).toBeVisible();
	await expect(page.getByText('Válida')).toBeVisible();
	// El código corto, grande, al lado del QR (para tipearlo si el QR no se puede escanear).
	const shownCode = await page.locator('.code-value').innerText();
	expect(shownCode.replace(/\s/g, '')).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
	const qrBox = await page.locator('.qr').boundingBox();
	const codeBox = await page.locator('.code').boundingBox();
	expect(codeBox && qrBox && codeBox.x > qrBox.x + qrBox.width - 1).toBe(true);
	// Nombre y pronombres de esa entrada; el DNI nunca en la página pública.
	await expect(page.getByText(people[1].name)).toBeVisible();
	await expect(page.getByText('ella', { exact: true })).toBeVisible();
	const html = await page.content();
	expect(html).not.toContain(buyer.dni);
	expect(html).not.toContain(dotted(buyer.dni));
	const ticketUrl = page.url();
	await shots(page, '07-entrada-con-codigo', page.locator('article.ticket'));

	// El GIF del QR para el email.
	const gif = await page.request.get(`${ticketUrl}/qr.gif`);
	expect(gif.status()).toBe(200);
	expect(gif.headers()['content-type']).toBe('image/gif');

	await page.goto('/admin/entradas');
	const card = page.locator('.event', { hasText: 'General' }).first();
	await expect(card).toBeVisible();
	await expect(card).toContainText('Fondo usado');
	await expect(card).toContainText('Aportes al fondo');
	await expect(card).toContainText('Neto del fondo');
	// 3 entradas "con el descuento del fondo": el neto es negativo (el fondo puso, nadie aportó).
	await expect(card.locator('.fondo-net')).toHaveText(/^[−+]?\$\s[\d.]+$/);

	// La pestaña Órdenes de la ficha muestra cada entrada y el DNI de quien compró.
	await page.goto(`/admin/eventos/${EVENT}/ordenes`);
	const order = page.locator('.order', { hasText: buyer.email });
	await expect(order.getByText(`DNI ${dotted(buyer.dni)}`)).toBeVisible();
	for (const p of people) await expect(order.getByRole('cell', { name: p.name })).toBeVisible();
	await expect(order).toContainText(`recargo MP +${ars(prices.surcharge)}`);

	// El CSV tiene una fila por entrada, con el DNI de quien compró.
	const csv = await (await page.request.get(`/admin/eventos/${EVENT}/ordenes.csv`)).text();
	expect(csv).toContain(`"${buyer.dni}"`);
	for (const p of people) expect(csv).toContain(`"${p.name}"`);

	// Modo puerta: "Escribir código" abre una hoja con el campo y "Validar".
	await page.goto(`/admin/eventos/${EVENT}/ingreso`, { waitUntil: 'networkidle' });
	/** @param {string} value */
	const validate = async (value) => {
		await page.getByRole('button', { name: 'Escribir código' }).click();
		await page.getByLabel(/Código de la entrada/).fill(value);
		await page.getByRole('button', { name: 'Validar' }).click();
	};
	const result = page.locator('.result');
	// El código corto (en minúsculas, con "KV-" y un espacio: se normaliza) sirve igual que el QR.
	await validate(`kv-${shownCode.toLowerCase()}`);
	await expect(result).toContainText('Adelante');
	await expect(result).toContainText(people[1].name);
	await expect(result).toContainText(buyer.email);
	// DNI parcial (últimos 3); al tocarlo se ve completo (y queda en el registro de actividad).
	await expect(result).toContainText(`DNI •••.${buyer.dni.slice(-3)}`);
	await expect(result).not.toContainText(dotted(buyer.dni));
	await result.getByRole('button', { name: /DNI •••/ }).click();
	await expect(result).toContainText(`DNI ${dotted(buyer.dni)}`);
	// Tocar el resultado abre la compra completa, con todas sus entradas.
	await result.getByRole('button', { name: /Ver compra/ }).click();
	const sheet = page.getByRole('dialog', { name: /Compra KV-/ });
	for (const p of people) await expect(sheet).toContainText(p.name);
	await sheet.getByRole('button', { name: 'Cerrar' }).click();

	await validate(ticketUrl);
	await expect(result).toContainText('Ya ingresó');

	await validate('A'.repeat(43));
	await expect(result).toContainText('QR inválido');

	// "Buscar persona": por DNI de quien compró aparecen sus 3 entradas (el DNI, parcial).
	await page.getByRole('button', { name: 'Buscar persona' }).click();
	const search = page.getByRole('combobox', { name: 'Buscar entrada' });
	const listbox = page.getByRole('listbox', { name: 'Sugerencias' });
	await search.pressSequentially(buyer.dni, { delay: 20 });
	await expect(listbox.getByRole('option')).toHaveCount(3);
	await expect(listbox).not.toContainText(dotted(buyer.dni));

	// Autocompletar: sin tildes ("acompanante" encuentra "Acompañante"), dice con qué coincidió,
	// y se elige con el teclado: marca el ingreso de esa persona.
	await search.fill('');
	await search.pressSequentially(`acompanante ${people[2].name.split(' ')[1].toLowerCase()}`, {
		delay: 20
	});
	const option = listbox.getByRole('option', { name: new RegExp(people[2].name) });
	await expect(option).toContainText('coincide con nombre de la entrada');
	await shots(page, '08-checkin-autocompletar', undefined, { fullPage: false });
	await search.press('ArrowDown');
	await expect(search).toHaveAttribute('aria-activedescendant', 'sugerencia-0');
	await search.press('Enter');
	await expect(result).toContainText('Adelante');
	await expect(result).toContainText(people[2].name);
	// Por email de quien compró (parte del medio).
	await page.getByRole('button', { name: 'Buscar persona' }).click();
	await search.pressSequentially(buyer.email.split('@')[0], { delay: 20 });
	await expect(listbox.getByRole('option').first()).toContainText('coincide con email');
	await page
		.getByRole('dialog', { name: 'Buscar persona' })
		.getByRole('button', { name: 'Cerrar' })
		.click();

	// La entrada ahora figura como usada.
	await page.goto(ticketUrl);
	await expect(page.getByText('Ya se usó para ingresar')).toBeVisible();

	// Accesos de admin: panel y menú de usuario en la página del evento.
	// El Inicio del panel: acciones rápidas y la plata del mes llevan a las páginas de entradas.
	await page.goto('/admin');
	const quick = page.getByRole('navigation', { name: 'Acciones rápidas' });
	await expect(quick.getByRole('link', { name: 'Nuevo código' })).toHaveAttribute(
		'href',
		'/admin/entradas/codigos'
	);
	await expect(quick.getByRole('link', { name: 'Cargar evento' })).toHaveAttribute(
		'href',
		'/admin/eventos/nuevo'
	);
	await expect(page.locator('a.stat', { hasText: 'Entradas este mes' })).toHaveAttribute(
		'href',
		'/admin/entradas'
	);
	await page.goto(`/calendario/${EVENT}`, { waitUntil: 'networkidle' });
	await page.getByText('GorroRojo').first().click();
	await expect(page.getByRole('menuitem', { name: 'Este evento en el panel' })).toHaveAttribute(
		'href',
		`/admin/eventos/${EVENT}/ventas`
	);
});

test('datos inválidos: se marcan y no se crea la orden', async ({ page }) => {
	await page.goto(BUY_URL, { waitUntil: 'networkidle' });
	const block = page.locator('#entradas');
	await block.getByLabel(TYPES.general.label).check();
	await block.getByRole('button', { name: 'Una entrada más' }).click();
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
	// Tus pronombres vacíos (la entrada 1 los toma de ahí) y los de la entrada 2.
	await expect(block.getByText('Poné tus pronombres.')).toHaveCount(1);
	await expect(block.getByText('Poné los pronombres de esta persona.')).toHaveCount(2);
	await expect(page).toHaveURL(new RegExp(`/calendario/${EVENT}/entradas`));
});

test('recargo de Mercado Pago y fondo: el total cambia en vivo con el medio de pago', async ({
	page
}) => {
	await buy(page, { type: 'general', quantity: 2, submit: false });
	const block = page.locator('#entradas');
	await expect(
		block.getByText('💜 Con el descuento del Fondo KinkyVibe ($ 2.000 menos)')
	).toBeVisible();
	// Horario de la venta (el fixture cierra en 30 días), en hora de Argentina.
	await expect(block.locator('.closes')).toHaveText(
		/^La venta cierra el [a-záéíóúñ]+ \d{1,2}\/\d{1,2} a las \d{2}:\d{2}\.$/
	);
	const mp = expected('general', 2, 'mercadopago');
	const tr = expected('general', 2, 'transferencia');
	expect(mp.surcharge).toBeGreaterThan(0);
	await expect(block.getByText('Recargo Mercado Pago')).toBeVisible();
	await expect(block.getByText(`Total: ${ars(mp.total)}`)).toBeVisible();
	await block.getByLabel(/Transferencia/).check();
	await expect(block.getByText('Recargo Mercado Pago')).toHaveCount(0);
	await expect(block.getByText(`Total: ${ars(tr.total)}`)).toBeVisible();
	expect(tr.total).toBe(16000);
});

test('medio de pago: elegir uno no mueve nada (sin saltos de layout)', async ({ page }) => {
	for (const width of [390, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await buy(page, { type: 'general', quantity: 1, submit: false });
		const block = page.locator('#entradas');
		const methods = block.locator('fieldset.methods');
		// Lo que se mide: las tarjetas, la explicación, el total, el botón y el formulario entero.
		const measure = async () => ({
			cards: await block.locator('.method-cards').boundingBox(),
			notes: await block.locator('.method-notes').boundingBox(),
			pay: await block.locator('.pay').boundingBox(),
			button: await block.locator('.pay button[type="submit"]').boundingBox(),
			form: await block.locator('form').boundingBox(),
			scrollY: await page.evaluate(() => window.scrollY)
		});
		await methods.scrollIntoViewIfNeeded();
		await block.getByLabel(/Mercado Pago/).check();
		const before = await measure();
		await block.getByLabel(/Transferencia/).check();
		await expect(block.locator('.method-note.shown')).toContainText('Sin recargo');
		expect(await measure()).toEqual(before);
		await block.getByLabel(/Mercado Pago/).check();
		await expect(block.locator('.method-note.shown')).toContainText('20 minutos');
		expect(await measure()).toEqual(before);
	}
	// Capturas (cambiar el tamaño de la ventana mueve todo: por eso van al final).
	const methods = page.locator('#entradas fieldset.methods');
	await shots(page, '05-medio-de-pago-1-mercadopago', methods);
	await page
		.locator('#entradas')
		.getByLabel(/Transferencia/)
		.check();
	await shots(page, '05-medio-de-pago-2-transferencia', methods);
});

test('cantidad: − / + y se puede tipear, entre 1 y las disponibles', async ({ page }) => {
	await page.goto(BUY_URL, { waitUntil: 'networkidle' });
	const block = page.locator('#entradas');
	await block.getByLabel(TYPES.anticipada.label).check();
	const qty = block.getByLabel('Cantidad');
	const minus = block.getByRole('button', { name: 'Una entrada menos' });
	const plus = block.getByRole('button', { name: 'Una entrada más' });
	await expect(qty).toHaveValue('1');
	await expect(minus).toBeDisabled();
	// Botones grandes para el dedo.
	const box = await plus.boundingBox();
	expect(box && box.width >= 44 && box.height >= 44).toBe(true);
	await plus.click();
	await plus.click();
	await expect(qty).toHaveValue('3');
	await expect(block.locator('fieldset.holder')).toHaveCount(3);
	// Anticipada tiene cupo 3 (si en otra corrida se vendió alguna, el máximo es menor).
	const max = Number(await qty.getAttribute('max'));
	expect(max).toBeLessThanOrEqual(3);
	if (max === 3) await expect(plus).toBeDisabled();
	await shots(page, '06-cantidad', block.locator('.stepper').locator('..'));
	await minus.click();
	await expect(qty).toHaveValue('2');
	await expect(block.locator('fieldset.holder')).toHaveCount(2);
	// Tipear un número de más se corrige al máximo al salir del campo.
	await qty.fill('50');
	await qty.blur();
	await expect(qty).toHaveValue(String(max));
	await block.getByLabel(TYPES.general.label).check();
	await qty.fill('7');
	await expect(block.locator('fieldset.holder')).toHaveCount(7);
	// Sin el texto "¿Necesitás más de 20?" ni el de privacidad.
	await expect(block).not.toContainText('Necesitás más de');
	await expect(block).not.toContainText('Guardamos tu nombre, email y DNI');
});

test('pronombres de quien compra: obligatorios y copiados a la entrada 1 hasta editarla', async ({
	page
}) => {
	await page.goto(BUY_URL, { waitUntil: 'networkidle' });
	const block = page.locator('#entradas');
	const mine = block.getByLabel('Tus pronombres');
	await expect(mine).toHaveAttribute('required', '');
	const first = block
		.locator('fieldset.holder')
		.nth(0)
		.getByLabel(/^Pronombres/);
	await mine.fill('ella');
	await expect(first).toHaveValue('ella');
	await first.fill('ella / elle');
	await mine.fill('elle');
	await expect(first).toHaveValue('ella / elle');
	// El "?" de pronombres es discreto: texto chiquito y gris, sin fondo de color.
	const help = block.getByRole('link', { name: /Qué son los pronombres/ }).first();
	const style = await help.evaluate((el) => {
		const cs = getComputedStyle(el);
		return {
			bg: cs.backgroundColor,
			size: parseFloat(cs.fontSize),
			label: parseFloat(
				getComputedStyle(/** @type {HTMLElement} */ (el.previousElementSibling)).fontSize
			)
		};
	});
	expect(style.bg).toBe('rgba(0, 0, 0, 0)');
	expect(style.size).toBeLessThan(style.label);
});

test('código de descuento: 20% con un solo uso, y 100% sin pasar por Mercado Pago', async ({
	page
}) => {
	const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
	const veinte = `E2E20${suffix}`;
	const gratis = `E2EGRATIS${suffix}`;

	await page.goto('/admin/entradas');
	await expect(page.getByRole('link', { name: /Códigos de descuento/ })).toHaveAttribute(
		'href',
		'/admin/entradas/codigos'
	);
	// Con la página ya hidratada (si no, a veces se envía el formulario sin los datos).
	await page.goto('/admin/entradas/codigos', { waitUntil: 'networkidle' });
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
	const { prices } = await buy(page, { quantity: 2, code: veinte, discount });
	await expect(page.getByRole('heading', { name: `Pagar ${ars(prices.total)}` })).toBeVisible();
	await page.getByRole('button', { name: 'Aprobar pago', exact: true }).click();
	await expect(page.getByRole('heading', { name: /ya tenés tus entradas/ })).toBeVisible();
	await expect(page.getByText(`−${ars(prices.discount)} (código ${veinte})`)).toBeVisible();

	// Ya se usó su único uso.
	await page.goto(BUY_URL, { waitUntil: 'networkidle' });
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
});

test('transferencia (con fondo): datos para transferir → admin confirma → la entrada funciona', async ({
	page
}) => {
	const { people, prices } = await buy(page, {
		type: 'general',
		quantity: 2,
		method: 'transferencia'
	});
	expect(prices).toMatchObject({ fondo: 4000, surcharge: 0, total: 16000 });
	await expect(page).toHaveURL(/\/entradas\/[0-9a-f-]{36}\/estado$/);
	await expect(page.getByRole('heading', { name: /falta la transferencia/ })).toBeVisible();
	await expect(page.getByText(TRANSFER_INFO.split('\\n')[0])).toBeVisible();
	await expect(page.locator('.amount')).toHaveText(ars(16000));
	const reference = await page.locator('.reference').innerText();
	expect(reference).toMatch(/^KV-[0-9A-F]{8}$/);
	const statusUrl = page.url();

	await page.goto(`/admin/eventos/${EVENT}/transferencias`);
	const pending = page.locator('.transfers .order', { hasText: reference });
	await expect(pending).toBeVisible();
	await pending.getByRole('button', { name: 'Confirmar pago' }).click();
	await expect(page.getByText(`Pago de ${reference} confirmado`)).toBeVisible();
	await expect(page.locator('.transfers .order', { hasText: reference })).toHaveCount(0);

	// Confirmar de nuevo (p. ej. desde otra pestaña): no emite nada.
	const res = await page.request.post(`/admin/eventos/${EVENT}/transferencias?/confirm`, {
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
	await page.goto(BUY_URL);
	const res = await page.request.post(`${BUY_URL}?/buy`, {
		form: {
			type: 'general',
			quantity: '1',
			name: 'Persona Tramposa',
			pronouns: 'elle',
			email: `tramposa-${Date.now()}@example.com`,
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

test('el evento de prueba: botón en la página del evento → página de compra con el fondo en todos los tipos', async ({
	page
}) => {
	await page.goto('/calendario/prueba-entradas-2026-12', { waitUntil: 'networkidle' });
	await expect(page.getByText(/BORRAR ANTES DE VENDER DE VERDAD/)).toBeVisible();
	// El formulario ya no está en la página del evento: hay un botón con el precio "desde".
	await expect(page.locator('form input[name="dni"]')).toHaveCount(0);
	const cta = page.locator('.buy-button');
	await expect(cta).toContainText('Comprar entradas');
	await expect(cta).toContainText('desde $ 6.400');
	await expect(cta).toHaveAttribute('href', '/calendario/prueba-entradas-2026-12/entradas');
	await shots(page, '01-evento-boton', undefined, { fullPage: false, scrollTo: cta });
	await cta.click();
	await expect(page).toHaveURL(/\/calendario\/prueba-entradas-2026-12\/entradas$/);
	// Encabezado compacto del evento arriba del formulario.
	await expect(page.locator('.event-mini h1')).toHaveText('Evento de prueba: entradas');
	await expect(page.locator('.event-mini')).toContainText('Lugar de prueba');
	await expect(page.locator('.event-mini')).toContainText('2026');
	await shots(page, '02-compra-arriba', undefined, { fullPage: false });
	const block = page.locator('#entradas');
	// fondo_percent: 20 → General $ 10.000 se ve a $ 8.000 y Anticipada $ 8.000 a $ 6.400.
	const general = block.locator('label.type', { hasText: 'General' });
	await expect(general.locator('s')).toHaveText('$ 10.000');
	await expect(general.locator('strong')).toHaveText('$ 8.000');
	const anticipada = block.locator('label.type', { hasText: 'Anticipada' });
	await expect(anticipada.locator('strong')).toHaveText('$ 6.400');
	await expect(block).not.toContainText('Reducida');
	await block.getByLabel(/General/).check();
	const options = block.locator('fieldset.options');
	await expect(options.getByRole('radio')).toHaveCount(5);
	await expect(options.getByLabel(/Con el descuento del fondo/)).toBeChecked();
	await expect(options.locator('label.option', { hasText: 'Entrada Sugar' })).toContainText(
		'$ 15.000'
	);
	// El fondo aplica también a Anticipada.
	await block.getByLabel(/Anticipada/).check();
	await expect(options.getByRole('radio')).toHaveCount(5);
	await expect(options.getByLabel(/Con el descuento del fondo/)).toBeChecked();
	await block.getByLabel(/Transferencia/).check();
	await expect(block.locator('.method-note.shown')).toContainText(
		'Confirmando la reserva desde el mail, te guardamos el lugar 48 horas mientras mandás el comprobante por mail'
	);
	// Condiciones: una sola lista con el mismo formato, devoluciones incluidas.
	await block.getByText('Condiciones de compra y devoluciones').click();
	const conditions = block.locator('details.conditions > ul > li');
	expect(await conditions.count()).toBeGreaterThanOrEqual(5);
	await expect(block.locator('details.conditions')).toContainText(
		'5 días hábiles antes del evento'
	);
	await expect(block.locator('details.conditions')).toContainText(
		'escribinos a kinkyvibe.talleres@gmail.com con su nombre, sus pronombres y su email'
	);
	await expect(block.locator('details.conditions p')).toHaveCount(0);
});

test('entrada solidaria: +10 % para el fondo, en el total y en "Aportes al fondo" del admin', async ({
	page
}) => {
	const card = page.locator(`a.event[href="/admin/eventos/${EVENT}/ventas"]`);
	/** @returns {Promise<number>} */
	const contributions = async () => {
		await page.goto('/admin/entradas');
		const text = await card.locator('.fondo-contribution').innerText();
		return Number(text.replace(/[^0-9]/g, ''));
	};
	const before = await contributions();

	// Con fondo ($ 10.000, fondo $ 2.000), 2 entradas solidarias: 2 × $ 11.000 + recargo MP.
	const { prices } = await buy(page, {
		type: 'general',
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
	await block.locator('.pay button[type="submit"]').click();
	await expect(page).toHaveURL(/\/entradas\/simular-pago\/[0-9a-f-]{36}$/);
	await expect(page.getByRole('heading', { name: `Pagar ${ars(prices.total)}` })).toBeVisible();
	await page.getByRole('button', { name: 'Aprobar pago', exact: true }).click();
	await expect(page.getByRole('heading', { name: /ya tenés tus entradas/ })).toBeVisible();
	await expect(page.getByText('+$ 2.000 💜 · Entrada solidaria (+10 %)')).toBeVisible();

	expect(await contributions()).toBe(before + 2000);
	await expect(card).toContainText('Fondo usado');
	// Neto del fondo = aportes − fondo usado, con signo y color.
	const net = card.locator('.fondo-net');
	const netText = await net.innerText();
	const netValue = Number(netText.replace(/[^0-9]/g, '')) * (netText.startsWith('−') ? -1 : 1);
	await expect(net).toHaveClass(netValue < 0 ? /neg/ : netValue > 0 ? /pos/ : /fondo-net/);
	await shots(page, '10-admin-fondo-neto-lista', card);
	// Pestaña Ventas de la ficha: la tabla del Fondo, con el neto en el pie.
	await page.goto(`/admin/eventos/${EVENT}/ventas`);
	const summary = page.locator('table.summary');
	await expect(summary).toContainText('Aportes al fondo');
	await expect(summary.locator('tfoot')).toContainText('Neto del fondo');
	await expect(summary.locator('tfoot .net')).toHaveText(netText);
	await shots(page, '10-admin-fondo-neto-evento', summary);
});

test('el formulario sobrevive a una recarga (sessionStorage) y se borra al comprar', async ({
	page
}) => {
	await page.goto(BUY_URL, { waitUntil: 'networkidle' });
	const block = page.locator('#entradas');
	await block.getByLabel(TYPES.general.label).check();
	await block.getByLabel(/Entrada muy solidaria/).check();
	await block.getByRole('button', { name: 'Una entrada más' }).click();
	await block.getByLabel('Tu nombre').fill('Persona Recarga');
	await block.getByLabel('Tus pronombres').fill('elle');
	const recargaEmail = `e2e-recarga-${Date.now()}@example.com`;
	await block.getByLabel(/^Email/).fill(recargaEmail);
	await block.getByLabel(/^DNI/).fill('22.333.444');
	const holders = block.locator('fieldset.holder');
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

	// Nunca en localStorage.
	expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('22.333.444');

	await page.reload({ waitUntil: 'networkidle' });
	await expect(block.getByLabel(TYPES.general.label)).toBeChecked();
	await expect(block.getByLabel(/Entrada muy solidaria/)).toBeChecked();
	await expect(block.getByLabel('Cantidad')).toHaveValue('2');
	await expect(block.getByLabel('Tu nombre')).toHaveValue('Persona Recarga');
	await expect(block.getByLabel('Tus pronombres')).toHaveValue('elle');
	await expect(block.getByLabel(/^Email/)).toHaveValue(recargaEmail);
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
	await block.getByLabel(/Transferencia/).check();
	await block.getByLabel(/18 años/).check();
	const { total } = expected('general', 2, 'transferencia', null, 'muy-solidaria');
	expect(total).toBe(26000);
	await expect(block.getByText(`Total: ${ars(total)}`)).toBeVisible();
	await block.locator('.pay button[type="submit"]').click();
	await expect(page).toHaveURL(/\/entradas\/[0-9a-f-]{36}\/estado$/);
	await expect(page.locator('.amount')).toHaveText(ars(26000));
	// Reserva inicial corta: pide confirmarla desde el mail para guardarla 48 horas.
	await expect(page.getByText(/te reservamos el lugar\s+2 horas/)).toBeVisible();
	await expect(page.locator('.confirm-note')).toContainText('48 horas');
	await page.goto(BUY_URL, { waitUntil: 'networkidle' });
	await expect(page.locator('#entradas').getByLabel('Tu nombre')).toHaveValue('');
});

test('cron de recordatorios: solo con el secreto', async ({ request }) => {
	const url = '/api/cron/recordatorios';
	expect((await request.post(url)).status()).toBe(401);
	expect(
		(
			await request.post(url, { headers: { 'x-cron-secret': 'otro-secreto-cualquiera-123' } })
		).status()
	).toBe(401);
	const ok = await request.post(url, {
		headers: { 'x-cron-secret': 'e2e-cron-secret-0123456789' }
	});
	expect(ok.status()).toBe(200);
	expect(await ok.json()).toMatchObject({ sent: expect.any(Number), failed: 0 });
});

test('reembolso desde el admin: MP simulado, anula las entradas y es idempotente', async ({
	page
}) => {
	const { buyer } = await buy(page);
	await page.getByRole('button', { name: 'Aprobar pago', exact: true }).click();
	await expect(page.getByRole('heading', { name: /ya tenés tus entradas/ })).toBeVisible();
	await page.getByRole('link', { name: 'Ver entrada 1 con su QR' }).click();
	await expect(page).toHaveURL(/\/entradas\/t\/[A-Za-z0-9_-]{43}$/);
	const ticketUrl = page.url();

	await page.goto(`/admin/eventos/${EVENT}/ordenes`, { waitUntil: 'networkidle' });
	const order = page.locator('.order', { hasText: buyer.email });
	await order.getByText('Reembolsar…').click();
	const panel = order.locator('.refund-panel');
	await expect(panel).toContainText(buyer.name);
	await shots(page, '13-reembolso-confirmar', order);
	const orderId = await panel.locator('input[name="order"]').getAttribute('value');
	await panel.getByRole('button', { name: /Confirmar reembolso de/ }).click();
	await expect(page.getByText(/reembolsada: se liberó el cupo/)).toBeVisible();

	// Otra vez (otra pestaña): no hace nada.
	const again = await page.request.post(`/admin/eventos/${EVENT}/ordenes?/refund`, {
		form: { order: orderId ?? '' },
		headers: { origin: 'http://localhost:5371', 'x-sveltekit-action': 'true' }
	});
	expect(await again.text()).toContain('ya estaba reembolsada');

	await page.goto(ticketUrl);
	await expect(page.getByText('Reembolsada (ya no es válida)')).toBeVisible();
	await page.goto(`/admin/eventos/${EVENT}/ingreso`, { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Escribir código' }).click();
	await page.getByLabel(/Código de la entrada/).fill(ticketUrl);
	await page.getByRole('button', { name: 'Validar' }).click();
	await expect(page.locator('.result')).toContainText('Anulada');
});
