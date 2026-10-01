/**
 * Personas en eventos y publicaciones (B7): funciones puras, sin base. Las usan el servidor
 * (src/lib/server/personas/), el editor del panel (en el navegador) y las páginas.
 *
 * Un evento o una publicación (material, wiki) lista personas con su rol en el frontmatter:
 *
 * ```yaml
 * personas:
 *   - perfil: colectivo-de-prueba   # la dirección (slug) del perfil
 *     rol: Organiza
 *   - perfil: persona-de-prueba
 *     rol: Facilita
 * ```
 *
 * Cada rol apunta a un perfil (persona o grupo) de Cuentas → Perfiles. Qué perfil se muestra lo
 * decide el servidor (visibilidad + aprobación + interruptor); acá solo se valida la forma.
 *
 * Cuando los eventos pasen a la base, cada perfil listado es un edge `persona` (evento → perfil)
 * con `data: { roles: [...] }`: {@link personasToEdges} arma exactamente eso.
 */

/** La clave del frontmatter. */
export const PERSONAS_KEY = 'personas';

/** Roles fijos (en este orden en las páginas). Les admins suman más desde el panel. */
export const FIXED_ROLES = Object.freeze([
	'Autore',
	'Traductore',
	'Organiza',
	'Produce',
	'Facilita',
	'Monitorea',
	'Enseña',
	'Fotografía',
	'Diseño'
]);

export const ROLE_MIN = 2;
export const ROLE_MAX = 40;
/** Cuántas personas puede listar un evento o una publicación. */
export const MAX_PERSONAS = 30;
/** Roles que se pueden agregar desde el panel. */
export const MAX_CUSTOM_ROLES = 50;

/** Dirección de un perfil (la de los objetos: minúsculas, números y guiones). */
const PROFILE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROFILE_SLUG_MAX = 100;
/** Letras (con tildes), números, espacios, guiones y apóstrofos; empieza con letra o número. */
const ROLE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} '’-]*$/u;

/** @typedef {{ perfil: string, rol: string }} PersonaEntry */

/**
 * @template T
 * @typedef {{ rol: string, items: T[] }} RoleGroup
 */

/** @param {unknown} slug */
export function isProfileSlug(slug) {
	return typeof slug === 'string' && slug.length <= PROFILE_SLUG_MAX && PROFILE_SLUG.test(slug);
}

/**
 * El nombre de un rol limpio (espacios de más afuera, NFC), o `''` si no es un nombre válido.
 * @param {unknown} raw
 */
export function cleanRole(raw) {
	if (typeof raw !== 'string') return '';
	const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
	if (name.length < ROLE_MIN || name.length > ROLE_MAX || !ROLE_NAME.test(name)) return '';
	return name;
}

/** Clave para comparar roles sin importar mayúsculas. @param {string} s */
const roleKey = (s) => s.normalize('NFC').toLocaleLowerCase('es');

/**
 * Los roles fijos más los del panel, sin repetir (sin importar mayúsculas), fijos primero.
 * @param {readonly string[]} [extra]
 * @returns {string[]}
 */
export function mergeRoles(extra = []) {
	/** @type {Map<string, string>} */
	const out = new Map();
	for (const r of [...FIXED_ROLES, ...extra]) {
		const name = cleanRole(r);
		if (name && !out.has(roleKey(name))) out.set(roleKey(name), name);
	}
	return [...out.values()];
}

/**
 * El rol de la lista que corresponde a lo escrito (sin importar mayúsculas), o `null`.
 * @param {readonly string[]} roles
 * @param {unknown} raw
 */
