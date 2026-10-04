/**
 * Vista previa en vivo del editor de la plantilla de un mail de un evento: POST con las partes
 * (vacías = las de la plantilla general) → el mail como saldría para este evento, con una compra
 * de ejemplo ({ subject, html, text }) y los errores de validación. Solo admins. No guarda nada.
 */
import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { templateInput } from '$lib/server/admin/mailTemplates.js';
import { getDB } from '$lib/server/db';
import { contactEmail, replyToAddress, siteOrigin } from '$lib/server/tickets/index.js';
import { previewEmail } from '$lib/server/tickets/templatePreview.js';
import { mergeTemplates, validateTemplate } from '$lib/utils/emailTemplates.js';
import { eventMailOr404, generalTemplate } from '../context.server.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, url, params, platform, request }) {
	requireAdmin(locals, url);
	const { def, previewEvent } = await eventMailOr404(params.slug, params.id);
	/** @type {Record<string, unknown>} */
	let raw = {};
	try {
		raw = await request.json();
	} catch {
		error(400, 'JSON inválido.');
	}
	const valid = validateTemplate(def.id, templateInput(raw), { optional: true });
	const db = getDB(platform);
	const { general } = await generalTemplate(db, def);
	const message = previewEmail(def.id, mergeTemplates(valid.value, general), {
		origin: siteOrigin(url),
		contactEmail: contactEmail(),
		replyTo: await replyToAddress(db),
		event: previewEvent
	});
	return json(
		{ ...message, errors: valid.ok ? {} : valid.errors },
		{ headers: { 'cache-control': 'private, no-store' } }
	);
}
