/**
 * Rebotes y quejas de Resend (resendWebhook.js y /api/resend/webhook): la firma Svix (buena, de
 * otro secreto, cuerpo o id cambiados, marca de tiempo vieja o futura, cabeceras rotas), los avisos
 * repetidos, qué marca cada tipo de aviso y el camino entero: el mail de las entradas guarda el id
 * de Resend, el aviso de rebote marca esa orden y suprime la dirección, y reenviar limpia la marca.
 * Lo que se le manda a Resend se captura (no sale nada). D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { toBase64 } from '$lib/utils/base64.js';
import { insertOrder } from '$lib/server/admin/testRows.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const SECRET = `whsec_${toBase64('clave-inventada-solo-para-tests!')}`;
const vars = vi.hoisted(() => /** @type {Record<string, string | undefined>} */ ({}));
vi.mock('$env/dynamic/private', () => ({ env: vars }));

vi.mock('$lib/server/tickets/events.js', async () => {
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	const meta = {
		title: 'Evento de prueba',
		start: '2099-11-14T22:00:00-03:00',
		end: '2099-11-15T03:00:00-03:00',
		status: 'abierto',
		location: 'Calle Falsa 123',
		location_name: 'Lugar Inventado',
		payment_methods: ['mercadopago'],
		tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 50 }]
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventMeta: async () => meta,
		getEventTickets: async (/** @type {string} */ _slug, /** @type {any} */ opts) =>
			parseTicketConfig(meta, opts),
		listTicketedEvents: async () => [{ slug: 'evento-de-prueba', config: parseTicketConfig(meta) }]
	};
});

const { WEBHOOK_TOLERANCE_SECONDS, handleResendEvent, problemOf, signWebhook, verifyWebhook } =
	await import('./resendWebhook.js');
const { isSuppressed } = await import('./suppressions.js');
const { getOrder } = await import('$lib/server/tickets/orders.js');
const { sendOrderEmail } = await import('$lib/server/tickets/index.js');
const { POST } = await import('../../../routes/api/resend/webhook/+server.js');

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
	for (const key of Object.keys(vars)) delete vars[key];
	vars.RESEND_WEBHOOK_SECRET = SECRET;
	vars.RESEND_API_KEY = 're_inventada';
	for (const level of /** @type {const} */ (['log', 'warn', 'error'])) {
		const spy = vi.spyOn(console, level).mockImplementation(() => {});
		onTestFinished(() => spy.mockRestore());
	}
});

const EMAIL = 'rebota@example.com';
const NOW = Date.parse('2099-11-10T12:00:00-03:00');
const TS = String(Math.floor(NOW / 1000));

/**
 * Un aviso de Resend con la forma de los de verdad.
 *
 * @param {string} type
 * @param {Record<string, unknown>} [data]
 */
function event(type, data = {}) {
	return {
		type,
		created_at: '2099-11-10T15:00:00.000Z',
		data: {
			email_id: 'email-inventado-1',
			from: 'Kinky Vibe <entradas@kinkyvibe.ar>',
			to: [EMAIL],
			subject: 'Tus entradas',
			...data
		}
	};
}

const BOUNCE = event('email.bounced', {
	bounce: { type: 'Permanent', subType: 'General', message: 'no existe' }
});

/**
 * Headers firmados para un cuerpo.
 *
 * @param {string} body
 * @param {{ id?: string, timestamp?: string, secret?: string }} [o]
 */
async function signed(body, { id = 'msg_inventado1', timestamp = TS, secret = SECRET } = {}) {
	const sig = await signWebhook({ secret, id, timestamp, body });
	return { id, timestamp, signature: `v1,${sig}` };
}

