/**
 * Panel → Amigues con los perfiles en la base (interruptor `perfiles_publicos`): loads y actions
 * que usan /admin/amigues/[slug], /admin/amigues/nuevo y /admin/eventos/lugares. Con el
 * interruptor apagado, esas rutas siguen con el editor de .md de siempre (contentRoutes.js).
 *
 * Cada load y cada action llama a `requireAdmin`. Todo cambio queda en el registro de actividad.
 * La lógica está en src/lib/server/amigues/editor.js; acá, solo el pegamento con SvelteKit.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { perfilesPublicosEnabled } from '$lib/server/flags.js';
import { logAdminAction } from './audit.js';
import {
	confirmKind,
	createProfileFromPanel,
	loadEditableProfile,
	profileFormValues,
	readProfileForm,
	saveProfileFromPanel
} from '$lib/server/amigues/editor.js';
import { approveProfile, unapproveProfile } from '$lib/server/amigues/approvals.js';
import { urlSlugOf } from '$lib/server/amigues/profiles.js';
import { decideClaim } from '$lib/server/amigues/claims.js';
import { profileKind } from '$lib/server/cuentas/perfiles.js';

/** Tipos que se eligen en el editor. */
export const EDITOR_KINDS = Object.freeze({ persona: 'Persona', grupo: 'Grupo', lugar: 'Lugar' });

/**
 * ¿Las páginas de amigues del panel trabajan con la base? (interruptor prendido y base.)
 *
 * @param {App.Platform | undefined} platform
 */
export async function dbMode(platform) {
	const db = getDB(platform);
	return db && (await perfilesPublicosEnabled(platform)) ? db : null;
}

/**
 * ¿Se edita este perfil en la base? Los perfiles que solo existen en la base (lugares, los que
 * se crean en el panel), siempre. Las fichas importadas, solo con el interruptor prendido: con
 * el interruptor apagado el sitio muestra su .md, así que se sigue editando el .md.
 *
 * @param {App.Platform | undefined} platform
 * @param {{ legacySlug: string | null }} found
 */
async function editsInDb(platform, found) {
	return !found.legacySlug || (await perfilesPublicosEnabled(platform));
}

/**
 * El perfil del editor si se edita en la base (ver `editsInDb`), o `null`.
 *
 * @param {App.Platform | undefined} platform
 * @param {string} urlSlug
 */
async function dbEditable(platform, urlSlug) {
	const db = getDB(platform);
	if (!db) return null;
	const found = await loadEditableProfile(db, urlSlug);
	return found && (await editsInDb(platform, found)) ? { db, found } : null;
}

/**
 * Datos del editor de un perfil de la base, o `null` si no hay perfil con esa dirección o si
 * se edita su .md (ver `editsInDb`).
 *
 * @param {App.Platform | undefined} platform
 *
 * @param {string} urlSlug
 */
export async function editorPageData(platform, urlSlug) {
	const editable = await dbEditable(platform, urlSlug);
	if (!editable) return null;
	const { object, legacySlug, approval, source } = editable.found;
	return {
		editor: /** @type {const} */ ('db'),
		profile: {
			id: object.id,
			title: object.title,
			urlSlug: urlSlugOf(object, legacySlug),
			kind: profileKind(object.data),
			visibility: object.visibility,
			version: object.version,
			updatedAt: object.updated_at,
			updatedBy: object.updated_by
		},
		values: profileFormValues(object),
		approval,
		source,
		kinds: EDITOR_KINDS
	};
}

/**
 * `?/guardarPerfil`: guarda el perfil (publicación inmediata, con control de versión).
 *
 * @type {import('@sveltejs/kit').Action}
 */
export async function saveProfileAction({ locals, url, platform, params, request }) {
	const admin = requireAdmin(locals, url);
	const editable = await dbEditable(platform, params.slug ?? '');
	if (!editable) return fail(404, { perfil: { ok: false, message: 'Ese perfil ya no existe.' } });
	const { db, found } = editable;
	const values = readProfileForm(await request.formData());
	const result = await saveProfileFromPanel(db, found.object, values, { actor: admin.login });
	if (!result.ok) {
		return fail(result.status, {
			perfil: {
				ok: false,
				message: result.message,
				errors: result.errors ?? {},
				conflict: result.conflict ?? null,
				values
			}
		});
	}
	await logAdminAction(db, locals, {
		action: 'profile.update',
		targetType: 'profile',
		targetId: result.profile.id,
		summary: `Editó el perfil «${result.profile.title}»`
	});
	return {
		perfil: {
			ok: true,
			message: 'Listo: guardado y publicado.',
			values: profileFormValues(result.profile)
		}
	};
}

