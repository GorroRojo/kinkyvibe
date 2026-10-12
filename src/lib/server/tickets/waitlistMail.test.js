/**
 * Links y envíos de la lista de espera (waitlistMail.js) y `sendState.js` con las filas por
 * anotación de `waitlist_sends` (clave de dos columnas: `kind` y `round`). D1 de miniflare; mails
 * inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	MAX_ATTEMPTS,
	STALE_CLAIM_MS,
	claimSend,
	expireStaleClaims,
	finishSend,
	pendingSendSql,
	sendBatch
} from './sendState.js';
import { joinWaitlist } from './waitlist.js';
import {
	WAITLIST_LEAVE_KEY,
	checkWaitlistLinkToken,
	sendWaitlistEntryMail,
	waitlistConfirmUrl,
	waitlistIdempotencyKey,
	waitlistLeaveUrl,
	waitlistOfferUrl,
	waitlistRejoinUrl
} from './waitlistMail.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

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
const ORIGIN = 'https://kinkyvibe.example';
const MESSAGE = { subject: 'Asunto', html: '<p>hola</p>', text: 'hola' };

/** Una anotación (sin confirmar alcanza: `waitlist_sends` solo pide que exista). */
async function entry(email = 'persona@example.com') {
	const r = /** @type {any} */ (
		await joinWaitlist(t.db, { eventSlug: 'evento-de-prueba', email, now: NOW })
	);
	return /** @type {string} */ (r.id);
}

/** @param {string} entryId */
async function sends(entryId) {
	const { results } = await t.db
		.prepare(
			'SELECT kind, round, status, attempts FROM waitlist_sends WHERE entry_id = ?1 ORDER BY kind, round'
		)
		.bind(entryId)
		.all();
	return results;
}

describe('sendState con filas por anotación (waitlist_sends)', () => {
	it('reserva una vez por anotación, mail y ronda; otra ronda u otro mail es otro envío', async () => {
		const id = await entry();
		const ref = { entryId: id, key: /** @type {const} */ (['offer', 1]) };
		expect(await claimSend(t.db, 'waitlist_sends', { ...ref, now: NOW })).toBe(true);
		expect(await claimSend(t.db, 'waitlist_sends', { ...ref, now: NOW })).toBe(false);
		expect(
			await claimSend(t.db, 'waitlist_sends', { entryId: id, key: ['offer', 2], now: NOW })
		).toBe(true);
		expect(
			await claimSend(t.db, 'waitlist_sends', { entryId: id, key: ['reminder', 1], now: NOW })
		).toBe(true);
		await finishSend(t.db, 'waitlist_sends', { ...ref, ok: true, now: NOW });
		expect(await claimSend(t.db, 'waitlist_sends', { ...ref, now: NOW + 1 })).toBe(false);
		expect(await sends(id)).toEqual([
			{ kind: 'offer', round: 1, status: 'sent', attempts: 1 },
			{ kind: 'offer', round: 2, status: 'sending', attempts: 1 },
			{ kind: 'reminder', round: 1, status: 'sending', attempts: 1 }
		]);
	});

	it('lo que falla se reintenta hasta MAX_ATTEMPTS y queda failed; lo colgado se rinde', async () => {
		const id = await entry();
		const ref = { entryId: id, key: /** @type {const} */ (['expired', 1]) };
		for (let i = 1; i <= MAX_ATTEMPTS; i++) {
			expect(await claimSend(t.db, 'waitlist_sends', { ...ref, now: NOW + i })).toBe(true);
			await finishSend(t.db, 'waitlist_sends', { ...ref, ok: false, now: NOW + i });
		}
		expect(await sends(id)).toEqual([
			{ kind: 'expired', round: 1, status: 'failed', attempts: MAX_ATTEMPTS }
		]);
		expect(await claimSend(t.db, 'waitlist_sends', { ...ref, now: NOW + 10 })).toBe(false);

		// Una reserva colgada se puede volver a tomar; con todos los intentos usados, failed.
		const other = await entry('otra.persona@example.com');
		const hung = { entryId: other, key: /** @type {const} */ (['closed', 0]) };
		expect(await claimSend(t.db, 'waitlist_sends', { ...hung, now: NOW })).toBe(true);
		const later = NOW + STALE_CLAIM_MS + 1;
		expect(await claimSend(t.db, 'waitlist_sends', { ...hung, now: later })).toBe(true);
		expect(
			await claimSend(t.db, 'waitlist_sends', { ...hung, now: later + STALE_CLAIM_MS + 1 })
		).toBe(true);
		await expireStaleClaims(t.db, 'waitlist_sends', later + 3 * STALE_CLAIM_MS);
		expect(await sends(other)).toEqual([
			{ kind: 'closed', round: 0, status: 'failed', attempts: MAX_ATTEMPTS }
		]);
	});

	it('pendingSendSql sirve sobre waitlist_entries (alias y dos parámetros de clave)', async () => {
		const a = await entry('a@example.com');
		const b = await entry('b@example.com');
		await claimSend(t.db, 'waitlist_sends', { entryId: a, key: ['offer', 1], now: NOW });
		await finishSend(t.db, 'waitlist_sends', { entryId: a, key: ['offer', 1], ok: true, now: NOW });
		const sql = `SELECT w.id FROM waitlist_entries w WHERE ${pendingSendSql('waitlist_sends', {
			key: [1, 2],
			stale: 3,
			alias: 'w'
		})} ORDER BY w.id`;
		const { results } = await t.db
			.prepare(sql)
			.bind('offer', 1, NOW - STALE_CLAIM_MS)
			.all();
		expect(results.map((r) => r.id)).toEqual([b]);
	});

	it('sendBatch con anotaciones: manda cada una una vez', async () => {
		const ids = [await entry('a@example.com'), await entry('b@example.com')];
		/** @type {string[]} */
		const sent = [];
		const run = () =>
			sendBatch(t.db, 'waitlist_sends', {
				items: ids,
				limit: 10,
				now: NOW,
				claim: (id) => ({ entryId: id, key: ['offer', 1] }),
				send: async (id) => {
					sent.push(id);
					return true;
				},
				label: 'la oferta'
			});
		expect(await run()).toEqual({ sent: 2, failed: 0, remaining: 0 });
		expect(await run()).toEqual({ sent: 0, failed: 0, remaining: 0 });
		expect(sent).toEqual(ids);
	});

	it('falta la anotación o la clave no tiene sus dos valores: error (no una fila rota)', async () => {
		await expect(
			claimSend(t.db, 'waitlist_sends', { orderId: 'x', key: ['offer', 1], now: NOW })
		).rejects.toThrow(/entryId/);
		const id = await entry();
		await expect(
			claimSend(t.db, 'waitlist_sends', { entryId: id, key: 'offer', now: NOW })
		).rejects.toThrow(/2 valores/);
		await expect(
			claimSend(t.db, /** @type {any} */ ('otra_tabla'), { orderId: 'x', key: 1, now: NOW })
		).rejects.toThrow(/desconocida/);
	});
});

