/**
 * Validación en el servidor de la venta de entradas que escribe el editor de eventos
 * (/admin/eventos/nuevo y /admin/eventos/<slug>/editar): las mismas reglas que el formulario
 * (`validateTicketsForm`) y las de la venta (`parseTicketConfig`), más lo que rompería compras
 * ya hechas (con las ventas de la base).
 */
import { parseDocument } from 'yaml';
import { logDBError } from '$lib/server/db';
import { splitMarkdown } from '$lib/utils/eventDraft.js';
import { readTicketsForm, validateTicketsForm } from '$lib/utils/ticketsEditor.js';
import { parseTicketConfig } from './config.js';
import { getCounts, getTaken } from './orders.js';
import { tierKey } from '$lib/utils/ticketTiers.js';
import { waitlistLiveByScope } from './waitlistAdmin.js';

/**
 * Vendidas y reservadas por tipo de un evento, o `null` si no hay base (o falla).
 *
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {string} slug
 * @returns {Promise<import('$lib/utils/ticketsEditor.js').SalesByType | null>}
 */
export async function salesByType(db, slug) {
	if (!db) return null;
	try {
		const now = Date.now();
		const counts = await getCounts(db, slug, now);
		const taken = await getTaken(db, slug, now);
		return Object.fromEntries(
			[...counts].map(([id, c]) => {
				// Lo tomado por tramo de preventa (para no dejar borrar un tramo vendido ni bajarle la
				// cantidad por debajo de lo vendido).
				/** @type {Record<string, number>} */
				const tiers = {};
				const prefix = tierKey(id, '');
				for (const [key, n] of taken.tiers) {
					if (key.startsWith(prefix)) tiers[key.slice(prefix.length)] = n;
				}
				return [
					id,
					{ sold: c.sold, held: c.held, ...(Object.keys(tiers).length ? { tiers } : {}) }
				];
			})
		);
	} catch (error) {
		logDBError('editor: ventas del evento', error);
		return null;
	}
}

/**
 * La gente anotada en la lista de espera del evento por alcance ('' = todo el evento), o `null`
 * si no hay base o falla (sin la migración 0053): entonces el editor no frena nada por la lista.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {string} slug
 * @returns {Promise<Record<string, number> | null>}
 */
export async function waitlistLiveFor(db, slug) {
	if (!db) return null;
	try {
		return await waitlistLiveByScope(db, slug);
	} catch (error) {
		logDBError('editor: lista de espera del evento', error);
		return null;
	}
}

/**
 * Problemas de la venta de entradas de un archivo de evento (vacío = todo bien). Un archivo
 * cuyas propiedades no se pueden leer lo valida el resto del guardado.
 *
 * @param {string} content el archivo completo
 * @param {{ sales?: import('$lib/utils/ticketsEditor.js').SalesByType | null,
 *   waitlistLive?: Record<string, number> | null }} [opts] `waitlistLive`: la gente anotada en
 *   la lista de espera (no deja apagarla ni cambiar el alcance)
 * @returns {string[]}
 */
export function ticketsFileErrors(content, { sales, waitlistLive } = {}) {
	/** @type {Record<string, any>} */
	let meta;
	try {
		const doc = parseDocument(splitMarkdown(content).frontmatter);
		if (doc.errors.length) return [];
		meta = doc.toJS() ?? {};
	} catch {
		return [];
	}
	const form = readTicketsForm(meta);
	const { errors } = validateTicketsForm(form, {
		sales: sales ?? undefined,
		waitlistLive: waitlistLive ?? undefined
	});
	if (form.enabled && !errors.length) {
		try {
			parseTicketConfig(meta);
		} catch (error) {
			errors.push(`Entradas: ${/** @type {Error} */ (error).message}`);
		}
	}
	return errors.map((e) => (e.startsWith('Entradas') ? e : `Entradas: ${e}`));
}
