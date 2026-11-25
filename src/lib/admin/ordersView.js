/**
 * Ventas › Órdenes del evento: lo que se calcula en el navegador para las dos vistas de la página
 * («Compras» y «Respuestas»). Todo puro (sin Svelte), para probarlo aparte.
 *
 * - Filtros de «Compras»: un estado (una sola opción, `?estado=` en la URL) más interruptores
 *   que se suman («Sin facturar», «Con nota», «Primera vez», «Usó el Fondo», «Aportó al Fondo»),
 *   el filtro por una respuesta (tocar una barra de «Respuestas») y el buscador.
 * - «Respuestas»: una tarjeta por pregunta, en el orden del formulario, armada con las
 *   definiciones de las preguntas (las respuestas guardadas solo traen id, texto de la pregunta,
 *   valor y entrada). Las de opciones, lista, varias opciones, casilla o puntaje se cuentan con
 *   todas sus opciones (las que nadie eligió, al final; el puntaje, del 1 al 5); las de texto,
 *   número o fecha listan a quienes escribieron algo. Las respuestas a preguntas
 *   que ya no están en el formulario van al final, juntas por el texto con que se guardaron.
 */
import {
	answerFormValue,
	answerSlots,
	fieldAppliesTo,
	fieldInputName
} from '$lib/utils/signupFields.js';
import { isCountedKind, showAnswer, splitMulti, tallyOptions } from '$lib/utils/questions.js';
import { foldText } from '$lib/utils/text.js';

/**
 * @typedef {import('$lib/utils/signupFields.js').Answer} Answer
 * @typedef {{ id: number, label: string, shortLabel?: string | null,
 *   kind: import('$lib/utils/signupFields.js').FieldKind, options: string[], perTicket?: boolean,
 *   ticketTypes?: string[], required?: boolean, help?: string, low?: string, high?: string,
 *   min?: number, max?: number }} ViewField
 *   `help`, `low`/`high` y `min`/`max`: lo propio de cada tipo (para «Editar», que dibuja las
 *   preguntas como la compra)
 * @typedef {{ name: string, pronouns: string, checkedIn?: boolean, firstTime?: boolean | null,
 *   firstFrom?: string | null }} ViewHolder
 * @typedef {{ id: string, reference: string, name: string, email: string, pronouns: string,
 *   status: string, quantity: number, typeId?: string, note?: string, toInvoice?: boolean,
 *   invoicedAt?: number | null, fondo?: number | null, contribution?: number | null,
 *   transferPending?: boolean, holders: ViewHolder[], answers: Answer[] }} ViewOrder
 * @typedef {{ key: string, value: string, label: string, multi?: boolean }} AnswerFilter
 *   `multi`: de «Varias opciones» (una opción entre las elegidas, no la respuesta entera)
 */

/** Hasta cuántas compras es un evento chico: sin filtros ni «Ordenar», se ven todas. */
export const SMALL_EVENT_MAX = 5;

/**
 * Los estados del filtro, en el orden en que se muestran (`id` es el valor de `?estado=`).
 * «Transferencias por confirmar»: esperando el pago o vencidas hace menos de 7 días
 * (`transferPending`, lo calcula el servidor con `pendingTransfers`).
 * @type {readonly { id: string, label: string }[]}
 */
export const STATUS_FILTERS = Object.freeze([
	{ id: 'transferencias', label: 'Transferencias por confirmar' },
	{ id: 'aprobadas', label: 'Aprobadas' },
	{ id: 'pendientes', label: 'Pendientes MP' },
	{ id: 'reembolsadas', label: 'Reembolsadas' },
	{ id: 'todas', label: 'Todas' }
]);

/**
 * El estado de `?estado=` si es uno de la lista; si no, ''.
 * @param {string | null | undefined} value
 */
export function statusFilterOf(value) {
	return STATUS_FILTERS.some((s) => s.id === value) ? String(value) : '';
}

/**
 * ¿La orden entra en ese estado?
 * @param {Pick<ViewOrder, 'status' | 'transferPending'>} o
 * @param {string} id
 */
export function matchesStatus(o, id) {
	switch (id) {
		case 'transferencias':
			return Boolean(o.transferPending);
		case 'aprobadas':
			return o.status === 'approved';
		case 'pendientes':
			return o.status === 'pending';
		case 'reembolsadas':
			return o.status === 'refunded';
		default:
			return true;
	}
}

/**
 * Con qué estado arranca la lista: las transferencias por confirmar si hay alguna (es lo que
 * toca hacer), si no las aprobadas. Un evento chico muestra todas.
 * @param {readonly ViewOrder[]} orders
 */
