/**
 * La sección «Personas» de los formularios del panel (crear y editar eventos, material): un
 * buscador como el de «Organizan» (amigues, los perfiles de la base o un nombre libre) y cada
 * persona con su rol. Funciones puras para el componente
 * ($lib/components/admin/event-form/PersonasField.svelte) y para las pruebas.
 *
 * Lo que se guarda sale de {@link formPersonasChanges}: los mismos cambios de `authors:` y
 * `personas:` que escribían «Organizan» y la vieja sección «Personas», así un .md sin cambios en
 * las personas queda igual, byte a byte (ver ./personasList.js).
 */
import { buildOrganizerOptions, findProfile } from './organizers.js';
import { authorRoleOf, personasFromMd, personasToMd } from './personasList.js';

/** @typedef {import('./personasList.js').PersonaItem} PersonaItem */
/** @typedef {import('./personasList.js').MdPersona} MdPersona */
/**
 * Un perfil de la base que se puede elegir (públicos y aprobados, `editorPersonas()` del
 * servidor): `slug` es la dirección del objeto (la de `personas:`), `href` su página en /amigues.
 * @typedef {{ slug: string, title: string, kind: 'persona' | 'proyecto', href: string }} DbProfile
 */
/**
 * Una sugerencia del buscador: la de «Organizan» (un nombre de `authors:`, `name`) más, si la
 * persona tiene perfil en la base, su dirección (`profile`).
 * @typedef {import('./organizers.js').OrganizerOption & { name?: string, profile?: string }} PersonaOption
 */

/**
 * La dirección de la página de un perfil de la base (`/amigues/<x>`): la de su ficha .md si se
 * importó de una, o la del objeto.
 * @param {string} href
 */
