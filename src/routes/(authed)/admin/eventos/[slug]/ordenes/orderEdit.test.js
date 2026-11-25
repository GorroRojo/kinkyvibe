/**
 * Órdenes → «Editar» una compra (acciones `edit` y `undoEdit` de eventActions.js,
 * $lib/server/admin/orderEdits.js): solo admins, solo órdenes de este evento. Cambia quien
 * compró, cada entrada y las respuestas (validando solo lo que cambió, como en la compra), guarda
 * el historial con antes → después, no manda mails y queda en Actividad sin los valores.
 * «Deshacer» vuelve a lo que había y queda como otro cambio. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

vi.mock('$lib/server/tickets/events.js', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	const meta = {
		title: 'Evento de prueba',
		start: '2099-11-14T22:00:00-03:00',
		status: 'abierto',
		location: 'Calle Falsa 123',
		payment_methods: ['mercadopago'],
		tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 50 }]
	};
	return {
		...actual,
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventMeta: async () => meta,
		getEventTickets: async (/** @type {string} */ _slug, /** @type {any} */ opts) =>
			parseTicketConfig(meta, opts)
	};
});
vi.mock('$env/dynamic/private', () => ({ env: { RESEND_API_KEY: 're_inventada' } }));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { editsByOrder } from '$lib/server/admin/orderEdits.js';
import { suppressionHash } from '$lib/server/email/suppressions.js';
import {
	applyPayment,
	getOrder,
	getOrderTickets,
	reserveOrder
} from '$lib/server/tickets/orders.js';
import { answersByOrder, createField } from '$lib/server/tickets/signupFields.js';
import { actions } from './+page.server.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

const SLUG = 'evento-de-prueba';
const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const notAdmin = { user: { id: 1, login: 'persona-de-prueba' }, user_token: 'prueba' };

/** Ids de las preguntas: texto por compra, opciones por entrada, casilla obligatoria por compra. */
let TEXT = 0;
let CHOICE = 0;
let CHECK = 0;
/** Lo que pasa por fetch (no debería salir ningún mail). */
/** @type {string[]} */
let fetched = [];
const fetch = /** @type {any} */ (
	async (/** @type {string} */ url) => {
		fetched.push(url);
		return new Response('{"id":"x"}');
	}
);

beforeEach(async () => {
	await resetDB(t.db);
	fetched = [];
	for (const level of /** @type {const} */ (['log', 'warn', 'error'])) {
		const spy = vi.spyOn(console, level).mockImplementation(() => {});
		onTestFinished(() => spy.mockRestore());
	}
	const by = { by: 'prueba' };
	/** @param {any} f */
	const make = async (f) => {
		const r = await createField(t.db, SLUG, { required: false, options: [], ...f }, by);
		if (!r.ok) throw new Error(r.message);
		return r.id;
	};
	TEXT = await make({ label: '¿Alguna alergia?', kind: 'text' });
	CHOICE = await make({
		label: '¿Qué comida?',
		kind: 'choice',
		options: ['Vegana', 'Carnívora'],
		perTicket: true
	});
	CHECK = await make({ label: 'Leí las reglas', kind: 'checkbox', required: true });
});

/**
 * Una compra de 2 entradas con respuestas; aprobada (entradas emitidas) salvo `approve: false`.
 * @param {{ approve?: boolean, pronouns?: string }} [o]
 */
async function order({ approve = true, pronouns = 'elle' } = {}) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: SLUG,
			type: { id: 'general', price: 10000, capacity: 50 },
			quantity: 2,
			holders: [
				{ name: 'Persona Demo', pronouns: 'elle' },
				{ name: 'Otra Persone', pronouns: 'ella' }
			],
			buyer: { name: 'Persona Demo', pronouns, email: 'persona@ejemplo.com', dni: '30111222' },
			answers: [
				{ id: TEXT, label: '¿Alguna alergia?', value: 'Maní' },
				{ id: CHOICE, label: '¿Qué comida?', value: 'Vegana', ticket: 1 },
				{ id: CHOICE, label: '¿Qué comida?', value: 'Vegana', ticket: 2 },
				{ id: CHECK, label: 'Leí las reglas', value: 'Sí' }
			]
		})
	);
	if (!approve) return r.order;
	await applyPayment(t.db, {
		id: 123,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 20000,
		currency_id: 'ARS'
	});
	await t.db.prepare('UPDATE orders SET email_sent_at = 1 WHERE id = ?1').bind(r.order.id).run();
	return r.order;
}

