/**
 * El edge `enlaza`: lo que el cuerpo (`data.body`) de un evento, un material, un perfil o una
 * etiqueta nombra con `[[…]]`, `![[…]]`, `@nombre` o `#etiqueta` (docs/enlaces.md, decisión 0047),
 * resuelto a objetos. Es un edge **calculado** (`derived`, como `adjunto` del material):
 * saveObject() lo recalcula en cada guardado, en la misma tanda, y nadie lo manda a mano. Apunta al
 * objeto, no al nombre: cambiarle el título a la página enlazada no rompe nada.
 *
 * Cómo se resuelve cada nombre (siempre entre los objetos vivos, nunca el mismo objeto):
 * - `@nombre`: el perfil con esa dirección vieja de ficha (`profile_sources.legacy_slug`) o con ese
 *   `slug`, igual que /amigues/<nombre> (`resolveProfileSlug`);
 * - `#etiqueta` y `#[[etiqueta]]`: la etiqueta con ese `key` (un alias es una etiqueta más: se
 *   apunta a él), si no la que tiene ese `key` sin mayúsculas y con guiones por espacios (como
 *   /wiki/<término>), si no la de esa dirección (`slugify`);
 * - `[[nombre]]` (y `![[nombre]]`): primero como una etiqueta (lo que hacen hoy los `[[…]]`, que
 *   llevan a la Kinkipedia); si no, el objeto con ese título (sin mayúsculas); si no, el de esa
 *   dirección. Si dos tipos empatan, gana material, después evento, perfil y etiqueta; en el mismo
 *   tipo, el más viejo (id más chico).
 *
 * «Sin mayúsculas» compara solo las letras sin tilde (como `lower()` de SQLite): así la consulta
 * trae exactamente los candidatos que después se comparan acá. «Ética» y «ética» igual se
 * encuentran por la dirección («etica»).
 *
 * Lo que no se resuelve («falta») no se guarda en ningún lado: el esquema no tiene dónde (un edge
 * necesita un objeto en la otra punta). La lista de lo que falta (Etiquetas › Enlaces que faltan,
 * src/lib/server/contenido/enlacesFalta.js) lo vuelve a calcular con {@link candidatesFor} y
 * {@link resolveReference}; {@link resolveBodyLinks} lo devuelve en `missing`.
 *
 * Quién ve qué: el edge se guarda aunque la otra punta esté oculta, sea «solo con cuenta» o un
 * perfil sin aprobar; ninguna salida pública lo lee todavía. Quien lo lea tiene que mostrar un
 * edge solo si quien mira puede ver las dos puntas (`getEdges` ya lo hace; los perfiles, además,
 * aprobados) y dibujar un enlace a algo que no puede ver igual que uno a algo que no existe
 * (docs/enlaces.md, «Quién puede ver qué»).
 *
 * Solo usa imports relativos (lo usa el cron nocturno, que no pasa por Vite).
 */
import { bodyReferences } from '../../utils/enlaces.js';
import { slugify } from '../../utils/text.js';
import { MAX_EDGES_PER_KIND } from './edges.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('../../utils/enlaces.js').BodyReference} BodyReference */

export const ENLAZA_EDGE = 'enlaza';

/** Los tipos a los que puede apuntar, en el orden en que ganan un empate. */
export const ENLAZA_TARGETS = Object.freeze(['material', 'evento', 'perfil', 'etiqueta']);

/** La definición del edge, igual en los cuatro tipos que tienen cuerpo. */
export const ENLAZA_EDGE_DEF = Object.freeze({
	label: 'Enlaces del texto',
	to: ENLAZA_TARGETS,
	derived: true
});

/** Minúsculas solo en A-Z, como `lower()` de SQLite. */
/** @param {string} s */
const asciiLower = (s) => s.replace(/[A-Z]+/g, (c) => c.toLowerCase());
/** La forma de un `key` en /wiki/<término>, sin mayúsculas (A-Z). */
/** @param {string} s */
const keyFold = (s) => asciiLower(s.replaceAll(' ', '-'));

/**
 * @typedef {{
 *   id: number, type: string, slug: string, title: string, key: string | null,
 *   legacy: string | null
 * }} Candidate
 */

/**
 * Los objetos vivos que pueden ser lo que nombran `refs` (una consulta; todos los candidatos que
 * {@link resolveReferences} va a comparar, y alguno de más). También para la lista de lo que falta
 * (src/lib/server/contenido/enlacesFalta.js), con las referencias de todos los cuerpos juntas.
 *
 * @param {D1Database} db
 * @param {BodyReference[]} refs
 * @returns {Promise<Candidate[]>}
 */
