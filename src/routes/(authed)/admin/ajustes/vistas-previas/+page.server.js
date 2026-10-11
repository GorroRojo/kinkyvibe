/**
 * Ajustes › Comunicación › Vistas previas al compartir: los textos que arman la tarjeta de un link
 * pegado en WhatsApp, Telegram, Instagram o X (títulos, descripciones, frases de los filtros) y
 * los que van escritos en las imágenes. Cada uno con su original y «volver al original». Se guardan
 * en `ticket_settings` (src/lib/server/linkPreview.js). Solo admins; cada guardado queda en el
 * registro de actividad. Ver docs/compartir.md.
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB, logDBError } from '$lib/server/db';
import {
	linkPreviewState,
	readPreviewTextOverrides,
	savePreviewTextOverrides
} from '$lib/server/linkPreview.js';
import {
	PREVIEW_TEXT_FIELDS,
	PREVIEW_TEXT_GROUPS,
	validatePreviewTexts
} from '$lib/utils/previewTexts.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	const [saved, state] = await Promise.all([
		readPreviewTextOverrides(db),
		linkPreviewState(platform).catch(() => null)
	]);
	return {
		dbAvailable: Boolean(db),
		groups: PREVIEW_TEXT_GROUPS,
		fields: PREVIEW_TEXT_FIELDS,
		saved: saved.overrides,
		updatedAt: saved.updatedAt,
		updatedBy: saved.updatedBy,
		// Las imágenes de ahora (con las portadas de los próximos eventos), para la vista previa.
		images: Object.fromEntries(
			Object.entries(state?.cards ?? {}).map(([k, c]) => [k, c?.url ?? null])
		)
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	save: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		const form = Object.fromEntries(
			[...(await request.formData())].map(([k, v]) => [k, String(v).slice(0, 400)])
		);
		const valid = validatePreviewTexts(form);
		if (!valid.ok) {
			return fail(400, { error: 'Revisá lo marcado.', errors: valid.errors, values: valid.values });
		}
		if (!db) return fail(503, { error: 'Sin base de datos.', errors: {}, values: form });
		const before = (await readPreviewTextOverrides(db)).overrides;
		try {
			await savePreviewTextOverrides(db, valid.value, { by: admin.login });
		} catch (error) {
			logDBError('guardar textos de la vista previa', error);
			return fail(500, { error: 'No se pudo guardar. Probá de nuevo.', errors: {}, values: form });
		}
		const changed = PREVIEW_TEXT_FIELDS.map((f) => f.key).filter(
			(k) => (before[k] ?? null) !== (valid.value[k] ?? null)
		);
		await logAdminAction(db, locals, {
			action: 'settings.save',
			targetType: 'settings',
			targetId: 'link_preview_texts',
			summary: changed.length
				? `Cambió ${changed.length === 1 ? 'un texto' : `${changed.length} textos`} de las vistas previas al compartir`
				: 'Guardó los textos de las vistas previas al compartir (sin cambios)',
			detail: { changed, custom: Object.keys(valid.value) }
		});
		return {
			ok: true,
			message:
				'Guardado. Los links nuevos ya salen así; las apps que ya guardaron una vista previa la cambian cuando la vuelven a leer.'
		};
	}
};
