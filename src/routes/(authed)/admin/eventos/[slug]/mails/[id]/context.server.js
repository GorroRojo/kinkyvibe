/**
 * Lo que comparten el editor de la plantilla de un mail de un evento y su vista previa: el
 * evento, la plantilla general y lo que cambia para el evento.
 */
import { error } from '@sveltejs/kit';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { getTemplateOverride } from '$lib/server/tickets/templates.js';
import { TEMPLATE_KEYS, templateDef } from '$lib/utils/emailTemplates.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * El mail y el evento, o 404.
 * @param {string} slug
 * @param {string} id
 */
export async function eventMailOr404(slug, id) {
	const def = templateDef(id);
	if (!def) error(404, 'No existe ese mail.');
	const config = await getEventTickets(slug);
	if (!config) error(404, 'Ese evento no vende entradas.');
	return {
		def,
		config,
		// Para la vista previa: el título, la fecha y el lugar de verdad (la compra es de ejemplo).
		previewEvent: {
			title: config.title || slug,
			start: config.start,
			location: config.location,
			location_name: config.location_name
		}
	};
}

/**
 * La plantilla general de ese mail (o null) y lo que sale en cada parte si el evento no la
 * cambia: lo de la plantilla general o, si no hay, el texto de siempre.
 *
 * @param {D1Database | null | undefined} db
 * @param {NonNullable<ReturnType<typeof templateDef>>} def
 */
export async function generalTemplate(db, def) {
	const general = await getTemplateOverride(db, def.id);
	/** @type {Partial<Record<import('$lib/utils/emailTemplates.js').TemplateKey, string>>} */
	const inherited = {};
	for (const k of TEMPLATE_KEYS) {
		const fromGeneral = general?.[k];
		const fallback =
			k === 'subject' || k === 'heading' || k === 'body' ? def.defaults[k] : def.extras[k]?.default;
		const v = fromGeneral || fallback;
		if (v) inherited[k] = v;
	}
	return { general, inherited };
}
