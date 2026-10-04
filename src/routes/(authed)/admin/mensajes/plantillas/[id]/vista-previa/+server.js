/**
 * Vista previa en vivo del editor de plantillas: POST { subject, heading, body, label, button,
 * help, why } → el mail
 * armado con datos de ejemplo ({ subject, html, text }) y los errores de validación. Solo admins.
 * No guarda nada.
 */
import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { contactEmail, mailFooter, replyToAddress, siteOrigin } from '$lib/server/tickets/index.js';
import { previewEmail } from '$lib/server/tickets/templatePreview.js';
import { templateInput } from '$lib/server/admin/mailTemplates.js';
import { templateDef, validateTemplate } from '$lib/utils/emailTemplates.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, url, params, platform, request }) {
	requireAdmin(locals, url);
	const def = templateDef(params.id);
	if (!def) error(404, 'No existe ese mail.');
	/** @type {Record<string, unknown>} */
	let raw = {};
	try {
		raw = await request.json();
	} catch {
		error(400, 'JSON inválido.');
	}
	const valid = validateTemplate(def.id, templateInput(raw));
	const message = previewEmail(def.id, valid.value, {
		origin: siteOrigin(url),
		contactEmail: contactEmail(),
		replyTo: await replyToAddress(getDB(platform)),
		footer: await mailFooter(getDB(platform))
	});
	return json(
		{ ...message, errors: valid.ok ? {} : valid.errors },
		{ headers: { 'cache-control': 'private, no-store' } }
	);
}
