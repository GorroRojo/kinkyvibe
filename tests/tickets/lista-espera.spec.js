/**
 * Lista de espera de punta a punta (interruptor `lista_espera`, docs/entradas.md, decisión 0040),
 * con el admin y Mercado Pago simulados (playwright.tickets.config.js, LISTA_ESPERA_ENABLED=1).
 *
 * Cada prueba crea su propio evento (un solo tipo con cupo 1 y `lista_espera: { alcance: evento }`)
 * para no depender de lo que dejaron las otras. Los mails en dev solo se resumen en la consola, así
 * que «abrir el mail» se hace con la base local (.wrangler/state, la misma que usa `vite dev`):
 * - confirmar: el token del mail se guarda solo como SHA-256, así que le ponemos a la anotación el
 *   hash de un token nuestro y abrimos `/lista-de-espera/confirmar/<token>`;
 * - la oferta: el token es la firma de `offer:<id>:<ronda>` con la clave `waitlist_offer_key`
 *   (waitlistEngine.js `offerToken`): lo armamos igual que el mail.
 * Todo con datos inventados (@example.com).
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { AGE_OK, fakeDni, nextStep, stepHeading, goToStep } from './helpers.js';

const ORIGIN = 'http://localhost:5371';
const CRON = { 'x-cron-secret': 'e2e-cron-secret-0123456789' };
const D1_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(AGE_OK);
});

/** La base local de D1 (la que tiene la lista de espera; si hay varias, la última tocada). */
function localDb() {
	const files = readdirSync(D1_DIR)
		.filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
		.map((f) => path.join(D1_DIR, f))
		.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
	for (const file of files) {
		const db = new DatabaseSync(file);
		db.exec('PRAGMA busy_timeout = 5000');
		const has = db
			.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'waitlist_entries'")
			.get();
		if (has) return db;
		db.close();
	}
	throw new Error(`No encontré la base local con waitlist_entries en ${D1_DIR}`);
}

/**
 * La anotación viva de ese mail en ese evento.
 * @param {string} slug
 * @param {string} email
 */
function entryOf(slug, email) {
	const db = localDb();
	try {
		const row = db
			.prepare(
				`SELECT id, status, offer_count FROM waitlist_entries
				WHERE event_slug = ? AND email = ? ORDER BY created_at DESC LIMIT 1`
			)
			.get(slug, email);
		if (!row) throw new Error(`no hay anotación para ${email}`);
		return /** @type {{ id: string, status: string, offer_count: number }} */ (row);
	} finally {
		db.close();
	}
}

/**
 * «Abre el mail de confirmar»: cambia el hash del token por el de uno nuestro (el del mail no se
 * guarda) y devuelve el link.
 * @param {string} slug
 * @param {string} email
 */
function confirmLink(slug, email) {
	const token = randomBytes(32).toString('base64url');
	const db = localDb();
	try {
		const r = db
			.prepare(
				`UPDATE waitlist_entries SET confirm_hash = ?
				WHERE event_slug = ? AND email = ? AND status = 'pending_confirmation'`
			)
			.run(createHash('sha256').update(token).digest('hex'), slug, email);
		expect(Number(r.changes)).toBe(1);
	} finally {
		db.close();
	}
	return `/lista-de-espera/confirmar/${token}`;
}

/**
 * El link de la oferta del mail «se liberó un lugar» (misma firma que `offerToken`).
 * @param {string} slug
 * @param {{ id: string, offer_count: number }} entry
 */
function offerLink(slug, entry) {
	const db = localDb();
	let key;
	try {
		key = /** @type {{ value: string } | undefined} */ (
			db.prepare("SELECT value FROM ticket_settings WHERE key = 'waitlist_offer_key'").get()
		)?.value;
	} finally {
		db.close();
	}
	if (!key) throw new Error('falta waitlist_offer_key (¿no se ofreció nada?)');
	const token = createHmac('sha256', key)
		.update(`offer:${entry.id}:${entry.offer_count}`)
		.digest('base64url')
		.slice(0, 43);
	return `/calendario/${slug}/entradas?lista=${token}`;
}

/**
 * «2026-11-01T21:00-03:00»: dentro de `days` días, hora de Argentina.
 * @param {number} days
 */
function argIso(days) {
	const at = new Date(Date.now() + days * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000);
	return `${at.toISOString().slice(0, 13)}:00-03:00`;
}

/**
 * Crea y publica un evento con un solo tipo de entrada (cupo 1) y lista de espera por evento. A
 * más de 7 días: la reserva de la lista dura 24 h (no vence durante la prueba).
 * @param {import('@playwright/test').Page} page
 */
