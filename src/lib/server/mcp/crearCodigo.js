/**
 * Cambio `crear_codigo` del conector de Claude (docs/conector-claude.md, «Cambios»): un código de
 * descuento nuevo, con los mismos campos y la misma validación que el formulario de Ventas →
 * Códigos del panel (`validateNewCode`). `aplicar` lo crea con la acción «Crear» de esa página
 * ({@link savePanelCode}): el mismo alta y el mismo registro en Actividad (`discount.create`).
 *
 * La versión de lo que había es «el código no existe»: si alguien lo crea entre la vista previa y
 * `aplicar`, no se crea otro.
 */
import { validateNewCode } from '$lib/server/tickets/discounts.js';
import { listTicketedEvents } from '$lib/server/tickets/events.js';
import { normalizeCode } from '$lib/utils/tickets.js';
import { formatARS } from '$lib/utils/money.js';
import { describeSchedule, formatEventDate } from '$lib/utils/eventDraft.js';
import { normalizeDateTime } from './editarEvento.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Las claves de `cambios` que entiende `crear_codigo`. */
export const CODE_FIELDS = Object.freeze([
	'codigo',
	'tipo',
	'valor',
	'desde',
	'hasta',
	'usos_maximos',
	'entradas_maximas'
]);

const KIND = /** @type {Record<string, 'percent' | 'fixed'>} */ ({
	porcentaje: 'percent',
	monto: 'fixed'
});

/** Los nombres de los campos del formulario del panel, para los errores. */
const FIELD_NAME = /** @type {Record<string, string>} */ ({
	code: 'codigo',
	kind: 'tipo',
	value: 'valor',
	event_slug: 'evento',
	starts_at: 'desde',
	ends_at: 'hasta',
	max_uses: 'usos_maximos',
	max_tickets: 'entradas_maximas'
});

/** Un error de las entradas, para devolverle a Claude. */
export class CodeChangeError extends Error {}

/** @param {unknown} v */
const optionalInt = (v) => (v === undefined || v === null || v === '' ? null : v);

/**
 * @typedef {{
 *   codigo: string,
 *   tipo: 'percent' | 'fixed',
 *   valor: number,
 *   evento: string | null,
 *   desde: string,
 *   hasta: string,
 *   usos_maximos: number | null,
 *   entradas_maximas: number | null
 * }} CodeInputs
 */

/**
 * Las entradas normalizadas y validadas como en el panel. Tira {@link CodeChangeError}.
 *
 * @param {unknown} raw `cambios`
 * @param {string | null} eventSlug el evento ya resuelto (o `null`: vale para todos)
 * @param {string[]} ticketed los eventos que venden entradas
 * @returns {CodeInputs}
 */
export function normalizeCodeInputs(raw, eventSlug, ticketed) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		throw new CodeChangeError(
			'`cambios` es un objeto con `codigo`, `tipo` (porcentaje o monto) y `valor` (y si querés: desde, hasta, usos_maximos, entradas_maximas).'
		);
	}
	const input = /** @type {Record<string, unknown>} */ (raw);
	const unknown = Object.keys(input).filter((k) => !CODE_FIELDS.includes(k));
	if (unknown.length) {
		throw new CodeChangeError(
			`No sé qué es ${unknown.map((k) => `«${k.slice(0, 30)}»`).join(', ')}. Los campos: ${CODE_FIELDS.join(', ')}.`
		);
	}
	const tipo = typeof input.tipo === 'string' ? KIND[input.tipo] : undefined;
	if (!tipo) throw new CodeChangeError('`tipo` es «porcentaje» o «monto».');
	/** @param {unknown} v @param {string} name */
	const dateIn = (v, name) => {
		if (v === undefined || v === null || v === '') return '';
		const d = normalizeDateTime(v);
		if (!d)
			throw new CodeChangeError(`\`${name}\` va como «AAAA-MM-DDTHH:MM» (hora de Argentina).`);
		return d;
	};
	const form = {
		code: typeof input.codigo === 'string' ? input.codigo.trim().toUpperCase() : '',
		kind: tipo,
		value: String(input.valor ?? ''),
		event_slug: eventSlug ?? '',
		starts_at: dateIn(input.desde, 'desde'),
		ends_at: dateIn(input.hasta, 'hasta'),
		max_uses: String(optionalInt(input.usos_maximos) ?? ''),
		max_tickets: String(optionalInt(input.entradas_maximas) ?? '')
	};
	const valid = validateNewCode(form, ticketed);
	if (!valid.ok) {
		throw new CodeChangeError(
			`Revisá: ${Object.entries(valid.errors)
				.map(([k, m]) => `${FIELD_NAME[k] ?? k}: ${m}`)
				.join(' ')}`
		);
	}
	return {
		codigo: /** @type {string} */ (normalizeCode(form.code)),
		tipo,
		valor: valid.value.value,
		evento: valid.value.event_slug,
		desde: form.starts_at,
		hasta: form.ends_at,
		usos_maximos: valid.value.max_uses,
		entradas_maximas: valid.value.max_tickets
	};
}

