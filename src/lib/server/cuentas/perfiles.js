/**
 * Perfiles de las cuentas (cuentas parte 2, decisión A2): una cuenta, varios perfiles.
 *
 * - Perfiles de **persona**: separados entre sí y NO vinculados de forma visible. Nada de lo
 *   público ni de lo que ve otra cuenta dice que dos perfiles son de la misma cuenta.
 * - Perfiles de **grupo**: los gestionan varias cuentas. Mostrar integrantes es opcional por
 *   grupo (`show_members`); quienes gestionan NUNCA se muestran.
 *
 * Los perfiles son objetos `perfil` (src/lib/server/objects/types/perfil.js) y se escriben SOLO
 * con saveObject(). Quién gestiona qué va en `profile_managers` (migración 0014): las cuentas no
 * son objetos, así que no puede ser un edge. Integrantes de un grupo: edges `es_integrante_de`
 * desde el perfil de la persona hacia el del grupo.
 *
 * Reglas que hace cumplir este archivo (las páginas no deciden nada):
 * - solo quien gestiona un perfil lo ve en Mi rincón y lo edita; para cualquier otra cuenta el
 *   perfil "no existe" (mismo mensaje que si no existiera);
 * - un perfil de persona tiene una sola cuenta (su dueñe); un grupo, al menos une dueñe: nadie
 *   se va ni pierde la propiedad si es le última (sentencias condicionales, sin carreras);
 * - las invitaciones a gestionar van por mail y nunca dicen si ese mail tiene cuenta;
 * - el grupo suma integrantes directamente, solo perfiles de persona que puede ver (nunca
 *   ocultos); la persona lo ve en Mi rincón y se va cuando quiere, sin pedirle nada a nadie, y
 *   ese grupo no la puede volver a sumar por 30 días.
 *
 * Las lecturas de "gestión" (mis perfiles, un perfil que gestiono) leen `objects` unidas a
 * `profile_managers`: la condición de acceso es esa unión, no la visibilidad (quien gestiona
 * un grupo oculto lo tiene que poder editar). Todo lo demás (lo que ve el público u otra
 * cuenta) pasa por el helper de visibilidad de los objetos.
 */
import {
	ANON,
	ObjectError,
	canSee,
	VersionConflictError,
	getEdges,
	getObject,
	saveObject,
	slugify
} from '$lib/server/objects/index.js';
import { OBJECT_COLUMNS, rowToObject } from '$lib/server/objects/read.js';
import { PROFILE_KINDS } from '$lib/server/objects/types/perfil.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { sha256Hex } from '$lib/server/hash.js';
import { emailHash, getAccount, getAccountByEmail, normalizeEmail } from './accounts.js';
import { buildProfileInviteEmail } from './email.js';
import { accountMailAllowed } from './mailCap.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').D1PreparedStatement} D1PreparedStatement */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */
/** @typedef {import('$lib/server/objects/visibility.js').Viewer} Viewer */
/** @typedef {import('$lib/server/objects/visibility.js').Visibility} Visibility */
/** @typedef {'owner' | 'manager'} ManagerRole */
/** @typedef {'persona' | 'grupo'} ProfileKind */

/**
 * @typedef {{ ok: false, status: number, message: string, errors?: Record<string, string> }} Failure
 */

/**
 * Verifica (y gasta) el código fresco por mail de las acciones delicadas de un grupo (purpose
 * 'grupo', ver cuentas/index.js). Devuelve `null` si está bien o el Failure que hay que mostrar.
 * Las funciones de acá la llaman solo cuando la acción lo pide, después de chequear permisos (así
 * un pedido sin permiso no gasta el código).
 * @typedef {() => Promise<Failure | null>} StepUp
 */

export const PROFILE_TYPE = 'perfil';
export const MEMBER_EDGE = 'es_integrante_de';
/** Perfiles (vivos) que puede gestionar una cuenta. */
export const MAX_PROFILES_PER_ACCOUNT = 20;
/** Invitaciones pendientes por perfil. */
export const MAX_PENDING_INVITES = 20;
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Límites de invitaciones (tabla rate_limits, src/lib/server/db/rateLimit.js), además de las
 * 20 pendientes por grupo. Cada invitación puede mandar un mail, así que:
 * - `group` y `account`: invitaciones por hora por grupo y por cuenta que invita. Se cuentan
 *   siempre, tenga o no cuenta el mail, así el aviso de "esperá" no revela nada;
 * - `recipient`: avisos por mail que recibe un mismo mail por día, de cualquier grupo. Este no
 *   se le muestra a quien invita (la invitación se crea igual, solo no sale el mail): si se
 *   mostrara, diría que ese mail tiene cuenta.
 */
export const INVITE_RATE_LIMITS = Object.freeze({
	group: { limit: 10, windowSeconds: 60 * 60 },
	account: { limit: 20, windowSeconds: 60 * 60 },
	recipient: { limit: 3, windowSeconds: 24 * 60 * 60 }
});

export const MESSAGES = Object.freeze({
	notFound: 'No encontramos ese perfil.',
	conflict:
		'Alguien lo cambió mientras tanto, así que no guardamos tus cambios. Abajo está la versión nueva; revisala y volvé a guardar.',
	onlyOwner: 'Eso lo puede hacer solo quien es dueñe del perfil.',
	onlyGroups: 'Eso es solo para perfiles de grupo.',
	onlyPersonas: 'Eso es solo para perfiles de persona.',
	lastOwner:
		'Sos la única persona dueña. Antes de irte, hacé dueñe a otra persona que lo gestione, o borrá el perfil.',
	lastOwnerOther: 'Tiene que quedar al menos una persona dueña.',
	personaLeave: 'Un perfil de persona no se deja: si no lo querés más, borralo.',
	tooManyProfiles: `Llegaste al máximo de ${MAX_PROFILES_PER_ACCOUNT} perfiles.`,
	tooManyInvites: `Hay demasiadas invitaciones pendientes (máximo ${MAX_PENDING_INVITES}). Cancelá alguna.`,
	badKind: 'Elegí si el perfil es de una persona o de un grupo.',
	badEmail: 'Revisá el mail: no parece una dirección válida.',
	invited:
		'Listo. Si ese mail tiene cuenta, le mandamos un aviso. La invitación aparece en Mi rincón → Perfiles cuando entre con ese mail (vence en 14 días).',
	tooManyInviteMails: 'Mandaste muchas invitaciones seguidas. Esperá un rato y probá de nuevo.',
	inviteGone: 'Esa invitación ya no está: puede que haya vencido o que la hayan cancelado.',
	notManager: 'Esa persona ya no gestiona este perfil.',
	personaNotFound:
		'No encontramos ese perfil de persona. Revisá la dirección (te la pasa la persona desde su perfil).',
	notMember: 'Esa persona ya no está en el grupo.',
	recentlyLeft:
		'Esa persona dejó el grupo hace poco: por ahora no la pueden volver a sumar. Si quiere volver, que te avise.',
	busy: 'Hubo otros cambios al mismo tiempo. Probá de nuevo.',
	needsCode:
		'Para esto te pedimos un código por mail: pedilo con «Mandame un código para confirmar» y escribilo antes de confirmar.',
	invalid: 'Revisá los datos marcados.'
});

