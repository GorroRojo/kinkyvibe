/**
 * Ficha del evento, pestaña "Plantillas de mails": los mails que les llegan a quienes compran
 * para este evento y si cambian algo sobre la plantilla general (Mensajes → Plantillas).
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { getEventTickets } from '$lib/server/tickets/events.js';
import {
	listEventTemplateOverrides,
	listTemplateOverrides
} from '$lib/server/tickets/templates.js';
import {
	EMAIL_TEMPLATES,
	TEMPLATE_FIELD_LABELS,
	TEMPLATE_KEYS
} from '$lib/utils/emailTemplates.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	if (!(await getEventTickets(params.slug))) error(404, 'Ese evento no vende entradas.');
	const db = getDB(platform);
	/** @type {Awaited<ReturnType<typeof listTemplateOverrides>>} */
	let general = new Map();
	/** @type {Awaited<ReturnType<typeof listEventTemplateOverrides>>} */
	let own = new Map();
	try {
		[general, own] = await Promise.all([
			listTemplateOverrides(db),
			listEventTemplateOverrides(db, params.slug)
		]);
	} catch (e) {
		logDBError('plantillas de mails del evento', e);
	}
	return {
		dbAvailable: Boolean(db),
		templates: EMAIL_TEMPLATES.map((t) => {
			const o = own.get(t.id);
			return {
				id: t.id,
				label: t.label,
				when: t.when,
				// Qué partes cambian para este evento.
				changed: o
					? TEMPLATE_KEYS.filter((k) => typeof o[k] === 'string').map(
							(k) => TEMPLATE_FIELD_LABELS[k]
						)
					: [],
				general: general.has(t.id),
				updatedAt: o?.updatedAt ?? null,
				updatedBy: o?.updatedBy ?? null
			};
		})
	};
}