async function createEvent(page) {
	const id = Math.random().toString(36).slice(2, 8);
	const slug = `lista-espera-e2e-${id}`;
	const content = `---
title: Prueba lista de espera ${id}
category: calendario
layout: calendario
start: ${argIso(20)}
tags:
  - español
  - AMBA
modalidad: presencial
puerta: true
payment_methods:
  - mercadopago
  - transferencia
tickets:
  - id: general
    name: General
    price: 5000
    capacity: 1
lista_espera:
  alcance: evento
---
`;
	const res = await page.request.post('/admin/eventos/nuevo?/publicar', {
		multipart: { slug, mode: 'publicar', featuredMode: 'none', content },
		headers: { origin: ORIGIN, 'x-sveltekit-action': 'true' }
	});
	expect(res.status()).toBe(200);
	expect(await res.text()).not.toMatch(/"type":"failure"/);
	return slug;
}

/**
 * Compra 1 General con Mercado Pago simulado y la aprueba. `url`: la página de compra o el link
 * de una oferta de la lista.
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 */
async function buyOne(page, url) {
	const id = Math.random().toString(36).slice(2, 8);
	const email = `e2e-lista-${id}@example.com`;
	await page.goto(url, { waitUntil: 'networkidle' });
	const block = page.locator('#entradas');
	await expect(block.getByRole('heading', { name: 'Comprar entradas' })).toBeVisible();
	if (await stepHeading(block, 'Entradas').isHidden()) await goToStep(block, 'Entradas');
	await block.getByLabel(/General/).check();
	await block.getByLabel('Cantidad').fill('1');
	await nextStep(block, 'Tus datos');
	await block.getByLabel('Tu nombre').fill(`Persona E2E ${id}`);
	await block.getByLabel('Tus pronombres').fill('elle');
	await block.getByLabel(/^Email/).fill(email);
	await block.getByLabel(/^DNI/).fill(fakeDni());
	await nextStep(block, 'Pagar');
	await block.getByLabel(/Mercado Pago/).check();
	await block.getByLabel(/18 años/).check();
	await block.locator('.pay button[type="submit"]').click();
	await expect(page).toHaveURL(/\/entradas\/simular-pago\/[0-9a-f-]{36}$/);
	await page.getByRole('button', { name: 'Aprobar pago', exact: true }).click();
	await expect(page.getByRole('heading', { name: /ya tenés tus entradas/ })).toBeVisible();
	return email;
}

/**
 * Se anota desde la página de compra (agotada) y confirma con el link del mail.
 * @param {import('@playwright/test').Page} page
 * @param {string} slug
 * @param {string} email
 */
async function joinAndConfirm(page, slug, email) {
	await page.goto(`/calendario/${slug}/entradas`, { waitUntil: 'networkidle' });
	const box = page.locator('#lista-espera');
	await expect(box).toContainText('Están agotadas');
	await box.getByLabel('Tu mail').fill(email);
	await box.getByRole('button', { name: 'Anotarme' }).click();
	await expect(box.getByRole('status')).toContainText('Te mandamos un mail para confirmar');
	expect(entryOf(slug, email).status).toBe('pending_confirmation');

	await page.goto(confirmLink(slug, email), { waitUntil: 'networkidle' });
	await expect(page.getByRole('heading', { name: 'Confirmá tu lugar en la fila' })).toBeVisible();
	// GET solo muestra el botón (los antivirus del correo abren los links): sigue sin confirmar.
	expect(entryOf(slug, email).status).toBe('pending_confirmation');
	await page.getByRole('button', { name: 'Confirmar' }).click();
	await expect(page.getByText(/Listo: estás en la lista de espera/)).toBeVisible();
	expect(entryOf(slug, email).status).toBe('waiting');
}

/**
 * La fila de esa persona en la pestaña «Lista de espera» del evento.
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 */
const row = (page, email) => page.locator('li.entry', { hasText: email });

/**
 * Una acción del panel que pide confirmar en el diálogo.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} button
 * @param {string | RegExp} title
 * @param {string} confirm
 */
async function confirmAction(page, button, title, confirm) {
	await button.click();
	const ask = page.getByRole('dialog', { name: title });
	await ask.getByRole('button', { name: confirm }).click();
	await expect(ask).toBeHidden();
}

