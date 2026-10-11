/**
 * Los vínculos de la metadata pública de un evento o un material: solo a objetos que ve cualquiera.
 *
 * La metadata de un post (`meta.personas` con `{ perfil, rol }` y `meta.tags` con los `key` de las
 * etiquetas) sale de los edges y de lo que quedó como texto en `data` (./personasEdges.js,
 * ./etiquetasEdges.js), que se leen sin mirar la visibilidad de la otra punta: así los necesita el
 * panel. Para lo público (las listas, las páginas, los JSON, la búsqueda), esa metadata pasa antes
 * por acá, con la misma regla que usan las páginas de esos objetos:
 *
 * - un perfil queda si lo ve cualquiera (`visibleWhere(ANON)`: ni oculto, ni solo con cuenta, ni
 *   borrado) y está aprobado (`PROFILE_APPROVED_SQL`, como /amigues). Un perfil no listado queda
 *   (se abre por su dirección). Si no, sale el ítem entero (ni la dirección ni su rol);
 * - una etiqueta queda si alguna etiqueta viva con ese `key` la ve cualquiera. Un `key` que no es
 *   de ninguna etiqueta (un texto suelto del post) queda tal cual: no apunta a nada.
 *
 * Se mira siempre como anónime, también si quien pide tiene cuenta: las listas se recuerdan para
 * todes (./posts.js) y las personas de una página ya se muestran como las ve cualquiera
 * (src/lib/server/personas/index.js). El panel y el editor no pasan por acá (leen con
 * ./repo.js): ven todo.
 */
import { ANON, visibleWhere } from '$lib/server/objects/visibility.js';
import { PROFILE_APPROVED_SQL } from '$lib/server/admin/cuentas.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * `profiles`: las direcciones de perfiles que ve cualquiera. `hiddenTags`: los `key` de etiquetas
 * que existen pero no ve cualquiera.
 * @typedef {{ profiles: ReadonlySet<string>, hiddenTags: ReadonlySet<string> }} PublicLinkTargets
 */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Pura: las direcciones de perfil y los `key` de etiqueta que nombra la metadata de un post.
 *
 * @param {Record<string, any>} meta
 * @returns {{ slugs: string[], keys: string[] }}
 */
export function linkRefsOf(meta) {
	const personas = Array.isArray(meta?.personas) ? meta.personas : [];
	const tags = Array.isArray(meta?.tags) ? meta.tags : [];
	return {
		slugs: personas.flatMap((p) => (isRecord(p) && typeof p.perfil === 'string' ? [p.perfil] : [])),
		keys: tags.filter((t) => typeof t === 'string')
	};
}

/**
 * Pura: la metadata sin los vínculos a lo que no ve cualquiera (ver arriba). Sin nada que sacar,
 * la misma metadata.
 *
 * @template {Record<string, any>} M
 * @param {M} meta
 * @param {PublicLinkTargets} targets
 * @returns {M}
 */
export function withPublicLinks(meta, targets) {
	/** @type {Record<string, any>} */
	const out = { ...meta };
	let changed = false;
	if (Array.isArray(meta.personas)) {
		const kept = meta.personas.filter(
			(p) => !(isRecord(p) && typeof p.perfil === 'string' && !targets.profiles.has(p.perfil))
		);
		if (kept.length !== meta.personas.length) {
			changed = true;
			if (kept.length) out.personas = kept;
			else delete out.personas;
		}
	}
	if (Array.isArray(meta.tags)) {
		const kept = meta.tags.filter((t) => !(typeof t === 'string' && targets.hiddenTags.has(t)));
		if (kept.length !== meta.tags.length) {
			changed = true;
			out.tags = kept;
		}
	}
	return changed ? /** @type {M} */ (out) : meta;
}

/**
 * Cuáles de esas direcciones son de perfiles que ve cualquiera y cuáles de esos `key` son de
 * etiquetas que no ve cualquiera. Una consulta para todo lo pedido (con `json_each`, sin tope de
 * parámetros).
 *
 * @param {D1Database} db
 * @param {{ slugs: Iterable<string>, keys: Iterable<string> }} refs
 * @returns {Promise<PublicLinkTargets>}
 */
export async function publicLinkTargets(db, refs) {
	const slugs = [...new Set(refs.slugs)];
	const keys = [...new Set(refs.keys)];
	/** @type {Set<string>} */
	const profiles = new Set();
	/** @type {Set<string>} */
	const hiddenTags = new Set();
	if (!slugs.length && !keys.length) return { profiles, hiddenTags };
	// Solo `?` sin número: visibleWhere agrega los suyos en el medio.
	const vo = visibleWhere(ANON, 'o');
	const vv = visibleWhere(ANON, 'v');
	const { results } = await db
		.prepare(
			`SELECT 'perfil' AS kind, o.slug AS ref FROM objects o
			WHERE o.type = 'perfil' AND o.slug IN (SELECT value FROM json_each(?))
				AND ${vo.sql} AND ${PROFILE_APPROVED_SQL}
			UNION
			SELECT 'etiqueta' AS kind, json_extract(o.data, '$.key') AS ref FROM objects o
			WHERE o.type = 'etiqueta'
				AND json_extract(o.data, '$.key') IN (SELECT value FROM json_each(?))
				AND NOT EXISTS (SELECT 1 FROM objects v WHERE v.type = 'etiqueta'
					AND json_extract(v.data, '$.key') = json_extract(o.data, '$.key') AND ${vv.sql})`
		)
		.bind(JSON.stringify(slugs), ...vo.params, JSON.stringify(keys), ...vv.params)
		.all();
	for (const r of results) {
		if (typeof r.ref !== 'string') continue;
		(r.kind === 'perfil' ? profiles : hiddenTags).add(r.ref);
	}
	return { profiles, hiddenTags };
}

/**
 * Las metadatas sin los vínculos a lo que no ve cualquiera (ver arriba), en el mismo orden. Una
 * consulta para todas (ninguna si no nombran perfiles ni etiquetas).
 *
 * @template {Record<string, any>} M
 * @param {D1Database} db
 * @param {readonly M[]} metas
 * @returns {Promise<M[]>}
 */
export async function publicLinksOf(db, metas) {
	const refs = metas.map(linkRefsOf);
	const slugs = refs.flatMap((r) => r.slugs);
	const keys = refs.flatMap((r) => r.keys);
	if (!slugs.length && !keys.length) return [...metas];
	const targets = await publicLinkTargets(db, { slugs, keys });
	return metas.map((m) => withPublicLinks(m, targets));
}
