/**
 * «Lo que enlaza acá» (docs/enlaces.md, plan `enlaces-lo-que-enlaza`): en la página de un evento, un
 * material, un perfil o una entrada de la Kinkipedia, los objetos cuyo cuerpo la enlaza (edges
 * `enlaza` que llegan, src/lib/server/objects/enlaces.js). Detrás del interruptor `lo_que_enlaza`.
 *
 * Quién ve qué (docs/enlaces.md, «Quién puede ver qué»): un edge sale solo si quien mira ve **las
 * dos** puntas, con la misma regla que el resto del sitio (`visibleWhere`, `partVisibleWhere` para
 * las partes de un taller y, en los perfiles, además aprobados y no ocultos, `shownProfileSql`,
 * como /amigues). Lo no listado (`unlisted`: se abre con el link, no aparece en listas) tampoco
 * sale, salvo para admins: esto es una lista.
 *
 * Caché: la consulta es de cada pedido y con quien mira; nada de esto se recuerda entre pedidos.
 * La caché de 1 minuto de las páginas (src/lib/server/edgeCache.js) guarda solo pedidos sin
 * cookies, o sea anónimes: esa página lleva solo lo que ve cualquiera (público → público).
 *
 * Una consulta por página, por la dirección de la página (sin esperar a saber su id): con las
 * tandas automáticas sale en la misma ida que lo demás (src/lib/server/db/autoBatch.js).
 */
import { getDB } from '$lib/server/db';
import { isFlagOn } from '$lib/server/flags.js';
import { isAdmin, partVisibleWhere, visibleWhere } from '$lib/server/objects/visibility.js';
import { ENLAZA_EDGE } from '$lib/server/objects/enlaces.js';
import { shownProfileSql, viewerFor } from '$lib/server/amigues/profiles.js';
import { tagPagePath } from '$lib/utils/series.js';
import { argDateShort } from '$lib/utils/dates.js';
import { contentIdFrom } from './posts.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/visibility.js').Viewer} Viewer */

/** Como mucho esto por página. */
export const LINKS_HERE_MAX = 50;

/**
 * Lo que la página sabe de sí misma: su categoría y dirección (evento o material), la dirección
 * de /amigues o el `key` de la etiqueta (/wiki).
 *
 * @typedef {{ category: 'calendario' | 'material', slug: string }
 *   | { profile: string }
 *   | { tag: string }} LinksHereTarget
 */

/**
 * Un objeto que enlaza acá, listo para la página. `date`: la fecha de un evento («12 ene 2024»: las
 * ediciones de una serie suelen tener el mismo título), si no `''`.
 * @typedef {{ type: string, title: string, path: string, date: string }} LinkHere
 */

/**
 * El id (o los ids) de la página, como subconsulta: solo `?` sin número.
 *
 * @param {LinksHereTarget} target
 * @returns {{ sql: string, params: string[] } | null}
 */
function targetIds(target) {
	if ('category' in target) return contentIdFrom(target.category, target.slug);
	if ('profile' in target) {
		// Como resolveProfileSlug: primero la dirección vieja de la ficha, después la del objeto.
		return {
			sql: `SELECT id FROM (
				SELECT o.id, 0 AS pri FROM profile_sources ps JOIN objects o ON o.id = ps.profile_id
				WHERE o.type = 'perfil' AND ps.legacy_slug = ?
				UNION ALL
				SELECT o.id, 1 AS pri FROM objects o WHERE o.type = 'perfil' AND o.slug = ?
			) ORDER BY pri LIMIT 1`,
			params: [target.profile, target.profile]
		};
	}
	// La etiqueta y sus alias (un `[[alias]]` apunta al alias, que lleva a la misma página).
	return {
		sql: `SELECT t.id FROM objects t WHERE t.type = 'etiqueta' AND t.deleted_at IS NULL
				AND json_extract(t.data, '$.key') = ?
			UNION
			SELECT a.from_id FROM edges a JOIN objects t ON t.id = a.to_id
			WHERE a.kind = 'alias_de' AND t.type = 'etiqueta' AND t.deleted_at IS NULL
				AND json_extract(t.data, '$.key') = ?`,
		params: [target.tag, target.tag]
	};
}