export function defaultStatus(orders) {
	if (orders.length <= SMALL_EVENT_MAX) return 'todas';
	return orders.some((o) => o.transferPending) ? 'transferencias' : 'aprobadas';
}

/**
 * Los interruptores de «Filtros» (se suman al estado). La etiqueta de «Primera vez» lleva la
 * serie si hay («Primera vez en Picantearla»).
 * @type {readonly { id: string, label: string }[]}
 */
export const ORDER_TOGGLES = Object.freeze([
	{ id: 'sin-facturar', label: 'Sin facturar' },
	{ id: 'con-nota', label: 'Con nota' },
	{ id: 'primera-vez', label: 'Primera vez' },
	{ id: 'uso-fondo', label: 'Usó el Fondo' },
	{ id: 'aporto-fondo', label: 'Aportó al Fondo' }
]);

/**
 * @param {Pick<ViewOrder, 'toInvoice' | 'invoicedAt' | 'note' | 'holders' | 'fondo' | 'contribution'>} o
 * @param {string} id
 */
export function matchesToggle(o, id) {
	switch (id) {
		case 'sin-facturar':
			return Boolean(o.toInvoice && !o.invoicedAt);
		case 'con-nota':
			return Boolean(o.note?.trim());
		case 'primera-vez':
			return o.holders.some((h) => h.firstTime);
		case 'uso-fondo':
			return Number(o.fondo ?? 0) > 0;
		case 'aporto-fondo':
			return Number(o.contribution ?? 0) > 0;
		default:
			return true;
	}
}

/**
 * Compras y personas de una lista, para los filtros («🧾 3 · 👥 5»). Con «Primera vez» cuentan
 * solo las entradas de quienes vienen por primera vez, no toda la compra.
 * @param {readonly ViewOrder[]} list
 * @param {string} [toggle]
 */
export function tally(list, toggle = '') {
	const people = list.reduce(
		(n, o) =>
			n + (toggle === 'primera-vez' ? o.holders.filter((h) => h.firstTime).length : o.quantity),
		0
	);
	return `🧾 ${list.length} · 👥 ${people}`;
}

/** El nombre corto de una pregunta si tiene, si no el texto entero. @param {Pick<ViewField, 'label' | 'shortLabel'>} f */
export function fieldLabel(f) {
	return f.shortLabel || f.label;
}

/**
 * La clave de la pregunta de una respuesta: `f<id>` si la pregunta sigue en el formulario; si no,
 * `l:<texto con que se guardó>` (una pregunta borrada).
 * @param {Pick<Answer, 'id' | 'label'>} a
 * @param {ReadonlySet<number>} fieldIds
 */
export function answerKey(a, fieldIds) {
	return fieldIds.has(a.id) ? `f${a.id}` : `l:${a.label}`;
}

/**
 * ¿Alguna respuesta de la compra (de una entrada o de la compra) es esa?
 * @param {Pick<ViewOrder, 'answers'>} o
 * @param {AnswerFilter} filter
 * @param {ReadonlySet<number>} fieldIds
 */
export function matchesAnswer(o, filter, fieldIds) {
	return o.answers.some(
		(a) =>
			answerKey(a, fieldIds) === filter.key &&
			(filter.multi ? splitMulti(a.value).includes(filter.value) : a.value === filter.value)
	);
}

/**
 * Todo lo que encuentra el buscador en una compra (sin acentos ni mayúsculas): referencia,
 * nombre, mail, las personas y las respuestas. El DNI se busca aparte, en el servidor.
 * @param {ViewOrder} o
 */
export function orderSearchText(o) {
	return foldText(
		[
			o.reference,
			o.name,
			o.email,
			...o.holders.map((h) => h.name),
			...o.answers.map((a) => a.value)
		].join(' ')
	);
}

/**
 * Las compras que pasan el estado, los interruptores y el filtro por respuesta.
 * @template {ViewOrder} T
 * @param {readonly T[]} orders
 * @param {{ status: string, toggles?: readonly string[], answer?: AnswerFilter | null,
 *   fieldIds?: ReadonlySet<number> }} f
 * @returns {T[]}
 */
export function filterOrders(
	orders,
	{ status, toggles = [], answer = null, fieldIds = new Set() }
) {
	return orders.filter(
		(o) =>
			matchesStatus(o, status) &&
			toggles.every((t) => matchesToggle(o, t)) &&
			(!answer || matchesAnswer(o, answer, fieldIds))
	);
}

/**
 * @typedef {{ key: string, label: string, fullLabel: string, value: string, choice: boolean,
 *   ticket: number | null }} ShownAnswer
 */

