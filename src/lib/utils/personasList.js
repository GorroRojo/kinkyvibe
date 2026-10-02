/**
 * Personas en una sola lista (pedido de gorrite: «Organizan» y «Personas» son una sola cosa).
 *
 * Una publicación nombra personas con un rol: quién organiza un evento o escribe un material, y
 * quién facilita, enseña, fotografía… La lista única es:
 *
 * ```js
 * [{ name: 'KinkyVibe', role: 'Organiza' },               // un nombre (libre o de amigues)
 *  { profile: 'colectivo-de-prueba', role: 'Facilita' },  // un perfil (su dirección)
 *  { name: 'Persona Sin Perfil', role: 'Fotografía' }]    // un nombre libre con otro rol
 * ```
 *
 * - **En la base** (`contenido_db`): es lo que guarda `data.personas` de un `evento` o un
 *   `material` (./../server/contenido/eventos.js, material.js), una sola lista con quienes
 *   organizan o escriben incluides.
 * - **En los .md** no cambia nada: se escribe en los campos de siempre ({@link personasToMd}):
 *   los nombres con el rol de `authors:` (Organiza en eventos, Autore en material y wiki) van a
 *   `authors:`, y el resto a `personas:` (`{ perfil, rol }`, o `{ nombre, rol }` para un nombre
 *   libre con otro rol). Leer un .md y volver a escribirlo da el mismo texto
 *   ({@link personasFromMd} y {@link personasToMd} son ida y vuelta: personasList.test.js).
 * - **Las páginas** siguen leyendo `authors` y `personas` de la metadata: para los posts de la
 *   base, la metadata se arma con {@link personasToMd} (`authors` = los nombres con el rol de
 *   autores, en orden).
 *
 * Funciones puras, sin base ni SvelteKit. Solo imports relativos (las usa el servidor de
 * contenido, que no pasa por los alias de Vite en todos lados).
 */
import { MAX_PERSONAS, PERSONAS_KEY, PERSON_NAME_MAX, cleanRole, findRole } from './personas.js';

/** El rol de `authors:` en los eventos. */
export const ORGANIZER_ROLE = 'Organiza';
/** El rol de `authors:` en el material y la wiki. */
export const AUTHOR_ROLE = 'Autore';

/** Cuántas filas puede guardar la base (las de `authors:` más las de `personas:`). */
export const MAX_PERSONA_ITEMS = 60;
/** Largo máximo de un nombre o una dirección de perfil en la base (como un ítem de lista). */
const ITEM_TEXT_MAX = 300;

/**
 * Una fila de la lista. Tiene un perfil (`profile`, la dirección del objeto `perfil`) o un nombre
 * (`name`: lo que hoy va en `authors:`, o un nombre libre). En el formulario, una fila elegida de
 * amigues puede tener los dos: va a `authors:` con su nombre si su rol es el de autores, y a
 * `personas:` con su perfil si no.
 * @typedef {{ profile?: string, name?: string, role: string }} PersonaItem
 */

/**
 * Una fila de `personas:` en un .md.
 * @typedef {{ perfil: string, rol: string } | { nombre: string, rol: string }} MdPersona
 */

/**
 * El rol de `authors:` de una categoría: Organiza en los eventos, Autore en lo demás.
 * @param {string} category
 */
