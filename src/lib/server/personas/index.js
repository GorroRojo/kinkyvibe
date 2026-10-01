/**
 * Personas en eventos y publicaciones (B7): qué perfiles se muestran con su rol en la página de
 * un evento o una publicación, y qué publicaciones lista la página de un perfil.
 *
 * Los vínculos viven en el frontmatter (`personas: [{ perfil, rol }]`, ver
 * src/lib/utils/personas.js) mientras los eventos sigan siendo .md: un edge necesita los dos
 * extremos en `objects`, y los eventos todavía no están ahí. Cuando lo estén, cada perfil
 * listado pasa a ser un edge `persona` (evento → perfil, `data.roles`), con la misma forma
 * (`personasToEdges`), y estas lecturas pasan a `getEdges()`.
 *
 * Quién se muestra (nada de esto inventa reglas nuevas):
 * - el interruptor `personas_eventos` prendido; si no, nada (las páginas quedan como siempre);
 * - el interruptor `perfiles_publicos` prendido ({@link profilesSwitchOn}): los links llevan a
 *   la página del perfil en /amigues (docs/amigues.md), que solo existe con ese interruptor;
 * - el perfil visible para cualquiera: `visibleWhere(ANON)` de los objetos (ni ocultos, ni
 *   "solo con cuenta", ni borrados). Se mira como anónime a propósito: así la página es igual
 *   para todes y se puede guardar en caché sin filtrar nada de una sesión;
 * - el perfil aprobado para /amigues (`PROFILE_APPROVED_SQL`: fila en `profile_approvals`,
 *   migración 0017), la misma regla que la lista de amigues;
 * - el perfil es una persona o un proyecto (`profileKindOf`, que lee el viejo `grupo` como
 *   proyecto): los lugares van aparte, en "Sucede en" (`event_venues`, docs/amigues.md).
 *
 * Un perfil que no cumple todo eso no aparece: ni su nombre, ni su link, ni un "perfil oculto".
 * La dirección (slug) sí está en el .md, que es público en el repo: el editor solo ofrece
 * perfiles visibles y aprobados.
 */
import { ANON, visibleWhere } from '$lib/server/objects/index.js';
import { PROFILE_TYPE } from '$lib/server/cuentas/perfiles.js';
import { PROFILE_APPROVED_SQL } from '$lib/server/admin/cuentas.js';
import { getDB, logDBError } from '$lib/server/db';
import { perfilesPublicosEnabled, personasEventosEnabled } from '$lib/server/flags.js';
import { profileKindOf } from '$lib/server/objects/types/perfil.js';
import {
	PERSONAS_KEY,
	contentByRole,
	groupByRole,
	isProfileSlug,
	parsePersonas,
	profileSlugsOf,
	validatePersonas
} from '$lib/utils/personas.js';
import { listRoles } from './roles.js';
import { parseDocument } from 'yaml';
import { splitMarkdown } from '$lib/utils/eventDraft.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/**
 * `slug`: la dirección del objeto (la que va en el `personas:` del .md). `href`: su página en
 * /amigues (con la dirección vieja si es una ficha importada).
 * @typedef {{ slug: string, title: string, kind: PersonaKind, href: string }} PublicProfileRef
 */
/** @typedef {'persona' | 'proyecto'} PersonaKind */
/** @typedef {{ rol: string, items: PublicProfileRef[] }} PersonasGroup */

/** Cuántas direcciones por consulta (D1 acepta hasta 100 parámetros por sentencia). */
const CHUNK = 90;
/** Cuántos perfiles ofrece el editor. */
export const PICKER_LIMIT = 500;

/**
 * La página pública de un perfil: /amigues/<dirección vieja de la ficha importada, o la del
 * objeto> (como `urlSlugOf` de src/lib/server/amigues/profiles.js). Un solo lugar: si cambia,
 * cambia acá.
 * @param {string} slug la dirección del objeto
 * @param {string | null} [legacySlug] la de la ficha .md importada, si hay
 */
export function profileHref(slug, legacySlug = null) {
	return `/amigues/${encodeURIComponent(legacySlug || slug)}`;
}

/**
 * ¿Están prendidos los perfiles para el público? Es el interruptor `perfiles_publicos`: sin él,
 * /amigues muestra las fichas .md y un link a un perfil de la base no tendría página.
 * @param {App.Platform | undefined} platform
 */
