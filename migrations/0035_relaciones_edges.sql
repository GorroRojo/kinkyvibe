-- Migration number: 0035 	 Relaciones de los eventos como edges: «sucede en» (lugar) y personas con rol.
--
-- Regla 4 de docs/objetos.md: las relaciones son edges, nunca ids ni direcciones dentro del JSON.
-- Decisión de gorrite («Contenido solo en la base», paso 3). Pasa a edges lo que ya hay:
--
-- 1. «Sucede en»: cada fila de `event_venues` (0017, 0027) cuyo evento está en la base pasa a un
--    edge `lugar` (evento → perfil del lugar), con el nivel propio del evento en `edges.data`
--    (`{"privacy": "name"}`; sin nivel propio, sin `data`), y la misma fecha y autore del vínculo.
--    La tabla queda (las migraciones solo agregan) pero el código ya no la usa; solo la lee la
--    importación de un evento que recién entra a la base (src/lib/server/contenido/importer.js,
--    `legacyVenueEdge`). Un evento que ya tiene edge `lugar` no se toca.
-- 2. Personas: en cada evento, los perfiles de `data.personas` (`{ "profile": "<dirección>",
--    "role": "…" }`) que son de un perfil vivo pasan a un edge `persona` por perfil, con
--    `data: {"roles": [...], "at": [...]}` (cada rol y su lugar en la lista). Lo demás (nombres sin
--    perfil, o una dirección que no es de ningún perfil vivo) queda en `data.personas`, en orden;
--    si no queda nada, sin `personas`. Lo guardado con la forma de antes de la lista única
--    (`authors` + `extra.personas`) pasa a la lista única primero, como al guardarlo
--    (`reshapePersonas` de src/lib/utils/personasList.js). Cada evento que cambia:
--    - sube `version` en 1 (el trigger de 0012 lo exige) y deja su versión en `object_revisions`
--      (`source = 'migracion'`), como todo guardado;
--    - si se importó de un .md y nadie lo había editado (`content_sources.imported_version` =
--      su versión), sigue contando como no editado (volver a importar lo sigue actualizando).
--    Un evento que ya tiene algún edge `persona` (lo guardó el código nuevo) no se toca.
--
-- Lo que se ve no cambia: el código lee los edges y arma la misma lista y el mismo lugar
-- (src/lib/server/contenido/personasEdges.js, src/lib/server/amigues/venues.js). El material
-- todavía guarda sus personas en `data.personas` (otro paso).
--
-- ORDEN: esta migración necesita el código de su PR. Con el código anterior las páginas leen las
-- personas del JSON (se perderían los perfiles) y el lugar de `event_venues` (que deja de
-- actualizarse). Aplicarla JUSTO DESPUÉS del deploy del PR (primero en preview), no antes: es la
-- excepción a docs/decisiones/0028-migraciones-antes-del-merge.md. Entre el deploy y la migración
-- los eventos se ven sin lugar vinculado (muestran el «Dónde» de su .md) y las personas se ven bien.

-- 1. «Sucede en» → edges `lugar`.
-- La dirección del evento es la de su página: la del .md importado (`content_sources`) o, si no
-- se importó de un .md, la del objeto.
INSERT INTO edges (from_id, kind, to_id, position, data, created_at, created_by)
SELECT ev.id, 'lugar', v.venue_id, 0,
	CASE WHEN v.privacy IS NULL THEN NULL ELSE json_object('privacy', v.privacy) END,
	v.created_at, v.created_by
FROM event_venues v
JOIN objects ev ON ev.type = 'evento' AND ev.id = coalesce(
	(SELECT s.object_id FROM content_sources s JOIN objects o ON o.id = s.object_id
		WHERE o.type = 'evento' AND s.category = 'calendario' AND s.legacy_slug = v.event_slug),
	(SELECT o.id FROM objects o WHERE o.type = 'evento' AND o.slug = v.event_slug
		AND NOT EXISTS (SELECT 1 FROM content_sources s WHERE s.object_id = o.id
			AND s.category = 'calendario'))
)
WHERE ev.id != v.venue_id
	AND NOT EXISTS (SELECT 1 FROM edges x WHERE x.from_id = ev.id AND x.kind = 'lugar')
ON CONFLICT (from_id, kind, to_id) DO NOTHING;

-- 2. Personas → edges `persona`. Tabla de trabajo (se borra al final): la lista única de cada
-- evento, una fila por persona.
CREATE TABLE m0035_personas (
	object_id INTEGER NOT NULL,
	src INTEGER NOT NULL, -- orden de origen
	profile TEXT,
	name TEXT,
	role TEXT,
	pos INTEGER, -- lugar en la lista única (desde 0)
	profile_id INTEGER -- el perfil vivo con esa dirección, si hay
);

