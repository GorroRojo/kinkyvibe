/**
 * Los ids de los eventos con una dirección de página (la del .md importado,
 * `content_sources.legacy_slug`, o, si no tiene, la del objeto: `coalesce(cs.legacy_slug, ev.slug)`),
 * como subconsulta (una columna, `id`) para `ev.id IN (…)` o para empezar la consulta por ahí.
 *
 * Es la misma regla que comparar `coalesce(cs.legacy_slug, ev.slug) = ?`, pero en dos búsquedas
 * por índice unidas con `UNION ALL` (el `UNIQUE (category, legacy_slug)` de `content_sources` y el
 * `UNIQUE (type, slug)` de `objects`): comparar la expresión obligaba a recorrer todos los eventos.
 *
 * @param {string} param el parámetro con la dirección (`?1`)
 * @returns {string}
 */
export const eventIdsWithSlugSql = (param) =>
	`SELECT slug_cs.object_id AS id FROM content_sources slug_cs
		WHERE slug_cs.category = 'calendario' AND slug_cs.legacy_slug = ${param}
	UNION ALL
	SELECT slug_ev.id FROM objects slug_ev
		WHERE slug_ev.type = 'evento' AND slug_ev.slug = ${param}
			AND NOT EXISTS (SELECT 1 FROM content_sources slug_c2
				WHERE slug_c2.object_id = slug_ev.id AND slug_c2.category = 'calendario')`;
