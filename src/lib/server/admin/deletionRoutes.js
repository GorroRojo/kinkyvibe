/**
 * Load y acciones de /admin/borrar/[kind]/[slug] (confirmar y borrar, deshacer) y la acción
 * «Recuperar» de Actividad. La lógica está en ./deletions.js; esto es el pegamento con SvelteKit.
 *
 * Solo admins (loads: requireAdmin redirige o da 403; acciones: lo mismo, más 403 sin token de
 * GitHub). Borrar necesita el interruptor `borrar_desde_panel` prendido (si no, 404); deshacer y
 * recuperar no: apagar el interruptor nunca deja algo borrado sin vuelta atrás.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { borrarDesdePanelEnabled } from '$lib/server/flags.js';
import { getEventAdmin, getRepoClient, usesLocalRepo } from '$lib/server/eventos';
import {
	FileChangedError,
	PathExistsError,
	PendingChangeError,
	closeContentPull
} from '$lib/server/eventos/github.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { authorUsage } from './content.js';
import { contentPullStatus } from './contentPulls.js';
import {
	DELETABLE,
	UndoError,
	confirmed,
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
 * Lo común a las acciones: admin, interruptor (si `needsFlag`) y base.
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {{ needsFlag: boolean }} opts
 */
async function actionContext({ locals, url, platform }, { needsFlag }) {
	requireAdmin(locals, url);
	if (needsFlag && !(await borrarDesdePanelEnabled(platform)))
		return { failure: fail(404, { error: 'Borrar desde el panel está apagado.' }) };
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
	if (!(await borrarDesdePanelEnabled(platform))) error(404, 'Not found');
	const admin = getEventAdmin(locals);
	if (!admin) error(403, NO_PERMISSION);
	const kind = params.kind ?? '';
	const slug = params.slug ?? '';
	if (!isDeletable(kind)) error(404, 'No se puede borrar eso desde el panel.');
	const info = DELETABLE[kind];
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
		exists: Boolean(files),
		title: files?.title ?? slug,
		plan: files ? await planFor(platform, kind, slug, files.media.length) : null
	};
}

/** `?/borrar` @type {import('@sveltejs/kit').Action} */
export async function deleteAction(event) {
	const ctx = await actionContext(event, { needsFlag: true });
	if (ctx.failure) return ctx.failure;
	const { actor, db } = ctx;
	const kind = event.params.kind ?? '';
	const slug = event.params.slug ?? '';
	if (!isDeletable(kind)) return fail(404, { error: 'No se puede borrar eso desde el panel.' });
	const typed = String((await event.request.formData()).get('confirmar') ?? '');
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
		return { deleted: { id: r.id, title: files.title, publish: r.publish, commit: r.commit } };
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
	const ctx = await actionContext(event, { needsFlag: false });
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
				publish: r.publish
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