export function slugOfHref(href) {
	const m = /^\/amigues\/([^/?#]+)$/.exec(String(href ?? ''));
	if (!m) return '';
	try {
		return decodeURIComponent(m[1]);
	} catch {
		return m[1];
	}
}

/**
 * Todo lo que el buscador sugiere: las fichas de amigues y los nombres que ya se usaron (como
 * «Organizan»), y los perfiles de la base. Un perfil de la base que se importó de una ficha es
 * una sola sugerencia con las dos cosas (su nombre de `authors:` y su dirección).
 *
 * @param {import('./organizers.js').Profile[]} profiles las fichas de amigues
 * @param {readonly DbProfile[]} dbProfiles
 * @param {Record<string, number>} [usage] `authors:` → en cuántas publicaciones está
 * @returns {PersonaOption[]}
 */
export function personaOptions(profiles, dbProfiles, usage = {}) {
	/** @type {PersonaOption[]} */
	const out = buildOrganizerOptions(profiles, usage).map((o) => ({ ...o, name: o.value }));
	for (const p of dbProfiles) {
		const md = findProfile(profiles, slugOfHref(p.href));
		const same = md && out.find((o) => o.hasProfile && o.name === md.slug && !o.profile);
		if (same) {
			same.profile = p.slug;
			continue;
		}
		out.push({
			value: p.title,
			label: p.title,
			detail: p.kind === 'proyecto' ? 'Proyecto (perfil)' : 'Persona (perfil)',
			hasProfile: true,
			count: 0,
			profile: p.slug
		});
	}
	return out;
}

/**
 * Las personas de un archivo, como las muestra el formulario. Con `withPersonas` (el interruptor
 * personas_eventos) también las de `personas:`; sin él, solo `authors:` (y `personas:` queda como
 * está). Los nombres de `authors:` que tienen perfil en la base lo traen (por si se les cambia el
 * rol: con otro rol se guardan con su perfil).
 *
 * @param {readonly string[]} authors
 * @param {unknown} personas
 * @param {string} category
 * @param {{ withPersonas?: boolean, options?: readonly PersonaOption[] }} [opts]
 * @returns {PersonaItem[]}
 */
export function formPersonas(
	authors,
	personas,
	category,
	{ withPersonas = false, options = [] } = {}
) {
	const role = authorRoleOf(category);
	return personasFromMd(authors, withPersonas ? personas : [], category).map((it) => {
		if (it.name === undefined || it.role !== role) return it;
		const o = options.find((x) => x.name === it.name && x.profile);
		return o ? { ...it, profile: o.profile } : it;
	});
}

/**
 * Qué cambiar en el frontmatter (para `applyFrontmatterChanges`): `authors` si cambió la lista de
 * nombres con el rol de autores, `personas` si cambió el resto (solo con `withPersonas`; vacía,
 * `remove`). Sin cambios, nada: el archivo queda igual.
 *
 * @template R
 * @param {readonly PersonaItem[]} initial lo que se leyó del archivo ({@link formPersonas})
 * @param {readonly PersonaItem[]} items lo que hay ahora en el formulario
 * @param {string} category
 * @param {{ withPersonas?: boolean, remove: R, emptyAuthors?: 'list' | 'remove' }} opts
 *   `emptyAuthors`: sin nadie con el rol de autores, `authors: []` (como el editor de eventos) o
 *   sacar la clave (como el de material)
 * @returns {{ authors?: string[] | R, personas?: MdPersona[] | R }}
 */
export function formPersonasChanges(initial, items, category, opts) {
	const before = personasToMd(initial, category);
	const now = personasToMd(items, category);
	/** @type {{ authors?: string[] | R, personas?: MdPersona[] | R }} */
	const changes = {};
	if (now.authors.join('\n') !== before.authors.join('\n'))
		changes.authors =
			now.authors.length || opts.emptyAuthors !== 'remove' ? now.authors : opts.remove;
	if (opts.withPersonas && JSON.stringify(now.personas) !== JSON.stringify(before.personas))
		changes.personas = now.personas.length ? now.personas : opts.remove;
	return changes;
}

/**
 * Cómo se ve una persona en la lista del formulario.
 *
 * @param {PersonaItem} it
 * @param {string} category
 * @param {import('./organizers.js').Profile[]} profiles
 * @param {ReadonlyMap<string, DbProfile>} dbBySlug
 * @returns {{ label: string, thumb?: string, linked: boolean, title: string }}
 */
export function personaView(it, category, profiles, dbBySlug) {
	const byName = it.name !== undefined && (it.role === authorRoleOf(category) || !it.profile);
	if (byName) {
		const p = findProfile(profiles, it.name ?? '');
		const db = it.profile ? dbBySlug.get(it.profile) : undefined;
		return {
			label: it.name ?? '',
			thumb: p?.thumb,
			linked: Boolean(p || db),
			title: p
				? `Perfil: ${p.title} (/amigues/${p.slug})`
				: db
					? `Perfil: ${db.title} (${db.href})`
					: 'Sin perfil: se muestra solo el nombre'
		};
	}
	const db = dbBySlug.get(it.profile ?? '');
	if (db) return { label: db.title, linked: true, title: `Perfil: ${db.title} (${db.href})` };
	return {
		label: `${it.profile || 'Sin perfil'} (no público)`,
		linked: false,
		title: 'Ese perfil no es público (o no está aprobado): en la página no aparece.'
	};
}

/**
 * La acción que crea un rol: la de Eventos › Roles y preguntas (la misma validación, solo admins,
 * queda en el registro de actividad). El formulario la llama desde «+ Nuevo rol…».
 */
export const ADD_ROLE_ACTION = '/admin/eventos/roles?/addRole';

/**
 * Las personas de un borrador guardado en el navegador (`people`), o las de antes de juntar las
 * secciones (`authors`: solo nombres; reemplazan a quienes tenían el rol de autores). Sin nada que
 * recuperar, las de ahora.
 *
 * @param {any} draft
 * @param {PersonaItem[]} current
 * @param {string} authorRole
 * @returns {PersonaItem[]}
 */
export function restorePeople(draft, current, authorRole) {
	if (Array.isArray(draft?.people)) {
		return draft.people.filter(
			(/** @type {any} */ it) => it && typeof it === 'object' && typeof it.role === 'string'
		);
	}
	if (Array.isArray(draft?.authors)) {
		return [
			...draft.authors.map((/** @type {unknown} */ name) => ({
				name: String(name),
				role: authorRole
			})),
			...current.filter((it) => it.role !== authorRole || it.name === undefined)
		];
	}
	return current;
}