/** Los eventos que venden entradas (los que puede tener un código). */
export async function ticketedSlugs() {
	return (await listTicketedEvents()).map((e) => e.slug);
}

/**
 * ¿Ya existe un código así?
 * @param {D1Database} db
 * @param {string} code
 */
export async function codeExists(db, code) {
	return Boolean(
		await db.prepare('SELECT 1 AS x FROM discount_codes WHERE code = ?1').bind(code).first()
	);
}

/** «2026-11-07T22:00» → «sábado 7 de noviembre de 2026, a las 22:00». @param {string} v */
const when = (v) => describeSchedule(formatEventDate(v.slice(0, 10), v.slice(11)));

/**
 * El código en palabras (lo que muestra la vista previa).
 * @param {CodeInputs} c
 * @param {string | null} eventTitle
 */
export function describeCode(c, eventTitle) {
	return [
		{ campo: 'código', antes: '(no existe)', despues: c.codigo },
		{
			campo: 'descuento',
			antes: '',
			despues: c.tipo === 'percent' ? `${c.valor}%` : `${formatARS(c.valor)} por entrada`
		},
		{
			campo: 'evento',
			antes: '',
			despues: eventTitle ? `solo «${eventTitle}»` : 'todos los eventos'
		},
		{ campo: 'desde', antes: '', despues: c.desde ? when(c.desde) : 'ya' },
		{ campo: 'hasta', antes: '', despues: c.hasta ? when(c.hasta) : 'sin fecha de fin' },
		{
			campo: 'usos',
			antes: '',
			despues: c.usos_maximos === null ? 'sin límite' : `hasta ${c.usos_maximos}`
		},
		{
			campo: 'entradas por compra',
			antes: '',
			despues: c.entradas_maximas === null ? 'sin límite' : `hasta ${c.entradas_maximas}`
		}
	];
}

/**
 * La acción «Crear» de Ventas → Códigos del panel, con un pedido armado como el del formulario.
 *
 * @param {{ platform?: App.Platform, fetch: typeof fetch, origin: string, user: { id: number, login: string } }} ctx
 * @param {CodeInputs} c
 * @returns {Promise<{ ok: true } | { ok: false, exists: boolean, message: string }>}
 */
export async function savePanelCode(ctx, c) {
	const { actions } = await import('../../../routes/(authed)/admin/ventas/codigos/+page.server.js');
	const form = new FormData();
	form.set('code', c.codigo);
	form.set('kind', c.tipo);
	form.set('value', String(c.valor));
	form.set('event_slug', c.evento ?? '');
	form.set('starts_at', c.desde);
	form.set('ends_at', c.hasta);
	form.set('max_uses', c.usos_maximos === null ? '' : String(c.usos_maximos));
	form.set('max_tickets', c.entradas_maximas === null ? '' : String(c.entradas_maximas));
	const url = new URL(`${ctx.origin}/admin/ventas/codigos?/create`);
	const event = {
		params: {},
		locals: {
			user: { id: ctx.user.id, login: ctx.user.login, name: null },
			user_token: 'conector-claude'
		},
		request: new Request(url, { method: 'POST', body: form }),
		url,
		platform: ctx.platform,
		fetch: ctx.fetch
	};
	const result = /** @type {any} */ (await actions.create(/** @type {any} */ (event)));
	if (result?.create?.ok) return { ok: true };
	const data = result?.data?.create;
	const errors = data?.errors && typeof data.errors === 'object' ? Object.values(data.errors) : [];
	return {
		ok: false,
		exists: result?.status === 409,
		message: [data?.error ?? 'No se pudo crear.', ...errors].join(' ')
	};
}
