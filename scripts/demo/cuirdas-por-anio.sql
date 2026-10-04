-- Cuirdas Sudacas: una serie por año (hija de «Cuirdas Sudacas»), en la base de PREVIEWS.
--
-- NUNCA en la base de producción (`kinkyvibe`). Solo para probar en el preview, y solo con las
-- etiquetas ya importadas a la base (Etiquetas → «Importar a la base»). Los pasos para
-- producción, que se hacen desde el panel y no con este archivo, están en docs/etiquetas.md
-- («Series hijas: una por año»).
--
--   npx wrangler d1 execute <base-de-previews> --remote --file scripts/demo/cuirdas-por-anio.sql
--
-- (el nombre de la base de previews está en el bloque [previews] de wrangler.toml; copialo de
-- ahí o de `npx wrangler d1 list`, nunca a mano).
--
-- Qué hace (idempotente: correrlo dos veces no duplica nada):
-- 1. Crea las etiquetas «Cuirdas Sudacas 2025» y «Cuirdas Sudacas 2026» (objetos `etiqueta`, con
--    el ícono de la madre) como hijas de «Cuirdas Sudacas» (edge `hijo_de`). Si «Cuirdas Sudacas»
--    no está en la base (etiquetas sin importar), no hace nada.
-- 2. A cada edición de Cuirdas Sudacas que esté en la base (objetos `evento`: interruptor
--    `contenido_db` e importación de Contenido → En la base), le suma la etiqueta de su año
--    («Cuirdas Sudacas 2025» a las de junio de 2025, «Cuirdas Sudacas 2026» a las de julio de
--    2026). La etiqueta «Cuirdas Sudacas» queda: así la página de la serie madre sigue mostrando
--    todas las ediciones, como con «Picantearla» y sus hijas. Con los eventos solo en los `.md`,
--    este paso no hace nada (ver docs/etiquetas.md para etiquetarlos).
--
-- Excepción conocida: esto escribe en `objects` y `edges` sin pasar por saveObject() (la regla
-- de docs/objetos.md vale para el código del sitio; esto es un arreglo de datos del preview).
-- Por eso respeta lo mismo que saveObject(): `version` sube de a 1 (lo exige el trigger),
-- `updated_at`/`updated_by` se actualizan, no se toca `search_text` (las etiquetas no son parte de
-- la búsqueda de un evento) y no deja historial en `object_revisions` (el cambio se ve por
-- `updated_by = 'demo:cuirdas-por-anio'`). El chequeo nocturno no tiene nada que marcar: los
-- datos son los que el tipo acepta.

-- 1. Las series por año, hijas de «Cuirdas Sudacas».
INSERT OR IGNORE INTO objects (type, slug, title, data, search_text, visibility, version,
	created_at, created_by, updated_at, updated_by)
SELECT 'etiqueta', y.slug, y.key,
	json_object(
		'key', y.key,
		'icon', COALESCE(json_extract(p.data, '$.icon'), '🪢'),
		'description', y.description
	),
	y.key || char(10) || y.description,
	'public', 1,
	CAST(strftime('%s', 'now') AS INTEGER) * 1000, 'demo:cuirdas-por-anio',
	CAST(strftime('%s', 'now') AS INTEGER) * 1000, 'demo:cuirdas-por-anio'
FROM (
	SELECT 'cuirdas-sudacas-2025' AS slug, 'Cuirdas Sudacas 2025' AS key,
		'Las jornadas de Cuirdas Sudacas de 2025.' AS description
	UNION ALL
	SELECT 'cuirdas-sudacas-2026', 'Cuirdas Sudacas 2026',
		'Las jornadas de Cuirdas Sudacas de 2026.'
) AS y
JOIN objects AS p
	ON p.type = 'etiqueta' AND p.deleted_at IS NULL
	AND json_extract(p.data, '$.key') = 'Cuirdas Sudacas'
WHERE NOT EXISTS (
	SELECT 1 FROM objects AS o
	WHERE o.type = 'etiqueta' AND o.deleted_at IS NULL AND json_extract(o.data, '$.key') = y.key
);

-- La relación `hijo_de` (hija → madre), al final de las hijas de «Cuirdas Sudacas» (2025 y
-- después 2026).
INSERT OR IGNORE INTO edges (from_id, kind, to_id, position, data, created_at, created_by)
SELECT c.id, 'hijo_de', p.id, 0,
	json_object('orden', (
		SELECT COALESCE(MAX(CAST(json_extract(e.data, '$.orden') AS INTEGER)), -1) + 1
		FROM edges AS e
		WHERE e.to_id = p.id AND e.kind = 'hijo_de' AND e.from_id NOT IN (
			SELECT o.id FROM objects AS o
			WHERE o.type = 'etiqueta'
				AND json_extract(o.data, '$.key') IN ('Cuirdas Sudacas 2025', 'Cuirdas Sudacas 2026')
		)
	) + CAST(substr(json_extract(c.data, '$.key'), -4) AS INTEGER) - 2025),
	CAST(strftime('%s', 'now') AS INTEGER) * 1000, 'demo:cuirdas-por-anio'
FROM objects AS c
JOIN objects AS p
	ON p.type = 'etiqueta' AND p.deleted_at IS NULL
	AND json_extract(p.data, '$.key') = 'Cuirdas Sudacas'
WHERE c.type = 'etiqueta' AND c.deleted_at IS NULL
	AND json_extract(c.data, '$.key') IN ('Cuirdas Sudacas 2025', 'Cuirdas Sudacas 2026');

-- 2. Cada edición en la base suma la etiqueta de su año (si esa serie existe y no la tiene ya).
UPDATE objects
SET data = json_insert(data, '$.tags[#]',
		'Cuirdas Sudacas ' || substr(json_extract(data, '$.start'), 1, 4)),
	version = version + 1,
	updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
	updated_by = 'demo:cuirdas-por-anio'
WHERE type = 'evento' AND deleted_at IS NULL
	AND substr(json_extract(data, '$.start'), 1, 4) IN ('2025', '2026')
	AND EXISTS (
		SELECT 1 FROM json_each(objects.data, '$.tags') AS t WHERE t.value = 'Cuirdas Sudacas'
	)
	AND NOT EXISTS (
		SELECT 1 FROM json_each(objects.data, '$.tags') AS t
		WHERE t.value = 'Cuirdas Sudacas ' || substr(json_extract(objects.data, '$.start'), 1, 4)
	)
	AND EXISTS (
		SELECT 1 FROM objects AS s
		WHERE s.type = 'etiqueta' AND s.deleted_at IS NULL
			AND json_extract(s.data, '$.key') =
				'Cuirdas Sudacas ' || substr(json_extract(objects.data, '$.start'), 1, 4)
	);
