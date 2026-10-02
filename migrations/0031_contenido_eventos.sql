-- Migration number: 0031 	 Contenido a la base, primera parte: eventos (paso 5 de la decisión 0026).
--
-- Los eventos (src/lib/posts/calendario/*.md) pasan a ser objetos `evento`
-- (src/lib/server/objects/types/evento.js), que se escriben SOLO con saveObject(). Esto agrega lo
-- que hace falta alrededor y no cambia nada de lo que existe:
-- - columnas generadas (virtuales: no ocupan lugar ni se escriben) e índices para lo que las
--   páginas filtran u ordenan (docs/objetos.md: «se promueve a columna con una migración»);
-- - de qué .md salió cada objeto importado (`content_sources`);
-- - el historial de cada guardado (`object_revisions`, decisión 0004: «historial: todo, para
--   siempre»).
-- Todo se usa recién con el interruptor `contenido_db` prendido o al importar desde el panel
-- (Contenido → En la base). Ver docs/contenido.md («En la base»).
--
-- El código de `main` no lee nada de esto: se puede aplicar antes del merge
-- (docs/decisiones/0028-migraciones-antes-del-merge.md). El backup ya sabe saltear las columnas
-- generadas (src/lib/server/backup/dump.js, `table_xinfo`).

-- Cuándo empieza y termina un evento, en ms desde epoch (como created_at). `start`/`end` se guardan
-- con su zona («2026-10-02T20:00-03:00»): comparar el texto ordenaría mal si cambiara la zona.
-- NULL para los demás tipos.
ALTER TABLE objects ADD COLUMN start_at INTEGER GENERATED ALWAYS AS (
	CASE WHEN type = 'evento' THEN unixepoch(json_extract(data, '$.start')) * 1000 END
) VIRTUAL;

ALTER TABLE objects ADD COLUMN end_at INTEGER GENERATED ALWAYS AS (
	CASE WHEN type = 'evento' THEN unixepoch(json_extract(data, '$.end')) * 1000 END
) VIRTUAL;

-- Estado del evento (anunciado, abierto, agotadas, cancelado).
ALTER TABLE objects ADD COLUMN event_status TEXT GENERATED ALWAYS AS (
	CASE WHEN type = 'evento' THEN json_extract(data, '$.status') END
) VIRTUAL;

-- «No listado» (se ve con el link, no aparece en las listas): `force_unlisted` de los .md. Para
-- cualquier tipo que tenga el campo `unlisted` (eventos, material, perfiles).
ALTER TABLE objects ADD COLUMN unlisted INTEGER GENERATED ALWAYS AS (
	CASE WHEN json_extract(data, '$.unlisted') = 1 THEN 1 ELSE 0 END
) VIRTUAL;

-- El calendario: los eventos vivos por fecha (próximos, pasados, entre dos fechas).
CREATE INDEX IF NOT EXISTS objects_evento_start ON objects (start_at)
	WHERE type = 'evento' AND deleted_at IS NULL;
-- Listas por estado o solo las listadas, también por fecha.
CREATE INDEX IF NOT EXISTS objects_evento_status ON objects (event_status, start_at)
	WHERE type = 'evento' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS objects_listed ON objects (type, unlisted, updated_at)
	WHERE deleted_at IS NULL;

-- De qué archivo .md salió cada objeto importado (eventos, y después material y wiki), como
-- `profile_sources` (0017) y `tag_sources` (0029):
-- - `category` + `legacy_slug`: la carpeta y el nombre del archivo sin `.md`
--   («calendario», «todo-kink-es-politico-2024-10-BDSM-cuir»). La dirección vieja no siempre
--   entra en `objects.slug` (solo minúsculas y guiones): esta tabla hace que siga andando igual;
-- - `source_hash`: SHA-256 del .md tal como se importó; si no cambió, reimportar no hace nada;
-- - `imported_version`: la `version` del objeto justo después de importar. Si el objeto tiene
--   otra, alguien lo editó en el panel y la importación no lo pisa.
CREATE TABLE IF NOT EXISTS content_sources (
	object_id INTEGER PRIMARY KEY REFERENCES objects (id) ON DELETE CASCADE,
	category TEXT NOT NULL CHECK (category IN ('calendario', 'material', 'wiki')),
	legacy_slug TEXT NOT NULL CHECK (length(legacy_slug) BETWEEN 1 AND 100),
	source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
	imported_version INTEGER NOT NULL CHECK (imported_version >= 1),
	imported_at INTEGER NOT NULL, -- ms desde epoch
	updated_at INTEGER NOT NULL,
	UNIQUE (category, legacy_slug)
);

-- Historial: una fila por cada guardado (crear, editar, borrar, deshacer), con el objeto tal como
-- quedó. Nunca se edita ni se borra (se va solo si se purga el objeto, ON DELETE CASCADE). La
-- escribe saveObject() en la misma tanda (opción `also`, src/lib/server/contenido/revisions.js):
-- si falla, no se guarda nada.
-- `source`: de dónde vino el guardado ('import' desde un .md, 'panel', 'agenda'…).
CREATE TABLE IF NOT EXISTS object_revisions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	object_id INTEGER NOT NULL REFERENCES objects (id) ON DELETE CASCADE,
	version INTEGER NOT NULL CHECK (version >= 1),
	slug TEXT NOT NULL,
	title TEXT NOT NULL,
	data TEXT NOT NULL CHECK (json_valid(data)),
	visibility TEXT NOT NULL,
	deleted_at INTEGER,
	saved_at INTEGER NOT NULL, -- ms desde epoch
	saved_by TEXT NOT NULL, -- login de GitHub de le admin, o quién importó
	source TEXT NOT NULL DEFAULT 'panel' CHECK (length(source) BETWEEN 1 AND 40),
	UNIQUE (object_id, version)
);
