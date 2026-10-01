/**
 * Perfiles para el público (/amigues): lo que ve cualquiera, una cuenta o une admin.
 *
 * Reglas (además de las de visibilidad de los objetos, que deciden `getObject`, `getEdges` y
 * `visibleWhere`; ver docs/objetos.md):
 * - **aprobación**: un perfil aparece en /amigues solo si tiene fila en `profile_approvals`
 *   (migración 0017). Los importados y los creados por admins nacen aprobados; los que crea una
 *   cuenta esperan a une admin. Sin aprobar, lo ven solo quienes lo gestionan (con el permiso de
 *   perfiles) y les admins; para el resto no existe (404, como cualquier cosa que no se puede ver);
 * - **listados**: solo aprobados, nunca ocultos (tampoco para admins: para eso está el panel) y
 *   nunca los marcados "no listado";
 * - **integrantes**: solo si el grupo eligió mostrarlos (`show_members`) y solo perfiles de persona
 *   aprobados que quien mira puede ver; quienes gestionan no se muestran nunca;
 * - **lista blanca de campos**: las páginas reciben {@link publicProfile}, nunca el objeto entero
 *   (ni `created_by`, ni el contacto, ni la dirección de un lugar más allá de su nivel).
 */
import { getEdges, getObject, ANON } from '$lib/server/objects/index.js';
import { OBJECT_COLUMNS, forViewer, rowToObject } from '$lib/server/objects/read.js';
import { visibleWhere } from '$lib/server/objects/visibility.js';
import { isAdmin } from '$lib/server/auth';
import {
	MEMBER_EDGE,
	PROFILE_TYPE,
	memberViewer,
	profileKind
} from '$lib/server/cuentas/perfiles.js';
import { pronounLabel } from '$lib/utils/mentions';
import { textOrNull as s } from '$lib/utils/text.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */
/** @typedef {import('$lib/server/objects/visibility.js').Viewer} Viewer */
/** @typedef {import('$lib/server/cuentas/perfiles.js').ProfileKind} ProfileKind */

/**
 * Quién mira, a partir de la sesión: admin (GitHub), cuenta del público o anónime.
 *
 * @param {App.Locals} locals
 * @returns {Viewer}
 */
export function viewerFor(locals) {
	if (locals.user && isAdmin(locals.user)) return { role: 'admin', id: locals.user.login };
	if (locals.member) return memberViewer(locals.member.id);
	return ANON;
}

/** @param {StoredObject} o @param {string | null} legacySlug */
export function urlSlugOf(o, legacySlug) {
	return legacySlug || o.slug;
}

/**
 * A qué perfil lleva una dirección de /amigues (sin mirar visibilidad: para decidir el camino).
 * Primero la dirección vieja de una ficha importada ("Gorro_Rojo"), después la del objeto.
 *
 * @param {D1Database} db
 * @param {string} urlSlug
 * @returns {Promise<{ id: number, legacySlug: string | null } | null>}
 */
export async function resolveProfileSlug(db, urlSlug) {
	if (typeof urlSlug !== 'string' || !urlSlug || urlSlug.length > 100) return null;
	const legacy = await db
		.prepare('SELECT profile_id FROM profile_sources WHERE legacy_slug = ?1')
		.bind(urlSlug)
		.first();
	if (legacy) return { id: Number(legacy.profile_id), legacySlug: urlSlug };
	const row = await db
		.prepare(
			`SELECT o.id, s.legacy_slug FROM objects o LEFT JOIN profile_sources s ON s.profile_id = o.id
			WHERE o.type = ?1 AND o.slug = ?2`
		)
		.bind(PROFILE_TYPE, urlSlug)
		.first();
	if (!row) return null;
	return {
		id: Number(row.id),
		legacySlug: row.legacy_slug == null ? null : String(row.legacy_slug)
	};
}

/**
 * ¿Está aprobado para /amigues?
 *
 * @param {D1Database} db
 * @param {number} id
 */
export async function isApproved(db, id) {
	const row = await db
		.prepare('SELECT 1 AS x FROM profile_approvals WHERE profile_id = ?1')
		.bind(id)
		.first();
	return Boolean(row);
}

