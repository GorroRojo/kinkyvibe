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
import { getCounts } from './orders.js';

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
		const counts = await getCounts(db, slug);
		return Object.fromEntries([...counts].map(([id, c]) => [id, { sold: c.sold, held: c.held }]));
	} catch (error) {
		logDBError('editor: ventas del evento', error);
		return null;
	}
}

/**
 * Problemas de la venta de entradas de un archivo de evento (vacío = todo bien). Un archivo
 * cuyas propiedades no se pueden leer lo valida el resto del guardado.
 *
 * @param {string} content el archivo completo
 * @param {{ sales?: import('$lib/utils/ticketsEditor.js').SalesByType | null }} [opts]
 * @returns {string[]}
 */
export function ticketsFileErrors(content, { sales } = {}) {
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
	const { errors } = validateTicketsForm(form, { sales: sales ?? undefined });
	if (form.enabled && !errors.length) {
		try {
			parseTicketConfig(meta);
		} catch (error) {
			errors.push(`Entradas: ${/** @type {Error} */ (error).message}`);
		}
	}
	return errors.map((e) => (e.startsWith('Entradas') ? e : `Entradas: ${e}`));
}