/**
 * Cómo figura una cuenta como autora de un objeto (`created_by`, `updated_by`). Con prefijo para
 * que nunca se confunda con el login de GitHub de une admin (que no puede tener «:»). Esos
 * campos solo los ven les admins (src/lib/server/objects/read.js, `forViewer`).
 *
 * @param {string} accountId
 */
export function accountActor(accountId) {
	return `cuenta:${accountId}`;
}

/**
 * Quién mira, para las lecturas de objetos, cuando mira una cuenta del público.
 *
 * @param {string} accountId
 * @returns {Viewer}
 */
export function memberViewer(accountId) {
	return { role: 'member', id: accountActor(accountId) };
}

/**
 * @param {number} status
 * @param {string} message
 * @param {Record<string, string>} [errors]
 * @returns {Failure}
 */
function failure(status, message, errors) {
	return errors ? { ok: false, status, message, errors } : { ok: false, status, message };
}

/**
 * Traduce los errores de saveObject a lo que muestra la página.
 *
 * @param {unknown} error
 * @returns {Failure}
 */
function saveFailure(error) {
	if (error instanceof VersionConflictError) return failure(409, MESSAGES.conflict);
	if (error instanceof ObjectError) {
		/** @type {Record<string, string>} */
		const errors = {};
		for (const e of error.errors) errors[e.path.split('.')[0] || 'form'] ??= e.message;
		if (error.code === 'not_found') return failure(404, MESSAGES.notFound);
		return failure(error.status === 409 ? 409 : 400, error.message, errors);
	}
	throw error;
}

/** @param {unknown} value */
const text = (value) => (typeof value === 'string' ? value : '');

/**
 * Los links como los escribe la persona (uno por línea o una lista).
 *
 * @param {unknown} value
 * @returns {string[]}
 */
function parseLinks(value) {
	const list = Array.isArray(value) ? value : text(value).split(/\r?\n/);
	return list.map((l) => text(l).trim()).filter(Boolean);
}

/**
 * @typedef {object} ProfileInput lo que se puede editar desde Mi rincón
 * @prop {string} [title] el nombre (no hay "nombre para mostrar" aparte, E1)
 * @prop {string} [bio]
 * @prop {string} [pronouns]
 * @prop {string | string[]} [links]
 * @prop {string} [visibility]
 * @prop {boolean} [show_members] solo grupos
 */

/**
 * `data` de un perfil a partir de lo que se editó. `kind` y `avatar` no se editan acá: quedan
 * como estaban.
 *
 * @param {ProfileKind} kind
 * @param {ProfileInput} input
 * @param {Record<string, unknown>} [current]
 */
function profileData(kind, input, current = {}) {
	/** @type {Record<string, unknown>} */
	const data = {
		kind,
		bio: text(input.bio),
		pronouns: text(input.pronouns),
		links: parseLinks(input.links)
	};
	if (current.avatar !== undefined) data.avatar = current.avatar;
	if (kind === 'grupo') data.show_members = input.show_members === true;
	return data;
}

/**
 * @typedef {{
 *   id: number, slug: string, title: string, kind: ProfileKind, visibility: Visibility,
 *   version: number, role: ManagerRole
 * }} MyProfile
 */

/**
 * @param {Record<string, unknown>} row fila de objects + `role`
 * @returns {MyProfile}
 */
function toMyProfile(row) {
	const o = rowToObject(row);
	return {
		id: o.id,
		slug: o.slug,
		title: o.title,
		kind: o.data.kind === 'grupo' ? 'grupo' : 'persona',
		visibility: o.visibility,
		version: o.version,
		role: row.role === 'owner' ? 'owner' : 'manager'
	};
}

const MANAGED_COLUMNS = OBJECT_COLUMNS.split(', ')
	.map((c) => `o.${c}`)
	.join(', ');

/**
 * Los perfiles que gestiona una cuenta (lectura de gestión: la condición es `profile_managers`).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<MyProfile[]>}
 */
export async function listMyProfiles(db, accountId) {
	const { results } = await db
		.prepare(
			`SELECT ${MANAGED_COLUMNS}, pm.role AS role FROM profile_managers pm
			JOIN objects o ON o.id = pm.profile_id
			WHERE pm.account_id = ?1 AND o.type = ?2 AND o.deleted_at IS NULL
			ORDER BY o.title COLLATE NOCASE, o.id`
		)
		.bind(accountId, PROFILE_TYPE)
		.all();
	return results.map(toMyProfile);
}

/**
 * Un perfil que la cuenta gestiona, con su rol, o `null` (no existe, está borrado o no lo
 * gestiona: para la página es lo mismo).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 * @returns {Promise<{ profile: StoredObject, kind: ProfileKind, role: ManagerRole } | null>}
 */
export async function getManagedProfile(db, accountId, slug) {
	if (typeof slug !== 'string' || !slug) return null;
	const row = await db
		.prepare(
			`SELECT ${MANAGED_COLUMNS}, pm.role AS role FROM profile_managers pm
			JOIN objects o ON o.id = pm.profile_id
			WHERE pm.account_id = ?1 AND o.type = ?2 AND o.slug = ?3 AND o.deleted_at IS NULL`
		)
		.bind(accountId, PROFILE_TYPE, slug)
		.first();
	if (!row) return null;
	const profile = rowToObject(row);
	return {
		profile,
		kind: profile.data.kind === 'grupo' ? 'grupo' : 'persona',
		role: row.role === 'owner' ? 'owner' : 'manager'
	};
}

/**
 * Cuántos perfiles vivos gestiona una cuenta (propios y de grupos).
 *
 * @param {D1Database} db
 * @param {string} accountId
 */
