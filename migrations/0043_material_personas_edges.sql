-- Migration number: 0043 	 Personas del material como edges `persona` (como los eventos en 0035).
--
-- Regla 4 de docs/objetos.md: las relaciones son edges, nunca ids ni direcciones dentro del JSON.
-- Es el paso 2 de la migración 0035 (personas de los eventos), ahora para el material:
--
-- En cada material, los perfiles de `data.personas` (`{ "profile": "<dirección>", "role": "…" }`)
-- que son de un perfil vivo pasan a un edge `persona` por perfil, con
-- `data: {"roles": [...], "at": [...]}` (cada rol y su lugar en la lista). Lo demás (nombres sin
-- perfil, o una dirección que no es de ningún perfil vivo) queda en `data.personas`, en orden; si
-- no queda nada, sin `personas`. Lo guardado con la forma de antes de la lista única (`authors` +
-- `extra.personas`) pasa a la lista única primero, como al guardarlo (`reshapePersonas` de
-- src/lib/utils/personasList.js; en el material, `authors` es el rol Autore). Cada material que
-- cambia:
-- - sube `version` en 1 (el trigger de 0012 lo exige) y deja su versión en `object_revisions`
--   (`source = 'migracion'`), como todo guardado;
-- - si se importó de un .md y nadie lo había editado (`content_sources.imported_version` = su
--   versión), sigue contando como no editado (volver a importar lo sigue actualizando).
-- No se toca: un material que ya tiene algún edge `persona` (lo guardó el código nuevo), uno sin
-- ningún perfil vivo, uno cuyo `data` no es JSON válido, ni uno cuya lista única tiene una fila
-- que el tipo no acepta (no es `{ profile o name, role }`: la marca el chequeo nocturno). Correrla
-- dos veces no cambia nada la segunda.
--
-- Lo que se ve no cambia: el código lee los edges y arma la misma lista, en el mismo orden
-- (src/lib/server/contenido/personasEdges.js).
--
-- ORDEN: como la 0035 y la 0042, esta migración necesita el código de su PR: con el código
-- anterior las páginas del material leen las personas solo del JSON (se perderían los perfiles que
-- pasan a edges). Primero el deploy del PR y JUSTO DESPUÉS esta migración (primero en preview), no
-- antes: es la excepción a docs/decisiones/0028-migraciones-antes-del-merge.md. Entre el deploy y
-- la migración todo se ve igual (el código nuevo lee la lista del JSON tal cual mientras no haya
-- edges).

-- Tabla de trabajo (se borra al final): la lista única de cada material, una fila por persona.
CREATE TABLE m0043_personas (
	object_id INTEGER NOT NULL,
	src INTEGER NOT NULL, -- orden de origen
	profile TEXT,
	name TEXT,
	role TEXT,
	bad INTEGER NOT NULL DEFAULT 0, -- una fila de la lista única que el tipo no acepta
	pos INTEGER, -- lugar en la lista única (desde 0)
	profile_id INTEGER -- el perfil vivo con esa dirección, si hay
);

-- La lista única (`data.personas`), tal cual. `v`: la fila si es un objeto (si no, `{}`, para no
-- leer como JSON un texto suelto).
INSERT INTO m0043_personas (object_id, src, profile, name, role, bad)
SELECT id, src,
	CASE WHEN json_type(v, '$.profile') = 'text' THEN json_extract(v, '$.profile') END,
	CASE WHEN json_type(v, '$.name') = 'text' THEN json_extract(v, '$.name') END,
	CASE WHEN json_type(v, '$.role') = 'text' THEN json_extract(v, '$.role') END,
	CASE WHEN jt != 'object'
		OR json_type(v, '$.role') IS NOT 'text'
		OR trim(json_extract(v, '$.role')) = ''
		OR (json_type(v, '$.profile') IS NULL) = (json_type(v, '$.name') IS NULL)
		OR coalesce(json_type(v, '$.profile'), json_type(v, '$.name')) != 'text'
		OR trim(coalesce(json_extract(v, '$.profile'), json_extract(v, '$.name'))) = ''
		OR EXISTS (SELECT 1 FROM json_each(v) k WHERE k.key NOT IN ('profile', 'name', 'role'))
	THEN 1 ELSE 0 END
FROM (
	SELECT o.id AS id, j.key AS src, j.type AS jt,
		CASE WHEN j.type = 'object' THEN j.value ELSE '{}' END AS v
	FROM objects o, json_each(o.data, '$.personas') j
	WHERE o.type = 'material' AND json_valid(o.data) AND json_type(o.data, '$.personas') = 'array'
);

-- La forma de antes: `authors` (rol Autore) y después `extra.personas` (`perfil`/`nombre`, `rol`),
-- sin espacios de más y sin las filas vacías (como `personasForData`).
INSERT INTO m0043_personas (object_id, src, profile, name, role)
SELECT o.id, j.key, NULL, trim(j.value), 'Autore'
FROM objects o, json_each(o.data, '$.authors') j
WHERE o.type = 'material' AND json_valid(o.data) AND json_type(o.data, '$.personas') IS NULL
	AND json_type(o.data, '$.authors') = 'array' AND j.type = 'text';

