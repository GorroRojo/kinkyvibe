/**
 * La migración 0053 (lista de espera): las reglas de la tabla, sin pasar por el código. Cada CHECK
 * rechaza lo que tiene que rechazar, la anotación viva es una por mail y alcance (y se puede
 * volver a anotar después de vencer o salir), y borrar una anotación borra sus envíos.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from './testing.js';

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
const HASH = 'a'.repeat(64);
const HASH2 = 'b'.repeat(64);
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

/**
 * Inserta una anotación. Por defecto, `waiting` en todo el evento.
 * @param {Record<string, unknown>} [over]
 */
async function entry(over = {}) {
	const row = {
		id: uuid(),
		event_slug: 'evento-de-prueba',
		ticket_type: null,
		email: 'persona@example.com',
		status: 'waiting',
		confirm_hash: null,
		confirm_expires_at: null,
		confirmed_at: NOW,
		offer_token_hash: null,
		offered_at: null,
		hold_until: null,
		order_id: null,
		ended_at: null,
		end_reason: null,
		ended_by: null,
		created_at: NOW,
		updated_at: NOW,
		...over
	};
	const cols = Object.keys(row);
	await t.db
		.prepare(
			`INSERT INTO waitlist_entries (${cols.join(', ')}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')})`
		)
		.bind(...Object.values(row))
		.run();
	return String(row.id);
}

async function order() {
	const id = uuid();
	await t.db
		.prepare(
			`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, subtotal, total,
				buyer_name, buyer_email, status, created_at, updated_at, expires_at)
			VALUES (?1, 'evento-de-prueba', 'general', 1, 1000, 1000, 1000, 'Persona de Prueba',
				'persona@example.com', 'approved', ?2, ?2, ?2)`
		)
		.bind(id, NOW)
		.run();
	return id;
}

const pending = {
	status: 'pending_confirmation',
	confirmed_at: null,
	confirm_hash: HASH,
	confirm_expires_at: NOW
};
const offered = {
	status: 'offered',
	offer_token_hash: HASH2,
	offered_at: NOW,
	hold_until: NOW + 1
};