/** @type {Record<string, string>} */
const PATH_PREFIX = { evento: '/calendario/', material: '/material/', perfil: '/amigues/' };

/**
 * La dirección de la página pública de un objeto (la vieja del .md o de la ficha si tiene): `type`,
 * `slug`, `legacy` y, de una etiqueta, `key`. También la usa ./enlacesFalta.js.
 *
 * @param {Record<string, unknown>} r
 * @returns {string | null}
 */
export function pathOf(r) {
	if (r.type === 'etiqueta') return typeof r.key === 'string' ? tagPagePath(r.key) : null;
	const prefix = PATH_PREFIX[String(r.type)];
	if (!prefix) return null;
	return prefix + encodeURIComponent(String(r.legacy || r.slug));
}

/**
 * Los objetos que enlazan a la página y que quien mira puede ver (ver arriba), por título.
 *
 * @param {D1Database} db
 * @param {Viewer} viewer
 * @param {LinksHereTarget} target
 * @returns {Promise<LinkHere[]>}
 */
export async function linksHereFor(db, viewer, target) {
	const ids = targetIds(target);
	if (!ids) return [];
	const vt = visibleWhere(viewer, 't');
	const vs = visibleWhere(viewer, 's');
	const part = partVisibleWhere(viewer, 's');
	const unlisted = isAdmin(viewer)
		? ''
		: `AND coalesce(json_extract(s.data, '$.unlisted'), 0) NOT IN (1, 'true')`;
	const { results } = await db
		.prepare(
			`SELECT s.id, s.type, s.slug, s.title,
				CASE WHEN s.type = 'etiqueta' THEN json_extract(s.data, '$.key') END AS key,
				CASE WHEN s.type = 'evento' THEN json_extract(s.data, '$.start') END AS start,
				coalesce(cs.legacy_slug, ps.legacy_slug) AS legacy
			FROM edges e
			JOIN objects t ON t.id = e.to_id
			JOIN objects s ON s.id = e.from_id
			LEFT JOIN content_sources cs ON cs.object_id = s.id
			LEFT JOIN profile_sources ps ON s.type = 'perfil' AND ps.profile_id = s.id
			WHERE e.kind = ? AND e.to_id IN (${ids.sql}) AND e.from_id != e.to_id
				AND ${vt.sql} AND (t.type != 'perfil' OR ${shownProfileSql('t')})
				AND ${vs.sql} AND ${part.sql} AND (s.type != 'perfil' OR ${shownProfileSql('s')})
				${unlisted}
			GROUP BY s.id
			ORDER BY lower(s.title), start, s.id
			LIMIT ${LINKS_HERE_MAX}`
		)
		.bind(ENLAZA_EDGE, ...ids.params, ...vt.params, ...vs.params, ...part.params)
		.all();
	return results.flatMap((r) => {
		const path = pathOf(r);
		if (!path) return [];
		const date = typeof r.start === 'string' ? argDateShort(r.start) : '';
		return [{ type: String(r.type), title: String(r.title), path, date }];
	});
}

/**
 * Para los loads de las páginas: «Lo que enlaza acá» de la página como la ve quien pide, o `null`
 * si el interruptor está apagado (o no hay base). Pedila a la par de la lectura de la página (no
 * después): así sale en la misma ida. Nunca tira: si falla, `null` y la página sale sin la sección.
 *
 * @param {App.Platform | undefined} platform
 * @param {App.Locals} locals
 * @param {LinksHereTarget} target
 * @returns {Promise<LinkHere[] | null>}
 */
export function linksHere(platform, locals, target) {
	const db = getDB(platform);
	if (!db) return Promise.resolve(null);
	return isFlagOn(db, 'lo_que_enlaza')
		.then((on) => (on ? linksHereFor(db, viewerFor(locals), target) : null))
		.catch((error) => {
			console.error('[lo que enlaza acá]', error);
			return null;
		});
}