/** El formulario como lo arma el editor: todo con lo que hay ahora, más `changes`. */
function current(
	/** @type {string} */ id,
	/** @type {Record<string, string | string[] | null>} */ changes
) {
	/** @type {Record<string, string | string[] | null>} */
	const base = {
		order: id,
		since: '0',
		name: 'Persona Demo',
		pronouns: 'elle',
		email: 'persona@ejemplo.com',
		holder_name_0: 'Persona Demo',
		holder_pronouns_0: 'elle',
		holder_name_1: 'Otra Persone',
		holder_pronouns_1: 'ella',
		[`campo_${TEXT}`]: 'Maní',
		[`campo_${CHOICE}_0`]: 'Vegana',
		[`campo_${CHOICE}_1`]: 'Vegana',
		[`campo_${CHECK}`]: 'on'
	};
	return { ...base, ...changes };
}

/**
 * Llama a la acción como SvelteKit; si tira (redirect / error), devuelve `{ thrown }`.
 * @param {'edit' | 'undoEdit'} name
 * @param {Record<string, string | string[] | null>} fields (`null`: el campo no va, como una
 *   casilla sin marcar; una lista: el mismo `name` repetido, como «Varias opciones»)
 * @param {{ locals?: any }} [o]
 */
async function act(name, fields, { locals = admin } = {}) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) {
		if (Array.isArray(v)) for (const x of v) body.append(k, x);
		else if (v !== null) body.set(k, v);
	}
	/** @type {any} */
	const event = {
		params: { slug: SLUG },
		platform: t.platform,
		locals,
		request: new Request('http://localhost/x', { method: 'POST', body }),
		url: new URL(`http://localhost/admin/eventos/${SLUG}/ordenes`),
		fetch
	};
	try {
		return /** @type {any} */ (await actions[name](event));
	} catch (e) {
		return { thrown: /** @type {any} */ (e).status };
	}
}

const answersOf = async (/** @type {string} */ id) => (await answersByOrder(t.db, SLUG)).get(id);

