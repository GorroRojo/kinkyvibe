import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { isValidCronSecret } from '$lib/server/cron.js';
import { applyPayment, reserveOrder } from './orders.js';
import {
	DEFAULT_REMINDERS,
	EVE_TIME,
	describeReminder,
	describeScheduledReminder,
	dueReminderOrders,
	dueReminderPlan,
	parseReminders,
	reminderDueAt,
	reminderId,
	reminderKey,
	reminderSchedule,
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

describe('evento que empieza antes de las 9: el «mismo día» sale la noche anterior', () => {
	const reminders = DEFAULT_REMINDERS;
	const SAME_DAY = DEFAULT_REMINDERS[1];
	/** @param {string} iso */
	const at = (iso) => Date.parse(iso);
	/** @param {number} start */
	const schedule = (start) =>
		reminderSchedule(reminders, start).map(({ reminder, due, eve }) => ({
			id: reminderId(reminder),
			due,
			eve
		}));

	it('el borde de las 9:00 (hora de Argentina, UTC−3 todo el año)', () => {
		expect(EVE_TIME).toBe('20:00');
		// 8:59: la noche anterior a las 20:00.
		expect(schedule(at('2026-12-12T08:59:00-03:00'))).toEqual([
			{ id: 'h48', due: at('2026-12-10T08:59:00-03:00'), eve: false },
			{ id: 'd0-0900', due: at('2026-12-11T20:00:00-03:00'), eve: true }
		]);
		// Justo a las 9:00: a la hora de empezar no sirve; también la noche anterior.
		expect(schedule(at('2026-12-12T09:00:00-03:00'))[1]).toEqual({
			id: 'd0-0900',
			due: at('2026-12-11T20:00:00-03:00'),
			eve: true
		});
		// 9:01: como siempre, el mismo día a las 9:00.
		expect(schedule(at('2026-12-12T09:01:00-03:00'))[1]).toEqual({
			id: 'd0-0900',
			due: at('2026-12-12T09:00:00-03:00'),
			eve: false
		});
	});

	it('la fecha es la de Argentina, aunque en UTC ya sea otro día', () => {
		// Domingo 00:30 en Argentina = domingo 03:30 UTC: la noche anterior es el sábado a las 20:00
		// de Argentina (23:00 UTC del sábado).
		const start = at('2026-12-13T00:30:00-03:00');
		expect(schedule(start)[1]).toEqual({
			id: 'd0-0900',
			due: at('2026-12-12T20:00:00-03:00'),
			eve: true
		});
		expect(new Date(schedule(start)[1].due).toISOString()).toBe('2026-12-12T23:00:00.000Z');
		// 1 de enero a las 7 en Argentina: la noche anterior es el 31/12 (cambia el año).
		expect(schedule(at('2027-01-01T07:00:00-03:00'))[1].due).toBe(at('2026-12-31T20:00:00-03:00'));
		// Sin horario de verano: el mismo corrimiento en pleno invierno.
		expect(schedule(at('2026-07-15T08:00:00-03:00'))[1].due).toBe(at('2026-07-14T20:00:00-03:00'));
		// Lo que antes salía igual sigue igual: el «día anterior» configurado no se mueve.
		const dayBefore = {
			kind: /** @type {const} */ ('day_at'),
			days: 1,
			time: '20:00',
			enabled: true
		};
		expect(reminderSchedule([dayBefore], at('2026-12-12T08:00:00-03:00'))).toEqual([
			{ reminder: dayBefore, due: at('2026-12-11T20:00:00-03:00'), eve: false }
		]);
	});

	it('no se duplica con otro recordatorio de último momento', () => {
		const start = at('2026-12-12T08:00:00-03:00');
		// «El día anterior a las 20:00» activado: ya hay uno la noche anterior, no sale otro.
		const withDayBefore = [
			...reminders,
			{ kind: /** @type {const} */ ('day_at'), days: 1, time: '20:00', enabled: true }
		];
		expect(reminderSchedule(withDayBefore, start).map((s) => reminderId(s.reminder))).toEqual([
			'h48',
			'd1-2000'
		]);
		// «12 horas antes» (20:00 del día anterior también): lo mismo.
		const with12h = [
			...reminders,
			{ kind: /** @type {const} */ ('hours_before'), hours: 12, enabled: true }
		];
		expect(reminderSchedule(with12h, start).map((s) => reminderId(s.reminder))).toEqual([
			'h48',
			'h12'
		]);
		// Dos «el mismo día» (9:00 y 10:00): uno solo pasa a la noche anterior.
		const twoSameDay = [SAME_DAY, { ...SAME_DAY, time: '10:00' }];
		expect(reminderSchedule(twoSameDay, start)).toEqual([
			{ reminder: SAME_DAY, due: at('2026-12-11T20:00:00-03:00'), eve: true }
		]);
		// Desactivado: nada.
		expect(reminderSchedule([{ ...SAME_DAY, enabled: false }], start)).toEqual([]);
	});

	it('se manda una vez, la noche anterior, con el mismo id, y el mail dice «es mañana»', async () => {
		const start = at('2026-12-12T08:00:00-03:00');
		const event = { slug: 'fiesta', start, reminders: true, cancelled: false };
		await order(start - 10 * 24 * H);
		/** @type {string[]} */
		const sent = [];
		/** @type {any[]} */
		const got = [];
		const send = async (/** @type {any} */ o, /** @type {any} */ r) => {
			sent.push(reminderKey(r));
			got.push(r);
			return true;
		};
		// A las 19:59 del día anterior: todavía no (el de 48 h ya salió).
		await sendDueReminders(t.db, {
			events: [event],
			reminders,
			now: at('2026-12-11T19:59:00-03:00'),
			send
		});
		expect(sent).toEqual(['h48']);
		// A las 20:00: el «mismo día», con su id de siempre.
		await sendDueReminders(t.db, {
			events: [event],
			reminders,
			now: at('2026-12-11T20:00:00-03:00'),
			send
		});
		expect(sent).toEqual(['h48', 'd0-0900']);
		expect(got[1]).toMatchObject({ kind: 'day_at', days: 0, time: '09:00', eve: true });
		// Las corridas siguientes (también a la mañana del evento) no lo repiten.
		for (const now of [at('2026-12-11T23:00:00-03:00'), at('2026-12-12T07:45:00-03:00')]) {
			await sendDueReminders(t.db, { events: [event], reminders, now, send });
		}
		// Si después el evento pasa a las 10, el de las 9:00 tampoco vuelve a salir (mismo id).
		await sendDueReminders(t.db, {
			events: [{ ...event, start: at('2026-12-12T10:00:00-03:00') }],
			reminders,
			now: at('2026-12-12T09:15:00-03:00'),
			send
		});
		expect(sent).toEqual(['h48', 'd0-0900']);
		const { results } = await t.db
			.prepare('SELECT reminder_id, status FROM reminder_sends ORDER BY reminder_id')
			.all();
		expect(results).toEqual([
			{ reminder_id: 'd0-0900', status: 'sent' },
			{ reminder_id: 'h48', status: 'sent' }
		]);
		const { buildReminderEmail } = await import('./email.js');
		const mail = buildReminderEmail({
			order: /** @type {any} */ ({ id: 'x', buyer_name: 'Ale' }),
			tickets: /** @type {any} */ ([{ token: 't'.repeat(43), code: 'ABC234', holder_name: 'Ale' }]),
			reminder: got[1],
			event: { title: 'Fiesta', start: '2026-12-12T08:00-03:00', location: 'Lugar' },
			typeName: 'General',
			origin: 'https://kinkyvibe.ar',
			contactEmail: 'c@example.com'
		});
		expect(mail.subject).toBe('Recordatorio: Fiesta es mañana');
	});

	it('quien compra después de las 20:00 del día anterior no lo recibe', async () => {
		const start = at('2026-12-12T08:00:00-03:00');
		const event = { slug: 'fiesta', start, reminders: true, cancelled: false };
		await order(at('2026-12-11T21:00:00-03:00'));
		const due = await dueReminderOrders(t.db, {
			events: [event],
			reminders,
			now: at('2026-12-12T07:00:00-03:00')
		});
		expect(due).toHaveLength(0);
		expect(
			dueReminderPlan({ events: [event], reminders, now: at('2026-12-12T07:00:00-03:00') })
		).toMatchObject([
			{ id: 'h48', eve: false },
			{ id: 'd0-0900', eve: true, due: at('2026-12-11T20:00:00-03:00') }
		]);
	});

	it('texto para el panel', () => {
		expect(describeScheduledReminder(SAME_DAY, false)).toBe('el mismo día a las 9:00');
		expect(describeScheduledReminder(SAME_DAY, true)).toBe(
			'el mismo día a las 9:00 → el día anterior a las 20:00 (empieza antes)'
		);
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