export function profilesSwitchOn(platform) {
	return perfilesPublicosEnabled(platform);
}

/**
 * ¿Mostrar personas en esta página? Los dos interruptores y la base.
 * @param {App.Platform | undefined} platform
 * @returns {Promise<D1Database | null>} la base, o `null` si no se muestra nada
 */
async function enabledDB(platform) {
	const db = getDB(platform);
	if (!db) return null;
	if (!(await personasEventosEnabled(platform))) return null;
	if (!(await profilesSwitchOn(platform))) return null;
	return db;
}

/**
 * El tipo de un perfil para los roles, con el normalizador compartido (`grupo` → `proyecto`), o
 * `null` si es un lugar (no se lista como persona).
 * @param {unknown} data la columna `data` (JSON)
 * @returns {PersonaKind | null}
 */
function personaKindOf(data) {
	let parsed = null;
	try {
		parsed = JSON.parse(String(data));
	} catch {
		// datos ilegibles: cuenta como persona, como en profileKindOf
	}
	const kind = profileKindOf(parsed && typeof parsed === 'object' ? parsed : null);
	return kind === 'lugar' ? null : kind;
}

/**
 * Una fila de perfil (`slug`, `title`, `data`, `legacy_slug`) como {@link PublicProfileRef}, o
 * `null` si es un lugar.
 * @param {Record<string, unknown>} r
 * @returns {PublicProfileRef | null}
 */
function rowToRef(r) {
	const kind = personaKindOf(r.data);
	if (!kind) return null;
	const slug = String(r.slug);
	const legacy = r.legacy_slug == null ? null : String(r.legacy_slug);
	return { slug, title: String(r.title), kind, href: profileHref(slug, legacy) };
}

/** Columnas y tablas de las consultas de perfiles públicos (alias `o`). */
const PROFILE_SELECT = `SELECT o.slug, o.title, o.data, s.legacy_slug FROM objects o
	LEFT JOIN profile_sources s ON s.profile_id = o.id`;

/**
 * Los perfiles públicos (visibles para cualquiera y aprobados) entre estas direcciones.
 *
 * @param {D1Database} db
 * @param {readonly string[]} slugs
 * @returns {Promise<Map<string, PublicProfileRef>>}
 */
export async function publicProfilesBySlug(db, slugs) {
	/** @type {Map<string, PublicProfileRef>} */
	const out = new Map();
	const valid = [...new Set(slugs.filter(isProfileSlug))];
	for (let i = 0; i < valid.length; i += CHUNK) {
		const chunk = valid.slice(i, i + CHUNK);
		const vis = visibleWhere(ANON, 'o');
		const { results } = await db
			.prepare(
				`${PROFILE_SELECT}
				WHERE o.type = ? AND o.slug IN (${chunk.map(() => '?').join(', ')})
				AND ${vis.sql} AND ${PROFILE_APPROVED_SQL}`
			)
			.bind(PROFILE_TYPE, ...chunk, ...vis.params)
			.all();
		for (const r of results) {
			const ref = rowToRef(r);
			if (ref) out.set(ref.slug, ref);
		}
	}
	return out;
}

/**
 * Los perfiles públicos que puede elegir el editor (por nombre).
 *
 * @param {D1Database} db
 * @returns {Promise<PublicProfileRef[]>}
 */
export async function pickableProfiles(db) {
	const vis = visibleWhere(ANON, 'o');
	const { results } = await db
		.prepare(
			`${PROFILE_SELECT}
			WHERE o.type = ? AND ${vis.sql} AND ${PROFILE_APPROVED_SQL}
			ORDER BY o.title COLLATE NOCASE LIMIT ?`
		)
		.bind(PROFILE_TYPE, ...vis.params, PICKER_LIMIT)
		.all();
	// Los lugares se filtran con profileKindOf() (no en el SQL), así que el límite cuenta también
	// los lugares: PICKER_LIMIT sobra para lo que hay.
	return results.flatMap((r) => rowToRef(r) ?? []);
}

/**
 * Las personas de un evento o publicación, agrupadas por rol y solo con perfiles públicos.
 * (Sin interruptores: para eso está {@link personasForPage}.)
 *
 * @param {D1Database} db
 * @param {unknown} raw `meta.personas`
 * @param {readonly string[]} roles orden de los grupos
 * @returns {Promise<PersonasGroup[]>}
 */
