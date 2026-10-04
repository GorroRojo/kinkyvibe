import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { isValidCronSecret } from '$lib/server/cron.js';
import { applyPayment, reserveOrder } from './orders.js';
import {
	DEFAULT_REMINDERS,
	describeReminder,
	dueReminderOrders,
	parseReminders,
	reminderDueAt,
	reminderId,
	reminderKey,
	sendDueReminders
} from './reminders.js';
import { validateSalesSettings } from './settings.js';

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

// Sábado 12/12/2026 21:00 en Argentina = 13/12 00:00 UTC.
const START = Date.parse('2026-12-12T21:00:00-03:00');
const H = 60 * 60 * 1000;
const EVENT = { slug: 'fiesta', start: START, reminders: true, cancelled: false };

/** @param {number} createdAt @param {boolean} [approve] */
async function order(createdAt, approve = true) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: 'fiesta',
			type: { id: 'general', price: 1000, capacity: 100 },
			quantity: 1,
			holders: [{ name: 'Persona', pronouns: 'elle' }],
			buyer: {
				name: 'Persona',
				pronouns: 'elle',
				email: `p${createdAt}@example.com`,
				dni: '30111222'
			},
			now: createdAt
		})
	);
	if (approve) {
		await applyPayment(
			t.db,
			{
				id: createdAt,
				status: 'approved',
				external_reference: r.order.id,
				transaction_amount: 1000,
				currency_id: 'ARS'
			},
			{ now: createdAt }
		);
	}
	return r.order;
}

describe('cuándo toca cada recordatorio (hora de Argentina)', () => {
	it('horas antes', () => {
		expect(reminderDueAt({ kind: 'hours_before', hours: 48, enabled: true }, START)).toBe(
			Date.parse('2026-12-10T21:00:00-03:00')
		);
	});
	it('el mismo día a las 9 (Argentina), aunque en UTC ya sea otro día', () => {
		const r = { kind: /** @type {const} */ ('day_at'), days: 0, time: '09:00', enabled: true };
		expect(reminderDueAt(r, START)).toBe(Date.parse('2026-12-12T09:00:00-03:00'));
		// Un evento a las 00:30 del domingo: "el mismo día" es el domingo.
		expect(reminderDueAt(r, Date.parse('2026-12-13T00:30:00-03:00'))).toBe(
			Date.parse('2026-12-13T09:00:00-03:00')
		);
		expect(reminderDueAt({ ...r, days: 1, time: '20:00' }, START)).toBe(
			Date.parse('2026-12-11T20:00:00-03:00')
		);
	});
	it('ids, textos y lista guardada', () => {
		expect(DEFAULT_REMINDERS.map(reminderId)).toEqual(['h48', 'd0-0900']);
		expect(DEFAULT_REMINDERS.map(describeReminder)).toEqual([
			'2 días antes',
			'el mismo día a las 9:00'
		]);
		expect(parseReminders('')).toBe(DEFAULT_REMINDERS);
		expect(parseReminders('[]')).toEqual([]);
		expect(parseReminders('roto')).toBe(DEFAULT_REMINDERS);
		expect(
			parseReminders(JSON.stringify([{ kind: 'hours_before', hours: 3 }, { kind: 'x' }]))
		).toEqual([{ kind: 'hours_before', hours: 3, enabled: true }]);
	});
	it('el formulario de ajustes arma la lista', () => {
		const r = /** @type {any} */ (
			validateSalesSettings({
				reminder_kind_0: 'hours_before',
				reminder_amount_0: '24',
				reminder_enabled_0: 'on',
				reminder_kind_1: 'day_at',
				reminder_amount_1: '0',
				reminder_time_1: '10:30',
				reminder_kind_2: 'hours_before',
				reminder_amount_2: '48',
				reminder_delete_2: 'on',
				reminder_kind_3: 'hours_before',
				reminder_amount_3: ''
			})
		);
		expect(JSON.parse(r.value.reminders)).toEqual([
			{ kind: 'hours_before', hours: 24, enabled: true },
			{ kind: 'day_at', days: 0, time: '10:30', enabled: false }
		]);
		expect(
			validateSalesSettings({
				reminder_kind_0: 'day_at',
				reminder_amount_0: '0',
				reminder_time_0: '25:00'
			}).ok
		).toBe(false);
	});
});

