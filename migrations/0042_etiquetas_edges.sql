-- Migration number: 0042 	 Etiquetas de los eventos y del material como edges `etiqueta`.
--
-- Regla 4 de docs/objetos.md: las relaciones son edges, nunca ids ni nombres de otros objetos
-- dentro del JSON (plan «Etiquetas de los eventos», docs/objetos.md). Pasa a edges lo que ya hay:
--
-- En cada evento y cada material, cada nombre de `data.tags` que es el `key` de una etiqueta viva
-- (objeto `etiqueta` sin borrar; un alias es una etiqueta más y se apunta a él tal cual, sin
-- seguir `alias_de`) pasa a un edge `etiqueta` (post → etiqueta), uno por etiqueta, con
-- `data: {"at": [...]}` (su lugar en la lista; varios si la lista la repite) y `position` en el
-- orden de la lista. Lo demás (nombres que no son de ninguna etiqueta viva) queda en `data.tags`,
-- en orden; si no queda nada, sin `tags`. Cada post que cambia:
-- - sube `version` en 1 (el trigger de 0012 lo exige) y deja su versión en `object_revisions`
--   (`source = 'migracion'`), como todo guardado;
-- - si se importó de un .md y nadie lo había editado (`content_sources.imported_version` = su
--   versión), sigue contando como no editado (volver a importar lo sigue actualizando).
-- No se toca: un post que ya tiene algún edge `etiqueta` (lo guardó el código nuevo), uno cuyo
-- `data` no es JSON válido, ni uno cuya lista tiene algo que no es texto (datos que el tipo no
-- acepta: los marca el chequeo nocturno). Correrla dos veces no cambia nada la segunda.
--
-- Lo que se ve no cambia: el código lee los edges y arma la misma lista, en el mismo orden
-- (src/lib/server/contenido/etiquetasEdges.js).
--
-- ORDEN: como la 0035, esta migración necesita el código de su PR: con el código anterior las
-- páginas leen las etiquetas solo del JSON (se perderían las que pasan a edges). Aplicarla JUSTO
-- DESPUÉS del deploy del PR (primero en preview), no antes: es la excepción a
-- docs/decisiones/0028-migraciones-antes-del-merge.md. Entre el deploy y la migración todo se ve
-- igual (el código nuevo lee las listas del JSON tal cual mientras no haya edges).

-- Tabla de trabajo (se borra al final): la lista de cada post, una fila por nombre.
CREATE TABLE m0042_tags (
	object_id INTEGER NOT NULL,
	pos INTEGER NOT NULL, -- lugar en la lista (desde 0)
	key TEXT,
	tag_id INTEGER -- la etiqueta viva con ese `key`, si hay
);

INSERT INTO m0042_tags (object_id, pos, key)
SELECT o.id, j.key, CASE WHEN j.type = 'text' THEN j.value END
FROM objects o, json_each(o.data, '$.tags') j
WHERE o.type IN ('evento', 'material') AND json_valid(o.data)
	AND json_type(o.data, '$.tags') = 'array';

-- Las etiquetas vivas (por el índice único de `key`, migración 0029).
UPDATE m0042_tags SET tag_id = (
	SELECT t.id FROM objects t
	WHERE t.type = 'etiqueta' AND t.deleted_at IS NULL AND json_extract(t.data, '$.key') = m0042_tags.key
) WHERE key IS NOT NULL;

-- Solo los posts con alguna etiqueta viva, con una lista de puro texto y sin edges `etiqueta`
-- todavía.
DELETE FROM m0042_tags
WHERE object_id NOT IN (SELECT object_id FROM m0042_tags WHERE tag_id IS NOT NULL)
	OR object_id IN (SELECT object_id FROM m0042_tags WHERE key IS NULL)
	OR object_id IN (SELECT from_id FROM edges WHERE kind = 'etiqueta');

-- Un edge por post y etiqueta, con sus lugares en orden.
INSERT INTO edges (from_id, kind, to_id, position, data, created_at, created_by)
SELECT object_id, 'etiqueta', tag_id, min(pos),
	json_object('at', json_group_array(pos)),
	CAST(unixepoch('now') AS INTEGER) * 1000, 'migracion-0042'
FROM (SELECT * FROM m0042_tags WHERE tag_id IS NOT NULL ORDER BY object_id, tag_id, pos)
GROUP BY object_id, tag_id
ON CONFLICT (from_id, kind, to_id) DO NOTHING;

-- Si nadie había editado el post importado, sigue sin editar (antes de subir la versión).
UPDATE content_sources SET imported_version = imported_version + 1
WHERE object_id IN (SELECT object_id FROM m0042_tags)
	AND imported_version = (SELECT version FROM objects WHERE id = content_sources.object_id);

-- `data.tags` sin las etiquetas que ahora son edges.
UPDATE objects SET
	data = (
		WITH kept AS (
			SELECT m.key FROM m0042_tags m
			WHERE m.object_id = objects.id AND m.tag_id IS NULL
			ORDER BY m.pos
		)
		SELECT CASE WHEN (SELECT count(*) FROM kept) = 0
			THEN json_remove(objects.data, '$.tags')
			ELSE json_set(objects.data, '$.tags', json((SELECT json_group_array(key) FROM kept)))
		END
	),
	version = version + 1
WHERE id IN (SELECT object_id FROM m0042_tags);

-- El historial, como cada guardado.
INSERT INTO object_revisions (object_id, version, slug, title, data, visibility, deleted_at,
	saved_at, saved_by, source)
SELECT id, version, slug, title, data, visibility, deleted_at,
	CAST(unixepoch('now') AS INTEGER) * 1000, 'migracion-0042', 'migracion'
FROM objects WHERE id IN (SELECT object_id FROM m0042_tags);

DROP TABLE m0042_tags;
