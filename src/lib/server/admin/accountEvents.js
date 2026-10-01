/**
 * Novedades de cuentas y perfiles para el panel: "cuenta creada" y "perfil creado" quedan en el
 * registro de actividad (`admin_audit`), así aparecen en la actividad del Inicio, en "Desde tu
 * última visita" y en Ajustes → Actividad, igual que las acciones de admins.
 *
 * No las hace une admin: quedan con `actor_id` NULL y el autor {@link ACCOUNT_EVENT_ACTOR}, que no
 * puede ser un login de GitHub (tiene espacio y paréntesis). Sin datos personales: nada de mails,
 * solo el id de la cuenta (al azar) y, en los perfiles, el nombre y el tipo, que el panel ya les
 * muestra a les admins.
 *
 * Nunca tira ni frena lo que la llama (como `logAdminAction`).
 */
import { profileKindOf } from '../objects/types/perfil.js';
import { logAdminAction } from './audit.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Quién figura como autor de estas entradas del registro. */
export const ACCOUNT_EVENT_ACTOR = 'cuentas (sitio)';

/** Acciones del registro que son novedades de cuentas y perfiles (no de admins). */
export const ACCOUNT_EVENT_ACTIONS = Object.freeze({
	accountCreated: 'account.create',
	profileCreated: 'profile.create',
	signupAnswersViewed: 'signup_answers.view'
});

const actor = { user: { login: ACCOUNT_EVENT_ACTOR } };

/**
 * "Se creó una cuenta" (en el primer ingreso con código).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ now?: number }} [opts]
 */
export function logAccountCreated(db, accountId, { now = Date.now() } = {}) {
	return logAdminAction(
		db,
		actor,
		{
			action: ACCOUNT_EVENT_ACTIONS.accountCreated,
			targetType: 'account',
			targetId: accountId,
			summary: 'Se creó una cuenta nueva'
		},
		{ now }
	);
}

/**
 * "Se creó un perfil" (desde Mi rincón).
 *
 * @param {D1Database} db
 * @param {{ id: number, title: string, kind: string, visibility: string }} profile
 * @param {{ now?: number }} [opts]
 */
export function logProfileCreated(db, profile, { now = Date.now() } = {}) {
	const kind = profileKindOf(profile);
	return logAdminAction(
		db,
		actor,
		{
			action: ACCOUNT_EVENT_ACTIONS.profileCreated,
			targetType: 'profile',
			targetId: profile.id,
			summary: `Se creó el perfil «${profile.title}» (${kind})`,
			detail: { kind, visibility: profile.visibility }
		},
		{ now }
	);
}

/**
 * "Une organizadore vio (o bajó en CSV) las respuestas de inscripción de un evento" (Mi rincón →
 * el perfil → Respuestas de inscripción). Sin las respuestas ni datos de quien compra: el perfil,
 * el evento y el id de la cuenta que miró.
 *
 * @param {D1Database} db
 * @param {{ accountId: string, profile: { id: number, title: string }, eventSlug: string, eventTitle: string, csv: boolean }} entry
 * @param {{ now?: number }} [opts]
 */
export function logSignupAnswersViewed(db, entry, { now = Date.now() } = {}) {
	const what = entry.csv ? 'bajó en CSV' : 'vio';
	return logAdminAction(
		db,
		actor,
		{
			action: ACCOUNT_EVENT_ACTIONS.signupAnswersViewed,
			targetType: 'profile',
			targetId: entry.profile.id,
			summary: `«${entry.profile.title}» ${what} las respuestas de inscripción de «${entry.eventTitle}»`,
			detail: { event: entry.eventSlug, account: entry.accountId, csv: entry.csv }
		},
		{ now }
	);
}
