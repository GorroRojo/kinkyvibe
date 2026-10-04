/**
 * Ficha de un perfil en el panel: sus datos, quiénes lo gestionan y las acciones de admins:
 * marcarlo como revisado (sale de "Para revisar"), ocultarlo o borrarlo (suave). Ocultar y borrar
 * van por `saveObject()` con la versión que se abrió (docs/objetos.md). Borrar es el mismo borrado
 * que el resto del panel (`deleteDbProfile`: una fila en `panel_deletions` con
 * `objeto:perfil:<id>`), así tiene «Deshacer» enseguida y «Recuperar» en Actividad. Solo admins: el `load` y
 * cada action llaman a `requireAdmin`. Todo queda en el registro de actividad.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { adminViewer, getProfileDetail, hideProfile } from '$lib/server/admin/cuentas.js';
import {
	UndoError,
	dbProfileIdOf,
	deleteDbProfile,
	getDeletion,
	undoDbProfileDeletionById
} from '$lib/server/admin/deletions.js';
import { ObjectError, VersionConflictError } from '$lib/server/objects/index.js';
import { listClaims } from '$lib/server/amigues/claims.js';
import { approvalAction, claimDecisionAction } from '$lib/server/admin/amiguesRoutes.js';

/** @param {string | undefined} raw */
function profileId(raw) {
	const id = Number(raw);
	return Number.isSafeInteger(id) && id > 0 && String(id) === raw ? id : null;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders }) {
	const user = requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const id = profileId(params.id);
	const detail = id ? await getProfileDetail(db, id, adminViewer(user)) : null;
	if (!detail) error(404, 'No encontramos ese perfil.');
	return {
		...detail,
		// Pedidos "Es mi perfil" de este perfil (también los resueltos).
		claims: await listClaims(db, { profileId: detail.profile.id, status: 'all' }).catch(() => [])
	};
}

/**
 * Lo común de las acciones: admin, base, el perfil (vivo) y la versión que se abrió.
 *
 * @param {import('./$types').RequestEvent} event
 */
async function target(event) {
	const user = requireAdmin(event.locals, event.url);
	const db = getDB(event.platform);
	if (!db) return { failure: fail(503, { perfil: { ok: false, message: 'Sin base de datos.' } }) };
	const id = profileId(event.params.id);
	const detail = id ? await getProfileDetail(db, id, adminViewer(user)) : null;
	if (!id || !detail) {
		return { failure: fail(404, { perfil: { ok: false, message: 'No encontramos ese perfil.' } }) };
	}
	if (detail.profile.deletedAt) {
		return {
			failure: fail(409, { perfil: { ok: false, message: 'Ese perfil ya está borrado.' } })
		};
	}
	const version = Number((await event.request.formData()).get('version'));
	return { user, db, id, detail, version };
}

/**
 * Traduce los errores de saveObject.
 * @param {unknown} e
 */
function saveFailure(e) {
	if (e instanceof VersionConflictError) {
		return fail(409, {
			perfil: {
				ok: false,
				message:
					'Alguien cambió este perfil mientras lo mirabas. Recargá la página, revisalo y volvé a intentar.'
			}
		});
	}
	if (e instanceof ObjectError)
		return fail(e.status, { perfil: { ok: false, message: e.message } });
	throw e;
}

/** @type {import('./$types').Actions} */
export const actions = {
	// "Marcar como revisado": sale de "Para revisar" del Inicio. No cambia el perfil.
	revisado: async (event) => {
		const t = await target(event);
		if (t.failure) return t.failure;
		if (t.detail.review) {
			return { perfil: { ok: true, message: 'Ya estaba revisado.' } };
		}
		await logAdminAction(t.db, event.locals, {
			action: 'profile.review',
			targetType: 'profile',
			targetId: t.id,
			summary: `Marcó como revisado el perfil «${t.detail.profile.title}»`
		});
		return { perfil: { ok: true, message: 'Listo: marcado como revisado.' } };
	},

	// Ocultar: visibilidad `hidden` (lo ven solo admins y quienes lo gestionan, en Mi rincón).
	ocultar: async (event) => {
		const t = await target(event);
		if (t.failure) return t.failure;
		if (t.detail.profile.visibility === 'hidden') {
			return { perfil: { ok: true, message: 'Ya estaba oculto.' } };
		}
		try {
			await hideProfile(t.db, t.id, t.version, t.user);
		} catch (e) {
			return saveFailure(e);
		}
		await logAdminAction(t.db, event.locals, {
			action: 'profile.hide',
			targetType: 'profile',
			targetId: t.id,
			summary: `Ocultó el perfil «${t.detail.profile.title}»`,
			detail: { from: t.detail.profile.visibility }
		});
		return { perfil: { ok: true, message: 'Listo: el perfil quedó oculto.' } };
	},

	// Aparece (o deja de aparecer) en /amigues. No cambia el perfil.
	aprobar: approvalAction(true),
	desaprobar: approvalAction(false),
	// Aprobar o rechazar un pedido "Es mi perfil".
	pedido: claimDecisionAction,

	// Borrar (suave): no se ve en ningún lado. «Deshacer» enseguida o «Recuperar» en Actividad.
	borrar: async (event) => {
		const t = await target(event);
		if (t.failure) return t.failure;
		const title = t.detail.profile.title;
		/** @type {number} */
		let deletion;
		try {
			const r = await deleteDbProfile(
				t.db,
				{ login: t.user.login, locals: event.locals },
				{ id: t.id, version: t.version, title, urlSlug: t.detail.urlSlug }
			);
			deletion = r.id;
		} catch (e) {
			return saveFailure(e);
		}
		return {
			perfil: { ok: true, message: 'Listo: el perfil quedó borrado.' },
			deleted: { id: deletion, title }
		};
	},

	// Deshacer el borrado recién hecho (el mismo camino que «Recuperar» en Actividad).
	deshacer: async (event) => {
		const user = requireAdmin(event.locals, event.url);
		const db = getDB(event.platform);
		if (!db) return fail(503, { perfil: { ok: false, message: 'Sin base de datos.' } });
		const id = profileId(event.params.id);
		const deletionId = Number((await event.request.formData()).get('id'));
		const d =
			Number.isSafeInteger(deletionId) && deletionId > 0 ? await getDeletion(db, deletionId) : null;
		// Solo un borrado de ESTE perfil (de la base): nunca uno del repo ni de otro perfil.
		if (!id || !d || dbProfileIdOf(d.path) !== id) {
			return fail(404, { perfil: { ok: false, message: 'No encontramos ese borrado.' } });
		}
		try {
			await undoDbProfileDeletionById(db, { login: user.login, locals: event.locals }, d.id);
		} catch (e) {
			if (e instanceof UndoError) return fail(409, { perfil: { ok: false, message: e.message } });
			throw e;
		}
		return { perfil: { ok: true, message: 'Listo: el perfil volvió.' } };
	}
};
