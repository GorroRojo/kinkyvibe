/**
 * Cambios de estado de la lista de espera (waitlist.js) contra la base de prueba: los que se
 * permiten y los que no.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { sha256Hex } from '$lib/server/hash.js';
import {
	WAITLIST_CONFIRM_TTL_MS,
	confirmWaitlistEntry,
	deleteExpiredUnconfirmed,
	endWaitlistEntry,
	joinWaitlist,
	leaveWaitlist,
	markPurchased,
	markPurchasedStatement,
	rejoinWaitlist,
	removeFromWaitlist
} from './waitlist.js';

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
});

const NOW = Date.parse('2026-10-11T12:00:00Z');
const H = 60 * 60 * 1000;
const SLUG = 'evento-de-prueba';
const EMAIL = 'persona@example.com';
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

/** @param {string} id */
async function row(id) {
	return /** @type {Record<string, any> | null} */ (
		await t.db.prepare('SELECT * FROM waitlist_entries WHERE id = ?1').bind(id).first()
	);
}

/** Anota y confirma: queda `waiting`. @param {Record<string, unknown>} [over] */
async function waiting(over = {}) {
	const r = /** @type {any} */ (
		await joinWaitlist(t.db, { eventSlug: SLUG, email: EMAIL, now: NOW, ...over })
	);
	expect(r.status).toBe('pending');
	expect(await confirmWaitlistEntry(t.db, r.token, NOW + 1)).not.toBeNull();
	return /** @type {string} */ (r.id);
}

/**
 * Le ofrece un lugar (lo hará el motor, en otra parte; acá a mano).
 * @param {string} id
 * @param {number | null} holdUntil
 */
async function offer(id, holdUntil) {
	await t.db
		.prepare(
			`UPDATE waitlist_entries SET status = 'offered', offer_token_hash = ?2, offered_at = ?3,
				hold_until = ?4, offer_count = offer_count + 1 WHERE id = ?1 AND status = 'waiting'`
		)
		.bind(id, await sha256Hex(`oferta-${id}`), NOW, holdUntil)
		.run();
}

/** @param {{ slug?: string, type?: string }} [opts] */
async function order({ slug = SLUG, type = 'general' } = {}) {
	const id = uuid();
	await t.db
		.prepare(
			`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, subtotal, total,
				buyer_name, buyer_email, status, created_at, updated_at, expires_at)
			VALUES (?1, ?2, ?3, 1, 1000, 1000, 1000, 'Persona de Prueba', ?4, 'pending', ?5, ?5, ?6)`
		)
		.bind(id, slug, type, EMAIL, NOW, NOW + H)
		.run();
	return id;
}

/** @param {string} email @param {{ verified?: boolean }} [opts] */
async function account(email, { verified = true } = {}) {
	const id = crypto.randomUUID();
	await t.db
		.prepare(
			`INSERT INTO accounts (id, email, email_verified_at, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?4)`
		)
		.bind(id, email, verified ? NOW : null, NOW)
		.run();
	return id;
}