describe('envío de recordatorios', () => {
	const reminders = DEFAULT_REMINDERS;

	it('manda cada recordatorio una vez por compra, cuando toca', async () => {
		await order(START - 10 * 24 * H);
		await order(START - 20 * 24 * H, false); // no aprobada
		/** @type {string[]} */
		const sent = [];
		const send = async (/** @type {any} */ o, /** @type {any} */ r) => {
			sent.push(`${o.buyer_email}:${reminderId(r)}`);
			return true;
		};
		// Antes de tiempo: nada.
		expect(
			await sendDueReminders(t.db, { events: [EVENT], reminders, now: START - 49 * H, send })
		).toEqual({ sent: 0, failed: 0, remaining: 0 });
		// A las 48 h: el primero.
		await sendDueReminders(t.db, { events: [EVENT], reminders, now: START - 47 * H, send });
		// Otra corrida del cron: no repite.
		await sendDueReminders(t.db, { events: [EVENT], reminders, now: START - 46 * H, send });
		expect(sent).toEqual([`p${START - 10 * 24 * H}@example.com:h48`]);
		// El día del evento a las 9:30: el segundo.
		await sendDueReminders(t.db, {
			events: [EVENT],
			reminders,
			now: Date.parse('2026-12-12T09:30:00-03:00'),
			send
		});
		expect(sent).toHaveLength(2);
		expect(sent[1]).toMatch(/:d0-0900$/);
		// Dos corridas a la vez: nada duplicado.
		await order(START - 30 * H);
		const now = Date.parse('2026-12-12T10:00:00-03:00');
		await Promise.all([
			sendDueReminders(t.db, { events: [EVENT], reminders, now, send }),
			sendDueReminders(t.db, { events: [EVENT], reminders, now, send })
		]);
		expect(sent).toHaveLength(3);
	});

	it('no manda: eventos pasados, cancelados, sin recordatorios, ni a quien compró después', async () => {
		await order(START - 10 * 24 * H);
		await order(START - 5 * H); // compró después de "2 días antes"
		const now = START - 3 * H;
		const due = await dueReminderOrders(t.db, { events: [EVENT], reminders, now });
		// La segunda compra (16 h) llegó después de las 9: ninguno de los dos para ella.
		expect(due.map((d) => d.id).sort()).toEqual(['d0-0900', 'h48']);
		for (const events of [
			[{ ...EVENT, cancelled: true }],
			[{ ...EVENT, reminders: false }],
			[{ ...EVENT, start: now - H }]
		]) {
			expect(await dueReminderOrders(t.db, { events, reminders, now })).toHaveLength(0);
		}
		expect(
			await dueReminderOrders(t.db, {
				events: [EVENT],
				reminders: reminders.map((r) => ({ ...r, enabled: false })),
				now
			})
		).toHaveLength(0);
	});

	it('si un envío falla, se reintenta en la próxima corrida', async () => {
		await order(START - 10 * 24 * H);
		let ok = false;
		const send = async () => ok;
		const now = START - 47 * H;
		expect(await sendDueReminders(t.db, { events: [EVENT], reminders, now, send })).toEqual({
			sent: 0,
			failed: 1,
			remaining: 0
		});
		ok = true;
		expect(await sendDueReminders(t.db, { events: [EVENT], reminders, now, send })).toEqual({
			sent: 1,
			failed: 0,
			remaining: 0
		});
	});
});

