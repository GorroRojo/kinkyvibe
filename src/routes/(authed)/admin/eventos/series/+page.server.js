/**
 * Eventos → Series (interruptor `series`): las series (etiquetas hijas de «evento recurrente»)
 * con sus ediciones y cuántas personas pidieron aviso. Solo admins (sin sesión, al login; sin
 * permiso, 403); con el interruptor apagado, 404. Los mails de quienes piden aviso nunca salen de
 * la base: acá solo se cuentan. Las ediciones se bajan en CSV (ediciones.csv).
 *
 * «Crear serie» (acción `crear`): una etiqueta nueva hija de «evento recurrente», con imagen
 * (de src/lib/assets) y descripción opcionales. «Editar» (acción `editar`): el nombre de la
 * etiqueta (renombrar, con la misma elección que en Etiquetas: RenameChoice.svelte), nombre
 * visible, ícono, imagen y descripción de una serie. Se guardan por el mismo camino que
 * /admin/etiquetas: un commit al archivo de etiquetas (planTagEdit / commitTagEdit) o, con el
 * interruptor `etiquetas_db`, en la base al momento (src/lib/server/etiquetas/panel.js; renombrar
 * en las publicaciones, además, un commit). Renombrar pide confirmar después de ver cuántas
 * publicaciones cambian.
 */
import { fail } from '@sveltejs/kit';
import { isAdmin, requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { TAGS_PATH, commitTagEdit, planTagEdit } from '$lib/server/admin/tagEditor.js';
import { assetNames, getEventAdmin, getRepoClient } from '$lib/server/eventos';
import { FileChangedError, PendingChangeError } from '$lib/server/eventos/github.js';
import { allSeries, tagExists } from '$lib/server/series/index.js';
import { subscriberCounts } from '$lib/server/series/subscriptions.js';
import { requireSeries } from '$lib/server/series/web.js';
import { seriesEnabled } from '$lib/server/flags.js';
import { seriesCreateOps, seriesEditOps } from '$lib/utils/seriesAdmin.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { dbTagsForAdmin, previewDbTagEdit, saveDbTagEdit } from '$lib/server/etiquetas/panel.js';
// La copia del archivo de etiquetas de este deploy (si el cliente del repo no lo tiene).
import bundledSource from '$lib/utils/hardcodedTags.js?raw';

const NO_PERMISSION =
	'No tenés permiso para editar etiquetas. Probá cerrar sesión y volver a entrar.';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	const login = requireAdmin(locals, url).login;
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
	// El árbol del archivo, o el de la base con el interruptor `etiquetas_db`.
	const tags = await siteTagManager(platform);
	const series = await allSeries({ tags });
	const dbMode = Boolean(await dbTagsForAdmin(platform, login));
	const canCreate = dbMode || Boolean(getEventAdmin(locals));
	const upcomingSlugs = new Set(series.flatMap((s) => s.upcoming.map((e) => e.slug)));
	return {
		series: series.map((s) => ({
			id: s.id,
			name: s.name,
			icon: s.icon,
			href: s.href,
			image: s.image ?? null,
			description: s.description,
			total: s.editions.length,
			upcoming: s.upcoming.length,
			next: s.upcoming[0] ?? null,
			last: s.past[0] ?? null,
			subscribers: counts.get(s.id) ?? { confirmed: 0, pending: 0 },
			// Lo que se edita con «Editar».
			edit: editValues(tags, s.id),
			// la más nueva primero, como el resto de las listas del panel
			editions: [...s.editions]
				.reverse()
				.map((e) => ({ ...e, upcoming: upcomingSlugs.has(e.slug) }))
		})),
		canCreate,
		dbMode,
		// Para elegir la imagen de una serie.
		assets: canCreate ? assetNames() : []
	};
}

/** @param {unknown} e */
const describe = (e) => (e instanceof Error ? e.message : String(e));