describe('anotarse y confirmar', () => {
	it('queda sin confirmar con un token; el token confirma una sola vez', async () => {
		const r = /** @type {any} */ (
			await joinWaitlist(t.db, {
				eventSlug: SLUG,
				email: '  Persona@Example.com ',
				clientHash: 'hash-de-conexion',
				now: NOW
			})
		);
		expect(r).toMatchObject({ ok: true, status: 'pending' });
		expect(r.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		const before = await row(r.id);
		expect(before).toMatchObject({
			status: 'pending_confirmation',
			email: EMAIL,
			ticket_type: null,
			confirmed_at: null,
			confirm_expires_at: NOW + WAITLIST_CONFIRM_TTL_MS,
			client_hash: 'hash-de-conexion'
		});
		// Solo el hash del token.
		expect(before?.confirm_hash).toBe(await sha256Hex(r.token));

		expect(await confirmWaitlistEntry(t.db, r.token, NOW + H)).toEqual({
			id: r.id,
			eventSlug: SLUG,
			ticketType: null
		});
		expect(await row(r.id)).toMatchObject({
			status: 'waiting',
			confirmed_at: NOW + H,
			confirm_hash: null,
			confirm_expires_at: null
		});
		expect(await confirmWaitlistEntry(t.db, r.token, NOW + 2 * H)).toBeNull();
	});

	it('un link vencido, inventado o mal formado no confirma', async () => {
		const r = /** @type {any} */ (
			await joinWaitlist(t.db, { eventSlug: SLUG, email: EMAIL, now: NOW })
		);
		expect(await confirmWaitlistEntry(t.db, r.token, NOW + WAITLIST_CONFIRM_TTL_MS)).toBeNull();
		expect(await confirmWaitlistEntry(t.db, 'x'.repeat(43), NOW)).toBeNull();
		expect(await confirmWaitlistEntry(t.db, 'corto', NOW)).toBeNull();
		expect(await confirmWaitlistEntry(t.db, 42, NOW)).toBeNull();
		expect((await row(r.id))?.status).toBe('pending_confirmation');
	});

	it('mail inválido: no anota nada', async () => {
		expect(await joinWaitlist(t.db, { eventSlug: SLUG, email: 'sin-arroba', now: NOW })).toEqual({
			ok: false,
			reason: 'bad_email'
		});
		const n = await t.db.prepare('SELECT COUNT(*) AS n FROM waitlist_entries').first();
		expect(n?.n).toBe(0);
	});

	it('anotarse otra vez sin haber confirmado: token nuevo, la misma anotación', async () => {
		const a = /** @type {any} */ (
			await joinWaitlist(t.db, { eventSlug: SLUG, email: EMAIL, now: NOW })
		);
		const b = /** @type {any} */ (
			await joinWaitlist(t.db, { eventSlug: SLUG, email: EMAIL, now: NOW + H })
		);
		expect(b).toMatchObject({ status: 'pending', id: a.id });
		expect(b.token).not.toBe(a.token);
		expect(await confirmWaitlistEntry(t.db, a.token, NOW + H)).toBeNull();
		expect((await row(a.id))?.confirm_expires_at).toBe(NOW + H + WAITLIST_CONFIRM_TTL_MS);
		expect(await confirmWaitlistEntry(t.db, b.token, NOW + H)).not.toBeNull();
	});

	it('ya en la fila (o con oferta): `already`, sin cambiar nada', async () => {
		const id = await waiting();
		const before = await row(id);
		expect(await joinWaitlist(t.db, { eventSlug: SLUG, email: EMAIL, now: NOW + H })).toEqual({
			ok: true,
			status: 'already',
			id
		});
		expect(await row(id)).toEqual(before);
		await offer(id, NOW + 2 * H);
		expect(await joinWaitlist(t.db, { eventSlug: SLUG, email: EMAIL, now: NOW + H })).toEqual({
			ok: true,
			status: 'already',
			id
		});
	});

	it('cada alcance es otra lista: evento, cada tipo y otro evento', async () => {
		const e = await waiting();
		const a = /** @type {any} */ (
			await joinWaitlist(t.db, { eventSlug: SLUG, ticketType: 'general', email: EMAIL, now: NOW })
		);
		const b = /** @type {any} */ (
			await joinWaitlist(t.db, { eventSlug: 'otro-evento', email: EMAIL, now: NOW })
		);
		expect(new Set([e, a.id, b.id]).size).toBe(3);
		expect((await row(a.id))?.ticket_type).toBe('general');
		// Un tipo vacío es todo el evento.
		expect(
			await joinWaitlist(t.db, { eventSlug: SLUG, ticketType: ' ', email: EMAIL, now: NOW })
		).toMatchObject({ status: 'already', id: e });
	});

	it('con cuenta y el mail verificado: entra directo a la fila', async () => {
		const accountId = await account(EMAIL);
		const r = await joinWaitlist(t.db, { eventSlug: SLUG, email: EMAIL, accountId, now: NOW });
		expect(r).toMatchObject({ ok: true, status: 'waiting' });
		expect(await row(/** @type {any} */ (r).id)).toMatchObject({
			status: 'waiting',
			confirmed_at: NOW,
			confirm_hash: null
		});
	});

	it('con cuenta, una anotación sin confirmar del mismo mail pasa a la fila', async () => {
		const p = /** @type {any} */ (
			await joinWaitlist(t.db, { eventSlug: SLUG, email: EMAIL, now: NOW })
		);
		const accountId = await account(EMAIL);
		expect(
			await joinWaitlist(t.db, { eventSlug: SLUG, email: EMAIL, accountId, now: NOW + H })
		).toEqual({ ok: true, status: 'waiting', id: p.id });
		expect(await row(p.id)).toMatchObject({ status: 'waiting', confirmed_at: NOW + H });
		expect(await confirmWaitlistEntry(t.db, p.token, NOW + H)).toBeNull();
	});

	it('con cuenta pero otro mail, sin verificar o borrada: hay que confirmar', async () => {
		const other = await account('otra@example.com');
		const unverified = await account('sin-verificar@example.com', { verified: false });
		for (const [accountId, email] of [
			[other, EMAIL],
			[unverified, 'sin-verificar@example.com'],
			[crypto.randomUUID(), 'nadie@example.com']
		]) {
			const r = await joinWaitlist(t.db, { eventSlug: SLUG, email, accountId, now: NOW });
			expect(r, email).toMatchObject({ ok: true, status: 'pending' });
		}
	});

	it('dos pedidos a la vez con el mismo mail: una sola anotación', async () => {
		const results = await Promise.all(
			Array.from({ length: 5 }, () =>
				joinWaitlist(t.db, { eventSlug: SLUG, email: EMAIL, now: NOW })
			)
		);
		const ids = new Set(results.map((r) => /** @type {any} */ (r).id));
		expect(ids.size).toBe(1);
		const n = await t.db.prepare('SELECT COUNT(*) AS n FROM waitlist_entries').first();
		expect(n?.n).toBe(1);
	});
});

describe('salir y sacar de la lista', () => {
	it('salir de la fila: cancelled por `left`; no se puede salir dos veces', async () => {
		const id = await waiting();
		expect(await leaveWaitlist(t.db, id, { now: NOW + H })).toEqual({
			id,
			eventSlug: SLUG,
			ticketType: null,
			was: 'waiting'
		});
		expect(await row(id)).toMatchObject({
			status: 'cancelled',
			end_reason: 'left',
			ended_at: NOW + H,
			ended_by: null
		});
		expect(await leaveWaitlist(t.db, id, { now: NOW + 2 * H })).toBeNull();
		// Y puede volver a anotarse.
		expect(
			await joinWaitlist(t.db, { eventSlug: SLUG, email: EMAIL, now: NOW + 3 * H })
		).toMatchObject({ status: 'pending' });
	});

	it('salir con un lugar ofrecido: avisa que lo liberó y borra el token de la oferta', async () => {
		const id = await waiting();
		await offer(id, NOW + 2 * H);
		expect(await leaveWaitlist(t.db, id, { now: NOW + H })).toMatchObject({ was: 'offered' });
		expect(await row(id)).toMatchObject({
			status: 'cancelled',
			offer_token_hash: null,
			hold_until: NOW + 2 * H
		});
	});

	it('salir sin haber confirmado: se borra la fila', async () => {
		const r = /** @type {any} */ (
			await joinWaitlist(t.db, { eventSlug: SLUG, email: EMAIL, now: NOW })
		);
		expect(await leaveWaitlist(t.db, r.id, { now: NOW })).toMatchObject({
			was: 'pending_confirmation'
		});
		expect(await row(r.id)).toBeNull();
	});

	it('une admin saca a alguien: cancelled por `admin` con quién fue', async () => {
		const id = await waiting();
		expect(
			await removeFromWaitlist(t.db, id, { by: 'admin-de-prueba', now: NOW + H })
		).toMatchObject({ was: 'waiting' });
		expect(await row(id)).toMatchObject({
			status: 'cancelled',
			end_reason: 'admin',
			ended_by: 'admin-de-prueba'
		});
	});

	it('no se puede salir de una anotación que ya compró, venció o no existe', async () => {
		const id = await waiting();
		await offer(id, NOW + 2 * H);
		expect(await markPurchased(t.db, { entryId: id, orderId: await order(), now: NOW + H })).toBe(
			true
		);
		expect(await leaveWaitlist(t.db, id, { now: NOW + H })).toBeNull();
		expect(await removeFromWaitlist(t.db, id, { by: 'admin', now: NOW + H })).toBeNull();
		expect((await row(id))?.status).toBe('purchased');
		expect(await leaveWaitlist(t.db, uuid())).toBeNull();
	});
});

describe('terminar (expired)', () => {
	it('reserva vencida: solo con `hold_until <= now`', async () => {
		const id = await waiting();
		await offer(id, NOW + 2 * H);
		expect(await endWaitlistEntry(t.db, id, { reason: 'hold_expired', now: NOW + H })).toBeNull();
		expect(await endWaitlistEntry(t.db, id, { reason: 'hold_expired', now: NOW + 2 * H })).toEqual({
			id,
			eventSlug: SLUG,
			ticketType: null,
			was: 'offered'
		});
		expect(await row(id)).toMatchObject({
			status: 'expired',
			end_reason: 'hold_expired',
			ended_at: NOW + 2 * H,
			offer_token_hash: null
		});
	});

	it('un aviso a todes (sin reserva) no vence por tiempo', async () => {
		const id = await waiting();
		await offer(id, null);
		expect(
			await endWaitlistEntry(t.db, id, { reason: 'hold_expired', now: NOW + 99 * H })
		).toBeNull();
		// Lo cierra el cierre de la lista.
		expect(await endWaitlistEntry(t.db, id, { reason: 'closed', now: NOW + 99 * H })).toMatchObject(
			{
				was: 'offered'
			}
		);
	});

	it('une admin termina una reserva (solo una oferta)', async () => {
		const id = await waiting();
		expect(await endWaitlistEntry(t.db, id, { reason: 'admin', by: 'admin', now: NOW })).toBeNull();
		await offer(id, NOW + 2 * H);
		expect(
			await endWaitlistEntry(t.db, id, { reason: 'admin', by: 'admin', now: NOW })
		).toMatchObject({ was: 'offered' });
		expect(await row(id)).toMatchObject({
			status: 'expired',
			end_reason: 'admin',
			ended_by: 'admin'
		});
	});

	it('cierre, evento cancelado o tipo borrado: desde la fila o con oferta; no sin confirmar', async () => {
		const a = await waiting();
		expect(await endWaitlistEntry(t.db, a, { reason: 'event_cancelled', now: NOW })).toMatchObject({
			was: 'waiting'
		});
		const p = /** @type {any} */ (
			await joinWaitlist(t.db, { eventSlug: SLUG, email: 'otra@example.com', now: NOW })
		);
		expect(await endWaitlistEntry(t.db, p.id, { reason: 'closed', now: NOW })).toBeNull();
		expect((await row(p.id))?.status).toBe('pending_confirmation');
		// Ya terminada: no se termina otra vez.
		expect(await endWaitlistEntry(t.db, a, { reason: 'type_removed', now: NOW })).toBeNull();
		expect((await row(a))?.end_reason).toBe('event_cancelled');
	});

	it('un motivo desconocido es un error', async () => {
		await expect(
			endWaitlistEntry(t.db, uuid(), { reason: /** @type {any} */ ('left'), now: NOW })
		).rejects.toThrow(RangeError);
	});
});

describe('volver a anotarse después de vencer', () => {
	it('entra al final de la fila, sin confirmar otra vez', async () => {
		const id = await waiting();
		const second = await waiting({ email: 'segunda@example.com' });
		await offer(id, NOW + H);
		await endWaitlistEntry(t.db, id, { reason: 'hold_expired', now: NOW + H });
		const r = await rejoinWaitlist(t.db, id, NOW + 2 * H);
		expect(r).toMatchObject({ status: 'waiting' });
		const fresh = await row(/** @type {any} */ (r).id);
		expect(fresh).toMatchObject({ status: 'waiting', email: EMAIL, confirmed_at: NOW + 2 * H });
		expect(fresh?.confirmed_at).toBeGreaterThan(
			/** @type {number} */ ((await row(second))?.confirmed_at)
		);
		// Otra vez con el mismo link: ya está.
		expect(await rejoinWaitlist(t.db, id, NOW + 3 * H)).toEqual({
			status: 'already',
			id: fresh?.id
		});
	});

	it('solo desde una reserva vencida (no si salió, la sacaron o sigue viva)', async () => {
		const id = await waiting();
		expect(await rejoinWaitlist(t.db, id, NOW)).toBeNull();
		await leaveWaitlist(t.db, id, { now: NOW });
		expect(await rejoinWaitlist(t.db, id, NOW)).toBeNull();
		const b = await waiting({ email: 'otra@example.com' });
		await endWaitlistEntry(t.db, b, { reason: 'closed', now: NOW });
		expect(await rejoinWaitlist(t.db, b, NOW)).toBeNull();
		expect(await rejoinWaitlist(t.db, uuid(), NOW)).toBeNull();
	});
});

describe('compró con su oferta', () => {
	it('offered → purchased con la orden; el token queda (por si la orden no se paga)', async () => {
		const id = await waiting();
		await offer(id, NOW + 2 * H);
		const orderId = await order();
		expect(await markPurchased(t.db, { entryId: id, orderId, now: NOW + H })).toBe(true);
		const r = await row(id);
		expect(r).toMatchObject({ status: 'purchased', order_id: orderId });
		expect(r?.offer_token_hash).toBe(await sha256Hex(`oferta-${id}`));
		// Una segunda compra con la misma oferta no la vuelve a usar.
		expect(await markPurchased(t.db, { entryId: id, orderId: await order(), now: NOW + H })).toBe(
			false
		);
		expect((await row(id))?.order_id).toBe(orderId);
	});

	it('va en la misma tanda que la orden (como lo usará reserveOrder)', async () => {
		const id = await waiting();
		await offer(id, null);
		const orderId = uuid();
		await t.db.batch([
			t.db
				.prepare(
					`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, subtotal, total,
						buyer_name, buyer_email, status, created_at, updated_at, expires_at)
					VALUES (?1, ?2, 'general', 1, 1000, 1000, 1000, 'Persona de Prueba', ?3, 'pending', ?4, ?4, ?4)`
				)
				.bind(orderId, SLUG, EMAIL, NOW),
			markPurchasedStatement(t.db, { entryId: id, orderId, now: NOW })
		]);
		expect(await row(id)).toMatchObject({ status: 'purchased', order_id: orderId });
	});

	it('no cambia nada: oferta vencida, sin oferta, orden inexistente, de otro evento o de otro tipo', async () => {
		const expired = await waiting();
		await offer(expired, NOW + H);
		expect(
			await markPurchased(t.db, { entryId: expired, orderId: await order(), now: NOW + H })
		).toBe(false);
		const plain = await waiting({ email: 'b@example.com' });
		expect(await markPurchased(t.db, { entryId: plain, orderId: await order(), now: NOW })).toBe(
			false
		);
		const offered = await waiting({ email: 'c@example.com' });
		await offer(offered, NOW + 2 * H);
		expect(await markPurchased(t.db, { entryId: offered, orderId: uuid(), now: NOW })).toBe(false);
		expect(
			await markPurchased(t.db, {
				entryId: offered,
				orderId: await order({ slug: 'otro-evento' }),
				now: NOW
			})
		).toBe(false);
		const typed = await waiting({ email: 'd@example.com', ticketType: 'vip' });
		await offer(typed, NOW + 2 * H);
		expect(
			await markPurchased(t.db, {
				entryId: typed,
				orderId: await order({ type: 'general' }),
				now: NOW
			})
		).toBe(false);
		expect(
			await markPurchased(t.db, { entryId: typed, orderId: await order({ type: 'vip' }), now: NOW })
		).toBe(true);
		for (const id of [expired, plain, offered])
			expect((await row(id))?.status, id).not.toBe('purchased');
	});
});

describe('anotaciones sin confirmar', () => {
	it('se borran a las 48 h; las confirmadas quedan', async () => {
		const old = /** @type {any} */ (
			await joinWaitlist(t.db, { eventSlug: SLUG, email: EMAIL, now: NOW })
		);
		const recent = /** @type {any} */ (
			await joinWaitlist(t.db, { eventSlug: SLUG, email: 'nueva@example.com', now: NOW + H })
		);
		const confirmed = await waiting({ email: 'confirmada@example.com' });
		expect(await deleteExpiredUnconfirmed(t.db, NOW + WAITLIST_CONFIRM_TTL_MS - 1)).toBe(0);
		expect(await deleteExpiredUnconfirmed(t.db, NOW + WAITLIST_CONFIRM_TTL_MS)).toBe(1);
		expect(await row(old.id)).toBeNull();
		expect((await row(recent.id))?.status).toBe('pending_confirmation');
		expect((await row(confirmed))?.status).toBe('waiting');
	});
});
