/**
 * Perfiles → Clasificar: la lista de revisión de la clasificación de los perfiles que vinieron de
 * las fichas .md (persona, proyecto o lugar, "a confirmar"). La importación de las fichas ya no
 * existe (decisión 0032: no quedan .md). La dirección sigue siendo /importar para no romper links.
 * Solo admins; queda en el registro.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { classificationRows } from '$lib/server/amigues/review.js';
import {
	confirmKind,
	loadEditableProfile,
	profileFormValues,
	saveProfileFromPanel
} from '$lib/server/amigues/editor.js';
import { EDITOR_KINDS } from '$lib/server/admin/amiguesRoutes.js';
import { getObject } from '$lib/server/objects/index.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	return {
		rows: await classificationRows(db),
		kinds: EDITOR_KINDS
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	// Confirma el tipo de una ficha (y, si se eligió otro, lo cambia con saveObject()).
	confirmar: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { confirm: { ok: false, message: 'Sin base de datos.' } });
		const form = await request.formData();
		const id = Number(form.get('profile'));
		const kind = String(form.get('kind') ?? '');
		const version = Number(form.get('version'));
		const current = Number.isSafeInteger(id)
			? await getObject(db, { id }, { role: 'admin', id: admin.login })
			: null;
		const found = current ? await loadEditableProfile(db, current.slug) : null;
		if (!current || !found?.source) {
			return fail(404, { confirm: { ok: false, message: 'Esa ficha ya no está.' } });
		}
		if (kind && kind !== current.data.kind) {
			const values = { ...profileFormValues(current), kind, version };
			const saved = await saveProfileFromPanel(db, current, values, { actor: admin.login });
			if (!saved.ok) return fail(saved.status, { confirm: { ok: false, message: saved.message } });
		}
		await confirmKind(db, id, admin.login);
		await logAdminAction(db, locals, {
			action: 'profile.kind_confirm',
			targetType: 'profile',
			targetId: id,
			summary: `Confirmó que «${current.title}» es ${kind || current.data.kind}`
		});
		return { confirm: { ok: true, message: `Listo: «${current.title}» confirmado.` } };
	}
};
