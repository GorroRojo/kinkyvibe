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
 * - el interruptor de perfiles prendido ({@link profilesSwitchOn});
 * - el perfil visible para cualquiera: `visibleWhere(ANON)` de los objetos (ni ocultos, ni
 *   "solo con cuenta", ni borrados). Se mira como anónime a propósito: así la página es igual
 *   para todes y se puede guardar en caché sin filtrar nada de una sesión;
 * - el perfil aprobado por une admin (`PROFILE_APPROVED_SQL`, la marca de "Para revisar").
 *
 * Un perfil que no cumple todo eso no aparece: ni su nombre, ni su link, ni un "perfil oculto".
 * La dirección (slug) sí está en el .md, que es público en el repo: el editor solo ofrece
 * perfiles visibles y aprobados.
 */
import { ANON, visibleWhere } from '$lib/server/objects/index.js';
import { PROFILE_TYPE } from '$lib/server/cuentas/perfiles.js';
import { PROFILE_APPROVED_SQL } from '$lib/server/admin/cuentas.js';
import { getDB, logDBError } from '$lib/server/db';
import { cuentasEnabled, personasEventosEnabled } from '$lib/server/flags.js';
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
/** @typedef {{ slug: string, title: string, kind: 'persona' | 'grupo' }} PublicProfileRef */
/** @typedef {{ rol: string, items: (PublicProfileRef & { href: string })[] }} PersonasGroup */

/** Cuántas direcciones por consulta (D1 acepta hasta 100 parámetros por sentencia). */
const CHUNK = 90;
/** Cuántos perfiles ofrece el editor. */
export const PICKER_LIMIT = 500;

/**
 * La página pública de un perfil. Un solo lugar: si cambia (por ejemplo, con las direcciones
 * viejas de amigues), cambia acá.
 * @param {string} slug
 */
export function profileHref(slug) {
	return `/amigues/${encodeURIComponent(slug)}`;
}

/**
 * ¿Están prendidos los perfiles para el público? Hoy los perfiles viven detrás de `cuentas`;
 * cuando exista el interruptor de perfiles públicos, se cambia solo acá.
 * @param {App.Platform | undefined} platform
 */
export function profilesSwitchOn(platform) {
	return cuentasEnabled(platform);
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

/** @param {unknown} data */
function kindOf(data) {
	try {
		return JSON.parse(String(data))?.kind === 'grupo' ? 'grupo' : 'persona';
	} catch {
		return 'persona';
	}
}

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
				`SELECT o.slug, o.title, o.data FROM objects o
				WHERE o.type = ? AND o.slug IN (${chunk.map(() => '?').join(', ')})
				AND ${vis.sql} AND ${PROFILE_APPROVED_SQL}`
			)
			.bind(PROFILE_TYPE, ...chunk, ...vis.params)
			.all();
		for (const r of results) {
			const slug = String(r.slug);
			out.set(slug, { slug, title: String(r.title), kind: kindOf(r.data) });
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
			`SELECT o.slug, o.title, o.data FROM objects o
			WHERE o.type = ? AND ${vis.sql} AND ${PROFILE_APPROVED_SQL}
			ORDER BY o.title COLLATE NOCASE LIMIT ?`
		)
		.bind(PROFILE_TYPE, ...vis.params, PICKER_LIMIT)
		.all();
	return results.map((r) => ({
		slug: String(r.slug),
		title: String(r.title),
		kind: kindOf(r.data)
	}));
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
		return p ? [{ rol: e.rol, ...p, href: profileHref(p.slug) }] : [];
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
	const db = getDB(platform);
	if (!db || !(await personasEventosEnabled(platform))) return null;
	try {
		const [roles, profiles] = await Promise.all([listRoles(db), pickableProfiles(db)]);
		return { roles, profiles };
	} catch (error) {
		logDBError('perfiles para el editor', error);
		return { roles: await listRoles(db), profiles: [] };
	}
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