/**
 * Las respuestas de una compra para la tarjeta: las de cada entrada (por persona, en el orden del
 * formulario) y las de la compra. Una respuesta de una entrada que no está en la lista de
 * personas va con las de la compra (con «Entrada N»). `choice`: se cuenta por opción (opciones,
 * lista, varias opciones, casilla o puntaje: se puede filtrar por esa respuesta). `value` es como
 * se lee (un número con coma, una fecha `dd/mm/aaaa`); en las que se cuentan es lo guardado.
 * @param {Pick<ViewOrder, 'answers' | 'holders'>} o
 * @param {readonly ViewField[]} fields
 * @returns {{ holders: ShownAnswer[][], order: ShownAnswer[] }}
 */
export function orderAnswerGroups(o, fields) {
	const byId = new Map(fields.map((f, i) => [f.id, { f, i }]));
	const ids = new Set(byId.keys());
	/** @param {Answer} a */
	const rank = (a) => byId.get(a.id)?.i ?? fields.length;
	/** @type {ShownAnswer[][]} */
	const holders = o.holders.map(() => []);
	/** @type {ShownAnswer[]} */
	const order = [];
	for (const a of [...o.answers].sort((x, y) => rank(x) - rank(y))) {
		if (!String(a.value ?? '').trim()) continue;
		const f = byId.get(a.id)?.f;
		/** @type {ShownAnswer} */
		const shown = {
			key: answerKey(a, ids),
			label: f ? fieldLabel(f) : a.label,
			fullLabel: f?.label ?? a.label,
			value: showAnswer(f?.kind ?? a.kind, a.value),
			choice: f ? isCountedKind(f.kind) : false,
			ticket: a.ticket ?? null
		};
		const slot = a.ticket ? holders[a.ticket - 1] : undefined;
		if (slot) slot.push(shown);
		else order.push(shown);
	}
	return { holders, order };
}

/**
 * @typedef {{ orderId: string, name: string, pronouns: string, firstTime: boolean | null,
 *   value: string }} TextEntry
 * @typedef {{ key: string, label: string, fullLabel: string,
 *   kind: 'text' | 'choice' | 'select' | 'multi' | 'checkbox' | 'rating',
 *   perTicket: boolean, answered: number, asked: number, removed: boolean,
 *   bars: { value: string, n: number, defined: boolean }[], entries: TextEntry[] }} QuestionCard
 *   `kind`: cómo se muestra: `text` lista a quienes respondieron (texto, texto corto, número y
 *   fecha); las demás, barras.
 */

/**
 * Quién respondió (la persona de esa entrada; en las de una vez por compra, quien compró).
 * @param {ViewOrder} o
 * @param {Answer} a
 */
function whoAnswered(o, a) {
	const h = a.ticket ? o.holders[a.ticket - 1] : null;
	if (h) return { name: h.name, pronouns: h.pronouns, firstTime: h.firstTime ?? null };
	const same = o.holders.find((x) => foldText(x.name) === foldText(o.name));
	return {
		name: a.ticket ? `${o.name} (entrada ${a.ticket})` : o.name,
		pronouns: a.ticket ? '' : o.pronouns,
		firstTime: a.ticket ? null : (same?.firstTime ?? null)
	};
}

/**
 * Las tarjetas de «Respuestas», con las compras que se pasen (la página pasa las aprobadas).
 *
 * - Una por pregunta del formulario, en su orden; la de opciones (o lista, o varias opciones) con
 *   todas las opciones (más elegida primero, las que nadie eligió al final; un valor que ya no es
 *   una opción también cuenta; en «Varias opciones», cada respuesta cuenta en cada opción que
 *   eligió); la casilla, con «Sí»; el puntaje, del 1 al 5 en orden; las de texto, número o fecha,
 *   con quienes escribieron (el número con coma y la fecha `dd/mm/aaaa`).
 * - `answered`: cuántas respuestas (personas en las de por entrada, compras en las de por compra);
 *   `asked`: a cuántas se les preguntó (las compras de los tipos de entrada a los que aplica).
 * - Al final, las respuestas a preguntas que ya no están, juntas por el texto guardado (como
 *   texto, con quienes respondieron).
 *
 * @param {readonly ViewField[]} fields
 * @param {readonly ViewOrder[]} orders
 * @returns {QuestionCard[]}
 */