describe('sendWaitlistEntryMail', () => {
	it('manda una sola vez, con la clave de idempotencia de esa ronda; arma el mail solo si lo manda', async () => {
		const id = await entry();
		/** @type {any[]} */
		const calls = [];
		/** @type {import('./waitlistMail.js').WaitlistSend} */
		const send = async (to, message, key) => {
			calls.push({ to, subject: message.subject, key });
			return 'sent';
		};
		const build = vi.fn(() => MESSAGE);
		const input = {
			entryId: id,
			kind: /** @type {const} */ ('offer'),
			round: 2,
			to: 'persona@example.com',
			build,
			send,
			now: NOW
		};
		expect(await sendWaitlistEntryMail(t.db, input)).toBe('sent');
		expect(await sendWaitlistEntryMail(t.db, input)).toBe('skipped');
		expect(build).toHaveBeenCalledTimes(1);
		expect(calls).toEqual([
			{ to: 'persona@example.com', subject: 'Asunto', key: `waitlist-offer-${id}-2` }
		]);
		// El cierre es uno por anotación (sin ronda).
		expect(await sendWaitlistEntryMail(t.db, { ...input, kind: 'closed', round: 7 })).toBe('sent');
		expect(await sendWaitlistEntryMail(t.db, { ...input, kind: 'closed', round: 8 })).toBe(
			'skipped'
		);
		expect(calls.at(-1).key).toBe(`waitlist-closed-${id}`);
		expect(await sends(id)).toEqual([
			{ kind: 'closed', round: 0, status: 'sent', attempts: 1 },
			{ kind: 'offer', round: 2, status: 'sent', attempts: 1 }
		]);
	});

	it('si falla queda para reintentar, sin loguear el mail', async () => {
		const id = await entry();
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const input = {
			entryId: id,
			kind: /** @type {const} */ ('reminder'),
			round: 1,
			to: 'persona@example.com',
			build: () => MESSAGE,
			send: async () => {
				throw new Error('Resend caído');
			},
			now: NOW
		};
		expect(await sendWaitlistEntryMail(t.db, input)).toBe('failed');
		expect(await sends(id)).toEqual([{ kind: 'reminder', round: 1, status: 'retry', attempts: 1 }]);
		expect(errors.mock.calls.flat().map(String).join('\n')).not.toContain('persona@example.com');
		errors.mockRestore();
		expect(
			await sendWaitlistEntryMail(t.db, { ...input, send: async () => 'failed', now: NOW + 1 })
		).toBe('failed');
		expect(
			await sendWaitlistEntryMail(t.db, { ...input, send: async () => 'sent', now: NOW + 2 })
		).toBe('sent');
		expect(await sends(id)).toEqual([{ kind: 'reminder', round: 1, status: 'sent', attempts: 3 }]);
		await expect(
			sendWaitlistEntryMail(t.db, { ...input, kind: /** @type {any} */ ('otro') })
		).rejects.toThrow(RangeError);
	});

	it('claves de idempotencia', () => {
		expect(waitlistIdempotencyKey('offer', 'e', 3)).toBe('waitlist-offer-e-3');
		expect(waitlistIdempotencyKey('reminder', 'e', 3)).toBe('waitlist-reminder-e-3');
		expect(waitlistIdempotencyKey('expired', 'e', 3)).toBe('waitlist-expired-e-3');
		expect(waitlistIdempotencyKey('closed', 'e', 3)).toBe('waitlist-closed-e');
	});
});