INSERT INTO m0043_personas (object_id, src, profile, name, role)
SELECT o.id,
	coalesce(json_array_length(o.data, '$.authors'), 0) + j.key,
	CASE WHEN NOT (json_type(j.value, '$.perfil') IS NULL AND json_type(j.value, '$.nombre') = 'text')
		THEN trim(coalesce(json_extract(j.value, '$.perfil'), '')) END,
	CASE WHEN json_type(j.value, '$.perfil') IS NULL AND json_type(j.value, '$.nombre') = 'text'
		THEN trim(json_extract(j.value, '$.nombre')) END,
	trim(coalesce(json_extract(j.value, '$.rol'), ''))
FROM objects o, json_each(o.data, '$.extra.personas') j
WHERE o.type = 'material' AND json_valid(o.data) AND json_type(o.data, '$.personas') IS NULL
	AND json_type(o.data, '$.extra.personas') = 'array' AND j.type = 'object';

-- Un material con alguna fila que el tipo no acepta no se toca (antes de limpiar las vacías de la
-- forma de antes, que `personasForData` saltea).
DELETE FROM m0043_personas
WHERE object_id IN (SELECT object_id FROM m0043_personas WHERE bad = 1);

DELETE FROM m0043_personas
WHERE role IS NULL OR role = '' OR (coalesce(profile, '') = '' AND coalesce(name, '') = '');

UPDATE m0043_personas SET profile = NULL WHERE profile = '';

-- El lugar de cada una en la lista.
UPDATE m0043_personas SET pos = (
	SELECT count(*) FROM m0043_personas p
	WHERE p.object_id = m0043_personas.object_id AND p.src < m0043_personas.src
);

-- Los perfiles vivos.
UPDATE m0043_personas SET profile_id = (
	SELECT p.id FROM objects p
	WHERE p.type = 'perfil' AND p.deleted_at IS NULL AND p.slug = m0043_personas.profile
) WHERE profile IS NOT NULL;

-- Solo los materiales con algún perfil vivo y sin edges `persona` todavía.
DELETE FROM m0043_personas
WHERE object_id NOT IN (SELECT object_id FROM m0043_personas WHERE profile_id IS NOT NULL)
	OR object_id IN (SELECT from_id FROM edges WHERE kind = 'persona');

-- Un edge por material y perfil, con sus roles y sus lugares (en el mismo orden en las dos listas).
INSERT INTO edges (from_id, kind, to_id, position, data, created_at, created_by)
SELECT object_id, 'persona', profile_id, min(pos),
	json_object('roles', json_group_array(role), 'at', json_group_array(pos)),
	CAST(unixepoch('now') AS INTEGER) * 1000, 'migracion-0043'
FROM (SELECT * FROM m0043_personas WHERE profile_id IS NOT NULL ORDER BY object_id, profile_id, pos)
GROUP BY object_id, profile_id
ON CONFLICT (from_id, kind, to_id) DO NOTHING;

-- Si nadie había editado el material importado, sigue sin editar (antes de subir la versión).
UPDATE content_sources SET imported_version = imported_version + 1
WHERE object_id IN (SELECT object_id FROM m0043_personas)
	AND imported_version = (SELECT version FROM objects WHERE id = content_sources.object_id);

-- `data.personas` sin los perfiles que ahora son edges (y sin la forma de antes).
UPDATE objects SET
	data = (
		WITH base AS (
			SELECT CASE
				WHEN json_type(objects.data, '$.personas') = 'array' THEN objects.data
				WHEN json_extract(json_remove(objects.data, '$.authors', '$.extra.personas'), '$.extra') = '{}'
					THEN json_remove(objects.data, '$.authors', '$.extra.personas', '$.extra')
				ELSE json_remove(objects.data, '$.authors', '$.extra.personas')
			END AS d
		),
		kept AS (
			SELECT CASE WHEN m.profile IS NOT NULL
				THEN json_object('profile', m.profile, 'role', m.role)
				ELSE json_object('name', m.name, 'role', m.role) END AS item
			FROM m0043_personas m
			WHERE m.object_id = objects.id AND m.profile_id IS NULL
			ORDER BY m.pos
		)
		SELECT CASE WHEN (SELECT count(*) FROM kept) = 0
			THEN json_remove((SELECT d FROM base), '$.personas')
			ELSE json_set((SELECT d FROM base), '$.personas',
				json((SELECT json_group_array(json(item)) FROM kept)))
		END
	),
	version = version + 1
WHERE id IN (SELECT object_id FROM m0043_personas);

-- El historial, como cada guardado.
INSERT INTO object_revisions (object_id, version, slug, title, data, visibility, deleted_at,
	saved_at, saved_by, source)
SELECT id, version, slug, title, data, visibility, deleted_at,
	CAST(unixepoch('now') AS INTEGER) * 1000, 'migracion-0043', 'migracion'
FROM objects WHERE id IN (SELECT object_id FROM m0043_personas);

DROP TABLE m0043_personas;