export async function resolvePersonas(db, raw, roles) {
	const entries = parsePersonas(raw);
	if (!entries.length) return [];
	const profiles = await publicProfilesBySlug(db, profileSlugsOf(entries));
	const items = entries.flatMap((e) => {
		const p = profiles.get(e.perfil);
		return p ? [{ rol: e.rol, ...p }] : [];
	});
	return groupByRole(items, roles).map((g) => ({
		rol: g.rol,
		items: g.items.map(({ slug, title, kind, href }) => ({ slug, title, kind, href }))
	}));
}

/**
 * Para la página de un evento o una publicación: las personas por rol, o `null` si no hay nada
 * que mostrar (interruptores apagados, sin base, sin `personas` o ningún perfil público). Nunca
 * rompe la página: con un error, `null`.
 *
 * @param {App.Platform | undefined} platform
 * @param {Record<string, any> | undefined} meta
 * @returns {Promise<PersonasGroup[] | null>}
 */
export async function personasForPage(platform, meta) {
	if (!parsePersonas(meta?.[PERSONAS_KEY]).length) return null;
	try {
		const db = await enabledDB(platform);
		if (!db) return null;
		const groups = await resolvePersonas(db, meta?.[PERSONAS_KEY], await listRoles(db));
		return groups.length ? groups : null;
	} catch (error) {
		logDBError('personas de la página', error);
		return null;
	}
}

/**
 * Lo que lista un perfil público en su página, por rol. `null` si el perfil no es público (o
 * no existe): nada que mostrar, sin decir por qué.
 *
 * @param {D1Database} db
 * @param {string} slug
 * @param {readonly { meta: Record<string, any>, path: string }[]} posts
 * @param {readonly string[]} roles
 */
export async function resolveProfileContent(db, slug, posts, roles) {
	if (!isProfileSlug(slug)) return null;
	const profile = (await publicProfilesBySlug(db, [slug])).get(slug);
	if (!profile) return null;
	return { profile, groups: contentByRole(posts, slug, roles) };
}

/**
 * Para la página de un perfil: sus eventos y publicaciones por rol, o `null` (interruptores
 * apagados, perfil no público o nada que listar).
 *
 * @param {App.Platform | undefined} platform
 * @param {string} slug
 * @param {() => Promise<readonly { meta: Record<string, any>, path: string }[]>} loadPosts
 */
export async function contentForProfilePage(platform, slug, loadPosts) {
	if (!isProfileSlug(slug)) return null;
	try {
		const db = await enabledDB(platform);
		if (!db) return null;
		const found = await resolveProfileContent(db, slug, await loadPosts(), await listRoles(db));
		return found?.groups.length ? found.groups : null;
	} catch (error) {
		logDBError('publicaciones del perfil', error);
		return null;
	}
}

/**
 * Lo que necesita el editor de publicaciones para "Personas": la lista de roles y los perfiles
 * que se pueden elegir (públicos y aprobados). `null` con el interruptor apagado o sin base: el
 * editor no muestra la sección y guardar no mira `personas:`.
 *
 * @param {App.Platform | undefined} platform
 * @returns {Promise<{ roles: string[], profiles: PublicProfileRef[] } | null>}
 */
export async function editorPersonas(platform) {
	const roles = await activeRoles(platform);
	if (!roles) return null;
	try {
		return { roles, profiles: await pickableProfiles(/** @type {D1Database} */ (getDB(platform))) };
	} catch (error) {
		logDBError('perfiles para el editor', error);
		return { roles, profiles: [] };
	}
}

/**
 * La lista de roles si el interruptor está prendido (para validar al guardar), o `null`.
 *
 * @param {App.Platform | undefined} platform
 * @returns {Promise<string[] | null>}
 */
export async function activeRoles(platform) {
	const db = getDB(platform);
	if (!db || !(await personasEventosEnabled(platform))) return null;
	return listRoles(db);
}

/**
 * Los problemas de `personas:` de un archivo (vacío si está bien o si el frontmatter no se puede
 * leer: de eso avisa el editor).
 *
 * @param {string} content el .md entero
 * @param {readonly string[]} roles
 * @returns {string[]}
 */
export function personasFileErrors(content, roles) {
	let meta;
	try {
		meta = parseDocument(splitMarkdown(content).frontmatter).toJS() ?? {};
	} catch {
		return [];
	}
	const r = validatePersonas(meta?.[PERSONAS_KEY], roles);
	return r.ok ? [] : r.errors;
}
