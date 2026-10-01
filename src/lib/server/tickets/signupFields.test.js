/**
 * Preguntas de inscripción (B8) contra un D1 de miniflare: guardar preguntas (generales y de un
 * evento, con topes), qué pregunta cada evento, el interruptor apagado (ninguna pregunta), la
 * validación en validatePurchase, las respuestas guardadas en la MISMA tanda que la orden (y
 * nada si la reserva no entra) y lo que ve la pestaña Órdenes. Datos inventados (example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { clearFlagCache, setFlag } from '$lib/server/flags.js';
import { eventOrderRows } from '$lib/server/admin/eventOrders.js';
import { MAX_EVENT_FIELDS, fieldInputName } from '$lib/utils/signupFields.js';
import { parseTicketConfig, validatePurchase } from './config.js';
import { reserveOrder } from './orders.js';
import {
	answersByOrder,
	chosenGeneralIds,
	createField,
	deleteField,
	eventSignupFields,
	fieldsForEvent,
	listGeneralFields,
	listOwnFields,
	readAnswers,
	setChosenGeneral
} from './signupFields.js';

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
	clearFlagCache();
});

const EVENT = 'taller-de-prueba';
const BY = { by: 'admin-de-prueba', now: 1 };
const NOW = Date.parse('2026-10-01T12:00:00Z');

/** @param {string} label @param {Partial<import('$lib/utils/signupFields.js').SignupField>} [o] */
const def = (label, o = {}) => ({
	label,
	kind: /** @type {const} */ ('text'),
	required: false,
	options: [],
	...o
});

/** Una general de opciones y una propia de texto obligatoria. */
async function seedFields() {
	const general = await createField(
		t.db,
		null,
		def('¿Cómo te enteraste?', {
			kind: 'choice',
			required: true,
			options: ['Instagram', 'Una amistad']
		}),
		BY
	);
	const other = await createField(t.db, null, def('Pregunta general sin usar'), BY);
	const own = await createField(
		t.db,
		EVENT,
		def('¿Alguna restricción alimentaria?', { required: true }),
		BY
	);
	if (!general.ok || !other.ok || !own.ok) throw new Error('no se pudo sembrar');
	await setChosenGeneral(t.db, EVENT, [general.id]);
	return { general: general.id, other: other.id, own: own.id };
}

describe('guardar preguntas', () => {
	it('generales y de un evento, cada una en su lugar', async () => {
		const ids = await seedFields();
		expect((await listGeneralFields(t.db)).map((f) => f.id)).toEqual([ids.general, ids.other]);
		expect((await listOwnFields(t.db, EVENT)).map((f) => f.label)).toEqual([
			'¿Alguna restricción alimentaria?'
		]);
		expect(await listOwnFields(t.db, 'otro-evento')).toEqual([]);
		expect(await chosenGeneralIds(t.db, EVENT)).toEqual([ids.general]);
		// Primero las generales elegidas, después las propias.
		expect((await fieldsForEvent(t.db, EVENT)).map((f) => f.id)).toEqual([ids.general, ids.own]);
	});

	it('elegir generales ignora ids que no son generales; borrar respeta el lugar', async () => {
		const ids = await seedFields();
		expect(await setChosenGeneral(t.db, EVENT, [ids.own, ids.other, 999, -1])).toBe(1);
		expect(await chosenGeneralIds(t.db, EVENT)).toEqual([ids.other]);
		// La propia de un evento no se borra como general ni desde otro evento.
		expect(await deleteField(t.db, ids.own, null)).toBeNull();
		expect(await deleteField(t.db, ids.own, 'otro-evento')).toBeNull();
		expect(await deleteField(t.db, ids.own, EVENT)).toBe('¿Alguna restricción alimentaria?');
		// Borrar una general la saca de los eventos que la usaban.
		expect(await deleteField(t.db, ids.other, null)).toBe('Pregunta general sin usar');
		expect(await chosenGeneralIds(t.db, EVENT)).toEqual([]);
	});

	it('tope de preguntas propias por evento', async () => {
		for (let i = 0; i < MAX_EVENT_FIELDS; i++) {
			expect((await createField(t.db, EVENT, def(`Pregunta ${i}`), BY)).ok).toBe(true);
		}
		expect(await createField(t.db, EVENT, def('Una más'), BY)).toEqual({
			ok: false,
			message: `Hasta ${MAX_EVENT_FIELDS} preguntas propias por evento.`
		});
		expect((await createField(t.db, 'otro-evento', def('En otro evento sí'), BY)).ok).toBe(true);
	});
});

