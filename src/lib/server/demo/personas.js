/**
 * «Entrar como persona de prueba»: en un deploy de preview (modo demo, ver docs/demo.md), entrar
 * con un clic a una cuenta del público inventada, sin el código por mail (que en un preview solo
 * llega a las direcciones de EMAIL_ALLOWLIST).
 *
 * Lo que nunca se tiene que romper:
 * - Solo en previews: la misma condición que «Entrar como admin de prueba» (`isPreviewDeploy()`,
 *   que la ruta pasa como `preview`; tiene que ser exactamente `true`).
 * - Solo estas cuentas: una persona se elige por su clave (nunca por un id o un mail que mande el
 *   navegador) y la cuenta tiene que existir en la base con **este** id, **este** mail
 *   `@example.invalid` y la marca `preferences.datos_de_prueba`, que pone solo el seed
 *   (scripts/demo/n3-cuentas.sql). Una cuenta real no tiene nada de eso.
 * - La sesión se abre con el código de siempre (`startSession` de las cuentas).
 */
import { startSession } from '../cuentas/web.js';
import { DEMO_ACCOUNT_MARK, DEMO_EMAIL_DOMAIN, DEMO_PERSONAS } from './personasData.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

export { DEMO_ACCOUNT_MARK, DEMO_EMAIL_DOMAIN, DEMO_PERSONAS };

/**
 * La persona de prueba de esta clave, o `null`.
 * @param {unknown} key
 */
export function demoPersona(key) {
	if (typeof key !== 'string') return null;
	return DEMO_PERSONAS.find((p) => p.key === key) ?? null;
}

/**
 * ¿Existe en la base la cuenta de esta persona, tal como la crea el seed (mismo id, mismo mail
 * `@example.invalid`, la marca, sin borrar)?
 *
 * @param {D1Database} db
 * @param {{ id: string, email: string }} persona
 */
export async function isSeededDemoAccount(db, persona) {
	if (!persona.email.endsWith(DEMO_EMAIL_DOMAIN)) return false;
	const row = await db
		.prepare(
			`SELECT id FROM accounts
			WHERE id = ?1 AND email = ?2 AND deleted_at IS NULL
				AND json_extract(preferences, '$.${DEMO_ACCOUNT_MARK}') = 1`
		)
		.bind(persona.id, persona.email)
		.first();
	return row !== null && row !== undefined && row.id === persona.id;
}

/**
 * Qué personas de prueba hay cargadas en esta base (para el selector).
 *
 * @param {D1Database} db
 */
export async function listDemoPersonas(db) {
	return Promise.all(
		DEMO_PERSONAS.map(async (p) => ({
			key: p.key,
			label: p.label,
			hint: p.hint,
			email: p.email,
			ready: await isSeededDemoAccount(db, p)
		}))
	);
}

/**
 * Abre una sesión de cuenta del público como la persona de prueba `key`. Devuelve `true` si la
 * abrió; `false` (sin tocar cookies ni la base) fuera de un preview, con una clave desconocida o
 * si la cuenta no es exactamente la del seed.
 *
 * @param {{ preview: boolean, event: import('@sveltejs/kit').RequestEvent, db: D1Database, key: unknown }} opts
 * @returns {Promise<boolean>}
 */
export async function startDemoPersonaSession({ preview, event, db, key }) {
	if (preview !== true) return false;
	const persona = demoPersona(key);
	if (!persona) return false;
	if (!(await isSeededDemoAccount(db, persona))) return false;
	await startSession(event, db, persona.id, 'code');
	return true;
}