/** @type {import('./$types').Actions} */
export const actions = {
	crear: async ({ locals, request, platform }) => {
		if (!(await seriesEnabled(platform))) return fail(404, { error: 'Not found' });
		const data = await request.formData();
		const input = {
			name: data.get('name'),
			image: data.get('image'),
			description: data.get('description')
		};
		const tags = await siteTagManager(platform);
		const planned = seriesCreateOps(input, { exists: (n) => tagExists(n, tags) });
		if (!planned.ok) return fail(400, { error: planned.error, values: textValues(input) });
		const res = await saveSeriesOps(locals, platform, planned.ops, {
			name: planned.name,
			summary: `crear «${planned.name}»`
		});
		if (!res.ok) return fail(res.status, { error: res.error, values: textValues(input) });
		return { created: { name: planned.name, ...res.saved } };
	},

	editar: async ({ locals, request, platform }) => {
		if (!(await seriesEnabled(platform))) return fail(404, { error: 'Not found' });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const keepAlias = data.get('keepAlias') === '1';
		const input = {
			key: data.get('key') ?? undefined,
			visible_name: data.get('visible_name'),
			icon: data.get('icon'),
			image: data.get('image'),
			description: data.get('description')
		};
		const tags = await siteTagManager(platform);
		const current = (await allSeries({ tags })).some((s) => s.id === id)
			? editValues(tags, id)
			: null;
		if (!current) return fail(404, { editing: id, error: 'Esa serie ya no existe.' });
		const planned = seriesEditOps(input, current, {
			keepAlias,
			exists: (n) => tagExists(n, tags)
		});
		const values = { ...textValues(input), keepAlias: keepAlias ? '1' : '' };
		if (!planned.ok) return fail(400, { editing: id, error: planned.error, values });
		// Renombrar: primero cuántas publicaciones cambian; se guarda cuando se confirma eso mismo.
		const confirmed =
			data.get('confirmTo') === planned.name && data.get('confirmAlias') === values.keepAlias;
		if (planned.renamed && !confirmed) {
			const count = await renamedPosts(locals, platform, planned.ops);
			if (!count.ok) return fail(count.status, { editing: id, error: count.error, values });
			return {
				editing: id,
				values,
				confirmRename: {
					from: id,
					to: planned.name,
					keepAlias: values.keepAlias,
					posts: count.posts,
					db: count.db
				}
			};
		}
		const res = await saveSeriesOps(locals, platform, planned.ops, {
			name: planned.name,
			summary: planned.renamed
				? `renombrar «${id}» a «${planned.name}»`
				: `editar «${planned.name}»`
		});
		if (!res.ok) return fail(res.status, { editing: id, error: res.error, values });
		return { edited: { name: planned.name, renamedFrom: planned.renamed, ...res.saved } };
	}
};

/**
 * Lo editable de una serie, como está ahora.
 *
 * @param {TagManager} tags
 * @param {string} id
 */
function editValues(tags, id) {
	const t = /** @type {Record<string, unknown> | undefined} */ (tags.get(id));
	/** @param {unknown} v */
	const str = (v) => (typeof v === 'string' ? v : '');
	const visible = str(t?.visible_name);
	return {
		id,
		key: id,
		visible_name: visible === id ? '' : visible,
		icon: str(t?.icon).trim(),
		image: str(t?.image).trim(),
		description: str(t?.description)
	};
}

/**
 * Con qué hacer el commit de las publicaciones, o null si no se puede.
 * @param {App.Locals} locals
 * @returns {Promise<import('$lib/server/etiquetas/panel.js').RepoAccess>}
 */
async function repoAccess(locals) {
	const admin = getEventAdmin(locals);
	return admin ? { client: await getRepoClient(), token: admin.token, who: admin.name } : null;
}