describe('links de la lista', () => {
	it('salir y volver van firmados, cada uno con su uso; una firma inventada no vale', async () => {
		const id = await entry();
		const leave = await waitlistLeaveUrl(t.db, `${ORIGIN}/`, id);
		const rejoin = await waitlistRejoinUrl(t.db, ORIGIN, id);
		expect(leave).toMatch(
			new RegExp(`^${ORIGIN}/lista-de-espera/salir/${id}\\.[A-Za-z0-9_-]{32}$`)
		);
		expect(rejoin).toMatch(
			new RegExp(`^${ORIGIN}/lista-de-espera/volver/${id}\\.[A-Za-z0-9_-]{32}$`)
		);
		const leaveToken = leave.split('/').pop();
		const rejoinToken = rejoin.split('/').pop();
		expect(await checkWaitlistLinkToken(t.db, 'leave', leaveToken)).toBe(id);
		expect(await checkWaitlistLinkToken(t.db, 'rejoin', rejoinToken)).toBe(id);
		// Un link no sirve para lo otro.
		expect(await checkWaitlistLinkToken(t.db, 'rejoin', leaveToken)).toBeNull();
		expect(await checkWaitlistLinkToken(t.db, 'leave', rejoinToken)).toBeNull();
		// Firma inventada, de otra anotación o rota.
		const other = await entry('otra.persona@example.com');
		const sig = String(leaveToken).split('.')[1];
		expect(await checkWaitlistLinkToken(t.db, 'leave', `${other}.${sig}`)).toBeNull();
		expect(await checkWaitlistLinkToken(t.db, 'leave', `${id}.${'A'.repeat(32)}`)).toBeNull();
		expect(await checkWaitlistLinkToken(t.db, 'leave', `${id}.corta`)).toBeNull();
		expect(await checkWaitlistLinkToken(t.db, 'leave', id)).toBeNull();
		expect(await checkWaitlistLinkToken(t.db, 'leave', null)).toBeNull();
		// La clave se creó sola en ticket_settings (nunca en el repo).
		const key = await t.db
			.prepare('SELECT value FROM ticket_settings WHERE key = ?1')
			.bind(WAITLIST_LEAVE_KEY)
			.first();
		expect(String(key?.value)).toHaveLength(43);
	});

	it('confirmar y la oferta', () => {
		expect(waitlistConfirmUrl(`${ORIGIN}/`, 'abc')).toBe(`${ORIGIN}/lista-de-espera/confirmar/abc`);
		expect(waitlistOfferUrl(ORIGIN, 'fiesta-de-prueba', 'a-b_c')).toBe(
			`${ORIGIN}/calendario/fiesta-de-prueba/entradas?lista=a-b_c`
		);
	});
});
