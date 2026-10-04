/**
 * Load y acciones de /admin/borrar/[kind]/[slug] (confirmar y borrar, deshacer) y la acción
 * «Recuperar» de Actividad. La lógica está en ./deletions.js; esto es el pegamento con SvelteKit.
 *
 * Los perfiles de amigues que viven solo en la base (sin .md) se borran y se deshacen en la base
 * (deleteBackend → 'objects': deleteDbProfile), sin leer ni escribir GitHub; el resto, por el
 * cliente del repo como siempre.
 *
 * Solo admins (loads: requireAdmin redirige o da 403; acciones: lo mismo, más 403 sin token de
 * GitHub). El interruptor `borrar_desde_panel` quedó prendido para siempre.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { getEventAdmin, getRepoClient, usesLocalRepo } from '$lib/server/eventos';
import {
	FileChangedError,
	PathExistsError,
	PendingChangeError,
	closeContentPull
} from '$lib/server/eventos/github.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { loadEditableProfile } from '$lib/server/amigues/editor.js';
import { ObjectError, VersionConflictError } from '$lib/server/objects/errors.js';
import { authorUsage, contentMetas } from './content.js';
import { contentPullStatus } from './contentPulls.js';
import {
	DELETABLE,
	UndoError,
	confirmed,
	dbProfileDeletionPlan,
	dbProfileDependents,
	deleteBackend,
	deleteDbProfile,
	deletePost,
	deletionPlan,
	eventOrders,
	isDeletable,
	organizedEvents,
	readPostFiles,
	undoDeletion
} from './deletions.js';

const NO_PERMISSION = 'No tenés permiso para borrar. Probá cerrar sesión y volver a entrar.';

/** @param {unknown} e */
const describe = (e) => (e instanceof Error ? e.message : String(e));

/**
 * El plan de borrado de una publicación (qué lo impide, qué depende de ella).
 * @param {App.Platform | undefined} platform
 * @param {import('./deletions.js').DeletableKind} kind
 * @param {string} slug
 * @param {number} media
 */
async function planFor(platform, kind, slug, media) {
	if (kind === 'calendario') {
		const [orders, tickets] = await Promise.all([
			eventOrders(getDB(platform), slug),
			getEventTickets(slug)
		]);
		return deletionPlan({ kind, slug, media, orders, sellsTickets: Boolean(tickets) });
	}
	if (kind === 'amigues') {
		const organizerOf = organizedEvents(await authorUsage('calendario'), slug);
		return deletionPlan({ kind, slug, media, organizerOf });
	}
	return deletionPlan({ kind, slug, media });
}

/**
 * El perfil de amigues con esa dirección si vive SOLO en la base (sin .md; no borrado), con su
 * plan de borrado; si no, `null` (va por el repo, como siempre).
 * @param {App.Platform | undefined} platform
 * @param {string} kind
 * @param {string} slug
 */
async function dbProfileTarget(platform, kind, slug) {
	if (kind !== 'amigues') return null;
	const db = getDB(platform);
	if (!db) return null;
	const found = await loadEditableProfile(db, slug);
	if (!found || deleteBackend(kind, found) !== 'objects') return null;
	const { object } = found;
	const dependents = await dbProfileDependents(db, object, await contentMetas());
	return {
		db,
		profile: { id: object.id, version: object.version, title: object.title, urlSlug: object.slug },
		plan: dbProfileDeletionPlan({ slug: object.slug, dependents })
	};
}

/**
 * Lo común a las acciones: admin y base.
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
async function actionContext({ locals, url, platform }) {
	requireAdmin(locals, url);
	const admin = getEventAdmin(locals);
	if (!admin) return { failure: fail(403, { error: NO_PERMISSION }) };
	const db = getDB(platform);
	if (!db)
		return {
			failure: fail(503, {
				error: 'Sin base de datos: no se puede guardar la copia para deshacer.'
			})
		};
	return { actor: { ...admin, locals }, db };
}

/** Cómo consultar y cerrar PRs: solo con GitHub de verdad (en el mock y la demo no hay PR). */
function pullOps() {
	if (usesLocalRepo()) return null;
	return {
		/** @param {string} token @param {number} n */
		status: (token, n) => contentPullStatus(token, n),
		close: closeContentPull
	};
}