/**
 * El rol de una cuenta en un perfil, si lo gestiona y tiene el permiso de perfiles.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {number} profileId
 * @returns {Promise<'owner' | 'manager' | null>}
 */
export async function managerRole(db, accountId, profileId) {
	const row = await db
		.prepare(
			`SELECT pm.role FROM profile_managers pm JOIN accounts a ON a.id = pm.account_id
			WHERE pm.profile_id = ?1 AND pm.account_id = ?2 AND a.deleted_at IS NULL
			AND a.can_have_profiles = 1`
		)
		.bind(profileId, accountId)
		.first();
	if (!row) return null;
	return row.role === 'owner' ? 'owner' : 'manager';
}

/**
 * Un perfil para su página pública, si quien mira lo puede ver; si no, `null` (404).
 *
 * @param {D1Database} db
 * @param {string} urlSlug
 * @param {Viewer} viewer
 * @param {{ accountId?: string }} [opts] la cuenta de la sesión, para saber si lo gestiona
 * @returns {Promise<{ object: StoredObject, legacySlug: string | null, approved: boolean, role: 'owner' | 'manager' | null } | null>}
 */
export async function findPublicProfile(db, urlSlug, viewer, { accountId } = {}) {
	const ref = await resolveProfileSlug(db, urlSlug);
	if (!ref) return null;
	const object = await getObject(db, { id: ref.id }, viewer);
	if (!object || object.type !== PROFILE_TYPE) return null;
	const approved = await isApproved(db, object.id);
	const role = accountId ? await managerRole(db, accountId, object.id) : null;
	// Sin aprobar: solo admins y quienes lo gestionan.
	if (!approved && viewer.role !== 'admin' && !role) return null;
	return { object, legacySlug: ref.legacySlug, approved, role };
}

/**
 * Los perfiles de /amigues: aprobados, no ocultos, no "no listados" y que quien mira puede ver.
 *
 * @param {D1Database} db
 * @param {Viewer} viewer
 * @param {{ kind?: ProfileKind }} [opts]
 * @returns {Promise<{ object: StoredObject, legacySlug: string | null }[]>}
 */
export async function listPublicProfiles(db, viewer, { kind } = {}) {
	const visible = visibleWhere(viewer, 'o');
	const cols = OBJECT_COLUMNS.split(', ')
		.map((c) => `o.${c}`)
		.join(', ');
	// Solo `?` sin número: visibleWhere agrega los suyos en el medio.
	const { results } = await db
		.prepare(
			`SELECT ${cols}, s.legacy_slug AS legacy_slug FROM objects o
			JOIN profile_approvals pa ON pa.profile_id = o.id
			LEFT JOIN profile_sources s ON s.profile_id = o.id
			WHERE o.type = ? AND ${visible.sql} AND o.visibility != 'hidden'
			AND COALESCE(json_extract(o.data, '$.unlisted'), 0) = 0
			AND (? IS NULL OR json_extract(o.data, '$.kind') = ?)
			ORDER BY o.title COLLATE NOCASE, o.id LIMIT 1000`
		)
		.bind(PROFILE_TYPE, ...visible.params, kind ?? null, kind ?? null)
		.all();
	return results.map((r) => ({
		object: forViewer(rowToObject(r), viewer),
		legacySlug: r.legacy_slug == null ? null : String(r.legacy_slug)
	}));
}

/**
 * Las direcciones viejas de todas las fichas importadas (también ocultas o borradas): con el
 * interruptor prendido, esas fichas se muestran solo desde la base (aunque el .md siga).
 *
 * @param {D1Database} db
 * @returns {Promise<Set<string>>}
 */
export async function importedLegacySlugs(db) {
	const { results } = await db.prepare('SELECT legacy_slug FROM profile_sources').all();
	return new Set(results.map((r) => String(r.legacy_slug)));
}

/**
 * Integrantes de un grupo para su página: solo si el grupo los muestra, solo personas aprobadas
 * y visibles para quien mira (nunca ocultas), con la dirección pública de cada una.
 *
 * @param {D1Database} db
 * @param {StoredObject} group
 * @param {Viewer} viewer
 * @returns {Promise<{ slug: string, title: string }[] | null>} `null` si no se muestran
 */
