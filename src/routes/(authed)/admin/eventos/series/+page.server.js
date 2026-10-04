/**
 * Eventos → Series: las series (etiquetas hijas de «evento recurrente») con sus ediciones y
 * cuántas personas pidieron aviso. Solo admins (sin sesión, al login; sin permiso, 403). Los mails de quienes piden aviso nunca salen de
 * la base: acá solo se cuentan. Las ediciones se bajan en CSV (ediciones.csv).
 *
 * «Crear serie» (acción `crear`): una etiqueta nueva hija de «evento recurrente» o, con `parent`,
 * de otra serie (serie hija: una por año, como «Cuirdas Sudacas 2026»), con ícono, imagen (de
 * src/lib/assets) y descripción opcionales. «Editar» (acción `editar`): el nombre de la
 * etiqueta (renombrar, con la misma elección que en Etiquetas: RenameChoice.svelte), nombre
 * visible, ícono, imagen y descripción de una serie. Se guardan por el mismo camino que
 * /admin/etiquetas: en la base al momento (src/lib/server/etiquetas/panel.js; renombrar también
 * cambia las publicaciones). Ya no hay commits al archivo de etiquetas. Renombrar pide confirmar después de ver cuántas
 * publicaciones cambian.
 */
import { fail } from '@sveltejs/kit';
import { isAdmin, requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { assetNames, getEventAdmin, getRepoClient } from '$lib/server/eventos';
import { allSeries, tagExists } from '$lib/server/series/index.js';
import { subscriberCounts } from '$lib/server/series/subscriptions.js';
import { seriesCreateOps, seriesEditOps } from '$lib/utils/seriesAdmin.js';
import { SERIES_PARENT, seriesParentOf, seriesTagIds } from '$lib/utils/series.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import {
	NEEDS_IMPORT,
	dbTagsForAdmin,
	previewDbTagEdit,
	saveDbTagEdit
} from '$lib/server/etiquetas/panel.js';

const NO_PERMISSION =
	'No tenés permiso para editar etiquetas. Probá cerrar sesión y volver a entrar.';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	const login = requireAdmin(locals, url).login;
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
	// El árbol de etiquetas en uso (la base).
	const tags = await siteTagManager(platform);
	const series = await allSeries({ tags, platform });
	const dbMode = Boolean(await dbTagsForAdmin(platform, login));
	const canCreate = dbMode;
	const upcomingSlugs = new Set(series.flatMap((s) => s.upcoming.map((e) => e.slug)));
	const ids = seriesTagIds(tags);
	return {
		series: series.map((s) => ({
			id: s.id,
			name: s.name,
			// La serie madre, si es una serie hija (una por año, una edición especial).
			parent: seriesParentOf(tags, s.id, ids),
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

/** @type {import('./$types').Actions} */
export const actions = {
	crear: async ({ locals, request, platform }) => {
		const data = await request.formData();
		const input = {
			name: data.get('name'),
			image: data.get('image'),
			description: data.get('description'),
			icon: data.get('icon'),
			parent: data.get('parent')
		};
		const tags = await siteTagManager(platform);
		const planned = seriesCreateOps(input, {
			exists: (n) => tagExists(n, tags),
			seriesIds: seriesTagIds(tags)
		});
		if (!planned.ok) return fail(400, { error: planned.error, values: textValues(input) });
		const res = await saveSeriesOps(locals, platform, planned.ops, {
			name: planned.name,
			summary:
				planned.parent === SERIES_PARENT
					? `crear «${planned.name}»`
					: `crear «${planned.name}» dentro de «${planned.parent}»`
		});
		if (!res.ok) return fail(res.status, { error: res.error, values: textValues(input) });
		return { created: { name: planned.name, ...res.saved } };
	},

	editar: async ({ locals, request, platform }) => {
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
		const current = (await allSeries({ tags, platform })).some((s) => s.id === id)
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
 * Cuántas publicaciones cambian al renombrar (lo que se muestra antes de confirmar): las del
 * renombre sin alias (con alias, ninguna).
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
	if (!fromDb) return { ok: false, status: 503, error: NEEDS_IMPORT };
	const res = await previewDbTagEdit(fromDb, ops, await repoAccess(locals));
	if (!res.ok) return res;
	return { ok: true, posts: res.preview.posts?.total ?? 0, db: true };
}

/**
 * Guarda operaciones de series en la base.
 *
 * @param {App.Locals} locals
 * @param {App.Platform | undefined} platform
 * @param {import('$lib/utils/tagConfig.js').TagOp[]} ops
 * @param {{ name: string, summary?: string }} what
 * @returns {Promise<{ ok: true, saved: { db: boolean, commit: string | null, publish: any, posts?: number } } | { ok: false, status: number, error: string }>}
 */
async function saveSeriesOps(locals, platform, ops, { name }) {
	if (!locals.user || !isAdmin(locals.user))
		return { ok: false, status: 403, error: NO_PERMISSION };
	const fromDb = await dbTagsForAdmin(platform, locals.user.login);
	if (!fromDb) return { ok: false, status: 503, error: NEEDS_IMPORT };
	// Renombrar sin alias: también cambia las publicaciones (saveDbTagEdit).
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

/** Lo que se escribió, para no perderlo si hay un error. @param {Record<string, unknown>} input */
function textValues(input) {
	return Object.fromEntries(
		Object.entries(input).map(([k, v]) => [k, typeof v === 'string' ? v : ''])
	);
}