/** @type {import('@sveltejs/kit').ServerLoad} */
export async function deletePageLoad({ locals, url, params, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const admin = getEventAdmin(locals);
	if (!admin) error(403, NO_PERMISSION);
	const kind = params.kind ?? '';
	const slug = params.slug ?? '';
	if (!isDeletable(kind)) error(404, 'No se puede borrar eso desde el panel.');
	const info = DELETABLE[kind];
	const inDb = await dbProfileTarget(platform, kind, slug);
	if (inDb)
		return {
			kind,
			slug,
			info,
			backend: /** @type {'repo' | 'objects'} */ ('objects'),
			exists: true,
			title: inDb.profile.title,
			plan: inDb.plan
		};
	let files;
	try {
		files = await readPostFiles(await getRepoClient(), admin.token, kind, slug);
	} catch (e) {
		error(502, 'No pudimos leer la publicación desde GitHub: ' + describe(e));
	}
	return {
		kind,
		slug,
		info,
		backend: /** @type {'repo' | 'objects'} */ ('repo'),
		exists: Boolean(files),
		title: files?.title ?? slug,
		plan: files ? await planFor(platform, kind, slug, files.media.length) : null
	};
}

/** `?/borrar` @type {import('@sveltejs/kit').Action} */
export async function deleteAction(event) {
	const ctx = await actionContext(event);
	if (ctx.failure) return ctx.failure;
	const { actor, db } = ctx;
	const kind = event.params.kind ?? '';
	const slug = event.params.slug ?? '';
	if (!isDeletable(kind)) return fail(404, { error: 'No se puede borrar eso desde el panel.' });
	const typed = String((await event.request.formData()).get('confirmar') ?? '');
	const inDb = await dbProfileTarget(event.platform, kind, slug);
	if (inDb) {
		// Lo que vale es lo que hay ahora (no lo que mostraba la página).
		if (!confirmed(inDb.plan, slug, typed))
			return fail(400, { error: `Para confirmar, escribí exactamente «${slug}».` });
		try {
			const r = await deleteDbProfile(db, actor, inDb.profile);
			return {
				deleted: {
					id: r.id,
					title: inDb.profile.title,
					publish: null,
					commit: null,
					immediate: true
				}
			};
		} catch (e) {
			if (e instanceof VersionConflictError)
				return fail(409, {
					error: 'Alguien cambió el perfil mientras tanto. Recargá y probá de nuevo.'
				});
			if (e instanceof ObjectError) return fail(e.status === 404 ? 404 : 409, { error: e.message });
			console.log(e);
			return fail(502, { error: 'No se pudo borrar: ' + describe(e) + '. Probá de nuevo.' });
		}
	}
	const client = await getRepoClient();
	let files;
	try {
		files = await readPostFiles(client, actor.token, kind, slug);
	} catch (e) {
		return fail(502, { error: 'No pudimos leer la publicación desde GitHub: ' + describe(e) });
	}
	if (!files) return fail(404, { error: 'Esa publicación ya no existe (¿la borró alguien más?).' });
	// Se vuelve a calcular acá: lo que vale es lo que hay ahora, no lo que mostraba la página.
	const plan = await planFor(event.platform, kind, slug, files.media.length);
	if (plan.blockers.length) return fail(409, { error: plan.blockers.join(' '), blocked: true });
	if (!confirmed(plan, slug, typed))
		return fail(400, { error: `Para confirmar, escribí exactamente «${slug}».` });
	try {
		const r = await deletePost(client, db, actor, { kind, slug, files });
		return {
			deleted: {
				id: r.id,
				title: files.title,
				publish: r.publish,
				commit: /** @type {string | null} */ (r.commit),
				immediate: false
			}
		};
	} catch (e) {
		if (e instanceof PendingChangeError) return fail(409, { error: e.message + '.' });
		if (e instanceof FileChangedError)
			return fail(409, {
				error: 'La publicación cambió mientras tanto. Recargá y probá de nuevo.'
			});
		console.log(e);
		return fail(502, { error: 'No se pudo borrar: ' + describe(e) + '. Probá de nuevo.' });
	}
}

/**
 * `?/deshacer` (página de borrar) y `?/recuperar` (Actividad): mismo camino.
 * @type {import('@sveltejs/kit').Action}
 */
export async function undoAction(event) {
	const ctx = await actionContext(event);
	if (ctx.failure) return ctx.failure;
	const { actor, db } = ctx;
	const id = Number((await event.request.formData()).get('id'));
	if (!Number.isSafeInteger(id) || id <= 0)
		return fail(400, { error: 'Falta el borrado a deshacer.' });
	try {
		const r = await undoDeletion(await getRepoClient(), db, actor, id, { pulls: pullOps() });
		return {
			undone: {
				id,
				mode: r.mode,
				title: r.deletion.title,
				kind: r.deletion.kind,
				slug: r.deletion.slug,
				publish: r.publish,
				immediate: r.immediate === true
			}
		};
	} catch (e) {
		if (e instanceof UndoError) return fail(409, { error: e.message });
		if (e instanceof PathExistsError)
			return fail(409, {
				error: 'Ya hay otra publicación con esa dirección: no se puede recuperar encima.'
			});
		if (e instanceof PendingChangeError) return fail(409, { error: e.message + '.' });
		console.log(e);
		return fail(502, { error: 'No se pudo deshacer: ' + describe(e) + '. Probá de nuevo.' });
	}
}