export function questionCards(fields, orders) {
	const ids = new Set(fields.map((f) => f.id));
	/** @type {Map<string, QuestionCard>} */
	const cards = new Map();
	/** @type {Map<string, ViewField>} */
	const byKey = new Map();
	/** @type {Map<string, string[]>} lo respondido, por tarjeta de barras */
	const values = new Map();
	for (const f of fields) {
		const counted = isCountedKind(f.kind);
		byKey.set(`f${f.id}`, f);
		if (counted) values.set(`f${f.id}`, []);
		cards.set(`f${f.id}`, {
			key: `f${f.id}`,
			label: fieldLabel(f),
			fullLabel: f.label,
			kind: counted ? /** @type {QuestionCard['kind']} */ (f.kind) : 'text',
			perTicket: Boolean(f.perTicket),
			answered: 0,
			asked: orders
				.filter((o) => fieldAppliesTo(f, o.typeId ?? ''))
				.reduce((n, o) => n + (f.perTicket ? Math.max(1, o.quantity) : 1), 0),
			removed: false,
			bars: [],
			entries: []
		});
	}
	for (const o of orders) {
		for (const a of o.answers) {
			const value = String(a.value ?? '').trim();
			if (!value) continue;
			const key = answerKey(a, ids);
			let card = cards.get(key);
			if (!card) {
				card = {
					key,
					label: a.label,
					fullLabel: a.label,
					kind: 'text',
					perTicket: Boolean(a.ticket),
					answered: 0,
					asked: 0,
					removed: true,
					bars: [],
					entries: []
				};
				cards.set(key, card);
			}
			card.answered++;
			if (card.kind === 'text') {
				const kind = byKey.get(key)?.kind ?? a.kind;
				card.entries.push({
					orderId: o.id,
					...whoAnswered(o, a),
					value: showAnswer(kind, a.value)
				});
				continue;
			}
			values.get(key)?.push(a.value);
		}
	}
	return [...cards.values()].map((c) => {
		const f = byKey.get(c.key);
		const bars = f
			? tallyOptions(f, values.get(c.key) ?? []).map(({ option, count, defined }) => ({
					value: option,
					n: count,
					defined
				}))
			: [];
		return {
			...c,
			asked: c.removed ? c.answered : c.asked,
			// La más elegida primero; a igual cantidad, el orden del formulario (las que ya no son
			// opciones, después). Las que nadie eligió quedan al final. El puntaje, del 1 al 5.
			bars:
				c.kind === 'rating'
					? bars
					: bars
							.map((b, i) => ({ b, i }))
							.sort(
								(x, y) => y.b.n - x.b.n || Number(y.b.defined) - Number(x.b.defined) || x.i - y.i
							)
							.map(({ b }) => b)
		};
	});
}

/**
 * «Copiar para el equipo»: una línea por respuesta, «Nombre (pronombres): respuesta», en texto
 * común (las respuestas de varias líneas, en una).
 * @param {Pick<QuestionCard, 'entries'>} card
 */
export function copyText(card) {
	return card.entries
		.map(
			(e) =>
				`${e.name}${e.pronouns ? ` (${e.pronouns})` : ''}: ${e.value.replace(/\s*\n\s*/g, ' / ')}`
		)
		.join('\n');
}

/** Desde cuántas letras una respuesta de texto se muestra cortada (se abre al tocarla). */
export const LONG_ANSWER = 60;

/** ¿La respuesta va cortada, con «tocá para leer entera»? @param {string} value */
export function isLongAnswer(value) {
	return value.length > LONG_ANSWER || value.includes('\n');
}

/**
 * «Editar» una compra: las preguntas que aplican (las de una vez por compra y las de una vez por
 * entrada, aparte) y con qué arranca cada campo del formulario (los mismos `name` que la compra;
 * el valor de cada respuesta, según su tipo, con `answerFormValue`).
 *
 * @param {Pick<ViewOrder, 'name' | 'pronouns' | 'email' | 'quantity' | 'typeId' | 'holders' | 'answers'>} o
 * @param {readonly ViewField[]} fields
 */
export function orderEditForm(o, fields) {
	const asked = fields.filter((f) => fieldAppliesTo(f, o.typeId ?? ''));
	/** @type {Record<string, string | string[]>} en «Varias opciones», la lista de las elegidas */
	const values = { name: o.name, pronouns: o.pronouns, email: o.email };
	o.holders.forEach((h, i) => {
		values[`holder_name_${i}`] = h.name;
		values[`holder_pronouns_${i}`] = h.pronouns;
	});
	for (const f of asked) {
		for (const slot of answerSlots(f, o.quantity)) {
			const ticket = slot === null ? undefined : slot + 1;
			const stored = o.answers.find((a) => a.id === f.id && a.ticket === ticket)?.value;
			values[fieldInputName(f.id, slot)] = answerFormValue(f, stored);
		}
	}
	/** @type {(f: ViewField) => import('$lib/utils/signupFields.js').SignupField} */
	const asSignup = ({ shortLabel, ...f }) => ({
		...f,
		required: Boolean(f.required),
		...(shortLabel ? { shortLabel } : {})
	});
	return {
		values,
		orderFields: asked.filter((f) => !f.perTicket).map(asSignup),
		ticketFields: asked.filter((f) => f.perTicket).map(asSignup)
	};
}