describe('verifyWebhook (firma Svix)', () => {
	it('coincide con el ejemplo de la documentación de Svix', async () => {
		const r = await verifyWebhook({
			secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
			id: 'msg_p5jXN8AQM9LWM0D4loKWxJek',
			timestamp: '1614265330',
			signature: 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
			body: '{"test": 2432232314}',
			now: 1614265330 * 1000
		});
		expect(r).toEqual({ ok: true });
	});

	it('acepta un aviso bien firmado, también con varias firmas (secreto rotado)', async () => {
		const body = JSON.stringify(BOUNCE);
		const h = await signed(body);
		expect(await verifyWebhook({ secret: SECRET, ...h, body, now: NOW })).toEqual({ ok: true });
		const other = await signWebhook({
			secret: `whsec_${toBase64('otra-clave-inventada-de-prueba!!')}`,
			id: h.id,
			timestamp: h.timestamp,
			body
		});
		expect(
			await verifyWebhook({
				secret: SECRET,
				...h,
				signature: `v1,${other} ${h.signature}`,
				body,
				now: NOW
			})
		).toEqual({ ok: true });
	});

	it('rechaza firmas de otro secreto, cuerpos o ids cambiados y versiones desconocidas', async () => {
		const body = JSON.stringify(BOUNCE);
		const h = await signed(body);
		const forged = await signed(body, {
			secret: `whsec_${toBase64('otra-clave-inventada-de-prueba!!')}`
		});
		const fail = { ok: false, reason: 'signature' };
		expect(await verifyWebhook({ secret: SECRET, ...forged, body, now: NOW })).toEqual(fail);
		expect(
			await verifyWebhook({
				secret: SECRET,
				...h,
				body: body.replace('Permanent', 'Transient'),
				now: NOW
			})
		).toEqual(fail);
		expect(await verifyWebhook({ secret: SECRET, ...h, id: 'msg_otro', body, now: NOW })).toEqual(
			fail
		);
		// La marca de tiempo es parte de lo firmado: correrla un segundo rompe la firma.
		expect(
			await verifyWebhook({
				secret: SECRET,
				...h,
				timestamp: String(Number(TS) + 1),
				body,
				now: NOW
			})
		).toEqual(fail);
		const value = h.signature.slice(3);
		for (const signature of [`v2,${value}`, value, '', 'v1,', `v1,${value.slice(0, -2)}==`]) {
			expect((await verifyWebhook({ secret: SECRET, ...h, signature, body, now: NOW })).ok).toBe(
				false
			);
		}
	});

	it('rechaza marcas de tiempo viejas o del futuro (un aviso grabado no se puede repetir después)', async () => {
		const body = JSON.stringify(BOUNCE);
		const h = await signed(body);
		const late = NOW + (WEBHOOK_TOLERANCE_SECONDS + 1) * 1000;
		const early = NOW - (WEBHOOK_TOLERANCE_SECONDS + 1) * 1000;
		expect(await verifyWebhook({ secret: SECRET, ...h, body, now: late })).toEqual({
			ok: false,
			reason: 'old-timestamp'
		});
		expect((await verifyWebhook({ secret: SECRET, ...h, body, now: early })).ok).toBe(false);
		// Dentro del margen, sí.
		expect((await verifyWebhook({ secret: SECRET, ...h, body, now: NOW + 60_000 })).ok).toBe(true);
	});

	it('rechaza cabeceras faltantes o con otra forma y un secreto que no es whsec_', async () => {
		const body = '{}';
		const h = await signed(body);
		for (const bad of [
			{ id: null },
			{ id: '' },
			{ id: 'msg id con espacios' },
			{ timestamp: null },
			{ timestamp: '12.5' },
			{ timestamp: '-1' },
			{ signature: null }
		]) {
			expect((await verifyWebhook({ secret: SECRET, ...h, ...bad, body, now: NOW })).ok).toBe(
				false
			);
		}
		expect((await verifyWebhook({ secret: 'sin-prefijo', ...h, body, now: NOW })).ok).toBe(false);
	});
});

describe('problemOf', () => {
	it('solo los rebotes permanentes, las quejas y las supresiones', () => {
		expect(problemOf(BOUNCE)).toEqual({ problem: 'bounced', suppress: true });
		expect(
			problemOf(event('email.bounced', { bounce: { type: 'Transient', subType: 'MailboxFull' } }))
		).toBeNull();
		expect(problemOf(event('email.bounced'))).toBeNull();
		expect(problemOf(event('email.complained'))).toEqual({ problem: 'complained', suppress: true });
		expect(problemOf(event('email.suppressed'))).toEqual({
			problem: 'suppressed',
			suppress: false
		});
		for (const type of ['email.delivered', 'email.opened', 'email.delivery_delayed', 'otro'])
			expect(problemOf(event(type))).toBeNull();
		expect(problemOf(null)).toBeNull();
	});
});