/**
 * `?/crearPerfil`: crea un perfil de la base desde el panel (nace aprobado) y abre su editor.
 * Funciona con el interruptor apagado (por ejemplo, para cargar lugares antes de prenderlo).
 *
 * @type {import('@sveltejs/kit').Action}
 */
export async function createProfileAction({ locals, url, platform, request }) {
	const admin = requireAdmin(locals, url);
	const db = getDB(platform);
	if (!db) return fail(503, { perfil: { ok: false, message: 'Sin base de datos.' } });
	const values = readProfileForm(await request.formData());
	const result = await createProfileFromPanel(db, values, { actor: admin.login });
	if (!result.ok) {
		return fail(result.status, {
			perfil: { ok: false, message: result.message, errors: result.errors ?? {}, values }
		});
	}
	await logAdminAction(db, locals, {
		action: 'profile.create',
		targetType: 'profile',
		targetId: result.profile.id,
		summary: `Creó el perfil «${result.profile.title}» (${profileKind(result.profile.data)})`
	});
	redirect(303, `/admin/amigues/${encodeURIComponent(result.profile.slug)}?guardado=creado`);
}

/**
 * `?/confirmarTipo`: la clasificación de una ficha importada queda confirmada.
 *
 * @type {import('@sveltejs/kit').Action}
 */
export async function confirmKindAction({ locals, url, platform, params }) {
	const admin = requireAdmin(locals, url);
	const db = getDB(platform);
	if (!db) return fail(503, { perfil: { ok: false, message: 'Sin base de datos.' } });
	const found = await loadEditableProfile(db, params.slug ?? '');
	if (!found?.source)
		return fail(404, { perfil: { ok: false, message: 'No es una ficha importada.' } });
	await confirmKind(db, found.object.id, admin.login);
	await logAdminAction(db, locals, {
		action: 'profile.kind_confirm',
		targetType: 'profile',
		targetId: found.object.id,
		summary: `Confirmó que «${found.object.title}» es ${profileKind(found.object.data)}`
	});
	return { perfil: { ok: true, message: 'Listo: tipo confirmado.' } };
}

/**
 * `?/aprobar` y `?/desaprobar`: el perfil aparece (o deja de aparecer) en /amigues.
 *
 * @param {boolean} approve
 * @returns {import('@sveltejs/kit').Action}
 */
export function approvalAction(approve) {
	return async ({ locals, url, platform, params }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { perfil: { ok: false, message: 'Sin base de datos.' } });
		const id = Number(params.id);
		if (!Number.isSafeInteger(id) || id <= 0) error(404, 'Not found');
		const changed = approve
			? await approveProfile(db, id, admin.login)
			: await unapproveProfile(db, id);
		if (changed) {
			const row = await db.prepare('SELECT title FROM objects WHERE id = ?1').bind(id).first();
			const title = String(row?.title ?? id);
			await logAdminAction(db, locals, {
				action: approve ? 'profile.approve' : 'profile.unapprove',
				targetType: 'profile',
				targetId: id,
				summary: approve
					? `Aprobó el perfil «${title}» para Amigues`
					: `Sacó el perfil «${title}» de Amigues`
			});
		}
		return {
			perfil: {
				ok: true,
				message: approve
					? 'Listo: el perfil aparece en Amigues.'
					: 'Listo: el perfil ya no aparece en Amigues.'
			}
		};
	};
}

/**
 * `?/pedido`: aprobar o rechazar un pedido "Es mi perfil" (ClaimsCard.svelte).
 *
 * @type {import('@sveltejs/kit').Action}
 */
export async function claimDecisionAction({ locals, url, platform, request }) {
	const admin = requireAdmin(locals, url);
	const db = getDB(platform);
	if (!db) return fail(503, { claim: { ok: false, message: 'Sin base de datos.' } });
	const form = await request.formData();
	const claimId = Number(form.get('claim'));
	const approve = form.get('decision') === 'aprobar';
	const result = await decideClaim(db, claimId, approve, { by: admin.login });
	if (!result.ok) return fail(result.status, { claim: { ok: false, message: result.message } });
	await logAdminAction(db, locals, {
		action: approve ? 'profile.claim_approve' : 'profile.claim_reject',
		targetType: 'profile',
		targetId: result.claim.profileId,
		// Sin el mail de la cuenta (el registro no lleva mails).
		summary: `${approve ? 'Aprobó' : 'Rechazó'} un pedido «Es mi perfil» de «${result.claim.profileTitle}»`
	});
	return {
		claim: {
			ok: true,
			message: approve
				? `Listo: la cuenta ahora es dueñe de «${result.claim.profileTitle}».`
				: 'Listo: pedido rechazado.'
		}
	};
}