-- La lista única (`data.personas`), tal cual.
INSERT INTO m0035_personas (object_id, src, profile, name, role)
SELECT o.id, j.key,
	CASE WHEN json_type(j.value, '$.profile') = 'text' THEN json_extract(j.value, '$.profile') END,
	CASE WHEN json_type(j.value, '$.name') = 'text' THEN json_extract(j.value, '$.name') END,
	CASE WHEN json_type(j.value, '$.role') = 'text' THEN json_extract(j.value, '$.role') END
FROM objects o, json_each(o.data, '$.personas') j
WHERE o.type = 'evento' AND json_valid(o.data) AND json_type(o.data, '$.personas') = 'array'
	AND j.type = 'object';

-- La forma de antes: `authors` (rol Organiza) y después `extra.personas` (`perfil`/`nombre`, `rol`),
-- sin espacios de más y sin las filas vacías (como `personasForData`).
INSERT INTO m0035_personas (object_id, src, profile, name, role)
SELECT o.id, j.key, NULL, trim(j.value), 'Organiza'
FROM objects o, json_each(o.data, '$.authors') j
WHERE o.type = 'evento' AND json_valid(o.data) AND json_type(o.data, '$.personas') IS NULL
	AND json_type(o.data, '$.authors') = 'array' AND j.type = 'text';

INSERT INTO m0035_personas (object_id, src, profile, name, role)
SELECT o.id,
	coalesce(json_array_length(o.data, '$.authors'), 0) + j.key,
	CASE WHEN NOT (json_type(j.value, '$.perfil') IS NULL AND json_type(j.value, '$.nombre') = 'text')
		THEN trim(coalesce(json_extract(j.value, '$.perfil'), '')) END,
	CASE WHEN json_type(j.value, '$.perfil') IS NULL AND json_type(j.value, '$.nombre') = 'text'
		THEN trim(json_extract(j.value, '$.nombre')) END,
	trim(coalesce(json_extract(j.value, '$.rol'), ''))
FROM objects o, json_each(o.data, '$.extra.personas') j
WHERE o.type = 'evento' AND json_valid(o.data) AND json_type(o.data, '$.personas') IS NULL
	AND json_type(o.data, '$.extra.personas') = 'array' AND j.type = 'object';

DELETE FROM m0035_personas
WHERE role IS NULL OR role = '' OR (coalesce(profile, '') = '' AND coalesce(name, '') = '');

UPDATE m0035_personas SET profile = NULL WHERE profile = '';

-- El lugar de cada una en la lista.
UPDATE m0035_personas SET pos = (
	SELECT count(*) FROM m0035_personas p
	WHERE p.object_id = m0035_personas.object_id AND p.src < m0035_personas.src
);

-- Los perfiles vivos.
UPDATE m0035_personas SET profile_id = (
	SELECT p.id FROM objects p
	WHERE p.type = 'perfil' AND p.deleted_at IS NULL AND p.slug = m0035_personas.profile
) WHERE profile IS NOT NULL;

-- Solo los eventos con algún perfil vivo y sin edges `persona` todavía.
DELETE FROM m0035_personas
WHERE object_id NOT IN (SELECT object_id FROM m0035_personas WHERE profile_id IS NOT NULL)
	OR object_id IN (SELECT from_id FROM edges WHERE kind = 'persona');

-- Un edge por evento y perfil, con sus roles y sus lugares (en el mismo orden en las dos listas).
INSERT INTO edges (from_id, kind, to_id, position, data, created_at, created_by)
SELECT object_id, 'persona', profile_id, min(pos),
	json_object('roles', json_group_array(role), 'at', json_group_array(pos)),
	CAST(unixepoch('now') AS INTEGER) * 1000, 'migracion-0035'
FROM m0035_personas
WHERE profile_id IS NOT NULL
GROUP BY object_id, profile_id
ON CONFLICT (from_id, kind, to_id) DO NOTHING;

-- Si nadie había editado el evento importado, sigue sin editar (antes de subir la versión).
UPDATE content_sources SET imported_version = imported_version + 1
WHERE object_id IN (SELECT object_id FROM m0035_personas)
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
			FROM m0035_personas m
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
WHERE id IN (SELECT object_id FROM m0035_personas);

-- El historial, como cada guardado.
INSERT INTO object_revisions (object_id, version, slug, title, data, visibility, deleted_at,
	saved_at, saved_by, source)
SELECT id, version, slug, title, data, visibility, deleted_at,
	CAST(unixepoch('now') AS INTEGER) * 1000, 'migracion-0035', 'migracion'
FROM objects WHERE id IN (SELECT object_id FROM m0035_personas);

DROP TABLE m0035_personas;