describe('talleres en varias partes: un recordatorio por parte', () => {
	it('con la entrada del taller llegan los de cada parte, una vez cada uno', async () => {
		await order(START - 10 * 24 * H);
		const PART_START = START + 7 * 24 * H;
		const events = [
			EVENT,
			{
				slug: 'fiesta',
				start: PART_START,
				reminders: true,
				cancelled: false,
				part: 'fiesta-parte-2'
			}
		];
		/** @type {string[]} */
		const sent = [];
		const send = async (/** @type {any} */ o, /** @type {any} */ r, /** @type {any} */ part) => {
			sent.push(`${reminderKey(r, part ?? undefined)}`);
			return true;
		};
		const reminders = [DEFAULT_REMINDERS[0]];
		// 48 h antes de la parte 1: solo el de la parte 1.
		await sendDueReminders(t.db, { events, reminders, now: START - 47 * H, send });
		expect(sent).toEqual(['h48']);
		// 48 h antes de la parte 2 (la parte 1 ya pasó): el de la parte 2, con su propio id.
		await sendDueReminders(t.db, { events, reminders, now: PART_START - 47 * H, send });
		await sendDueReminders(t.db, { events, reminders, now: PART_START - 46 * H, send });
		expect(sent).toEqual(['h48', 'h48@fiesta-parte-2']);
		const { results } = await t.db
			.prepare('SELECT reminder_id FROM reminder_sends ORDER BY reminder_id')
			.all();
		expect(results.map((r) => r.reminder_id)).toEqual(['h48', 'h48@fiesta-parte-2']);
		// Una parte cancelada no manda.
		const due = await dueReminderOrders(t.db, {
			events: [{ ...events[1], part: 'fiesta-parte-3', cancelled: true }],
			reminders,
			now: PART_START - 47 * H
		});
		expect(due).toHaveLength(0);
	});
});

describe('secreto del cron', () => {
	const SECRET = 'un-secreto-largo-de-prueba-1234';
	it('solo con el secreto exacto, y nunca sin secreto configurado', async () => {
		expect(await isValidCronSecret(SECRET, SECRET)).toBe(true);
		expect(await isValidCronSecret(`${SECRET}x`, SECRET)).toBe(false);
		expect(await isValidCronSecret('', SECRET)).toBe(false);
		expect(await isValidCronSecret(null, SECRET)).toBe(false);
		expect(await isValidCronSecret(SECRET, undefined)).toBe(false);
		expect(await isValidCronSecret('corto', 'corto')).toBe(false);
	});
});

describe('mail del recordatorio', () => {
	it('lleva cuándo, el código de cada entrada o el link de la transmisión, sin DNI', async () => {
		const { buildReminderEmail } = await import('./email.js');
		const o = /** @type {any} */ ({ id: 'x', buyer_name: 'Ale', buyer_dni: '30111222' });
		const tickets = /** @type {any} */ ([
			{ token: 't'.repeat(43), code: 'ABC234', holder_name: 'Ale', holder_pronouns: 'elle' }
		]);
		const base = {
			order: o,
			tickets,
			typeName: 'General',
			origin: 'https://kinkyvibe.ar',
			contactEmail: 'c@example.com'
		};
		const presencial = buildReminderEmail({
			...base,
			reminder: DEFAULT_REMINDERS[1],
			event: { title: 'Fiesta', start: '2026-12-12T21:00-03:00', location: 'Lugar' }
		});
		expect(presencial.subject).toBe('Recordatorio: Fiesta es hoy');
		expect(presencial.html).toContain('ABC 234');
		expect(presencial.text).not.toContain('30111222');
		const online = buildReminderEmail({
			...base,
			reminder: DEFAULT_REMINDERS[0],
			event: { title: 'Taller', online: true, streamLink: 'https://meet.example.com/x' }
		});
		expect(online.subject).toBe('Recordatorio: Taller se acerca');
		expect(online.html).toContain('https://meet.example.com/x');
		expect(online.html).not.toContain('ABC 234');
	});
});
