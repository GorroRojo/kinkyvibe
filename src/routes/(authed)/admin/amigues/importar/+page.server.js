/**
 * Contenido → Amigues → Importar y clasificar: pasa las fichas .md de este deploy a perfiles en
 * la base de este entorno (preview o producción) y muestra la lista de revisión de la
 * clasificación (persona, grupo o lugar, "a confirmar"). Es la forma de correr la importación en
 * las bases remotas: idempotente, se puede repetir (ver src/lib/server/amigues/importer.js).
 * Funciona con el interruptor `perfiles_publicos` apagado, para poder revisar antes de prenderlo.
 * Solo admins; queda en el registro.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { importAmigues, summarizeImport } from '$lib/server/amigues/importer.js';
import { bundledAmigueFiles, classificationRows } from '$lib/server/amigues/review.js';
import {
	confirmKind,
	loadEditableProfile,
	profileFormValues,
	saveProfileFromPanel
} from '$lib/server/amigues/editor.js';
import { EDITOR_KINDS } from '$lib/server/admin/amiguesRoutes.js';
import { perfilesPublicosEnabled } from '$lib/server/flags.js';
import { getObject } from '$lib/server/objects/index.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	const admin = requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const preview = await importAmigues(db, await bundledAmigueFiles(), {
		actor: admin.login,
		dryRun: true
	});
	return {
		preview,
		summary: summarizeImport(preview),
		rows: await classificationRows(db),
		kinds: EDITOR_KINDS,
		flagOn: await perfilesPublicosEnabled(platform)
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	importar: async ({ locals, url, platform }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { importResult: null, error: 'Sin base de datos.' });
		const results = await importAmigues(db, await bundledAmigueFiles(), { actor: admin.login });
		const summary = summarizeImport(results);
		await logAdminAction(db, locals, {
			action: 'amigues.import',
			targetType: 'settings',
			targetId: 'amigues',
			summary: `Importó las fichas de amigues: ${summary.created} nuevas, ${summary.updated} actualizadas, ${summary.unchanged} sin cambios`,
			detail: summary
		});
		return {
			importResult: {
				summary,
				problems: results
					.filter((r) => r.action === 'error' || r.action.startsWith('skipped'))
					.map((r) => ({ legacySlug: r.legacySlug, action: r.action, message: r.message ?? '' }))
			}
		};
	},

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