describe('Editar una compra', () => {
	it('cambia quien compró, las entradas y las respuestas; guarda el historial y no manda mails', async () => {
		const o = await order();
		const res = await act(
			'edit',
			current(o.id, {
				name: 'Persona Corregida',
				email: ' Nueva@Ejemplo.com ',
				holder_name_1: 'Otre Nombre',
				holder_pronouns_1: 'elle',
				[`campo_${TEXT}`]: '',
				[`campo_${CHOICE}_1`]: 'Carnívora',
				[`campo_${CHECK}`]: 'on'
			})
		);
		expect(res.orderEdit).toMatchObject({ ok: true, order: o.id });
		expect(await getOrder(t.db, o.id)).toMatchObject({
			buyer_name: 'Persona Corregida',
			buyer_pronouns: 'elle',
			buyer_email: 'nueva@ejemplo.com',
			// El mail de las entradas no se toca (no sale otro).
			email_sent_at: 1
		});
		const tickets = await getOrderTickets(t.db, o.id);
		expect(tickets.map((x) => [x.holder_name, x.holder_pronouns])).toEqual([
			['Persona Demo', 'elle'],
			['Otre Nombre', 'elle']
		]);
		// Las respuestas que leen Órdenes, el CSV y el bot: la vacía se va, la cambiada en su lugar.
		expect(await answersOf(o.id)).toEqual([
			{ id: CHOICE, label: '¿Qué comida?', value: 'Vegana', ticket: 1 },
			{ id: CHOICE, label: '¿Qué comida?', value: 'Carnívora', ticket: 2 },
			{ id: CHECK, label: 'Leí las reglas', value: 'Sí' }
		]);
		expect(fetched).toEqual([]);

		const [edit] = /** @type {any[]} */ ((await editsByOrder(t.db, SLUG)).get(o.id));
		expect(edit).toMatchObject({ by: admin.user.login, undoes: null, undone: false });
		expect(edit.changes).toEqual([
			{ key: 'buyer.name', label: 'Nombre', before: 'Persona Demo', after: 'Persona Corregida' },
			{
				key: 'buyer.email',
				label: 'Mail',
				before: 'persona@ejemplo.com',
				after: 'nueva@ejemplo.com'
			},
			{
				key: 'holder.1.name',
				label: 'Entrada 2: nombre',
				before: 'Otra Persone',
				after: 'Otre Nombre'
			},
			{
				key: 'holder.1.pronouns',
				label: 'Entrada 2: pronombres',
				before: 'ella',
				after: 'elle'
			},
			{
				key: `answer.${TEXT}`,
				label: '¿Alguna alergia?',
				question: '¿Alguna alergia?',
				before: 'Maní',
				after: ''
			},
			{
				key: `answer.${CHOICE}.2`,
				label: 'Entrada 2: ¿Qué comida?',
				question: '¿Qué comida?',
				before: 'Vegana',
				after: 'Carnívora'
			}
		]);

		const log = (await listAudit(t.db)).filter((e) => e.action === 'order.edit');
		expect(log).toHaveLength(1);
		expect(log[0]).toMatchObject({ targetId: o.id, actorLogin: admin.user.login });
		// Qué se cambió, pero ningún valor (datos de quien compró).
		const logged = JSON.stringify(log[0]);
		for (const v of ['Corregida', '@', 'Otre', 'Carnívora', 'Maní'])
			expect(logged).not.toContain(v);
	});

	it('sin cambios no guarda nada', async () => {
		const o = await order();
		const res = await act('edit', current(o.id, {}));
		expect(res.orderEdit.ok).toBe(true);
		expect((await editsByOrder(t.db, SLUG)).get(o.id)).toBeUndefined();
		expect((await listAudit(t.db)).filter((e) => e.action === 'order.edit')).toHaveLength(0);
	});

	it('valida lo que cambió con las reglas de la compra, por tipo de pregunta', async () => {
		const o = await order();
		const res = await act(
			'edit',
			current(o.id, {
				name: 'P',
				email: 'no-es-un-mail',
				holder_pronouns_0: '',
				[`campo_${TEXT}`]: 'x'.repeat(501),
				[`campo_${CHOICE}_0`]: 'Otra cosa',
				[`campo_${CHECK}`]: null
			})
		);
		expect(res.status).toBe(400);
		expect(Object.keys(res.data.orderEdit.errors).sort()).toEqual(
			[
				'name',
				'email',
				'holder_pronouns_0',
				`campo_${TEXT}`,
				`campo_${CHOICE}_0`,
				`campo_${CHECK}`
			].sort()
		);
		// No cambió nada.
		expect((await getOrder(t.db, o.id))?.buyer_name).toBe('Persona Demo');
		expect((await answersOf(o.id))?.[0]).toMatchObject({ id: TEXT, value: 'Maní' });
		expect((await editsByOrder(t.db, SLUG)).get(o.id)).toBeUndefined();
	});

	it('un dato viejo que hoy no pasaría no frena corregir otro', async () => {
		// Sin pronombres (como una venta en la puerta) y sin responder la casilla obligatoria.
		const o = await order({ pronouns: '' });
		await t.db
			.prepare('UPDATE order_answers SET answers = ?2 WHERE order_id = ?1')
			.bind(o.id, '[]')
			.run();
		const res = await act(
			'edit',
			current(o.id, {
				pronouns: '',
				[`campo_${TEXT}`]: 'Gluten',
				[`campo_${CHOICE}_0`]: '',
				[`campo_${CHOICE}_1`]: '',
				[`campo_${CHECK}`]: null
			})
		);
		expect(res.orderEdit?.ok).toBe(true);
		expect(await answersOf(o.id)).toEqual([
			{ id: TEXT, label: '¿Alguna alergia?', value: 'Gluten' }
		]);
	});

	it('una compra sin entradas emitidas cambia los datos de cada entrada en la orden', async () => {
		const o = await order({ approve: false });
		const res = await act('edit', current(o.id, { holder_name_0: 'Nombre Nuevo' }));
		expect(res.orderEdit?.ok).toBe(true);
		const fresh = await getOrder(t.db, o.id);
		expect(JSON.parse(String(fresh?.holders))).toEqual([
			{ name: 'Nombre Nuevo', pronouns: 'elle' },
			{ name: 'Otra Persone', pronouns: 'ella' }
		]);
	});

	it('no pone un mail que tocó «No fui yo»', async () => {
		const o = await order();
		await t.db
			.prepare('INSERT INTO email_suppressions (email_hash, created_at) VALUES (?1, 1)')
			.bind(await suppressionHash('bloqueado@ejemplo.com'))
			.run();
		const res = await act('edit', current(o.id, { email: 'bloqueado@ejemplo.com' }));
		expect(res.status).toBe(400);
		expect(res.data.orderEdit.errors).toHaveProperty('email');
		expect((await getOrder(t.db, o.id))?.buyer_email).toBe('persona@ejemplo.com');
	});

	it('si alguien guardó otro cambio en el medio, no lo pisa', async () => {
		const o = await order();
		await act('edit', current(o.id, { name: 'Primer Cambio' }));
		const res = await act('edit', current(o.id, { name: 'Segundo Cambio', since: '0' }));
		expect(res.status).toBe(409);
		expect((await getOrder(t.db, o.id))?.buyer_name).toBe('Primer Cambio');
	});

	it('solo admins y solo órdenes de este evento', async () => {
		const o = await order();
		expect(await act('edit', current(o.id, { name: 'Otro' }), { locals: notAdmin })).toEqual({
			thrown: 403
		});
		expect(await act('edit', current(o.id, { name: 'Otro' }), { locals: {} })).toEqual({
			thrown: 303
		});
		expect(await act('undoEdit', { order: o.id, edit: '1' }, { locals: notAdmin })).toEqual({
			thrown: 403
		});
		await t.db
			.prepare("UPDATE orders SET event_slug = 'otro-evento' WHERE id = ?1")
			.bind(o.id)
			.run();
		const res = await act('edit', current(o.id, { name: 'Otro' }));
		expect(res.status).toBe(400);
		expect((await getOrder(t.db, o.id))?.buyer_name).toBe('Persona Demo');
	});
});