/** @param {import('@playwright/test').APIRequestContext} request */
async function runCron(request) {
	const res = await request.post('/api/cron/recordatorios', { headers: CRON });
	expect(res.status()).toBe(200);
	expect(await res.json()).toMatchObject({ waitlistAdvance: expect.any(Object) });
}

test('agotado → anotarse y confirmar → reembolso → oferta → terminar y pasar a la siguiente → compra con el link', async ({
	page,
	browser
}) => {
	const slug = await createEvent(page);
	const tab = `/admin/eventos/${slug}/lista-espera`;
	const id = Math.random().toString(36).slice(2, 8);
	const first = `primere-${id}@example.com`;
	const second = `segunde-${id}@example.com`;

	// La única entrada se vende: agotado.
	const buyer = await buyOne(page, `/calendario/${slug}/entradas`);

	// Dos personas se anotan (cada una en su navegador, como el público) y confirman.
	const visitor = await browser.newContext();
	await visitor.addInitScript(AGE_OK);
	const pub = await visitor.newPage();
	await joinAndConfirm(pub, slug, first);
	await joinAndConfirm(pub, slug, second);
	// Ya estaba en la fila: se responde igual que a alguien nuevo (no se dice quién está anotade).
	await pub.goto(`/calendario/${slug}/entradas`, { waitUntil: 'networkidle' });
	await pub.locator('#lista-espera').getByLabel('Tu mail').fill(first);
	await pub.locator('#lista-espera').getByRole('button', { name: 'Anotarme' }).click();
	await expect(pub.locator('#lista-espera').getByRole('status')).toContainText(
		'Te mandamos un mail para confirmar'
	);

	await page.goto(tab, { waitUntil: 'networkidle' });
	await expect(page.locator('.scope .big')).toContainText('2 personas esperando');
	await expect(row(page, first)).toContainText('1.º en la fila');
	await expect(row(page, second)).toContainText('2.º en la fila');

	// Se libera el lugar: reembolso desde el panel.
	await page.goto(`/admin/eventos/${slug}/ordenes`, { waitUntil: 'networkidle' });
	const order = page.locator('.order', { hasText: buyer });
	await order.getByText('Reembolsar…').click();
	await order
		.locator('.refund-panel')
		.getByRole('button', { name: /Confirmar reembolso de/ })
		.click();
	await expect(page.getByText(/reembolsada: se liberó el cupo/)).toBeVisible();

	// El cron avanza la lista (el empujón del reembolso puede haberlo hecho ya: es idempotente).
	await runCron(page.request);
	await page.goto(tab, { waitUntil: 'networkidle' });
	await expect(row(page, first)).toContainText('Con lugar ofrecido');
	await expect(row(page, first)).toContainText('Lugar guardado hasta');
	await expect(row(page, second)).toContainText('Esperando');
	await expect(page.locator('.scope')).toContainText('1 con lugar guardado hasta las');

	// El lugar liberado es de la lista: el público no lo puede comprar.
	await pub.goto(`/calendario/${slug}/entradas`, { waitUntil: 'networkidle' });
	const sale = pub.getByRole('region', { name: 'Comprar entradas' });
	await expect(sale.getByRole('status')).toHaveText('Agotadas.');
	await expect(sale.getByRole('button', { name: /^Continuar/ })).toHaveCount(0);
	await expect(pub.locator('#lista-espera')).toContainText('Están agotadas');

	// Le admin termina esa reserva: pasa a la siguiente persona en el momento.
	const firstOffer = offerLink(slug, entryOf(slug, first));
	// El diálogo pregunta si le avisamos por mail, con la casilla marcada de entrada (se deja así).
	await row(page, first)
		.getByRole('button', { name: 'Terminar la reserva y pasar a la siguiente' })
		.click();
	const ask = page.getByRole('dialog', { name: '¿Terminar su reserva?' });
	await expect(ask).toContainText('¿Le avisamos por mail?');
	await expect(ask.getByRole('checkbox', { name: `Mandarle un mail a ${first}` })).toBeChecked();
	await ask.getByRole('button', { name: 'Terminar y pasar a la siguiente' }).click();
	await expect(ask).toBeHidden();
	await expect(page.locator('p.kv-flash[role="status"]')).toContainText(
		'Listo: terminó su reserva y le mandamos un mail. Le ofrecimos el lugar a la próxima persona.'
	);
	await expect(row(page, second)).toContainText('Con lugar ofrecido');
	await expect(row(page, first)).toContainText('Terminó');
	await expect(row(page, first)).toContainText('desde el panel');

	// El link de la primera persona ya no vale.
	await pub.goto(firstOffer, { waitUntil: 'networkidle' });
	await expect(pub.getByText(/Este link de la lista de espera ya no vale/)).toBeVisible();

	// La segunda compra con su link: ve hasta cuándo le guardamos el lugar.
	const secondEntry = entryOf(slug, second);
	expect(secondEntry.status).toBe('offered');
	const secondOffer = offerLink(slug, secondEntry);
	await pub.goto(secondOffer, { waitUntil: 'networkidle' });
	await expect(pub.getByText('¡Se liberó un lugar!')).toBeVisible();
	await expect(pub.getByText(/Te lo guardamos hasta el/)).toBeVisible();
	await buyOne(pub, secondOffer);
	expect(entryOf(slug, second).status).toBe('purchased');

	// El link ya se usó; en el panel figura como compra.
	await pub.goto(secondOffer, { waitUntil: 'networkidle' });
	await expect(pub.getByText(/Ya usaste este link para comprar/)).toBeVisible();
	await page.goto(tab, { waitUntil: 'networkidle' });
	await expect(row(page, second)).toContainText('Compró');
	await expect(row(page, second)).toContainText('orden aprobada');
	await expect(page.locator('.scope .big')).toContainText('0 personas esperando');

	// El CSV tiene las dos anotaciones.
	const csv = await page.request.get(`${tab}.csv`);
	expect(csv.status()).toBe(200);
	const text = await csv.text();
	expect(text).toContain(first);
	expect(text).toContain(second);
	await visitor.close();
});

