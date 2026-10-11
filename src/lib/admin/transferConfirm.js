/**
 * «Confirmar pago» de una transferencia, igual en la bandeja (`/admin/ventas/transferencias`) y en
 * la pestaña del evento:
 *
 * 1. una pregunta corta con el nombre y el monto (`askConfirm`): emitir entradas no tiene vuelta
 *    atrás con un clic, y es fácil tocar la fila de al lado;
 * 2. si confirmar pasa el cupo, el servidor contesta `needsConfirmation` y se pregunta con el
 *    diálogo de límites (`OverrideDialog`), reenviando con la clave;
 * 3. el resultado se muestra en la misma fila (la fila confirmada queda a la vista con su aviso,
 *    `keepRows`), no arriba de todo, fuera de la pantalla.
 */
import { askConfirm } from '$lib/admin/confirm.js';
import { formatARS } from '$lib/utils/money.js';
import { entradas } from '$lib/utils/plural.js';

/**
 * Texto de la pregunta antes de confirmar.
 * @param {{ reference: string, name: string, total: number, quantity: number, type: string }} o
 * @returns {import('$lib/admin/confirm.js').ConfirmOptions}
 */
export function confirmPaymentQuestion(o) {
	return {
		title: `¿Confirmar el pago de ${o.name}?`,
		text: `${o.reference} · ${formatARS(o.total)} · ${entradas(o.quantity)} ${o.type}. Se emiten las entradas y le llegan por mail.`,
		confirmLabel: 'Sí, confirmar pago',
		cancelLabel: 'Volver',
		tone: 'primary'
	};
}

/**
 * @template {{ id: string }} T
 * @typedef {{ row: T, index: number, ok: boolean, message: string, list?: string }} KeptRow
 */

/**
 * Las filas a mostrar: las de la página más las que se acaban de resolver (con su aviso), cada
 * una en el lugar donde estaba. Si una fila resuelta sigue en la lista (falló), se muestra la de
 * la lista con el aviso.
 * @template {{ id: string }} T
 * @param {T[]} rows
 * @param {KeptRow<T>[]} kept
 * @returns {{ row: T, result: { ok: boolean, message: string } | null }[]}
 */
export function keepRows(rows, kept) {
	const byId = new Map(kept.map((k) => [k.row.id, k]));
	/** @type {{ row: T, result: { ok: boolean, message: string } | null }[]} */
	const out = rows.map((row) => {
		const k = byId.get(row.id);
		return { row, result: k ? { ok: k.ok, message: k.message } : null };
	});
	const present = new Set(rows.map((r) => r.id));
	for (const k of [...kept].sort((a, b) => a.index - b.index)) {
		if (present.has(k.row.id)) continue;
		out.splice(Math.min(k.index, out.length), 0, {
			row: k.row,
			result: { ok: k.ok, message: k.message }
		});
	}
	return out;
}

/**
 * La función de `use:enhance` del form «Confirmar pago».
 * @param {{
 *   row: { id: string, reference: string, name: string, total: number, quantity: number, type: string },
 *   index: number,
 *   list?: string,
 *   overrideDialog: () => { ask: (needs: any, o?: any) => Promise<string | null> },
 *   setBusy: (id: string | null) => void,
 *   onResult: (kept: KeptRow<any>) => void,
 *   refresh: () => Promise<unknown>
 * }} o
 * @returns {import('@sveltejs/kit').SubmitFunction}
 */
export function confirmPaymentSubmit({
	row,
	index,
	list,
	overrideDialog,
	setBusy,
	onResult,
	refresh
}) {
	return async ({ formElement, cancel }) => {
		const again = !!formElement.querySelector('input[name=override]');
		// La pregunta corta, solo la primera vez (el reenvío con la clave ya se confirmó).
		if (!again && !(await askConfirm(confirmPaymentQuestion(row)))) return cancel();
		setBusy(row.id);
		return async ({ result }) => {
			// La clave vale para un solo envío.
			formElement.querySelector('input[name=override]')?.remove();
			setBusy(null);
			const data = /** @type {any} */ (
				result.type === 'success' || result.type === 'failure' ? result.data : null
			);
			const needs = result.type === 'failure' ? data?.transfer?.needsConfirmation : null;
			if (needs) {
				const key = await overrideDialog().ask(needs, {
					title: 'Confirmar esta transferencia pasa el cupo'
				});
				if (!key) return;
				const input = document.createElement('input');
				input.type = 'hidden';
				input.name = 'override';
				input.value = key;
				formElement.append(input);
				formElement.requestSubmit();
				return;
			}
			const ok = result.type === 'success' && data?.transfer?.ok !== false;
			const message =
				data?.transfer?.message ??
				(result.type === 'error' ? 'No se pudo confirmar: probá de nuevo.' : 'Listo.');
			onResult({ row, index, list, ok, message });
			await refresh();
		};
	};
}