describe('interruptor', () => {
	it('apagado: el formulario de compra no pregunta nada; prendido, las del evento', async () => {
		const ids = await seedFields();
		expect(await eventSignupFields(t.db, EVENT)).toEqual([]);
		expect(await eventSignupFields(null, EVENT)).toEqual([]);
		await setFlag(t.db, 'personas_eventos', true, BY);
		const fields = await eventSignupFields(t.db, EVENT);
		expect(fields.map((f) => f.id)).toEqual([ids.general, ids.own]);
		// Lo que llega a la página: sin quién ni cuándo la editó.
		expect(Object.keys(fields[0]).sort()).toEqual(['id', 'kind', 'label', 'options', 'required']);
	});
});

describe('comprar con preguntas', () => {
	const config = /** @type {import('./config.js').EventTickets} */ (
		parseTicketConfig({
			title: 'Taller de prueba',
			start: '2099-12-01T20:00-03:00',
			tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 2 }]
		})
	);
	const buyer = {
		name: 'Persona de Prueba',
		pronouns: 'elle',
		email: 'prueba@example.com',
		dni: '30.000.000'
	};

	it('validatePurchase valida las respuestas en el servidor (sin preguntas, como siempre)', async () => {
		const ids = await seedFields();
		await setFlag(t.db, 'personas_eventos', true, BY);
		const fields = await eventSignupFields(t.db, EVENT);
		const base = { type: 'general', quantity: 1, buyer, holders: [], accept: 'on', now: NOW };
		const missing = validatePurchase({ ...config, fields }, { ...base, answers: {} });
		expect(missing.ok).toBe(false);
		expect(!missing.ok && missing.errors).toEqual({
			[fieldInputName(ids.general)]: 'Elegí una opción.',
			[fieldInputName(ids.own)]: 'Completá esta respuesta.'
		});
		const form = new FormData();
		form.set(fieldInputName(ids.general), 'Una amistad');
		form.set(fieldInputName(ids.own), 'Sin gluten');
		form.set(fieldInputName(999), 'no es una pregunta del evento');
		const answers = readAnswers(form, fields);
		expect(Object.keys(answers)).toHaveLength(2);
		const ok = validatePurchase({ ...config, fields }, { ...base, answers });
		expect(ok.ok && ok.answers).toEqual([
			{ id: ids.general, label: '¿Cómo te enteraste?', value: 'Una amistad' },
			{ id: ids.own, label: '¿Alguna restricción alimentaria?', value: 'Sin gluten' }
		]);
		// Sin preguntas (interruptor apagado): igual que antes, sin respuestas.
		const plain = validatePurchase(config, base);
		expect(plain.ok && plain.answers).toEqual([]);
	});

	it('las respuestas se guardan con la orden, en la misma tanda; si la reserva no entra, nada', async () => {
		const answers = [{ id: 1, label: '¿Alguna restricción alimentaria?', value: 'Sin gluten' }];
		/** @param {number} quantity */
		const reserve = (quantity) =>
			reserveOrder(t.db, {
				eventSlug: EVENT,
				type: config.types[0],
				quantity,
				holders: Array.from({ length: quantity }, () => ({
					name: 'Persona de Prueba',
					pronouns: 'elle'
				})),
				buyer: { name: 'Persona de Prueba', email: 'prueba@example.com', dni: '30000000' },
				option: 'completo',
				now: NOW,
				answers
			});
		const first = await reserve(1);
		expect(first.ok).toBe(true);
		const tooMany = await reserve(5); // el cupo es 2: no entra
		expect(tooMany.ok).toBe(false);
		const rows = (await t.db.prepare('SELECT order_id FROM order_answers').all()).results;
		expect(rows).toHaveLength(1);
		const stored = await answersByOrder(t.db, EVENT);
		expect(first.ok && stored.get(first.order.id)).toEqual(answers);
		expect((await answersByOrder(t.db, 'otro-evento')).size).toBe(0);

		// Pestaña Órdenes: cada orden con sus respuestas.
		const { rows: orderRows } = await eventOrderRows(t.db, EVENT, config, NOW);
		expect(orderRows).toHaveLength(1);
		expect(orderRows[0].answers).toEqual(answers);
	});
});