export async function groupMembers(db, group, viewer) {
	if (profileKind(group.data) !== 'grupo' || group.data.show_members !== true) return null;
	const edges = await getEdges(db, group.id, viewer, { direction: 'in', kind: MEMBER_EDGE });
	const people = edges
		.map((e) => e.object)
		.filter((o) => profileKind(o.data) === 'persona' && o.visibility !== 'hidden');
	if (!people.length) return [];
	const ids = people.map((o) => o.id);
	const { results } = await db
		.prepare(
			`SELECT pa.profile_id, s.legacy_slug FROM profile_approvals pa
			LEFT JOIN profile_sources s ON s.profile_id = pa.profile_id
			WHERE pa.profile_id IN (SELECT value FROM json_each(?1))`
		)
		.bind(JSON.stringify(ids))
		.all();
	/** @type {Map<number, string | null>} */
	const approved = new Map(
		results.map((r) => [Number(r.profile_id), r.legacy_slug == null ? null : String(r.legacy_slug)])
	);
	return people
		.filter((o) => approved.has(o.id))
		.map((o) => ({ slug: urlSlugOf(o, approved.get(o.id) ?? null), title: o.title }))
		.sort((a, b) => a.title.localeCompare(b.title, 'es'));
}

/**
 * @typedef {{
 *   slug: string,
 *   title: string,
 *   kind: ProfileKind,
 *   bio: string | null,
 *   pronoun: string | null,
 *   pronounLabel: string | null,
 *   links: string[],
 *   linkText: string | null,
 *   tags: string[],
 *   authors: string[],
 *   jobTitle: string | null,
 *   publishedDate: string | null,
 *   updatedDate: string | null,
 *   image: string | null,
 *   imported: boolean
 * }} PublicProfile
 */

/**
 * Lo que una página pública puede saber de un perfil (lista blanca). Lo mismo que mostraba la
 * página de una ficha .md: nombre, pronombres, resumen, etiquetas, autores, link y su imagen.
 * Sin mail, teléfono, cumpleaños ni identidad de género (la página vieja tampoco los mostraba) y
 * sin nada de la dirección de un lugar (eso va aparte, según su privacidad).
 *
 * @param {StoredObject} o
 * @param {{ legacySlug: string | null, image?: string | null, tags?: string[] }} extra
 * @returns {PublicProfile}
 */
export function publicProfile(o, { legacySlug, image = null, tags }) {
	const d = o.data;
	/** @param {unknown} v */
	const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
	const pronoun = s(d.pronouns) ?? s(d.pronouns_url);
	return {
		slug: urlSlugOf(o, legacySlug),
		title: o.title,
		kind: profileKind(d),
		bio: s(d.bio),
		pronoun,
		pronounLabel: pronounLabel(pronoun) ?? null,
		links: list(d.links),
		linkText: s(d.link_text),
		tags: tags ?? list(d.tags),
		authors: list(d.authors),
		jobTitle: s(d.job_title),
		publishedDate: s(d.published_date),
		updatedDate: s(d.updated_date),
		image,
		imported: Boolean(legacySlug)
	};
}

/**
 * Un perfil con la forma de un post (`ProcessedPost`), para mostrarlo con los mismos componentes
 * de lista que las fichas .md (PostList / PostListItem).
 *
 * @param {PublicProfile} p
 * @returns {ProcessedPost}
 */
export function profileAsPost(p) {
	return /** @type {ProcessedPost} */ (
		/** @type {unknown} */ ({
			path: `/amigues/${p.slug}`,
			meta: {
				title: p.title,
				summary: p.bio ?? '',
				tags: p.tags,
				authors: p.authors,
				published_date: p.publishedDate ?? undefined,
				updated_date: p.updatedDate ?? undefined,
				featured: p.image ?? undefined,
				link: p.links[0],
				link_text: p.linkText ?? undefined,
				job_title: p.jobTitle ?? undefined,
				pronoun: p.pronoun ?? undefined,
				category: 'amigues',
				layout: 'amigues',
				postID: p.slug,
				kind: p.kind
			}
		})
	);
}