export function findRole(roles, raw) {
	const name = cleanRole(raw);
	if (!name) return null;
	return roles.find((r) => roleKey(r) === roleKey(name)) ?? null;
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Lo que dice el frontmatter, para mostrar: se saltean las entradas con forma inválida, sin
 * repetir (perfil, rol), hasta {@link MAX_PERSONAS}. No mira la lista de roles (un rol que se
 * borró del panel se sigue mostrando como está escrito).
 *
 * @param {unknown} raw `meta.personas`
 * @returns {PersonaEntry[]}
 */
export function parsePersonas(raw) {
	if (!Array.isArray(raw)) return [];
	/** @type {PersonaEntry[]} */
	const out = [];
	for (const item of raw) {
		if (!isRecord(item) || !isProfileSlug(item.perfil)) continue;
		const rol = cleanRole(item.rol);
		if (!rol) continue;
		const perfil = /** @type {string} */ (item.perfil);
		if (out.some((e) => e.perfil === perfil && roleKey(e.rol) === roleKey(rol))) continue;
		out.push({ perfil, rol });
		if (out.length >= MAX_PERSONAS) break;
	}
	return out;
}

/**
 * Valida `personas` para guardar (editor del panel y acción de guardar): forma, direcciones de
 * perfil, roles de la lista y el máximo. Sin `personas` (o vacío) está bien.
 *
 * @param {unknown} raw
 * @param {readonly string[]} roles {@link mergeRoles}
 * @returns {{ ok: true, personas: PersonaEntry[] } | { ok: false, errors: string[] }}
 */
export function validatePersonas(raw, roles) {
	if (raw === undefined || raw === null) return { ok: true, personas: [] };
	if (!Array.isArray(raw)) {
		return { ok: false, errors: ['Personas: tiene que ser una lista de { perfil, rol }.'] };
	}
	if (raw.length > MAX_PERSONAS) {
		return { ok: false, errors: [`Personas: hasta ${MAX_PERSONAS} por publicación.`] };
	}
	/** @type {string[]} */
	const errors = [];
	/** @type {PersonaEntry[]} */
	const personas = [];
	raw.forEach((item, i) => {
		const n = i + 1;
		if (!isRecord(item)) {
			errors.push(`Personas, fila ${n}: tiene que tener perfil y rol.`);
			return;
		}
		if (!isProfileSlug(item.perfil)) {
			errors.push(`Personas, fila ${n}: elegí un perfil.`);
			return;
		}
		const rol = findRole(roles, item.rol);
		if (!rol) {
			errors.push(`Personas, fila ${n}: «${String(item.rol ?? '')}» no es un rol de la lista.`);
			return;
		}
		const perfil = /** @type {string} */ (item.perfil);
		if (personas.some((e) => e.perfil === perfil && e.rol === rol)) {
			errors.push(`Personas, fila ${n}: ese perfil ya tiene el rol ${rol}.`);
			return;
		}
		personas.push({ perfil, rol });
	});
	return errors.length ? { ok: false, errors } : { ok: true, personas };
}

/**
 * Agrupa por rol, en el orden de `roles` (los que no están en la lista, al final, en el orden en
 * que aparecen). Dentro de cada rol, el orden original.
 *
 * @template {{ rol: string }} T
 * @param {readonly T[]} items
 * @param {readonly string[]} [roles]
 * @returns {RoleGroup<T>[]}
 */
export function groupByRole(items, roles = FIXED_ROLES) {
	/** @type {Map<string, RoleGroup<T>>} */
	const groups = new Map();
	for (const item of items) {
		const k = roleKey(item.rol);
		const g = groups.get(k) ?? { rol: item.rol, items: [] };
		g.items.push(item);
		groups.set(k, g);
	}
	const order = roles.map(roleKey);
	/** @param {RoleGroup<T>} g */
	const rank = (g) => {
		const i = order.indexOf(roleKey(g.rol));
		return i === -1 ? order.length : i;
	};
	return [...groups.values()]
		.map((g, i) => ({ g, i }))
		.sort((a, b) => rank(a.g) - rank(b.g) || a.i - b.i)
		.map(({ g }) => g);
}

/**
 * @typedef {{ title: string, path: string, category: string, date: string | null }} ContentRef
 */

/**
 * Lo que lista un perfil en su página: las publicaciones (eventos, material, wiki) que lo
 * nombran, agrupadas por rol. Una publicación aparece una vez por rol.
 *
 * @param {readonly { meta: Record<string, any>, path: string }[]} posts
 * @param {string} slug la dirección del perfil
 * @param {readonly string[]} [roles]
 * @returns {RoleGroup<ContentRef & { rol: string }>[]}
 */
export function contentByRole(posts, slug, roles = FIXED_ROLES) {
	if (!isProfileSlug(slug)) return [];
	/** @type {(ContentRef & { rol: string })[]} */
	const items = [];
	for (const p of posts) {
		for (const e of parsePersonas(p.meta?.[PERSONAS_KEY])) {
			if (e.perfil !== slug) continue;
			const date = p.meta.start ?? p.meta.published_date ?? null;
			items.push({
				rol: e.rol,
				title: String(p.meta.title ?? p.path),
				path: p.path,
				category: String(p.meta.category ?? ''),
				date: date === null ? null : String(date)
			});
		}
	}
	return groupByRole(items, roles);
}

/**
 * Las direcciones de perfil que nombra una lista (sin repetir).
 * @param {readonly PersonaEntry[]} personas
 */
export function profileSlugsOf(personas) {
	return [...new Set(personas.map((e) => e.perfil))];
}

/**
 * Los edges `persona` que tendrá el evento cuando esté en la base (forma de `saveObject()`:
 * `{ persona: [{ to, data }] }`): un edge por perfil (los edges no se repiten entre los mismos
 * dos objetos), con todos sus roles en `data.roles`. Los perfiles sin id se saltean.
 *
 * @param {readonly PersonaEntry[]} personas
 * @param {ReadonlyMap<string, number>} idBySlug
 * @returns {{ persona: { to: number, data: { roles: string[] } }[] }}
 */
export function personasToEdges(personas, idBySlug) {
	/** @type {Map<number, string[]>} */
	const byId = new Map();
	for (const e of personas) {
		const id = idBySlug.get(e.perfil);
		if (!id) continue;
		const roles = byId.get(id) ?? [];
		if (!roles.includes(e.rol)) roles.push(e.rol);
		byId.set(id, roles);
	}
	return { persona: [...byId].map(([to, roles]) => ({ to, data: { roles } })) };
}