describe('handleResendEvent', () => {
	/** @param {string} emailId */
	async function sentOrder(emailId, email = EMAIL) {
		const id = await insertOrder(t.db, { email, emailSentAt: NOW - 60_000 });
		await t.db.prepare('UPDATE orders SET email_id = ?2 WHERE id = ?1').bind(id, emailId).run();
		return id;
	}

	it('un rebote permanente marca la orden de ese mail y suprime la dirección', async () => {
		const id = await sentOrder('email-inventado-1');
		const otra = await sentOrder('email-inventado-2', 'otra@example.com');
		expect(await handleResendEvent(t.db, { svixId: 'msg_1', event: BOUNCE, now: NOW })).toEqual({
			outcome: 'marked'
		});
		expect(await getOrder(t.db, id)).toMatchObject({
			email_problem: 'bounced',
			email_problem_at: NOW
		});
		expect((await getOrder(t.db, otra))?.email_problem).toBeNull();
		expect(await isSuppressed(t.db, EMAIL)).toBe(true);
		expect(await isSuppressed(t.db, 'otra@example.com')).toBe(false);
		// Nunca guarda la dirección: la tabla de supresiones tiene solo el hash.
		const rows = await t.db.prepare('SELECT * FROM email_suppressions').all();
		expect(JSON.stringify(rows.results)).not.toContain('example.com');
	});

	it('el mismo svix-id dos veces se procesa una sola', async () => {
		const id = await sentOrder('email-inventado-1');
		await handleResendEvent(t.db, { svixId: 'msg_1', event: BOUNCE, now: NOW });
		await t.db.prepare('UPDATE orders SET email_problem = NULL WHERE id = ?1').bind(id).run();
		expect(
			await handleResendEvent(t.db, { svixId: 'msg_1', event: BOUNCE, now: NOW + 1000 })
		).toEqual({ outcome: 'duplicate' });
		expect((await getOrder(t.db, id))?.email_problem).toBeNull();
	});

	it('queja: marca y suprime; supresión de Resend: marca sin anotar la dirección', async () => {
		const id = await sentOrder('email-inventado-1');
		await handleResendEvent(t.db, {
			svixId: 'msg_s',
			event: event('email.suppressed'),
			now: NOW
		});
		expect((await getOrder(t.db, id))?.email_problem).toBe('suppressed');
		expect(await isSuppressed(t.db, EMAIL)).toBe(false);
		await handleResendEvent(t.db, {
			svixId: 'msg_c',
			event: event('email.complained', { to: [`Persona <${EMAIL.toUpperCase()}>`] }),
			now: NOW
		});
		expect((await getOrder(t.db, id))?.email_problem).toBe('complained');
		expect(await isSuppressed(t.db, EMAIL)).toBe(true);
	});

	it('un rebote temporal o un aviso de entrega no tocan nada', async () => {
		const id = await sentOrder('email-inventado-1');
		for (const [n, e] of [
			event('email.bounced', { bounce: { type: 'Transient' } }),
			event('email.delivered')
		].entries()) {
			expect(await handleResendEvent(t.db, { svixId: `msg_${n}`, event: e, now: NOW })).toEqual({
				outcome: 'ignored'
			});
		}
		expect((await getOrder(t.db, id))?.email_problem).toBeNull();
		expect(await isSuppressed(t.db, EMAIL)).toBe(false);
	});

	it('un rebote de otro mail (sin orden) igual suprime la dirección', async () => {
		expect(
			await handleResendEvent(t.db, {
				svixId: 'msg_x',
				event: event('email.bounced', {
					email_id: 'de-un-recordatorio',
					bounce: { type: 'Permanent' }
				}),
				now: NOW
			})
		).toEqual({ outcome: 'unmatched' });
		expect(await isSuppressed(t.db, EMAIL)).toBe(true);
	});

	it('los svix-id de más de 7 días se borran', async () => {
		await handleResendEvent(t.db, {
			svixId: 'msg_viejo',
			event: event('email.delivered'),
			now: NOW
		});
		const later = NOW + 8 * 24 * 60 * 60 * 1000;
		await handleResendEvent(t.db, {
			svixId: 'msg_nuevo',
			event: event('email.delivered'),
			now: later
		});
		const { results } = await t.db.prepare('SELECT svix_id FROM resend_webhook_events').all();
		expect(results.map((r) => r.svix_id)).toEqual(['msg_nuevo']);
	});
});

