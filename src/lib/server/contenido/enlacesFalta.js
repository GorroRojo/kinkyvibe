/**
 * Lo que falta (plan `enlaces-falta`, docs/enlaces.md): los `[[…]]`, `![[…]]`, `@nombre` y
 * `#etiqueta` de los cuerpos que no llevan a ningún objeto, con cuántas veces se escriben y qué
 * objetos los usan. Es la lista de qué escribir para hacer crecer la Kinkipedia. Solo para el panel
 * (admins): nombra objetos ocultos y lo que tienen escrito.
 *
 * No hay tabla de lo que falta (un edge necesita un objeto en la otra punta; docs/enlaces.md, «Al
 * guardar»): se calcula al pedirla, leyendo los cuerpos. Dos consultas en fila: los cuerpos (como
 * mucho {@link FALTA_MAX_OBJECTS}, los editados más recientemente primero) y, con todo lo que
 * nombran junto, los candidatos ({@link candidatesFor}, la misma que usa el guardado). Cada nombre
 * se resuelve igual que al guardar ({@link resolveReference}): sin mirar visibilidad, así que lo
 * que lleva a algo oculto no «falta» (existe; solo no se ve).
 */
import { bodyReferences } from '$lib/utils/enlaces.js';
import { ENLAZA_TARGETS, candidatesFor, resolveReference } from '$lib/server/objects/enlaces.js';
import { pathOf } from './loQueEnlaza.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/enlaces.js').BodyReference} BodyReference */

/** Cuántos cuerpos se leen como mucho (los demás no se miran y la página lo dice). */
export const FALTA_MAX_OBJECTS = 3000;

/**
 * Un objeto que escribe algo que falta.
 * @typedef {{ id: number, type: string, title: string, visibility: string, path: string | null }} FaltaSource
 */

/**
 * Un nombre que falta: cómo se escribe (`[[…]]`, `@…` o `#…`, con la forma de la primera vez),
 * cuántas veces aparece en total y en qué objetos.
 * @typedef {{ name: string, form: BodyReference['form'], count: number, sources: FaltaSource[] }} FaltaItem
 */

/**
 * La misma cosa escrita de dos maneras cuenta una vez: sin mayúsculas, y `[[x]]`, `![[x]]` y `#x`
 * juntos (llevarían al mismo lugar); una mención va aparte.
 * @param {BodyReference} ref
 */
const keyOf = ({ form, target }) =>
	`${form === 'mencion' ? '@' : ''}${target.toLocaleLowerCase('es').replaceAll(' ', '-')}`;

/** @param {BodyReference} ref */
function written({ form, target }) {
	if (form === 'mencion') return `@${target}`;
	if (form === 'etiqueta') return /\s/.test(target) ? `#[[${target}]]` : `#${target}`;
	return `[[${target}]]`;
}

/**
 * Lo que falta en todos los cuerpos, de lo que más se escribe a lo que menos.
 *
 * @param {D1Database} db
 * @param {{ max?: number }} [opts]
 * @returns {Promise<{ items: FaltaItem[], scanned: number, truncated: boolean, references: number }>}
 */
export async function missingLinks(db, { max = FALTA_MAX_OBJECTS } = {}) {
	const { results } = await db
		.prepare(
			`SELECT o.id, o.type, o.slug, o.title, o.visibility,
				json_extract(o.data, '$.body') AS body,
				CASE WHEN o.type = 'etiqueta' THEN json_extract(o.data, '$.key') END AS key,
				coalesce(cs.legacy_slug, ps.legacy_slug) AS legacy
			FROM objects o
			LEFT JOIN content_sources cs ON cs.object_id = o.id
			LEFT JOIN profile_sources ps ON o.type = 'perfil' AND ps.profile_id = o.id
			WHERE o.deleted_at IS NULL AND o.type IN (SELECT value FROM json_each(?1))
				AND json_valid(o.data) AND coalesce(json_extract(o.data, '$.body'), '') != ''
			ORDER BY o.updated_at DESC, o.id DESC
			LIMIT ?2`
		)
		.bind(JSON.stringify(ENLAZA_TARGETS), max + 1)
		.all();
	const truncated = results.length > max;
	const rows = results.slice(0, max);
	/** @type {{ row: Record<string, unknown>, refs: BodyReference[] }[]} */
	const read = rows.map((row) => ({ row, refs: bodyReferences(row.body) }));
	/** @type {Map<string, BodyReference>} */
	const unique = new Map();
	for (const { refs } of read)
		for (const ref of refs) unique.set(`${ref.form}\u0000${ref.target}`, ref);
	const refs = [...unique.values()];
	const candidates = refs.length ? await candidatesFor(db, refs) : [];
	/** @type {Set<string>} */
	const missing = new Set();
	for (const [k, ref] of unique) if (!resolveReference(ref, candidates)) missing.add(k);
	/** @type {Map<string, FaltaItem & { seen: Set<number> }>} */
	const items = new Map();
	let references = 0;
	for (const { row, refs: own } of read) {
		for (const ref of own) {
			references++;
			if (!missing.has(`${ref.form}\u0000${ref.target}`)) continue;
			const key = keyOf(ref);
			let item = items.get(key);
			if (!item) {
				item = { name: written(ref), form: ref.form, count: 0, sources: [], seen: new Set() };
				items.set(key, item);
			}
			item.count++;
			const id = Number(row.id);
			if (!item.seen.has(id)) {
				item.seen.add(id);
				item.sources.push({
					id,
					type: String(row.type),
					title: String(row.title),
					visibility: String(row.visibility),
					path: pathOf(row)
				});
			}
		}
	}
	const list = [...items.values()]
		.map(({ seen: _seen, ...item }) => item) // eslint-disable-line no-unused-vars
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
	return { items: list, scanned: rows.length, truncated, references };
}