export async function candidatesFor(db, refs) {
	const names = new Set();
	const slugs = new Set();
	const mentions = new Set();
	for (const { form, target } of refs) {
		if (form === 'mencion') {
			mentions.add(target);
			continue;
		}
		names.add(asciiLower(target));
		names.add(keyFold(target));
		const s = slugify(target);
		if (s) slugs.add(s);
	}
	const { results } = await db
		.prepare(
			`SELECT o.id, o.type, o.slug, o.title,
				CASE WHEN o.type = 'etiqueta' THEN json_extract(o.data, '$.key') END AS key,
				ps.legacy_slug AS legacy
			FROM objects o
			LEFT JOIN profile_sources ps ON o.type = 'perfil' AND ps.profile_id = o.id
			WHERE o.deleted_at IS NULL AND o.type IN (SELECT value FROM json_each(?1)) AND (
				o.slug IN (SELECT value FROM json_each(?2))
				OR lower(o.title) IN (SELECT value FROM json_each(?3))
				OR (o.type = 'etiqueta' AND json_valid(o.data) AND (
					json_extract(o.data, '$.key') IN (SELECT value FROM json_each(?4))
					OR lower(replace(json_extract(o.data, '$.key'), ' ', '-'))
						IN (SELECT value FROM json_each(?3))))
				OR (o.type = 'perfil' AND (o.slug IN (SELECT value FROM json_each(?5))
					OR ps.legacy_slug IN (SELECT value FROM json_each(?5)))))`
		)
		.bind(
			JSON.stringify(ENLAZA_TARGETS),
			JSON.stringify([...slugs]),
			JSON.stringify([...names]),
			JSON.stringify(refs.filter((r) => r.form !== 'mencion').map((r) => r.target)),
			JSON.stringify([...mentions])
		)
		.all();
	return results.map((r) => ({
		id: Number(r.id),
		type: String(r.type),
		slug: String(r.slug),
		title: String(r.title),
		key: r.key == null ? null : String(r.key),
		legacy: r.legacy == null ? null : String(r.legacy)
	}));
}

/**
 * El primero de `list` según el orden de {@link ENLAZA_TARGETS} y, en el mismo tipo, el id.
 *
 * @param {Candidate[]} list
 */
function best(list) {
	/** @type {Candidate | null} */
	let out = null;
	for (const c of list) {
		if (
			!out ||
			ENLAZA_TARGETS.indexOf(c.type) < ENLAZA_TARGETS.indexOf(out.type) ||
			(c.type === out.type && c.id < out.id)
		)
			out = c;
	}
	return out;
}

/**
 * El objeto que nombra una referencia (o `null`: «falta»). Pura: recibe los candidatos.
 *
 * @param {BodyReference} ref
 * @param {Candidate[]} candidates
 * @returns {Candidate | null}
 */
export function resolveReference({ form, target }, candidates) {
	/** @param {(c: Candidate) => boolean} test */
	const first = (test) => best(candidates.filter(test));
	if (form === 'mencion') {
		return (
			first((c) => c.type === 'perfil' && c.legacy === target) ??
			first((c) => c.type === 'perfil' && c.slug === target)
		);
	}
	const slug = slugify(target);
	const tag =
		first((c) => c.type === 'etiqueta' && c.key === target) ??
		first((c) => c.type === 'etiqueta' && c.key !== null && keyFold(c.key) === keyFold(target));
	if (tag) return tag;
	if (form === 'etiqueta')
		return slug ? first((c) => c.type === 'etiqueta' && c.slug === slug) : null;
	const lower = asciiLower(target);
	return (
		first((c) => asciiLower(c.title) === lower) ?? (slug ? first((c) => c.slug === slug) : null)
	);
}

/**
 * Las referencias de `refs` resueltas: los ids en el orden del texto (sin repetir, sin `selfId`,
 * como mucho {@link MAX_EDGES_PER_KIND}) y las que no se encontraron.
 *
 * @param {BodyReference[]} refs
 * @param {Candidate[]} candidates
 * @param {number | null} selfId
 */
export function resolveReferences(refs, candidates, selfId) {
	/** @type {number[]} */
	const ids = [];
	/** @type {BodyReference[]} */
	const missing = [];
	for (const ref of refs) {
		const found = resolveReference(ref, candidates);
		if (!found) missing.push(ref);
		else if (found.id !== selfId && !ids.includes(found.id) && ids.length < MAX_EDGES_PER_KIND)
			ids.push(found.id);
	}
	return { ids, missing };
}

/**
 * Lo que enlaza un cuerpo: los ids de los objetos que nombra y las referencias que faltan.
 *
 * @param {D1Database} db
 * @param {unknown} body
 * @param {number | null} selfId el objeto que se guarda (null si es nuevo)
 * @returns {Promise<{ ids: number[], missing: BodyReference[] }>}
 */
export async function resolveBodyLinks(db, body, selfId) {
	const refs = bodyReferences(body);
	if (!refs.length) return { ids: [], missing: [] };
	return resolveReferences(refs, await candidatesFor(db, refs), selfId);
}

/**
 * `deriveEdges` de los tipos con cuerpo (solo `enlaza`).
 *
 * @param {D1Database} db
 * @param {Record<string, any>} data
 * @param {{ id: number | null }} self
 */
export async function deriveEnlaza(db, data, self) {
	return { [ENLAZA_EDGE]: (await resolveBodyLinks(db, data.body, self.id)).ids };
}
