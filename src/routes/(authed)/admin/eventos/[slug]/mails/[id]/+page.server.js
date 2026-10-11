/**
 * Plantilla de un mail para un evento: lo que cambia sobre la plantilla general solo en los mails
 * de este evento (`event_email_templates`). Guardar, volver a la plantilla general (el texto de
 * antes queda para «Recuperar» en Actividad) y mandarse una prueba. Solo admins (`requireAdmin` en el `load` y en cada action); cada cambio queda en el
 * registro de actividad.
 */
import { fail } from '@sveltejs/kit';
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
	deleteEventTemplateOverride,
	listEventTemplateOverrides,
	saveEventTemplateOverride
} from '$lib/server/tickets/templates.js';
import { TEMPLATE_LIMITS, mergeTemplates, validateTemplate } from '$lib/utils/emailTemplates.js';
import { eventMailOr404, generalTemplate } from './context.server.js';

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
	const { def, config } = await eventMailOr404(params.slug, params.id);
	const db = getDB(platform);
	/** @type {import('$lib/server/tickets/templates.js').StoredEventTemplate | undefined} */
	let saved;
	/** @type {Awaited<ReturnType<typeof generalTemplate>>} */
	let general = { general: null, inherited: {} };
	try {
		[saved, general] = await Promise.all([
			listEventTemplateOverrides(db, params.slug).then((m) => m.get(def.id)),
			generalTemplate(db, def)
		]);
	} catch (e) {
		logDBError('plantilla de mail del evento', e);
	}
	return {
		dbAvailable: Boolean(db),
		eventTitle: config.title || params.slug,
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
		hasGeneral: Boolean(general.general),
		inherited: general.inherited,
		recipients: await testRecipients({ db, token: locals.user_token, fetch })
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	save: async ({ locals, url, params, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const { def, config } = await eventMailOr404(params.slug, params.id);
		const db = getDB(platform);
		const form = await readForm(request);
		const valid = validateTemplate(def.id, form, { optional: true });
		if (!valid.ok) {
			return fail(400, { error: 'Revisá lo marcado.', errors: valid.errors, values: valid.value });
		}
		if (!db) return fail(503, { error: 'Sin base de datos.', errors: {}, values: valid.value });
		let kept = false;
		try {
			kept = await saveEventTemplateOverride(db, params.slug, def.id, valid.value, {
				by: admin.login,
				// Si quedó todo vacío, el texto de antes queda para «Recuperar» en Actividad.
				title: `Mail «${def.label}» de ${config.title || params.slug}`
			});
		} catch (e) {
			logDBError('guardar plantilla de mail del evento', e);
			return fail(500, {
				error: 'No se pudo guardar. Probá de nuevo.',
				errors: {},
				values: valid.value
			});
		}
		await logAdminAction(db, locals, {
			action: kept ? 'template.event_save' : 'template.event_reset',
			targetType: 'event_email_template',
			targetId: `${params.slug}/${def.id}`,
			summary: kept
				? `Cambió el mail "${def.label}" de ${config.title || params.slug}`
				: `Volvió a la plantilla general el mail "${def.label}" de ${config.title || params.slug}`,
			detail: kept ? { subject: valid.value.subject || null } : undefined
		});
		return {
			ok: true,
			reset: !kept,
			message: kept
				? 'Guardado: los próximos mails de este evento salen con este texto.'
				: 'No quedó nada propio: este mail sale como en la plantilla general.'
		};
	},

	reset: async ({ locals, url, params, platform }) => {
		const admin = requireAdmin(locals, url);
		const { def, config } = await eventMailOr404(params.slug, params.id);
		const db = getDB(platform);
		if (!db) return fail(503, { error: 'Sin base de datos.', errors: {} });
		// El texto de antes queda para «Recuperar» en Actividad.
		const had = await deleteEventTemplateOverride(db, params.slug, def.id, {
			by: admin.login,
			title: `Mail «${def.label}» de ${config.title || params.slug}`
		});
		if (had) {
			await logAdminAction(db, locals, {
				action: 'template.event_reset',
				targetType: 'event_email_template',
				targetId: `${params.slug}/${def.id}`,
				summary: `Volvió a la plantilla general el mail "${def.label}" de ${config.title || params.slug}`
			});
		}
		return {
			ok: true,
			reset: true,
			message: had
				? 'Listo: este mail vuelve a salir como en la plantilla general. Si te equivocaste, el texto de antes se recupera desde Ajustes › Actividad.'
				: 'Listo: este mail vuelve a salir como en la plantilla general.'
		};
	},

	// "Mandarme una prueba": lo escrito ahora (aunque no esté guardado) sobre la plantilla general,
	// con el evento de verdad y una compra de ejemplo, a una dirección de la organización.
	test: async ({ locals, url, params, platform, request, fetch }) => {
		requireAdmin(locals, url);
		const { def, previewEvent } = await eventMailOr404(params.slug, params.id);
		const db = getDB(platform);
		const form = await readForm(request);
		const valid = validateTemplate(def.id, form, { optional: true });
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
		const { general } = await generalTemplate(db, def);
		const message = previewEmail(def.id, mergeTemplates(valid.value, general), {
			origin: siteOrigin(url),
			contactEmail: contactEmail(),
			replyTo: await replyToAddress(db),
			event: previewEvent
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