async function countMyProfiles(db, accountId) {
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS n FROM profile_managers pm JOIN objects o ON o.id = pm.profile_id
			WHERE pm.account_id = ?1 AND o.deleted_at IS NULL`
		)
		.bind(accountId)
		.first();
	return Number(row?.n ?? 0);
}

/** Largo del sufijo al azar que se suma a la dirección de un perfil si el nombre ya está usado. */
export const SLUG_SUFFIX_LENGTH = 5;
const SLUG_SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Un sufijo al azar para la dirección (letras minúsculas y números). */
function slugSuffix() {
	const bytes = crypto.getRandomValues(new Uint8Array(SLUG_SUFFIX_LENGTH));
	// 256 no es múltiplo de 36: un sesgo mínimo que acá no importa (no es un secreto).
	return Array.from(bytes, (b) => SLUG_SUFFIX_CHARS[b % SLUG_SUFFIX_CHARS.length]).join('');
}

/**
 * Crea un perfil y deja a la cuenta como dueñe, en la misma tanda de saveObject(). Si la
 * dirección (sale del nombre) ya está usada, le suma un sufijo corto al azar (nunca -2, -3…, que
 * dirían cuántos perfiles, quizás ocultos o borrados, tienen ese nombre).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {ProfileInput & { kind?: unknown }} input
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true, profile: StoredObject } | Failure>}
 */
export async function createProfile(db, accountId, input, { now = Date.now() } = {}) {
	const kind = /** @type {ProfileKind} */ (input.kind);
	if (!PROFILE_KINDS.includes(kind))
		return failure(400, MESSAGES.badKind, { kind: MESSAGES.badKind });
	if (!(await getAccount(db, accountId))) return failure(404, MESSAGES.notFound);
	if ((await countMyProfiles(db, accountId)) >= MAX_PROFILES_PER_ACCOUNT) {
		return failure(400, MESSAGES.tooManyProfiles);
	}
	const title = text(input.title).trim();
	const base = slugify(title) || 'perfil';
	const data = profileData(kind, input);
	for (let attempt = 1; attempt <= 6; attempt++) {
		const slug = attempt === 1 ? base : `${base.slice(0, 80)}-${slugSuffix()}`;
		try {
			const profile = await saveObject(
				db,
				{
					type: PROFILE_TYPE,
					title,
					slug,
					data,
					visibility: /** @type {Visibility} */ (input.visibility || undefined)
				},
				{
					actor: accountActor(accountId),
					now,
					also: (self) => [
						db
							.prepare(
								`INSERT INTO profile_managers (profile_id, account_id, role, created_at)
								SELECT id, ?1, 'owner', ?2 FROM objects WHERE type = ?3 AND slug = ?4`
							)
							.bind(accountId, now, self.type, self.slug)
					]
				}
			);
			return { ok: true, profile };
		} catch (error) {
			if (error instanceof ObjectError && error.code === 'slug_taken') continue;
			return saveFailure(error);
		}
	}
	return failure(409, 'No pudimos armar una dirección para ese nombre. Probá con otro.');
}

/**
 * Edita un perfil que la cuenta gestiona. `version` es la que se abrió en la página: si alguien
 * guardó en el medio, no se guarda nada y vuelve `MESSAGES.conflict` (409).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 * @param {ProfileInput & { version: number }} input
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true, profile: StoredObject } | Failure>}
 */
export async function updateProfile(db, accountId, slug, input, { now = Date.now() } = {}) {
	const managed = await getManagedProfile(db, accountId, slug);
	if (!managed) return failure(404, MESSAGES.notFound);
	const { profile, kind } = managed;
	try {
		const saved = await saveObject(
			db,
			{
				id: profile.id,
				type: PROFILE_TYPE,
				version: input.version,
				title: text(input.title).trim(),
				data: profileData(kind, input, profile.data),
				visibility: /** @type {Visibility} */ (input.visibility || profile.visibility)
			},
			{ actor: accountActor(accountId), now }
		);
		return { ok: true, profile: saved };
	} catch (error) {
		return saveFailure(error);
	}
}

/**
 * Borra (suave, se puede deshacer desde la base) un perfil. Solo dueñes. Las filas de
 * `profile_managers` y los edges quedan, para poder deshacer; como el objeto está borrado, no
 * se ve en ningún lado. Borrar un grupo pide además un código fresco por mail (`stepUp`).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 * @param {number} version
 * @param {{ now?: number, stepUp?: StepUp }} [opts]
 * @returns {Promise<{ ok: true } | Failure>}
 */
export async function deleteProfile(
	db,
	accountId,
	slug,
	version,
	{ now = Date.now(), stepUp } = {}
) {
	const managed = await getManagedProfile(db, accountId, slug);
	if (!managed) return failure(404, MESSAGES.notFound);
	if (managed.role !== 'owner') return failure(403, MESSAGES.onlyOwner);
	if (managed.kind === 'grupo') {
		// La versión se mira antes de gastar el código.
		if (version !== managed.profile.version) return failure(409, MESSAGES.conflict);
		const bad = await confirmStep(stepUp);
		if (bad) return bad;
	}
	try {
		await saveObject(
			db,
			{ id: managed.profile.id, type: PROFILE_TYPE, version, deleted: true },
			{ actor: accountActor(accountId), now }
		);
		return { ok: true };
	} catch (error) {
		return saveFailure(error);
	}
}

// ---------------------------------------------------------------------------------------------
// Quiénes gestionan un grupo. Nunca se muestra fuera de Mi rincón de quienes lo gestionan.
// ---------------------------------------------------------------------------------------------

/** Dueñes activos (cuenta no borrada) de un perfil, como subconsulta con el id en ?1. */
const ACTIVE_OWNERS = `(SELECT COUNT(*) FROM profile_managers p JOIN accounts a ON a.id = p.account_id
	WHERE p.profile_id = ?1 AND p.role = 'owner' AND a.deleted_at IS NULL)`;

/**
 * @typedef {{ accountId: string, email: string, role: ManagerRole, me: boolean }} ManagerRow
 * @typedef {{ id: string, createdAt: number, expiresAt: number, invitedBy: string | null }} InviteRow
 *   `invitedBy`: el mail de quien invitó (otre dueñe del grupo), o null si ya no está
 */

/**
 * Invitaciones de alguien que ya no es dueñe de ese perfil (porque le sacaron la propiedad, salió
 * de la gestión o lo sacaron): se borran en la misma tanda que el cambio. ?1 = perfil, ?2 = cuenta.
 * Si el cambio no se hizo (por ejemplo, era le última dueñe), sigue siendo dueñe y no se borra nada.
 */
const DROP_INVITES_OF_NON_OWNER = `DELETE FROM profile_invites WHERE profile_id = ?1 AND invited_by = ?2
	AND NOT EXISTS (SELECT 1 FROM profile_managers
		WHERE profile_id = ?1 AND account_id = ?2 AND role = 'owner')`;

/**
 * Quiénes gestionan un grupo y las invitaciones pendientes. Solo para quienes lo gestionan; las
 * invitaciones (con quién las mandó), solo para dueñes, que son quienes pueden cancelarlas.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true, managers: ManagerRow[], invites: InviteRow[] } | Failure>}
 */
export async function listManagers(db, accountId, slug, { now = Date.now() } = {}) {
	const managed = await getManagedProfile(db, accountId, slug);
	if (!managed) return failure(404, MESSAGES.notFound);
	const { results } = await db
		.prepare(
			`SELECT p.account_id, p.role, a.email FROM profile_managers p
			JOIN accounts a ON a.id = p.account_id
			WHERE p.profile_id = ?1 AND a.deleted_at IS NULL
			ORDER BY p.role = 'owner' DESC, p.created_at, a.email`
		)
		.bind(managed.profile.id)
		.all();
	const { results: invites } =
		managed.role === 'owner'
			? await db
					.prepare(
						`SELECT i.id, i.created_at, i.expires_at, a.email AS invited_by FROM profile_invites i
						LEFT JOIN accounts a ON a.id = i.invited_by AND a.deleted_at IS NULL
						WHERE i.profile_id = ?1 AND i.expires_at > ?2 ORDER BY i.created_at`
					)
					.bind(managed.profile.id, now)
					.all()
			: { results: [] };
	return {
		ok: true,
		managers: results.map((r) => ({
			accountId: String(r.account_id),
			email: String(r.email),
			role: r.role === 'owner' ? 'owner' : 'manager',
			me: r.account_id === accountId
		})),
		invites: invites.map((r) => ({
			id: String(r.id),
			createdAt: Number(r.created_at),
			expiresAt: Number(r.expires_at),
			invitedBy: r.invited_by == null ? null : String(r.invited_by)
		}))
	};
}

/**
 * Para mandar el aviso por mail de una invitación sin que la respuesta cambie.
 *
 * @typedef {object} InviteNotice
 * @prop {import('./index.js').SendMail} send el camino de mails de siempre (`mailSender`)
 * @prop {string} origin para armar el link a Mi rincón
 * @prop {(task: Promise<unknown>) => void} defer corre la tarea DESPUÉS de responder, sin que
 *   quien invita la espere (en Cloudflare, `ctx.waitUntil`; ver `inviteNotice` en perfilesWeb.js)
 */

/**
 * Invita a un mail a gestionar un grupo (solo dueñes). Responde lo mismo tenga o no cuenta ese
 * mail, y aunque ya lo gestione: no se puede usar para averiguar quién tiene cuenta.
 *
 * Además, si se pasa `notice`, deja programado un aviso por mail (`sendInviteNotice`) que sale
 * solo si hay una cuenta verificada con ese mail. Para que ni el mensaje ni el tiempo de
 * respuesta lo revelen, esta función NO busca la cuenta: todo lo que depende de que exista
 * (buscarla, el límite por destinatarie, armar y mandar el mail) pasa dentro de la tarea que se
 * le da a `notice.defer`, que corre después de responder. Lo que se hace antes de responder
 * (permisos, límites por grupo y por cuenta, guardar la invitación) es igual en los dos casos.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 * @param {unknown} rawEmail
 * @param {{ now?: number, notice?: InviteNotice }} [opts]
 * @returns {Promise<{ ok: true, message: string } | Failure>}
 */
export async function inviteManager(
	db,
	accountId,
	slug,
	rawEmail,
	{ now = Date.now(), notice } = {}
) {
	const managed = await getManagedProfile(db, accountId, slug);
	if (!managed) return failure(404, MESSAGES.notFound);
	if (managed.kind !== 'grupo') return failure(400, MESSAGES.onlyGroups);
	if (managed.role !== 'owner') return failure(403, MESSAGES.onlyOwner);
	const email = normalizeEmail(rawEmail);
	if (!email) return failure(400, MESSAGES.badEmail, { email: MESSAGES.badEmail });
	const hash = await emailHash(email);
	const id = managed.profile.id;
	const pending = await db
		.prepare(
			'SELECT COUNT(*) AS n FROM profile_invites WHERE profile_id = ?1 AND expires_at > ?2 AND email_hash != ?3'
		)
		.bind(id, now, hash)
		.first();
	if (Number(pending?.n ?? 0) >= MAX_PENDING_INVITES) return failure(400, MESSAGES.tooManyInvites);
	// Las claves de límite no llevan datos de nadie: el id del grupo (un objeto) y un hash de la
	// cuenta.
	const perGroup = await hitRateLimit(db, `perfiles:invite:g:${id}`, INVITE_RATE_LIMITS.group, now);
	const perAccount = await hitRateLimit(
		db,
		`perfiles:invite:a:${await sha256Hex(`perfiles:account:${accountId}`)}`,
		INVITE_RATE_LIMITS.account,
		now
	);
	if (!perGroup.allowed || !perAccount.allowed) return failure(429, MESSAGES.tooManyInviteMails);
	await db.batch([
		db
			.prepare('DELETE FROM profile_invites WHERE profile_id = ?1 AND expires_at <= ?2')
			.bind(id, now),
		db
			.prepare(
				`INSERT INTO profile_invites (id, profile_id, email_hash, invited_by, created_at, expires_at)
				VALUES (?1, ?2, ?3, ?4, ?5, ?6)
				ON CONFLICT (profile_id, email_hash) DO UPDATE SET
					invited_by = excluded.invited_by, created_at = excluded.created_at,
					expires_at = excluded.expires_at`
			)
			.bind(crypto.randomUUID(), id, hash, accountId, now, now + INVITE_TTL_MS)
	]);
	if (notice) notice.defer(sendInviteNotice(db, { profileId: id, email, hash, notice, now }));
	return { ok: true, message: MESSAGES.invited };
}

/**
 * El aviso por mail de una invitación (corre en segundo plano, ver `inviteManager`). Sale solo
 * si hay una cuenta activa con ese mail verificado que todavía no gestiona el grupo, y dentro
 * del límite por destinatarie. Nombra al grupo (su nombre de ahora), nunca a quien invitó. Nunca
 * tira: un error queda en el log y la invitación sigue en Mi rincón igual.
 *
 * @param {D1Database} db
 * @param {{ profileId: number, email: string, hash: string, notice: InviteNotice, now: number }} input
 * @returns {Promise<'sent' | 'simulated' | 'failed' | 'skipped' | 'limited'>}
 */
export async function sendInviteNotice(db, { profileId, email, hash, notice, now }) {
	try {
		const account = await getAccountByEmail(db, email);
		if (!account?.email_verified_at) return 'skipped';
		if (await isManager(db, profileId, account.id)) return 'skipped';
		const group = await db
			.prepare('SELECT title FROM objects WHERE id = ?1 AND type = ?2 AND deleted_at IS NULL')
			.bind(profileId, PROFILE_TYPE)
			.first();
		if (!group) return 'skipped';
		const limit = await hitRateLimit(
			db,
			`perfiles:notice:e:${hash}`,
			INVITE_RATE_LIMITS.recipient,
			now
		);
		if (!limit.allowed) return 'limited';
		// El tope global de mails de cuentas: si se llegó, el aviso no sale (la invitación queda).
		if (!(await accountMailAllowed(db, now))) return 'limited';
		const groupTitle = String(group.title);
		const message = buildProfileInviteEmail({
			groupTitle,
			url: new URL('/mi-rincon/perfiles', notice.origin).href
		});
		return await notice.send(account.email, message, `Invitación a gestionar «${groupTitle}»`);
	} catch (error) {
		console.error('[perfiles] no se pudo mandar el aviso de invitación:', error);
		return 'failed';
	}
}

/**
 * Cancela una invitación pendiente (solo dueñes).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 * @param {unknown} inviteId
 * @returns {Promise<{ ok: true } | Failure>}
 */
export async function cancelInvite(db, accountId, slug, inviteId) {
	const managed = await getManagedProfile(db, accountId, slug);
	if (!managed) return failure(404, MESSAGES.notFound);
	if (managed.role !== 'owner') return failure(403, MESSAGES.onlyOwner);
	await db
		.prepare('DELETE FROM profile_invites WHERE id = ?1 AND profile_id = ?2')
		.bind(text(inviteId), managed.profile.id)
		.run();
	return { ok: true };
}

/**
 * Las invitaciones para el mail (verificado) de esta cuenta, con el nombre del grupo.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ id: string, title: string, expiresAt: number }[]>}
 */
export async function myInvites(db, accountId, { now = Date.now() } = {}) {
	const account = await getAccount(db, accountId);
	if (!account?.email_verified_at) return [];
	const { results } = await db
		.prepare(
			`SELECT i.id, i.expires_at, o.title FROM profile_invites i
			JOIN objects o ON o.id = i.profile_id
			WHERE i.email_hash = ?1 AND i.expires_at > ?2 AND o.deleted_at IS NULL AND o.type = ?3
			AND NOT EXISTS (SELECT 1 FROM profile_managers p WHERE p.profile_id = i.profile_id AND p.account_id = ?4)
			ORDER BY i.created_at`
		)
		.bind(await emailHash(account.email), now, PROFILE_TYPE, accountId)
		.all();
	return results.map((r) => ({
		id: String(r.id),
		title: String(r.title),
		expiresAt: Number(r.expires_at)
	}));
}

/**
 * Acepta o rechaza una invitación dirigida al mail verificado de esta cuenta.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {unknown} inviteId
 * @param {boolean} accept
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true, slug: string | null } | Failure>}
 */
export async function answerInvite(db, accountId, inviteId, accept, { now = Date.now() } = {}) {
	const account = await getAccount(db, accountId);
	if (!account?.email_verified_at) return failure(404, MESSAGES.inviteGone);
	const hash = await emailHash(account.email);
	const invite = await db
		.prepare(
			`SELECT i.id, i.profile_id, o.slug, o.data FROM profile_invites i
			JOIN objects o ON o.id = i.profile_id
			WHERE i.id = ?1 AND i.email_hash = ?2 AND i.expires_at > ?3
			AND o.deleted_at IS NULL AND o.type = ?4`
		)
		.bind(text(inviteId), hash, now, PROFILE_TYPE)
		.first();
	if (!invite) return failure(404, MESSAGES.inviteGone);
	const remove = db.prepare('DELETE FROM profile_invites WHERE id = ?1').bind(invite.id);
	if (!accept) {
		await remove.run();
		return { ok: true, slug: null };
	}
	// Aceptar suma un perfil a los que gestiona: el mismo tope que al crear.
	if ((await countMyProfiles(db, accountId)) >= MAX_PROFILES_PER_ACCOUNT) {
		return failure(400, MESSAGES.tooManyProfiles);
	}
	await db.batch([
		db
			.prepare(
				`INSERT INTO profile_managers (profile_id, account_id, role, created_at)
				VALUES (?1, ?2, 'manager', ?3) ON CONFLICT (profile_id, account_id) DO NOTHING`
			)
			.bind(invite.profile_id, accountId, now),
		remove
	]);
	return { ok: true, slug: String(invite.slug) };
}

/**
 * Cambia el rol de alguien que gestiona un grupo (solo dueñes). Nunca deja al grupo sin dueñe:
 * la condición va en la misma sentencia, así dos cambios a la vez no pueden dejarlo en cero. Si
 * deja de ser dueñe, sus invitaciones pendientes se borran en la misma tanda.
 *
 * Hacer dueñe a alguien o sacarle la propiedad a otre dueñe pide además un código fresco por mail
 * (`stepUp`): con solo una sesión abierta ajena no se puede quedar con el grupo. Sacarse la
 * propiedad a une misme no lo pide.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 * @param {unknown} targetAccountId
 * @param {unknown} role
 * @param {{ stepUp?: StepUp }} [opts]
 * @returns {Promise<{ ok: true } | Failure>}
 */
export async function setManagerRole(db, accountId, slug, targetAccountId, role, { stepUp } = {}) {
	if (role !== 'owner' && role !== 'manager') return failure(400, MESSAGES.invalid);
	const managed = await getManagedProfile(db, accountId, slug);
	if (!managed) return failure(404, MESSAGES.notFound);
	if (managed.kind !== 'grupo') return failure(400, MESSAGES.onlyGroups);
	if (managed.role !== 'owner') return failure(403, MESSAGES.onlyOwner);
	const target = text(targetAccountId);
	const current = await managerRole(db, managed.profile.id, target);
	if (!current) return failure(409, MESSAGES.notManager);
	const self = target === accountId;
	const sensitive = role === 'owner' ? current !== 'owner' : current === 'owner' && !self;
	if (sensitive) {
		const bad = await confirmStep(stepUp);
		if (bad) return bad;
	}
	// Sin código, la sentencia solo puede tocar a quien no es dueñe (o a une misme): si alguien
	// lo hizo dueñe en el medio, no se hace nada.
	const unconfirmedGuard = sensitive || self ? '' : "AND role = 'manager'";
	const [res] = await db.batch([
		db
			.prepare(
				`UPDATE profile_managers SET role = ?3 WHERE profile_id = ?1 AND account_id = ?2
				AND (?3 = 'owner' OR role = 'manager' OR ${ACTIVE_OWNERS} > 1) ${unconfirmedGuard}`
			)
			.bind(managed.profile.id, target, role),
		db.prepare(DROP_INVITES_OF_NON_OWNER).bind(managed.profile.id, target)
	]);
	if (res.meta.changes) return { ok: true };
	const after = await managerRole(db, managed.profile.id, target);
	if (after === role) return { ok: true };
	if (!after) return failure(409, MESSAGES.notManager);
	return failure(409, sensitive || self ? MESSAGES.lastOwnerOther : MESSAGES.busy);
}

/**
 * @param {D1Database} db
 * @param {number} profileId
 * @param {string} accountId
 */
async function isManager(db, profileId, accountId) {
	return (await managerRole(db, profileId, accountId)) !== null;
}

/**
 * El rol de una cuenta en un perfil, o `null` si no lo gestiona.
 *
 * @param {D1Database} db
 * @param {number} profileId
 * @param {string} accountId
 * @returns {Promise<ManagerRole | null>}
 */
async function managerRole(db, profileId, accountId) {
	const row = await db
		.prepare('SELECT role FROM profile_managers WHERE profile_id = ?1 AND account_id = ?2')
		.bind(profileId, accountId)
		.first();
	if (!row) return null;
	return row.role === 'owner' ? 'owner' : 'manager';
}

/**
 * Pide el código fresco (`stepUp`); sin `stepUp`, la acción no se hace.
 *
 * @param {StepUp | undefined} stepUp
 * @returns {Promise<Failure | null>}
 */
async function confirmStep(stepUp) {
	if (!stepUp) return failure(403, MESSAGES.needsCode);
	return stepUp();
}

/**
 * Saca a alguien de la gestión de un grupo: une dueñe a cualquiera, cualquiera a sí misme
 * ("dejar de gestionar"). Le última dueñe no se puede ir (condición en la misma sentencia). Las
 * invitaciones pendientes que mandó se borran en la misma tanda.
 *
 * Sacar a otre dueñe pide además un código fresco por mail (`stepUp`); sacar a une manager o irse
 * une misme, no.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 * @param {unknown} targetAccountId
 * @param {{ stepUp?: StepUp }} [opts]
 * @returns {Promise<{ ok: true } | Failure>}
 */
export async function removeManager(db, accountId, slug, targetAccountId, { stepUp } = {}) {
	const target = text(targetAccountId);
	const managed = await getManagedProfile(db, accountId, slug);
	if (!managed) return failure(404, MESSAGES.notFound);
	const self = target === accountId;
	if (managed.kind !== 'grupo')
		return failure(400, self ? MESSAGES.personaLeave : MESSAGES.onlyGroups);
	if (!self && managed.role !== 'owner') return failure(403, MESSAGES.onlyOwner);
	const sensitive = !self && (await managerRole(db, managed.profile.id, target)) === 'owner';
	if (sensitive) {
		const bad = await confirmStep(stepUp);
		if (bad) return bad;
	}
	// Sin código, solo se puede sacar a une manager (o irse une misme).
	const unconfirmedGuard = sensitive || self ? '' : "AND role = 'manager'";
	const [res] = await db.batch([
		db
			.prepare(
				`DELETE FROM profile_managers WHERE profile_id = ?1 AND account_id = ?2
				AND (role = 'manager' OR ${ACTIVE_OWNERS} > 1) ${unconfirmedGuard}`
			)
			.bind(managed.profile.id, target),
		db.prepare(DROP_INVITES_OF_NON_OWNER).bind(managed.profile.id, target)
	]);
	if (res.meta.changes) return { ok: true };
	if (!(await isManager(db, managed.profile.id, target))) return failure(409, MESSAGES.notManager);
	if (!sensitive && !self) return failure(409, MESSAGES.busy);
	return failure(409, self ? MESSAGES.lastOwner : MESSAGES.lastOwnerOther);
}

/**
 * Dejar de gestionar un grupo.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} slug
 */
export function leaveProfile(db, accountId, slug) {
	return removeManager(db, accountId, slug, accountId);
}

// ---------------------------------------------------------------------------------------------
// Integrantes: edges `es_integrante_de` (persona → grupo), escritos con saveObject() sobre el
// perfil de la persona. El grupo suma directamente; la persona se va cuando quiere.
// ---------------------------------------------------------------------------------------------

/** Cuánto tiempo un grupo no puede volver a sumar a una persona que se fue. */
export const LEAVE_BLOCK_MS = 30 * 24 * 60 * 60 * 1000;

/** Intentos al guardar los edges de una persona si otro guardado se cruza. */
const MEMBER_SAVE_ATTEMPTS = 3;

/**
 * Los grupos a los que apunta un perfil de persona (lectura de gestión), en orden.
 *
 * @param {D1Database} db
 * @param {number} personaId
 * @returns {Promise<number[]>}
 */
async function memberEdges(db, personaId) {
	const { results } = await db
		.prepare('SELECT to_id FROM edges WHERE from_id = ?1 AND kind = ?2 ORDER BY position, id')
		.bind(personaId, MEMBER_EDGE)
		.all();
	return results.map((r) => Number(r.to_id));
}

/**
 * Un perfil de persona vivo, leído de nuevo (para cada intento de guardado).
 *
 * @param {D1Database} db
 * @param {number} id
 */
async function readPersona(db, id) {
	const row = await db
		.prepare(
			`SELECT ${OBJECT_COLUMNS} FROM objects WHERE id = ?1 AND type = ?2 AND deleted_at IS NULL`
		)
		.bind(id, PROFILE_TYPE)
		.first();
	if (!row) return null;
	const o = rowToObject(row);
	return o.data.kind === 'persona' ? o : null;
}

/**
 * Cambia los grupos de una persona con saveObject(). Lee el perfil y sus edges de nuevo en cada
 * intento y guarda con esa versión: si otro guardado se cruza (la persona editando su perfil, un
 * grupo sumándola), se vuelve a intentar con lo nuevo en vez de pisarlo o fallar.
 *
 * `change` recibe la persona y sus grupos y devuelve los grupos nuevos, `null` (nada que hacer:
 * está bien así) o un Failure. `also` son las sentencias de apoyo que van en la misma tanda.
 *
 * @param {D1Database} db
 * @param {number} personaId
 * @param {string} accountId quien hace el cambio (queda en `updated_by`, que solo ven admins)
 * @param {number} now
 * @param {(persona: StoredObject, groups: number[]) => Promise<number[] | null | Failure>} change
 * @param {D1PreparedStatement[]} [also]
 * @returns {Promise<{ ok: true } | Failure>}
 */
async function changeMemberships(db, personaId, accountId, now, change, also = []) {
	for (let attempt = 1; attempt <= MEMBER_SAVE_ATTEMPTS; attempt++) {
		const persona = await readPersona(db, personaId);
		if (!persona) return failure(404, MESSAGES.personaNotFound);
		const next = await change(persona, await memberEdges(db, persona.id));
		if (next === null) return { ok: true };
		if (!Array.isArray(next)) return next;
		try {
			await saveObject(
				db,
				{
					id: persona.id,
					type: PROFILE_TYPE,
					version: persona.version,
					edges: { [MEMBER_EDGE]: next }
				},
				{ actor: accountActor(accountId), now, also: () => also }
			);
			return { ok: true };
		} catch (error) {
			if (error instanceof VersionConflictError && attempt < MEMBER_SAVE_ATTEMPTS) continue;
			return saveFailure(error);
		}
	}
	return failure(409, MESSAGES.busy);
}

/**
 * Acepta "https://kinkyvibe.ar/amigues/nombre", "/amigues/nombre" o "nombre".
 *
 * @param {unknown} value
 */
function slugFromInput(value) {
	const raw = text(value)
		.trim()
		.replace(/[?#].*$/, '')
		.replace(/\/+$/, '');
	const last = raw.split('/').pop() ?? '';
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(last) ? last : '';
}

/**
 * Quien gestiona un grupo suma a una persona como integrante, por la dirección de su perfil. Sin
 * pedido ni aprobación, con estos resguardos:
 * - solo perfiles de persona que esta cuenta puede VER (getObject con su visibilidad), y nunca
 *   uno oculto, aunque sea suyo: para todo lo demás la respuesta es "no lo encontramos", igual
 *   que si no existiera;
 * - si esa persona dejó ESTE grupo hace menos de 30 días, no se la puede volver a sumar
 *   (`profile_member_blocks`, migración 0014);
 * - la persona lo ve en Mi rincón → Perfiles y se puede ir cuando quiera (`leaveMembership`).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} groupSlug
 * @param {unknown} personaSlug
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true } | Failure>}
 */
export async function addMember(db, accountId, groupSlug, personaSlug, { now = Date.now() } = {}) {
	const managed = await getManagedProfile(db, accountId, groupSlug);
	if (!managed) return failure(404, MESSAGES.notFound);
	if (managed.kind !== 'grupo') return failure(400, MESSAGES.onlyGroups);
	const groupId = managed.profile.id;
	const notFound = failure(404, MESSAGES.personaNotFound, { persona: MESSAGES.personaNotFound });
	const slug = slugFromInput(personaSlug);
	const seen = slug
		? await getObject(db, { type: PROFILE_TYPE, slug }, memberViewer(accountId))
		: null;
	if (!seen || seen.data.kind !== 'persona' || seen.visibility === 'hidden') return notFound;
	await db
		.prepare('DELETE FROM profile_member_blocks WHERE group_id = ?1 AND until <= ?2')
		.bind(groupId, now)
		.run();
	return changeMemberships(db, seen.id, accountId, now, async (persona, groups) => {
		// Se vuelve a mirar en cada intento: pudo pasar a oculto mientras tanto.
		if (persona.visibility === 'hidden') return notFound;
		if (groups.includes(groupId)) return null;
		const blocked = await db
			.prepare(
				'SELECT 1 AS x FROM profile_member_blocks WHERE group_id = ?1 AND persona_id = ?2 AND until > ?3'
			)
			.bind(groupId, persona.id, now)
			.first();
		if (blocked) return failure(409, MESSAGES.recentlyLeft, { persona: MESSAGES.recentlyLeft });
		return [...groups, groupId];
	});
}

/**
 * Quien gestiona un grupo saca a une integrante. No bloquea nada: el grupo la puede volver a
 * sumar (el bloqueo de 30 días es solo cuando la persona se va).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} groupSlug
 * @param {unknown} personaId
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true } | Failure>}
 */
export async function removeMember(db, accountId, groupSlug, personaId, { now = Date.now() } = {}) {
	const managed = await getManagedProfile(db, accountId, groupSlug);
	if (!managed) return failure(404, MESSAGES.notFound);
	if (managed.kind !== 'grupo') return failure(400, MESSAGES.onlyGroups);
	const id = Number(personaId);
	if (!Number.isSafeInteger(id)) return failure(404, MESSAGES.notMember);
	const groupId = managed.profile.id;
	const result = await changeMemberships(db, id, accountId, now, async (_, groups) =>
		groups.includes(groupId)
			? groups.filter((g) => g !== groupId)
			: failure(404, MESSAGES.notMember)
	);
	return !result.ok && result.message === MESSAGES.personaNotFound
		? failure(404, MESSAGES.notMember)
		: result;
}

/**
 * La persona deja un grupo. Siempre se puede, sin aprobación de nadie, aunque el grupo esté
 * oculto o borrado. En la misma tanda queda el bloqueo: ese grupo no la puede volver a sumar por
 * 30 días. Si ya no estaba, no hace nada (y no bloquea).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} personaSlug
 * @param {unknown} groupId
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true } | Failure>}
 */
export async function leaveMembership(
	db,
	accountId,
	personaSlug,
	groupId,
	{ now = Date.now() } = {}
) {
	const managed = await getManagedProfile(db, accountId, personaSlug);
	if (!managed) return failure(404, MESSAGES.notFound);
	if (managed.kind !== 'persona') return failure(400, MESSAGES.onlyPersonas);
	const group = Number(groupId);
	if (!Number.isSafeInteger(group)) return { ok: true };
	const block = db
		.prepare(
			`INSERT INTO profile_member_blocks (group_id, persona_id, until) VALUES (?1, ?2, ?3)
			ON CONFLICT (group_id, persona_id) DO UPDATE SET until = excluded.until`
		)
		.bind(group, managed.profile.id, now + LEAVE_BLOCK_MS);
	return changeMemberships(
		db,
		managed.profile.id,
		accountId,
		now,
		async (_, groups) => (groups.includes(group) ? groups.filter((g) => g !== group) : null),
		[block]
	);
}

/**
 * Los grupos de un perfil de persona, para su propia pantalla.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} personaSlug
 * @returns {Promise<{ id: number, title: string }[]>}
 */
export async function listMemberships(db, accountId, personaSlug) {
	const managed = await getManagedProfile(db, accountId, personaSlug);
	if (!managed || managed.kind !== 'persona') return [];
	const { results } = await db
		.prepare(
			`SELECT o.id, o.title FROM edges e JOIN objects o ON o.id = e.to_id
			WHERE e.from_id = ?1 AND e.kind = ?2 AND o.deleted_at IS NULL
			ORDER BY o.title COLLATE NOCASE`
		)
		.bind(managed.profile.id, MEMBER_EDGE)
		.all();
	return results.map((r) => ({ id: Number(r.id), title: String(r.title) }));
}

/**
 * Todos los grupos que sumaron a alguno de los perfiles de persona de esta cuenta, para
 * Mi rincón → Perfiles ("Te sumaron a…"). Es la pantalla de la propia cuenta: ahí sí se ve qué
 * perfil suyo está en qué grupo (nadie más lo ve junto).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<{ groupId: number, groupTitle: string, personaSlug: string, personaTitle: string }[]>}
 */
export async function listMyMemberships(db, accountId) {
	const { results } = await db
		.prepare(
			`SELECT g.id AS group_id, g.title AS group_title, p.slug AS persona_slug, p.title AS persona_title
			FROM profile_managers pm
			JOIN objects p ON p.id = pm.profile_id
			JOIN edges e ON e.from_id = p.id AND e.kind = ?2
			JOIN objects g ON g.id = e.to_id
			WHERE pm.account_id = ?1 AND p.type = ?3 AND p.deleted_at IS NULL AND g.deleted_at IS NULL
			ORDER BY g.title COLLATE NOCASE, p.title COLLATE NOCASE`
		)
		.bind(accountId, MEMBER_EDGE, PROFILE_TYPE)
		.all();
	return results.map((r) => ({
		groupId: Number(r.group_id),
		groupTitle: String(r.group_title),
		personaSlug: String(r.persona_slug),
		personaTitle: String(r.persona_title)
	}));
}

/**
 * Integrantes de un grupo, para quienes lo gestionan: solo los perfiles que esta cuenta puede
 * ver (si une integrante pasa a oculto, deja de aparecer también acá).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} groupSlug
 * @returns {Promise<{ id: number, slug: string, title: string }[]>}
 */
export async function listGroupMembers(db, accountId, groupSlug) {
	const managed = await getManagedProfile(db, accountId, groupSlug);
	if (!managed || managed.kind !== 'grupo') return [];
	const { results } = await db
		.prepare(
			`SELECT ${MANAGED_COLUMNS} FROM edges e JOIN objects o ON o.id = e.from_id
			WHERE e.to_id = ?1 AND e.kind = ?2 AND o.type = ?3 AND o.deleted_at IS NULL
			ORDER BY o.title COLLATE NOCASE`
		)
		.bind(managed.profile.id, MEMBER_EDGE, PROFILE_TYPE)
		.all();
	const viewer = memberViewer(accountId);
	return results
		.map(rowToObject)
		.filter((o) => o.data.kind === 'persona' && canSee(o, viewer))
		.map((o) => ({ id: o.id, slug: o.slug, title: o.title }));
}

// ---------------------------------------------------------------------------------------------
// Lo que ve el público o cualquier otra cuenta.
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {{
 *   slug: string, title: string, kind: ProfileKind, bio: string | null, pronouns: string | null,
 *   links: string[], avatar: string | null, members: { slug: string, title: string }[] | null
 * }} PublicProfile
 */

/**
 * Un perfil como lo ve cualquiera que no lo gestiona (para la página pública que viene). Una
 * lista blanca de campos: sin ids, sin quién lo creó o editó, sin quiénes lo gestionan. Los
 * integrantes solo si el grupo eligió mostrarlos y solo los perfiles de persona que quien mira
 * puede ver (getEdges pasa los dos extremos por el helper de visibilidad).
 *
 * @param {D1Database} db
 * @param {string} slug
 * @param {Viewer | null | undefined} [viewer]
 * @returns {Promise<PublicProfile | null>}
 */
export async function getPublicProfile(db, slug, viewer = ANON) {
	const o = await getObject(db, { type: PROFILE_TYPE, slug }, viewer);
	if (!o) return null;
	const kind = o.data.kind === 'grupo' ? 'grupo' : 'persona';
	/** @type {{ slug: string, title: string }[] | null} */
	let members = null;
	if (kind === 'grupo' && o.data.show_members === true) {
		const edges = await getEdges(db, o.id, viewer, { direction: 'in', kind: MEMBER_EDGE });
		members = edges
			.filter((e) => e.object.data.kind === 'persona')
			.map((e) => ({ slug: e.object.slug, title: e.object.title }))
			.sort((a, b) => a.title.localeCompare(b.title, 'es'));
	}
	return {
		slug: o.slug,
		title: o.title,
		kind,
		bio: o.data.bio ?? null,
		pronouns: o.data.pronouns ?? null,
		links: Array.isArray(o.data.links) ? o.data.links : [],
		avatar: o.data.avatar ?? null,
		members
	};
}

// ---------------------------------------------------------------------------------------------
// Al borrar una cuenta.
// ---------------------------------------------------------------------------------------------

/**
 * Quién figura como autore (`created_by`, `updated_by`) de los perfiles que deja una cuenta
 * borrada: el mismo para todas, así nada vincula esos perfiles entre sí ni con la cuenta.
 */
export const DELETED_ACTOR = 'cuenta:borrada';
/** El nombre que queda en un perfil de persona de una cuenta borrada. */
export const DELETED_TITLE = 'Perfil borrado';
/** Intentos por perfil si otro guardado se cruza mientras se suelta. */
const RELEASE_ATTEMPTS = 3;

/**
 * Guarda un perfil con la versión que tiene AHORA (la vuelve a leer en cada intento), para que un
 * guardado que se cruza no corte el borrado de la cuenta a la mitad.
 *
 * @param {D1Database} db
 * @param {number} id
 * @param {(version: number) => Parameters<typeof saveObject>[1]} input
 * @param {Parameters<typeof saveObject>[2]} context
 */
async function saveFresh(db, id, input, context) {
	for (let attempt = 1; ; attempt++) {
		const row = await db.prepare('SELECT version FROM objects WHERE id = ?1').bind(id).first();
		if (!row) return;
		try {
			await saveObject(db, input(Number(row.version)), context);
			return;
		} catch (error) {
			if (error instanceof VersionConflictError && attempt < RELEASE_ATTEMPTS) continue;
			throw error;
		}
	}
}

/**
 * Suelta los perfiles de una cuenta que se va a borrar:
 * - sus perfiles de persona (también los que ya había borrado) se vacían y se borran: sin
 *   presentación, pronombres, links, imagen ni texto de búsqueda, con el nombre «Perfil borrado»,
 *   sin los grupos de los que era parte y con `created_by`/`updated_by` neutros
 *   (`DELETED_ACTOR`). La fila queda (borrado suave) para que la dirección no se reuse; se van
 *   también su fila de gestión y sus bloqueos de grupos;
 * - de los grupos sale: si era le última dueñe, pasa la propiedad a quien gestiona hace más
 *   tiempo (el grupo queda con sus datos) o, si no queda nadie, borra el grupo (suave, con sus
 *   datos: es de un grupo, no de la persona);
 * - se borran las invitaciones que mandó.
 *
 * Se puede volver a correr sin problema: lo que ya se soltó no aparece de nuevo. Si algo falla a
 * la mitad, la cuenta sigue viva y el próximo intento termina el trabajo.
 *
 * La llama `closeAccount()` (cuentas/index.js) antes de borrar la cuenta.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ now?: number }} [opts]
 */
export async function releaseAccountProfiles(db, accountId, { now = Date.now() } = {}) {
	const context = { actor: DELETED_ACTOR, now };
	// Todas sus filas de gestión, también de perfiles ya borrados (una persona que borró antes
	// tiene que quedar vacía igual).
	const { results } = await db
		.prepare(
			`SELECT o.id, o.data, o.deleted_at FROM profile_managers pm
			JOIN objects o ON o.id = pm.profile_id
			WHERE pm.account_id = ?1 AND o.type = ?2 ORDER BY o.id`
		)
		.bind(accountId, PROFILE_TYPE)
		.all();
	for (const row of results) {
		const p = rowToObject(row);
		if (p.data.kind !== 'grupo') {
			await saveFresh(
				db,
				p.id,
				(version) => ({
					id: p.id,
					type: PROFILE_TYPE,
					version,
					title: DELETED_TITLE,
					data: { kind: 'persona' },
					edges: { [MEMBER_EDGE]: [] },
					deleted: true
				}),
				{
					...context,
					createdBy: DELETED_ACTOR,
					also: () => [
						db.prepare('DELETE FROM profile_managers WHERE profile_id = ?1').bind(p.id),
						db.prepare('DELETE FROM profile_member_blocks WHERE persona_id = ?1').bind(p.id)
					]
				}
			);
			continue;
		}
		if (p.deleted_at !== null) continue;
		const others = await db
			.prepare(
				`SELECT p.account_id, p.role FROM profile_managers p JOIN accounts a ON a.id = p.account_id
				WHERE p.profile_id = ?1 AND p.account_id != ?2 AND a.deleted_at IS NULL
				ORDER BY p.role = 'owner' DESC, p.created_at`
			)
			.bind(p.id, accountId)
			.all();
		const heir = others.results[0];
		if (heir) {
			await db.batch([
				db
					.prepare(
						"UPDATE profile_managers SET role = 'owner' WHERE profile_id = ?1 AND account_id = ?2"
					)
					.bind(p.id, heir.account_id),
				db
					.prepare('DELETE FROM profile_managers WHERE profile_id = ?1 AND account_id = ?2')
					.bind(p.id, accountId)
			]);
			continue;
		}
		await saveFresh(
			db,
			p.id,
			(version) => ({ id: p.id, type: PROFILE_TYPE, version, deleted: true }),
			context
		);
	}
	await db.prepare('DELETE FROM profile_invites WHERE invited_by = ?1').bind(accountId).run();
}