/**
 * Cuántas publicaciones cambian al renombrar (lo que se muestra antes de confirmar): con la base,
 * las del renombre sin alias (con alias, ninguna); con el archivo, las del commit (menos el
 * archivo de etiquetas).
 *
 * @param {App.Locals} locals
 * @param {App.Platform | undefined} platform
 * @param {import('$lib/utils/tagConfig.js').TagOp[]} ops
 * @returns {Promise<{ ok: true, posts: number, db: boolean } | { ok: false, status: number, error: string }>}
 */
async function renamedPosts(locals, platform, ops) {
	if (!locals.user || !isAdmin(locals.user))
		return { ok: false, status: 403, error: NO_PERMISSION };
	const fromDb = await dbTagsForAdmin(platform, locals.user.login);
	if (fromDb) {
		const res = await previewDbTagEdit(fromDb, ops, await repoAccess(locals));
		if (!res.ok) return res;
		return { ok: true, posts: res.preview.posts?.total ?? 0, db: true };
	}
	const admin = getEventAdmin(locals);
	if (!admin) return { ok: false, status: 403, error: NO_PERMISSION };
	try {
		const plan = await planTagEdit(await getRepoClient(), admin.token, ops, bundledSource);
		return { ok: true, posts: plan.files.filter((f) => f.path !== TAGS_PATH).length, db: false };
	} catch (e) {
		return { ok: false, status: 400, error: describe(e) };
	}
}

/**
 * Guarda operaciones de series: en la base (interruptor `etiquetas_db`) o con un commit al archivo.
 *
 * @param {App.Locals} locals
 * @param {App.Platform | undefined} platform
 * @param {import('$lib/utils/tagConfig.js').TagOp[]} ops
 * @param {{ name: string, summary: string }} what
 * @returns {Promise<{ ok: true, saved: { db: boolean, commit: string | null, publish: any, posts?: number } } | { ok: false, status: number, error: string }>}
 */
async function saveSeriesOps(locals, platform, ops, { name, summary }) {
	if (!locals.user || !isAdmin(locals.user))
		return { ok: false, status: 403, error: NO_PERMISSION };
	const fromDb = await dbTagsForAdmin(platform, locals.user.login);
	if (fromDb) {
		// Renombrar sin alias: también un commit que cambia las publicaciones (saveDbTagEdit).
		const res = await saveDbTagEdit(fromDb, ops, {
			locals,
			login: locals.user.login,
			label: 'Series',
			targetId: name.slice(0, 120),
			repo: await repoAccess(locals)
		});
		if (!res.ok) return res;
		return {
			ok: true,
			saved: { db: true, commit: res.commit, publish: res.publish, posts: res.posts }
		};
	}
	const admin = getEventAdmin(locals);
	if (!admin) return { ok: false, status: 403, error: NO_PERMISSION };
	const client = await getRepoClient();
	let plan;
	try {
		plan = await planTagEdit(client, admin.token, ops, bundledSource);
	} catch (e) {
		return { ok: false, status: 400, error: describe(e) };
	}
	try {
		const commit = await commitTagEdit(client, admin.token, plan, admin.name);
		await logAdminAction(getDB(platform), locals, {
			action: 'tags.edit',
			targetType: 'tags',
			targetId: name.slice(0, 120),
			summary: `Series: ${summary}`,
			detail: { commit: commit.url, files: plan.files.map((f) => f.path) }
		});
		return { ok: true, saved: { db: false, commit: commit.url, publish: commit.pr ?? null } };
	} catch (e) {
		if (e instanceof FileChangedError)
			return {
				ok: false,
				status: 409,
				error: `${e.path} cambió en GitHub mientras tanto. Probá de nuevo.`
			};
		if (e instanceof PendingChangeError) return { ok: false, status: 409, error: e.message + '.' };
		return { ok: false, status: 502, error: 'No se pudo guardar: ' + describe(e) };
	}
}

/** Lo que se escribió, para no perderlo si hay un error. @param {Record<string, unknown>} input */
function textValues(input) {
	return Object.fromEntries(
		Object.entries(input).map(([k, v]) => [k, typeof v === 'string' ? v : ''])
	);
}