test('sacar de la lista, la nota en la puerta y cerrar la lista', async ({ page, browser }) => {
	const slug = await createEvent(page);
	const tab = `/admin/eventos/${slug}/lista-espera`;
	const id = Math.random().toString(36).slice(2, 8);
	const leaves = `sale-${id}@example.com`;
	const stays = `queda-${id}@example.com`;
	await buyOne(page, `/calendario/${slug}/entradas`);

	const visitor = await browser.newContext();
	await visitor.addInitScript(AGE_OK);
	const pub = await visitor.newPage();
	await joinAndConfirm(pub, slug, leaves);
	await joinAndConfirm(pub, slug, stays);

	// La puerta y la carga a mano avisan (sin frenar) que hay gente en la fila.
	await page.goto(`/admin/eventos/${slug}/ingreso`, { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Vender en puerta' }).click();
	await expect(page.getByRole('note').filter({ hasText: 'lista de espera' })).toContainText(
		'Hay 2 personas en la lista de espera. Podés vender igual'
	);
	await page.goto(`/admin/eventos/${slug}/ordenes/cargar`, { waitUntil: 'networkidle' });
	await expect(page.getByRole('note').filter({ hasText: 'lista de espera' })).toContainText(
		'Podés cargar igual'
	);

	// Sacar de la lista: pierde su lugar en la fila y la otra persona pasa a ser primera.
	await page.goto(tab, { waitUntil: 'networkidle' });
	await confirmAction(
		page,
		row(page, leaves).getByRole('button', { name: 'Sacar de la lista' }),
		'¿Sacar de la lista?',
		'Sacar de la lista'
	);
	await expect(page.locator('p.kv-flash[role="status"]')).toContainText(
		'Listo: salió de la lista.'
	);
	await expect(row(page, leaves)).toContainText('Salió');
	await expect(row(page, stays)).toContainText('1.º en la fila');
	expect(entryOf(slug, leaves).status).toBe('cancelled');

	// Cerrar la lista: quien esperaba termina («se cerró la lista») y la lista se apaga en el
	// evento (gorrite, 12/10): nadie más se puede anotar.
	await confirmAction(
		page,
		page.getByRole('button', { name: 'Cerrar la lista' }),
		'¿Cerrar la lista?',
		'Cerrar la lista'
	);
	await expect(page.locator('p.kv-flash[role="status"]')).toContainText(
		'Listo: cerramos y apagamos la lista (1 persona salió). Nadie más se puede anotar.'
	);
	await expect(row(page, stays)).toContainText('se cerró la lista');
	expect(entryOf(slug, stays).status).toBe('expired');
	await expect(page.locator('.scope .big')).toContainText('0 personas esperando');
	await expect(page.getByText('La lista de espera está apagada en este evento')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Cerrar la lista' })).toBeDisabled();

	// La página del evento ya no ofrece anotarse (agotado, sin lista).
	await pub.goto(`/calendario/${slug}/entradas`, { waitUntil: 'networkidle' });
	await expect(pub.locator('#lista-espera')).toHaveCount(0);
	await visitor.close();
});
