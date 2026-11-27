/**
 * Ventas › Órdenes, «Compras»: la barra para actuar sobre varias compras a la vez (plan
 * `ordenes-editar`; docs/tickets.md, «Varias compras a la vez»). Lo puro, que usan la página y el
 * servidor ($lib/server/admin/orderActions.js): qué acciones hay, a qué compras aplica cada una,
 * en tandas de cuántas se mandan y cómo se cuenta lo que pasó.
 *
 * Solo acciones que ya existen de a una, seguras y que se deshacen: nada de plata (ni reembolsos,
 * ni cancelar, ni confirmar transferencias). «CSV» y «Copiar mails» no tocan nada.
 */

/** @typedef {'facturada' | 'sin-facturar' | 'revisada' | 'reenviar'} BulkAction */
/** @typedef {{ id: string, reason: string }} Skipped */
/** @typedef {{ done: string[], skipped: Skipped[], stopped?: boolean }} BulkResult */

/**
 * Las acciones de la barra, en el orden en que se muestran. `batch`: cuántas compras van en
 * cada pedido al servidor (reenviar manda mails: de a pocas, para no pasar los límites del
 * Worker ni la tasa de Resend).
 * @type {{ id: BulkAction, label: string, batch: number }[]}
 */
export const BULK_ACTIONS = [
	{ id: 'facturada', label: 'Marcar facturadas', batch: 50 },
	{ id: 'sin-facturar', label: 'Desmarcar facturadas', batch: 50 },
	{ id: 'revisada', label: 'Marcar revisadas', batch: 50 },
	{ id: 'reenviar', label: 'Reenviar mail', batch: 5 }
];

/** @param {unknown} id @returns {id is BulkAction} */
export function isBulkAction(id) {
	return BULK_ACTIONS.some((a) => a.id === id);
}

/** @param {BulkAction} id */
export function bulkBatch(id) {
	return BULK_ACTIONS.find((a) => a.id === id)?.batch ?? 1;
}

/**
 * Por qué se salteó una compra (lo que se muestra entre paréntesis), en singular y en plural.
 * @type {Record<string, [string, string]>}
 */
export const SKIP_REASONS = {
	'no-encontrada': ['que no encontramos', 'que no encontramos'],
	'ya-facturada': ['ya facturada', 'ya facturadas'],
	'sin-pago': ['sin pago para facturar', 'sin pago para facturar'],
	'ya-sin-facturar': ['que no estaba facturada', 'que no estaban facturadas'],
	'sin-revisar': ['que no estaba para revisar', 'que no estaban para revisar'],
	'no-aprobada': ['no aprobada', 'no aprobadas'],
	'mail-fallo': ['con el mail que no salió', 'con el mail que no salió'],
	esperar: [
		'sin mandar porque Resend pidió esperar (probá en un rato)',
		'sin mandar porque Resend pidió esperar (probá en un rato)'
	],
	error: ['que no se pudo hacer (probá de nuevo)', 'que no se pudieron hacer (probá de nuevo)']
};

/**
 * Si la acción aplica a una compra, con lo que la página sabe de ella (el servidor lo vuelve a
 * mirar). Devuelve `null` si aplica o el motivo para saltearla.
 *
 * @param {BulkAction} action
 * @param {{ status: string, toInvoice?: boolean, invoicedAt?: number | null,
 *   needsReview?: string | null }} o
 * @returns {string | null}
 */
export function skipReason(action, o) {
	if (action === 'facturada') {
		if (o.invoicedAt) return 'ya-facturada';
		return o.toInvoice ? null : 'sin-pago';
	}
	if (action === 'sin-facturar') return o.invoicedAt ? null : 'ya-sin-facturar';
	if (action === 'revisada') return o.needsReview ? null : 'sin-revisar';
	return o.status === 'approved' ? null : 'no-aprobada';
}

/**
 * Las elegidas, separadas en las que se mandan y las que se saltean de entrada.
 *
 * @template {{ id: string, status: string }} T
 * @param {BulkAction} action
 * @param {T[]} orders
 * @returns {{ apply: T[], skipped: Skipped[] }}
 */
export function splitForAction(action, orders) {
	/** @type {T[]} */
	const apply = [];
	/** @type {Skipped[]} */
	const skipped = [];
	for (const o of orders) {
		const reason = skipReason(action, o);
		if (reason) skipped.push({ id: o.id, reason });
		else apply.push(o);
	}
	return { apply, skipped };
}

/**
 * @template T
 * @param {T[]} list
 * @param {number} size
 * @returns {T[][]}
 */
export function chunk(list, size) {
	/** @type {T[][]} */
	const out = [];
	for (let i = 0; i < list.length; i += Math.max(1, size)) out.push(list.slice(i, i + size));
	return out;
}

/**
 * Suma lo que volvió de una tanda. Con `stopped` (Resend pidió esperar), las que no se mandaron
 * todavía (`rest`) quedan salteadas con ese motivo.
 *
 * @param {BulkResult} acc
 * @param {BulkResult} part
 * @param {string[]} [rest]
 * @returns {BulkResult}
 */
export function mergeBulk(acc, part, rest = []) {
	const skipped = [...acc.skipped, ...part.skipped];
	if (part.stopped) for (const id of rest) skipped.push({ id, reason: 'esperar' });
	return {
		done: [...acc.done, ...part.done],
		skipped,
		stopped: Boolean(acc.stopped || part.stopped)
	};
}

/**
 * «3 hechas, 2 salteadas (1 ya facturada; 1 sin pago para facturar).»
 * @param {BulkResult} r
 */
export function bulkMessage(r) {
	const n = r.done.length;
	const m = r.skipped.length;
	let text = `${n} ${n === 1 ? 'hecha' : 'hechas'}`;
	if (m) {
		/** @type {Map<string, number>} */
		const by = new Map();
		for (const s of r.skipped) by.set(s.reason, (by.get(s.reason) ?? 0) + 1);
		const why = [...by]
			.map(([reason, k]) => `${k} ${SKIP_REASONS[reason]?.[k === 1 ? 0 : 1] ?? reason}`)
			.join('; ');
		text += `, ${m} ${m === 1 ? 'salteada' : 'salteadas'} (${why})`;
	}
	return `${text}.`;
}

/**
 * Los mails de las elegidas, sin repetir, para pegar en el campo «Para» (separados por coma).
 * @param {{ email: string }[]} orders
 */
export function mailList(orders) {
	/** @type {Map<string, string>} */
	const seen = new Map();
	for (const o of orders) {
		const mail = String(o.email ?? '').trim();
		if (mail && !seen.has(mail.toLowerCase())) seen.set(mail.toLowerCase(), mail);
	}
	return [...seen.values()];
}

/**
 * La selección, solo con las compras que se ven (cambiar los filtros o que una compra deje de
 * verse la saca). Devuelve la misma lista si no cambió.
 * @param {string[]} selected
 * @param {Set<string>} visible
 */
export function keepVisible(selected, visible) {
	const kept = selected.filter((id) => visible.has(id));
	return kept.length === selected.length ? selected : kept;
}