describe('Deshacer', () => {
	/** El último cambio de la orden. */
	const lastEdit = async (/** @type {string} */ id) =>
		/** @type {any} */ ((await editsByOrder(t.db, SLUG)).get(id))?.[0];

	it('vuelve a lo que había, queda como otro cambio y se puede deshacer una sola vez', async () => {
		const o = await order();
		await act(
			'edit',
			current(o.id, {
				email: 'nueva@ejemplo.com',
				holder_name_0: 'Nombre Nuevo',
				[`campo_${TEXT}`]: '',
				[`campo_${CHOICE}_0`]: 'Carnívora'
			})
		);
		const first = await lastEdit(o.id);
		const res = await act('undoEdit', { order: o.id, edit: String(first.id) });
		expect(res.orderEdit).toMatchObject({ ok: true, order: o.id });
		expect((await getOrder(t.db, o.id))?.buyer_email).toBe('persona@ejemplo.com');
		expect((await getOrderTickets(t.db, o.id))[0].holder_name).toBe('Persona Demo');
		const answers = (await answersOf(o.id)) ?? [];
		expect(answers.find((a) => a.id === TEXT)).toEqual({
			id: TEXT,
			label: '¿Alguna alergia?',
			value: 'Maní'
		});
		expect(answers.find((a) => a.id === CHOICE && a.ticket === 1)?.value).toBe('Vegana');

		const undo = await lastEdit(o.id);
		expect(undo).toMatchObject({ undoes: first.id, undone: false });
		expect(undo.changes[0]).toMatchObject({
			key: 'buyer.email',
			before: 'nueva@ejemplo.com',
			after: 'persona@ejemplo.com'
		});
		const list = /** @type {any[]} */ ((await editsByOrder(t.db, SLUG)).get(o.id));
		expect(list.find((e) => e.id === first.id)?.undone).toBe(true);
		expect((await listAudit(t.db)).filter((e) => e.action === 'order.edit_undo')).toHaveLength(1);
		expect(fetched).toEqual([]);

		const again = await act('undoEdit', { order: o.id, edit: String(first.id) });
		expect(again.status).toBe(409);

		// Deshacer el «Deshacer» vuelve a lo corregido.
		expect((await act('undoEdit', { order: o.id, edit: String(undo.id) })).orderEdit.ok).toBe(true);
		expect((await getOrder(t.db, o.id))?.buyer_email).toBe('nueva@ejemplo.com');
	});

	it('si el dato cambió después, pide deshacer primero lo más nuevo', async () => {
		const o = await order();
		await act('edit', current(o.id, { name: 'Primer Cambio' }));
		const first = await lastEdit(o.id);
		await act('edit', current(o.id, { name: 'Segundo Cambio', since: String(first.id) }));
		const res = await act('undoEdit', { order: o.id, edit: String(first.id) });
		expect(res.status).toBe(409);
		expect((await getOrder(t.db, o.id))?.buyer_name).toBe('Segundo Cambio');
	});

	it('un cambio de otra orden no se deshace desde esta', async () => {
		const a = await order();
		const b = await order();
		await act('edit', current(a.id, { name: 'Cambio De A' }));
		const edit = await lastEdit(a.id);
		const res = await act('undoEdit', { order: b.id, edit: String(edit.id) });
		expect(res.status).toBe(404);
		expect((await getOrder(t.db, a.id))?.buyer_name).toBe('Cambio De A');
	});
});

