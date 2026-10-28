/**
 * Aviso de cupo de Resend: cuando Resend contesta 429 porque se terminó el cupo diario o mensual
 * (`daily_quota_exceeded`, `monthly_quota_exceeded`), `deliver()` (index.js) lo anota acá y el
 * Inicio del panel lo muestra en «Para revisar» durante {@link RESEND_QUOTA_SHOW_MS}. Ver
 * docs/mails.md, «Cupo de Resend y errores pasajeros».
 *
 * Se guarda en `ticket_settings` (el almacén clave-valor de los ajustes, como el último porcentaje
 * del Fondo): una sola fila, con cuándo pasó y qué cupo fue. Nada de a quién iba el mail.
 */
import { rowsOf } from '$lib/server/db/batch.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ at: number, code: string }} ResendQuotaHit */

/** La clave en `ticket_settings`. */
export const RESEND_QUOTA_KEY = 'resend_quota';
/** Cuánto se ve el aviso después del último 429 por cupo. */
export const RESEND_QUOTA_SHOW_MS = 24 * 60 * 60 * 1000;

/**
 * Anota que Resend dijo que se terminó el cupo. Nunca tira: si no se puede guardar, solo lo loguea.
 *
 * @param {D1Database | null | undefined} db
 * @param {{ code: string, now?: number }} input `code`: el `name` del error de Resend
 */
export async function noteResendQuota(db, { code, now = Date.now() }) {
	console.error(`[mails] Resend: se terminó el cupo (${code}); los envíos siguen después`);
	if (!db) return;
	try {
		await db
			.prepare(
				`INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, 'automático')
				ON CONFLICT (key) DO UPDATE SET value = ?2, updated_at = ?3, updated_by = 'automático'`
			)
			.bind(RESEND_QUOTA_KEY, JSON.stringify({ at: now, code }), now)
			.run();
	} catch (error) {
		console.error('[mails] no se pudo anotar el aviso de cupo de Resend:', error);
	}
}

/**
 * El último 429 por cupo si fue hace menos de {@link RESEND_QUOTA_SHOW_MS}, o `null` (para la
 * tanda del Inicio, ver $lib/server/db/batch.js).
 *
 * @param {number} now
 * @returns {import('$lib/server/db/batch.js').BatchQuery<ResendQuotaHit | null>}
 */
export function resendQuotaQuery(now) {
	return {
		what: 'inicio: cupo de Resend',
		fallback: null,
		statements: (db) => [
			db.prepare('SELECT value FROM ticket_settings WHERE key = ?1').bind(RESEND_QUOTA_KEY)
		],
		read: (results) => readResendQuota(rowsOf(results)[0]?.value, now)
	};
}

/**
 * @param {unknown} value el JSON guardado
 * @param {number} now
 * @returns {ResendQuotaHit | null}
 */
export function readResendQuota(value, now) {
	if (typeof value !== 'string') return null;
	try {
		const { at, code } = JSON.parse(value);
		if (!Number.isFinite(at) || at < now - RESEND_QUOTA_SHOW_MS) return null;
		return { at, code: String(code ?? '') };
	} catch {
		return null;
	}
}

/** Dónde se ve el uso y el plan de Resend. */
export const RESEND_USAGE_HREF = 'https://resend.com/settings/usage';

/**
 * La fila de «Para revisar» del cupo de Resend, o `null`.
 *
 * @param {ResendQuotaHit | null | undefined} hit
 * @param {{ formatWhen: (ms: number) => string }} options
 * @returns {import('$lib/server/admin/inicio.js').ReviewItem | null}
 */
export function resendQuotaItem(hit, { formatWhen }) {
	if (!hit) return null;
	const monthly = hit.code === 'monthly_quota_exceeded';
	return {
		id: 'resend-quota',
		tone: 'bad',
		icon: 'mail',
		title: `Se terminó el cupo ${monthly ? 'mensual' : 'diario'} de mails de Resend`,
		text: `Resend no aceptó más mails (el último aviso, ${formatWhen(hit.at)}). Los recordatorios y avisos se reintentan solos cuando se renueve el cupo; las entradas que no salieron aparecen acá para reenviar.`,
		action: 'Ver el uso',
		href: RESEND_USAGE_HREF
	};
}
