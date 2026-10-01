/**
 * Eventos → Series (interruptor `series`): las series (etiquetas hijas de «evento recurrente»)
 * con sus ediciones y cuántas personas pidieron aviso. Solo admins (sin sesión, al login; sin
 * permiso, 403); con el interruptor apagado, 404. Los mails de quienes piden aviso nunca salen de
 * la base: acá solo se cuentan. Las ediciones se bajan en CSV (ediciones.csv).
 *
 * «Crear serie» (acción `crear`): una etiqueta nueva hija de «evento recurrente», con imagen
 * (de src/lib/assets) y descripción opcionales, guardada por el mismo camino que
 * /admin/etiquetas (planTagEdit / commitTagEdit: un commit al archivo de etiquetas).
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { commitTagEdit, planTagEdit } from '$lib/server/admin/tagEditor.js';
import { assetNames, getEventAdmin, getRepoClient } from '$lib/server/eventos';
import { FileChangedError, PendingChangeError } from '$lib/server/eventos/github.js';
import { allSeries, tagExists } from '$lib/server/series/index.js';
import { subscriberCounts } from '$lib/server/series/subscriptions.js';
import { requireSeries } from '$lib/server/series/web.js';
import { seriesEnabled } from '$lib/server/flags.js';
import { seriesCreateOps } from '$lib/utils/seriesAdmin.js';
// La copia del archivo de etiquetas de este deploy (si el cliente del repo no lo tiene).
import bundledSource from '$lib/utils/hardcodedTags.js?raw';

const NO_PERMISSION =
	'No tenés permiso para editar etiquetas. Probá cerrar sesión y volver a entrar.';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	await requireSeries(platform);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	/** @type {Map<string, { confirmed: number, pending: number }>} */
	let counts = new Map();
	if (db) {
		try {
			counts = await subscriberCounts(db);
		} catch (error) {
			logDBError('series: suscripciones', error);
		}
	}
	const series = await allSeries();
	const canCreate = Boolean(getEventAdmin(locals));
	const upcomingSlugs = new Set(series.flatMap((s) => s.upcoming.map((e) => e.slug)));
	return {
		series: series.map((s) => ({
			id: s.id,
			name: s.name,
			icon: s.icon,
			href: s.href,
			image: s.image ?? null,
			total: s.editions.length,
			upcoming: s.upcoming.length,
			next: s.upcoming[0] ?? null,
			last: s.past[0] ?? null,
			subscribers: counts.get(s.id) ?? { confirmed: 0, pending: 0 },
			// la más nueva primero, como el resto de las listas del panel
			editions: [...s.editions]
				.reverse()
				.map((e) => ({ ...e, upcoming: upcomingSlugs.has(e.slug) }))
		})),
		canCreate,
		// Para elegir la imagen de una serie nueva.
		assets: canCreate ? assetNames() : []
	};
}

/** @param {unknown} e */
const describe = (e) => (e instanceof Error ? e.message : String(e));

/** @type {import('./$types').Actions} */
export const actions = {
	crear: async ({ locals, request, platform }) => {
		if (!(await seriesEnabled(platform))) return fail(404, { error: 'Not found' });
		const admin = getEventAdmin(locals);
		if (!admin) return fail(403, { error: NO_PERMISSION });
		const data = await request.formData();
		const input = {
			name: data.get('name'),
			image: data.get('image'),
			description: data.get('description')
		};
		const planned = seriesCreateOps(input, { exists: (n) => tagExists(n) });
		if (!planned.ok) return fail(400, { error: planned.error, values: textValues(input) });
		const client = await getRepoClient();
		let plan;
		try {
			plan = await planTagEdit(client, admin.token, planned.ops, bundledSource);
		} catch (e) {
			return fail(400, { error: describe(e), values: textValues(input) });
		}
		try {
			const commit = await commitTagEdit(client, admin.token, plan, admin.name);
			await logAdminAction(getDB(platform), locals, {
				action: 'tags.edit',
				targetType: 'tags',
				targetId: planned.name.slice(0, 120),
				summary: `Series: crear «${planned.name}»`,
				detail: { commit: commit.url, files: plan.files.map((f) => f.path) }
			});
			return { created: { name: planned.name, commit: commit.url, publish: commit.pr ?? null } };
		} catch (e) {
			if (e instanceof FileChangedError)
				return fail(409, {
					error: `${e.path} cambió en GitHub mientras tanto. Probá de nuevo.`,
					values: textValues(input)
				});
			if (e instanceof PendingChangeError)
				return fail(409, { error: e.message + '.', values: textValues(input) });
			return fail(502, { error: 'No se pudo guardar: ' + describe(e), values: textValues(input) });
		}
	}
};

/** Lo que se escribió, para no perderlo si hay un error. @param {Record<string, unknown>} input */
function textValues(input) {
	return Object.fromEntries(
		Object.entries(input).map(([k, v]) => [k, typeof v === 'string' ? v : ''])
	);
}