describe('Editar las respuestas de todos los tipos', () => {
	it('varias opciones, número y puntaje: se validan como en la compra y se guardan con su tipo', async () => {
		/** @param {any} f */
		const make = async (f) => {
			const r = await createField(
				t.db,
				SLUG,
				{ required: false, options: [], ...f },
				{
					by: 'prueba'
				}
			);
			if (!r.ok) throw new Error(r.message);
			return r.id;
		};
		const MULTI = await make({
			label: 'Intereses',
			kind: 'multi',
			options: ['Sogas', 'Látex', 'Impacto'],
			perTicket: true
		});
		const NUM = await make({ label: 'Edad', kind: 'number', min: 18, max: 99 });
		const RATE = await make({ label: 'Puntaje', kind: 'rating', low: 'Mal', high: 'Re bien' });
		const o = await order();
		// Como las guarda la compra: los tipos nuevos con `kind`.
		const plain = (await answersOf(o.id)) ?? [];
		await t.db
			.prepare('UPDATE order_answers SET answers = ?2 WHERE order_id = ?1')
			.bind(
				o.id,
				JSON.stringify([
					...plain,
					{ id: MULTI, label: 'Intereses', value: 'Sogas | Impacto', ticket: 1, kind: 'multi' },
					{ id: NUM, label: 'Edad', value: '30', kind: 'number' }
				])
			)
			.run();

		// Las mismas elegidas (en otro orden) y el mismo número no son un cambio.
		const same = await act(
			'edit',
			current(o.id, { [`campo_${MULTI}_0`]: ['Impacto', 'Sogas'], [`campo_${NUM}`]: '30' })
		);
		expect(same.orderEdit).toMatchObject({ ok: true, message: 'No había nada para cambiar.' });

		const bad = await act(
			'edit',
			current(o.id, {
				[`campo_${MULTI}_0`]: ['Sogas', 'Otra'],
				[`campo_${NUM}`]: '12',
				[`campo_${RATE}`]: '7'
			})
		);
		expect(bad.status).toBe(400);
		expect(bad.data.orderEdit.errors).toEqual({
			[`campo_${MULTI}_0`]: 'Elegí entre las opciones de la lista.',
			[`campo_${NUM}`]: 'Tiene que ser entre 18 y 99.',
			[`campo_${RATE}`]: 'Elegí un puntaje de 1 a 5.'
		});
		expect((await editsByOrder(t.db, SLUG)).get(o.id)).toBeUndefined();

		const res = await act(
			'edit',
			current(o.id, {
				[`campo_${MULTI}_0`]: ['Látex'],
				[`campo_${MULTI}_1`]: ['Impacto', 'Sogas'],
				[`campo_${NUM}`]: '30,5',
				[`campo_${RATE}`]: '4'
			})
		);
		expect(res.orderEdit).toMatchObject({ ok: true, order: o.id });
		const answers = (await answersOf(o.id)) ?? [];
		// Las de antes, sin tocar (sin `kind`); las nuevas, con el suyo, en el orden de la lista.
		expect(answers.slice(0, plain.length)).toEqual(plain);
		expect(answers.slice(plain.length)).toEqual([
			{ id: MULTI, label: 'Intereses', value: 'Látex', ticket: 1, kind: 'multi' },
			{ id: NUM, label: 'Edad', value: '30.5', kind: 'number' },
			{ id: MULTI, label: 'Intereses', value: 'Sogas | Impacto', ticket: 2, kind: 'multi' },
			{ id: RATE, label: 'Puntaje', value: '4', kind: 'rating' }
		]);
		const [edit] = /** @type {any[]} */ ((await editsByOrder(t.db, SLUG)).get(o.id));
		expect(edit.changes).toEqual([
			{
				key: `answer.${MULTI}.1`,
				label: 'Entrada 1: Intereses',
				question: 'Intereses',
				before: 'Sogas | Impacto',
				after: 'Látex',
				kind: 'multi'
			},
			{
				key: `answer.${MULTI}.2`,
				label: 'Entrada 2: Intereses',
				question: 'Intereses',
				before: '',
				after: 'Sogas | Impacto',
				kind: 'multi'
			},
			{
				key: `answer.${NUM}`,
				label: 'Edad',
				question: 'Edad',
				before: '30',
				after: '30.5',
				kind: 'number'
			},
			{
				key: `answer.${RATE}`,
				label: 'Puntaje',
				question: 'Puntaje',
				before: '',
				after: '4',
				kind: 'rating'
			}
		]);

		// «Deshacer» vuelve a lo que había; deshacer el «Deshacer» las vuelve a sumar con su tipo.
		const undo = await act('undoEdit', { order: o.id, edit: String(edit.id) });
		expect(undo.orderEdit?.ok).toBe(true);
		expect(((await answersOf(o.id)) ?? []).slice(plain.length)).toEqual([
			{ id: MULTI, label: 'Intereses', value: 'Sogas | Impacto', ticket: 1, kind: 'multi' },
			{ id: NUM, label: 'Edad', value: '30', kind: 'number' }
		]);
		const [undone] = /** @type {any[]} */ ((await editsByOrder(t.db, SLUG)).get(o.id));
		expect((await act('undoEdit', { order: o.id, edit: String(undone.id) })).orderEdit?.ok).toBe(
			true
		);
		expect(((await answersOf(o.id)) ?? []).slice(plain.length)).toEqual([
			{ id: MULTI, label: 'Intereses', value: 'Látex', ticket: 1, kind: 'multi' },
			{ id: NUM, label: 'Edad', value: '30.5', kind: 'number' },
			{ id: MULTI, label: 'Intereses', value: 'Sogas | Impacto', ticket: 2, kind: 'multi' },
			{ id: RATE, label: 'Puntaje', value: '4', kind: 'rating' }
		]);
	});
});