describe('migración 0053: waitlist_entries', () => {
	it('acepta cada estado bien formado', async () => {
		await entry({ ...pending, email: 'a@example.com' });
		await entry({ email: 'b@example.com' });
		await entry({ ...offered, email: 'c@example.com' });
		await entry({
			...offered,
			offer_token_hash: 'c'.repeat(64),
			hold_until: null,
			email: 'd@example.com'
		});
		await entry({
			status: 'purchased',
			order_id: await order(),
			offered_at: NOW,
			email: 'e@example.com'
		});
		await entry({
			status: 'expired',
			end_reason: 'hold_expired',
			ended_at: NOW,
			email: 'f@example.com'
		});
		await entry({ status: 'cancelled', end_reason: 'left', ended_at: NOW, email: 'g@example.com' });
		await entry({
			status: 'cancelled',
			end_reason: 'admin',
			ended_at: NOW,
			ended_by: 'admin',
			email: 'h@example.com'
		});
		await entry({ ticket_type: 'general', email: 'a@example.com' });
		const r = await t.db.prepare('SELECT COUNT(*) AS n FROM waitlist_entries').first();
		expect(r?.n).toBe(9);
	});

	/** @type {[string, Record<string, unknown>][]} */
	const bad = [
		['id que no es UUID', { id: 'corto' }],
		['slug vacío', { event_slug: '' }],
		['tipo vacío', { ticket_type: '' }],
		['mail con mayúsculas', { email: 'Persona@example.com' }],
		['mail con espacios', { email: ' persona@example.com' }],
		['estado desconocido', { status: 'paused' }],
		['hash de confirmar corto', { ...pending, confirm_hash: 'abc' }],
		['sin confirmar y sin hash', { ...pending, confirm_hash: null }],
		['sin confirmar y sin vencimiento', { ...pending, confirm_expires_at: null }],
		['esperando sin confirmed_at', { confirmed_at: null }],
		['oferta sin token', { ...offered, offer_token_hash: null }],
		['oferta sin offered_at', { ...offered, offered_at: null }],
		['reserva sin offered_at', { hold_until: NOW }],
		['comprada sin orden', { status: 'purchased', offered_at: NOW }],
		['vencida sin motivo', { status: 'expired', ended_at: NOW }],
		['cancelada sin fecha', { status: 'cancelled', end_reason: 'admin' }],
		['viva con motivo', { end_reason: 'admin', ended_at: NOW }],
		['motivo desconocido', { status: 'expired', end_reason: 'aburrimiento', ended_at: NOW }],
		['salió pero quedó vencida', { status: 'expired', end_reason: 'left', ended_at: NOW }],
		['ronda negativa', { offer_count: -1 }],
		['orden que no existe', { order_id: 'no-existe' }]
	];
	for (const [name, over] of bad) {
		it(`rechaza: ${name}`, async () => {
			await expect(entry(over)).rejects.toThrow(/constraint/i);
		});
	}

	it('una anotación viva por mail y alcance; se puede volver a anotar después de vencer o salir', async () => {
		await entry();
		// Otra viva, en el mismo alcance (aunque sea otro estado vivo): no.
		await expect(entry()).rejects.toThrow(/UNIQUE/);
		await expect(entry(pending)).rejects.toThrow(/UNIQUE/);
		await expect(entry(offered)).rejects.toThrow(/UNIQUE/);
		// En otro alcance (un tipo, otro evento) u otro mail: sí.
		await entry({ ticket_type: 'general' });
		await entry({ event_slug: 'otro-evento' });
		await entry({ email: 'otra@example.com' });
		// Terminada: no cuenta, se puede volver a anotar.
		await t.db
			.prepare(
				`UPDATE waitlist_entries SET status = 'expired', end_reason = 'hold_expired', ended_at = ?1
				WHERE event_slug = 'evento-de-prueba' AND ticket_type IS NULL AND email = 'persona@example.com'`
			)
			.bind(NOW)
			.run();
		const again = await entry();
		await t.db
			.prepare(
				"UPDATE waitlist_entries SET status = 'cancelled', end_reason = 'left', ended_at = ?2 WHERE id = ?1"
			)
			.bind(again, NOW)
			.run();
		await entry();
		// Comprada tampoco cuenta como viva.
		const o = await order();
		await t.db
			.prepare(
				`UPDATE waitlist_entries SET status = 'purchased', order_id = ?1
				WHERE status = 'waiting' AND event_slug = 'evento-de-prueba' AND ticket_type IS NULL`
			)
			.bind(o)
			.run();
		await entry();
	});

	it('los tokens de confirmar y de oferta no se repiten', async () => {
		await entry({ ...pending });
		await expect(entry({ ...pending, email: 'otra@example.com' })).rejects.toThrow(/UNIQUE/);
		await entry({ ...offered, email: 'b@example.com' });
		await expect(entry({ ...offered, email: 'c@example.com' })).rejects.toThrow(/UNIQUE/);
	});
});

describe('migración 0053: waitlist_sends', () => {
	/** @param {string} entryId @param {Record<string, unknown>} [over] */
	const send = (entryId, over = {}) => {
		const row = {
			entry_id: entryId,
			kind: 'offer',
			round: 1,
			status: 'sent',
			sent_at: NOW,
			...over
		};
		const cols = Object.keys(row);
		return t.db
			.prepare(
				`INSERT INTO waitlist_sends (${cols.join(', ')}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')})`
			)
			.bind(...Object.values(row))
			.run();
	};

	it('un envío por anotación, tipo y ronda; CHECKs de tipo y estado', async () => {
		const id = await entry(offered);
		await send(id);
		await send(id, { round: 2 });
		await send(id, { kind: 'reminder' });
		await send(id, { kind: 'closed', round: 0 });
		await expect(send(id)).rejects.toThrow(/UNIQUE|PRIMARY/);
		await expect(send(id, { kind: 'otro', round: 9 })).rejects.toThrow(/constraint/i);
		await expect(send(id, { status: 'mandado', round: 9 })).rejects.toThrow(/constraint/i);
		await expect(send(id, { round: -1 })).rejects.toThrow(/constraint/i);
		await expect(send(uuid())).rejects.toThrow(/FOREIGN KEY/);
	});

	it('borrar la anotación borra sus envíos (cascada)', async () => {
		const id = await entry(offered);
		const other = await entry({ email: 'otra@example.com' });
		await send(id);
		await send(id, { kind: 'reminder' });
		await send(other, { kind: 'closed', round: 0 });
		await t.db.prepare('DELETE FROM waitlist_entries WHERE id = ?1').bind(id).run();
		const { results } = await t.db.prepare('SELECT entry_id FROM waitlist_sends').all();
		expect(results.map((r) => r.entry_id)).toEqual([other]);
	});
});