export function authorRoleOf(category) {
	return category === 'calendario' ? ORGANIZER_ROLE : AUTHOR_ROLE;
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * De los campos de un .md a la lista: primero `authors:` (con el rol de autores de la categoría),
 * después `personas:`, cada una en su orden. No limpia ni valida (así volver a escribir da el
 * mismo texto); se saltean solo las filas de `personas:` que no son un objeto.
 *
 * @param {readonly string[]} authors `authors:` ya como lista de textos (como la lee cada uno)
 * @param {unknown} personas `personas:` tal cual
 * @param {string} category
 * @returns {PersonaItem[]}
 */
export function personasFromMd(authors, personas, category) {
	const role = authorRoleOf(category);
	/** @type {PersonaItem[]} */
	const out = authors.map((name) => ({ name, role }));
	if (!Array.isArray(personas)) return out;
	for (const p of personas) {
		if (!isRecord(p)) continue;
		const rol = p.rol === undefined || p.rol === null ? '' : String(p.rol);
		if (p.perfil === undefined && typeof p.nombre === 'string')
			out.push({ name: p.nombre, role: rol });
		else
			out.push({
				profile: p.perfil === undefined || p.perfil === null ? '' : String(p.perfil),
				role: rol
			});
	}
	return out;
}

/**
 * De la lista a los campos de un .md (lo que se escribe al guardar en GitHub, y la metadata de
 * los posts de la base): los nombres con el rol de autores de la categoría van a `authors`, en
 * orden; el resto a `personas` (un perfil como `{ perfil, rol }`, un nombre como
 * `{ nombre, rol }`), en orden.
 *
 * @param {readonly PersonaItem[]} items
 * @param {string} category
 * @returns {{ authors: string[], personas: MdPersona[] }}
 */
export function personasToMd(items, category) {
	const role = authorRoleOf(category);
	/** @type {string[]} */
	const authors = [];
	/** @type {MdPersona[]} */
	const personas = [];
	for (const it of items) {
		if (typeof it.name === 'string' && it.role === role) authors.push(it.name);
		else if (typeof it.profile === 'string') personas.push({ perfil: it.profile, rol: it.role });
		else personas.push({ nombre: it.name ?? '', rol: it.role });
	}
	return { authors, personas };
}

/**
 * ¿`data` (de un objeto de la base) tiene la lista única? Si no, es de la forma de antes
 * (`data.authors` y `data.extra.personas`, como lo guardaba la importación hasta este cambio).
 * @param {Record<string, any> | null | undefined} data
 */
export function hasPersonaItems(data) {
	return Array.isArray(data?.personas);
}

/**
 * La lista de un objeto de la base, de las dos formas: la única (`data.personas`) o la de antes
 * (`data.authors` + `data.extra.personas`). La de antes no se migra: se lee así y pasa a la única
 * la próxima vez que se guarda (o se vuelve a importar).
 *
 * @param {Record<string, any> | null | undefined} data
 * @param {string} category
 * @returns {PersonaItem[]}
 */
export function personasFromData(data, category) {
	if (hasPersonaItems(data)) {
		return /** @type {unknown[]} */ (data?.personas ?? []).flatMap((it) => {
			if (!isRecord(it) || typeof it.role !== 'string') return [];
			/** @type {PersonaItem} */
			const item = { role: it.role };
			if (typeof it.profile === 'string') item.profile = it.profile;
			if (typeof it.name === 'string') item.name = it.name;
			return item.profile === undefined && item.name === undefined ? [] : [item];
		});
	}
	const authors = Array.isArray(data?.authors) ? data.authors.map(String) : [];
	const extra = isRecord(data?.extra) ? data.extra : {};
	return personasFromMd(authors, extra[PERSONAS_KEY], category);
}

/**
 * La lista para guardar en la base desde los campos de un .md: como {@link personasFromMd}, con
 * los textos sin espacios de más y sin las filas vacías (sin perfil ni nombre, o sin rol), que se
 * informan. La importación y el guardado del panel pasan por acá.
 *
 * @param {readonly string[]} authors
 * @param {unknown} personas
 * @param {string} category
 * @returns {{ items: PersonaItem[], warnings: string[] }}
 */
export function personasForData(authors, personas, category) {
	/** @type {string[]} */
	const warnings = [];
	/** @type {PersonaItem[]} */
	const items = [];
	const nAuthors = authors.length;
	personasFromMd(authors, personas, category).forEach((it, i) => {
		const role = it.role.trim();
		const profile = it.profile?.trim();
		const name = it.name?.trim();
		if (!role || (!profile && !name)) {
			if (i >= nAuthors)
				warnings.push(
					`personas, fila ${i - nAuthors + 1}: sin perfil, nombre o rol (no se guarda)`
				);
			return;
		}
		items.push(profile ? { profile, role } : { name, role });
	});
	return { items, warnings };
}

/**
 * `data` de un objeto con la lista única: lo guardado con la forma de antes (`authors` +
 * `extra.personas`) pasa a `personas` (como quedaría al importarlo hoy); lo demás queda igual.
 * Para comparar lo guardado con lo que daría importar (./../server/contenido/importer.js) sin
 * ver «cambios» que son solo la forma.
 *
 * @param {Record<string, any> | null | undefined} data
 * @param {string} category
 * @returns {Record<string, any>}
 */
export function reshapePersonas(data, category) {
	if (!data || hasPersonaItems(data)) return { ...(data ?? {}) };
	const { authors, ...rest } = data;
	const extra = isRecord(rest.extra) ? { ...rest.extra } : null;
	const { items } = personasForData(
		Array.isArray(authors) ? authors.map(String) : [],
		extra?.[PERSONAS_KEY],
		category
	);
	if (extra) {
		delete extra[PERSONAS_KEY];
		if (Object.keys(extra).length) rest.extra = extra;
		else delete rest.extra;
	}
	return items.length ? { ...rest, personas: items } : rest;
}

/**
 * Qué tiene de malo la lista guardada en la base (forma, no la lista de roles: un rol que se sacó
 * del panel se sigue mostrando como está escrito). Vacío = está bien.
 *
 * @param {unknown} items `data.personas`
 * @returns {string[]}
 */
export function personaItemsProblems(items) {
	if (items === undefined || items === null) return [];
	if (!Array.isArray(items)) return ['Personas: tiene que ser una lista'];
	if (items.length > MAX_PERSONA_ITEMS) return [`Personas: hasta ${MAX_PERSONA_ITEMS}`];
	/** @type {string[]} */
	const out = [];
	items.forEach((it, i) => {
		const n = i + 1;
		if (!isRecord(it)) {
			out.push(`Personas, fila ${n}: tiene que ser { profile o name, role }`);
			return;
		}
		const extra = Object.keys(it).filter((k) => !['profile', 'name', 'role'].includes(k));
		if (extra.length) out.push(`Personas, fila ${n}: no conoce ${extra.join(', ')}`);
		const text = (/** @type {unknown} */ v) =>
			typeof v === 'string' && v.trim() !== '' && v.length <= ITEM_TEXT_MAX;
		if (typeof it.role !== 'string' || !it.role.trim() || it.role.length > ITEM_TEXT_MAX)
			out.push(`Personas, fila ${n}: falta el rol`);
		if ((it.profile === undefined) === (it.name === undefined))
			out.push(`Personas, fila ${n}: tiene que tener un perfil o un nombre (uno solo)`);
		else if (!text(it.profile ?? it.name))
			out.push(`Personas, fila ${n}: el perfil o el nombre está vacío o es muy largo`);
	});
	return out;
}

/** @param {string} s */
const nameKey = (s) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');

/**
 * Quién es una fila (para no repetir la misma persona con el mismo rol): su perfil, o su nombre.
 * @param {PersonaItem} it
 */
export function personKey(it) {
	return it.profile ? `p:${it.profile}` : `n:${nameKey(it.name ?? '')}`;
}

/**
 * Los problemas de la lista del formulario, en castellano y por fila (en el orden en que se ven).
 * Vacío = se puede guardar.
 *
 * @param {readonly PersonaItem[]} items
 * @param {readonly string[]} roles los roles que se pueden elegir ({@link import('./personas.js').mergeRoles})
 * @returns {string[]}
 */
export function validatePersonaItems(items, roles) {
	/** @type {string[]} */
	const errors = [];
	if (items.length > MAX_PERSONAS) errors.push(`Personas: hasta ${MAX_PERSONAS} por publicación.`);
	/** @type {Set<string>} */
	const seen = new Set();
	items.forEach((it, i) => {
		const n = i + 1;
		const name = (it.name ?? '').trim();
		if (!it.profile && !name) {
			errors.push(`Personas, fila ${n}: elegí un perfil o escribí un nombre.`);
			return;
		}
		if (!it.profile && name.length > PERSON_NAME_MAX) {
			errors.push(`Personas, fila ${n}: el nombre es muy largo (hasta ${PERSON_NAME_MAX} letras).`);
			return;
		}
		if (!it.role) {
			errors.push(`Personas, fila ${n}: elegí un rol.`);
			return;
		}
		const role = findRole(roles, it.role);
		if (!role || !cleanRole(it.role)) {
			errors.push(`Personas, fila ${n}: «${it.role}» no es un rol de la lista.`);
			return;
		}
		const key = `${personKey(it)}|${role}`;
		if (seen.has(key)) {
			errors.push(`Personas, fila ${n}: esa persona ya tiene el rol ${role}.`);
			return;
		}
		seen.add(key);
	});
	return errors;
}
