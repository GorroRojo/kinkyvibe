-- Migration number: 0073 	 2026-11-03T12:00:00.000Z
-- Conector de Claude: deshacer (docs/conector-claude.md, «Deshacer»). Creada con
-- `npm run db:migrations:new`.
--
-- - `object_revisions.edges`: cada versión del historial guarda también las relaciones del
--   objeto como quedaron al guardar (etiquetas, personas con perfil, imagen, lugar…): una lista
--   JSON de `{ kind, to, position, data, slug, key }` (`slug` y `key`: la dirección y, si es una
--   etiqueta, el nombre del objeto al que apunta, en ese momento). Hasta ahora el historial
--   guardaba solo los datos, el título y la visibilidad, así que volver a una versión vieja no
--   podía devolver las etiquetas ni la imagen. Vacía (NULL) en lo guardado antes de esta
--   migración.
-- - La versión actual de cada evento, material, perfil y etiqueta queda en el historial con sus
--   relaciones: si ya estaba, se le completan las relaciones; si no estaba (los perfiles y las
--   etiquetas que el panel guardaba sin historial), se agrega con quién y cuándo la guardó
--   (`source` = 'migracion'). Así lo primero que se cambie después de esta migración se puede
--   deshacer.
--
-- Solo agrega una columna que puede quedar vacía y filas al historial: anda con el código de
-- `main`, que no la lee ni la escribe (decisión 0028). Lo que `main` guarde entre esta migración y
-- el deploy queda sin relaciones en el historial (como todo lo de antes). Correrla dos veces: el
-- ALTER falla la segunda (como toda migración aplicada); las otras dos sentencias no cambian nada.
ALTER TABLE object_revisions ADD COLUMN edges TEXT
	CHECK (edges IS NULL OR (json_valid(edges) AND json_type(edges) = 'array'));

UPDATE object_revisions
SET edges = (
	SELECT json_group_array(json_object('kind', e.kind, 'to', e.to_id, 'position', e.position,
		'data', json(e.data), 'slug', t.slug, 'key', json_extract(t.data, '$.key')))
	FROM (SELECT * FROM edges WHERE from_id = object_revisions.object_id
		ORDER BY kind, position, id) e
	JOIN objects t ON t.id = e.to_id
)
WHERE edges IS NULL
	AND EXISTS (
		SELECT 1 FROM objects o
		WHERE o.id = object_revisions.object_id AND o.version = object_revisions.version
			AND o.type IN ('evento', 'material', 'perfil', 'etiqueta')
	);

INSERT INTO object_revisions (object_id, version, slug, title, data, visibility, deleted_at,
	saved_at, saved_by, source, edges)
SELECT o.id, o.version, o.slug, o.title, o.data, o.visibility, o.deleted_at, o.updated_at,
	o.updated_by, 'migracion', (
		SELECT json_group_array(json_object('kind', e.kind, 'to', e.to_id, 'position', e.position,
			'data', json(e.data), 'slug', t.slug, 'key', json_extract(t.data, '$.key')))
		FROM (SELECT * FROM edges WHERE from_id = o.id ORDER BY kind, position, id) e
		JOIN objects t ON t.id = e.to_id
	)
FROM objects o
WHERE o.type IN ('evento', 'material', 'perfil', 'etiqueta')
	AND NOT EXISTS (
		SELECT 1 FROM object_revisions r WHERE r.object_id = o.id AND r.version = o.version
	);