describe('POST /api/resend/webhook', () => {
	/**
	 * @param {string} body
	 * @param {Record<string, string>} headers
	 */
	function call(body, headers) {
		const request = new Request('https://kinkyvibe.example/api/resend/webhook', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...headers },
			body
		});
		return POST(/** @type {any} */ ({ request, platform: { env: { DB: t.db } } }));
	}

	/** @param {string} body @param {{ id?: string, timestamp?: string, secret?: string }} [o] */
	async function svixHeaders(body, o) {
		const h = await signed(body, { timestamp: String(Math.floor(Date.now() / 1000)), ...o });
		return { 'svix-id': h.id, 'svix-timestamp': h.timestamp, 'svix-signature': h.signature };
	}

	it('sin RESEND_WEBHOOK_SECRET no hace nada (503)', async () => {
		delete vars.RESEND_WEBHOOK_SECRET;
		const body = JSON.stringify(BOUNCE);
		const res = await call(body, await svixHeaders(body));
		expect(res.status).toBe(503);
		expect(await isSuppressed(t.db, EMAIL)).toBe(false);
	});

	it('firma falsa, cuerpo cambiado o aviso viejo: 401 y no toca la base', async () => {
		const body = JSON.stringify(BOUNCE);
		const forged = await svixHeaders(body, {
			secret: `whsec_${toBase64('otra-clave-inventada-de-prueba!!')}`
		});
		expect((await call(body, forged)).status).toBe(401);
		const good = await svixHeaders(body);
		expect((await call(body.replace(EMAIL, 'otra@example.com'), good)).status).toBe(401);
		const old = await svixHeaders(body, {
			timestamp: String(Math.floor(Date.now() / 1000) - 3600)
		});
		expect((await call(body, old)).status).toBe(401);
		expect((await call(body, {})).status).toBe(401);
		expect(await isSuppressed(t.db, EMAIL)).toBe(false);
		expect(await isSuppressed(t.db, 'otra@example.com')).toBe(false);
	});

	it('aviso bien firmado: 200 y marca; repetido: 200 sin cambios', async () => {
		const id = await insertOrder(t.db, { email: EMAIL, emailSentAt: NOW });
		await t.db
			.prepare("UPDATE orders SET email_id = 'email-inventado-1' WHERE id = ?1")
			.bind(id)
			.run();
		const body = JSON.stringify(BOUNCE);
		const headers = await svixHeaders(body);
		const res = await call(body, headers);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, outcome: 'marked' });
		expect((await getOrder(t.db, id))?.email_problem).toBe('bounced');
		const again = await call(body, headers);
		expect(again.status).toBe(200);
		expect(await again.json()).toEqual({ ok: true, outcome: 'duplicate' });
	});

	it('cuerpo firmado que no es JSON: 400; demasiado grande: 413', async () => {
		const body = 'no es json';
		expect((await call(body, await svixHeaders(body))).status).toBe(400);
		const big = 'x'.repeat(70 * 1024);
		expect((await call(big, await svixHeaders(big))).status).toBe(413);
	});

	it('cuerpo en pedazos sin content-length: corta al pasar los 64 KB (413) sin leerlo entero', async () => {
		const chunk = new TextEncoder().encode('x'.repeat(16 * 1024));
		let pulled = 0;
		const stream = new ReadableStream({
			pull(controller) {
				// Infinito: si la ruta lo leyera entero, el test no terminaría.
				pulled++;
				controller.enqueue(chunk);
			}
		});
		const request = new Request('https://kinkyvibe.example/api/resend/webhook', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(await svixHeaders('{}')) },
			body: stream,
			// @ts-ignore: hace falta en Node para mandar un stream
			duplex: 'half'
		});
		expect(request.headers.get('content-length')).toBeNull();
		const res = await POST(/** @type {any} */ ({ request, platform: { env: { DB: t.db } } }));
		expect(res.status).toBe(413);
		expect(pulled).toBeLessThan(10);

		// Uno chico en pedazos, bien firmado, pasa.
		const body = JSON.stringify(event('email.delivered'));
		const bytes = new TextEncoder().encode(body);
		const small = new ReadableStream({
			start(controller) {
				controller.enqueue(bytes.slice(0, 10));
				controller.enqueue(bytes.slice(10));
				controller.close();
			}
		});
		const ok = new Request('https://kinkyvibe.example/api/resend/webhook', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(await svixHeaders(body)) },
			body: small,
			// @ts-ignore: hace falta en Node para mandar un stream
			duplex: 'half'
		});
		const r = await POST(/** @type {any} */ ({ request: ok, platform: { env: { DB: t.db } } }));
		expect(r.status).toBe(200);
		expect(await r.json()).toEqual({ ok: true, outcome: 'ignored' });
	});
});

