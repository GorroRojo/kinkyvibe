/**
 * Ajustes → Mails → Plantillas: los mails que manda el sistema y si tienen texto propio.
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { listTemplateOverrides } from '$lib/server/tickets/templates.js';
import { EMAIL_TEMPLATES } from '$lib/utils/emailTemplates.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	/** @type {Awaited<ReturnType<typeof listTemplateOverrides>>} */
	let saved = new Map();
	try {
		saved = await listTemplateOverrides(db);
	} catch (error) {
		logDBError('plantillas de mails', error);
	}
	return {
		dbAvailable: Boolean(db),
		templates: EMAIL_TEMPLATES.map((t) => {
			const s = saved.get(t.id);
			return {
				id: t.id,
				label: t.label,
				when: t.when,
				subject: s?.subject ?? t.defaults.subject,
				custom: Boolean(s),
				updatedAt: s?.updatedAt ?? null,
				updatedBy: s?.updatedBy ?? null
			};
		})
	};
}
