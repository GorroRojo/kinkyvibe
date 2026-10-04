/**
 * Editor de la plantilla de un mail: guardar, restaurar el original y mandarse una prueba.
 * Solo admins (`requireAdmin` en el `load` y en cada action). Cada cambio queda en el registro
 * de actividad.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { templateInput, testRecipients } from '$lib/server/admin/mailTemplates.js';
import { getDB, logDBError } from '$lib/server/db';
import {
	contactEmail,
	replyToAddress,
	sendTestEmail,
	siteOrigin
} from '$lib/server/tickets/index.js';
import { previewEmail } from '$lib/server/tickets/templatePreview.js';
import {
	deleteTemplateOverride,
	listTemplateOverrides,
	saveTemplateOverride
} from '$lib/server/tickets/templates.js';
import { TEMPLATE_LIMITS, templateDef, validateTemplate } from '$lib/utils/emailTemplates.js';

/** @param {string} id */
function defOr404(id) {
	const def = templateDef(id);
	if (!def) error(404, 'No existe ese mail.');
	return def;
}

/** @param {Request} request */
async function readForm(request) {
	const f = await request.formData();
	return {
		...templateInput(f),
		to: String(f.get('to') ?? '')
			.slice(0, 300)
			.trim()
			.toLowerCase()
	};
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders, fetch }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const def = defOr404(params.id);
	const db = getDB(platform);
	/** @type {import('$lib/server/tickets/templates.js').StoredTemplate | undefined} */
	let saved;
	try {
		saved = (await listTemplateOverrides(db)).get(def.id);
	} catch (e) {
		logDBError('plantilla de mail', e);
	}
	return {
		dbAvailable: Boolean(db),
		def: {
			id: def.id,
			label: def.label,
			when: def.when,
			fixed: def.fixed,
			vars: def.vars,
			defaults: def.defaults,
			extras: def.extras
		},
		limits: TEMPLATE_LIMITS,
		saved: saved ?? null,
		recipients: await testRecipients({ db, token: locals.user_token, fetch })
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	save: async ({ locals, url, params, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const def = defOr404(params.id);
		const db = getDB(platform);
		const form = await readForm(request);
		const valid = validateTemplate(def.id, form);
		if (!valid.ok) {
			return fail(400, { error: 'Revisá lo marcado.', errors: valid.errors, values: valid.value });
		}
		if (!db) return fail(503, { error: 'Sin base de datos.', errors: {}, values: valid.value });
		try {
			await saveTemplateOverride(db, def.id, valid.value, { by: admin.login });
		} catch (e) {
			logDBError('guardar plantilla de mail', e);
			return fail(500, {
				error: 'No se pudo guardar. Probá de nuevo.',
				errors: {},
				values: valid.value
			});
		}
		await logAdminAction(db, locals, {
			action: 'template.save',
			targetType: 'email_template',
			targetId: def.id,
			summary: `Cambió el texto del mail "${def.label}"`,
			detail: { subject: valid.value.subject }
		});
		return { ok: true, message: 'Guardado: los próximos mails salen con este texto.' };
	},

	reset: async ({ locals, url, params, platform }) => {
		requireAdmin(locals, url);
		const def = defOr404(params.id);
		const db = getDB(platform);
		if (!db) return fail(503, { error: 'Sin base de datos.', errors: {} });
		const had = await deleteTemplateOverride(db, def.id);
		if (had) {
			await logAdminAction(db, locals, {
				action: 'template.reset',
				targetType: 'email_template',
				targetId: def.id,
				summary: `Restauró el texto original del mail "${def.label}"`
			});
		}
		return {
			ok: true,
			reset: true,
			message: 'Listo: el mail vuelve a salir con el texto original.'
		};
	},

	// "Mandarme una prueba": con lo que está escrito ahora (aunque no esté guardado), con datos de
	// ejemplo, a una dirección de la organización o de le admin.
	test: async ({ locals, url, params, platform, request, fetch }) => {
		requireAdmin(locals, url);
		const def = defOr404(params.id);
		const db = getDB(platform);
		const form = await readForm(request);
		const valid = validateTemplate(def.id, form);
		if (!valid.ok) {
			return fail(400, { error: 'Revisá lo marcado.', errors: valid.errors, values: valid.value });
		}
		const allowed = await testRecipients({ db, token: locals.user_token, fetch });
		if (!allowed.some((r) => r.address === form.to)) {
			return fail(400, {
				error: 'Elegí una de las direcciones de la lista.',
				errors: {},
				values: valid.value
			});
		}
		const message = previewEmail(def.id, valid.value, {
			origin: siteOrigin(url),
			contactEmail: contactEmail(),
			replyTo: await replyToAddress(db)
		});
		const result = await sendTestEmail({ db, fetch, to: form.to, message });
		/** @type {Record<string, string>} */
		const text = {
			sent: `Mandamos la prueba a ${form.to}.`,
			simulated:
				'Sin RESEND_API_KEY (o en un preview sin EMAIL_ALLOWLIST) el mail no sale: quedó en los logs.',
			failed: 'No se pudo mandar la prueba (ver logs).'
		};
		const body = {
			ok: result !== 'failed',
			message: text[result],
			values: valid.value,
			errors: {}
		};
		return result === 'failed' ? fail(502, { ...body, error: text.failed }) : body;
	}
};