describe('el mail de las entradas guarda el id de Resend', () => {
	it('se guarda al mandar, el rebote marca la orden y reenviar limpia la marca', async () => {
		const id = await insertOrder(t.db, { email: EMAIL, emailSentAt: null });
		let n = 0;
		const fetch = /** @type {any} */ (
			async () => new Response(JSON.stringify({ id: `email-inventado-${++n}` }), { status: 200 })
		);
		const order = /** @type {import('$lib/server/tickets/orders.js').Order} */ (
			await getOrder(t.db, id)
		);
		const origin = 'https://kinkyvibe.example';
		expect(await sendOrderEmail({ db: t.db, order, origin, fetch })).toBe(true);
		expect(await getOrder(t.db, id)).toMatchObject({ email_id: 'email-inventado-1' });

		await handleResendEvent(t.db, { svixId: 'msg_1', event: BOUNCE, now: NOW });
		expect((await getOrder(t.db, id))?.email_problem).toBe('bounced');

		// «Reenviar»: otro envío, otro id, sin la marca (si vuelve a rebotar, Resend avisa de nuevo).
		expect(await sendOrderEmail({ db: t.db, order, origin, fetch, idempotent: false })).toBe(true);
		expect(await getOrder(t.db, id)).toMatchObject({
			email_id: 'email-inventado-2',
			email_problem: null,
			email_problem_at: null
		});
	});

	it('si Resend no devuelve id, la orden queda marcada como enviada sin id', async () => {
		const id = await insertOrder(t.db, { email: EMAIL, emailSentAt: null });
		const fetch = /** @type {any} */ (async () => new Response('{}', { status: 200 }));
		const order = /** @type {any} */ (await getOrder(t.db, id));
		expect(
			await sendOrderEmail({ db: t.db, order, origin: 'https://kinkyvibe.example', fetch })
		).toBe(true);
		expect(await getOrder(t.db, id)).toMatchObject({
			email_sent_at: expect.any(Number),
			email_id: null
		});
	});
});

describe('«Para revisar» del panel', () => {
	it('suma los mails que rebotaron en los últimos 14 días, además de los que no salieron', async () => {
		const { unsentEmails } = await import('$lib/server/admin/inicio.js');
		const DAY = 24 * 60 * 60 * 1000;
		const unsent = await insertOrder(t.db, {
			name: 'Sin Mail',
			emailSentAt: null,
			updated: NOW - DAY
		});
		const bounced = await insertOrder(t.db, { name: 'Rebote', emailSentAt: NOW - DAY });
		const old = await insertOrder(t.db, { name: 'Rebote Viejo', emailSentAt: NOW - 30 * DAY });
		const refunded = await insertOrder(t.db, {
			name: 'Reembolso',
			status: 'refunded',
			emailSentAt: NOW - DAY
		});
		const mark = t.db.prepare(
			"UPDATE orders SET email_problem = 'bounced', email_problem_at = ?2 WHERE id = ?1"
		);
		await t.db.batch([
			mark.bind(bounced, NOW - 2 * 60 * 60 * 1000),
			mark.bind(old, NOW - 20 * DAY),
			mark.bind(refunded, NOW - 2 * 60 * 60 * 1000)
		]);
		const rows = await unsentEmails(t.db, NOW);
		expect(rows.map((r) => [r.id, r.problem])).toEqual([
			[bounced, 'bounced'],
			[unsent, null]
		]);
	});
});
