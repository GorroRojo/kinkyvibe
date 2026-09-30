-- Migration number: 0012 	 Objetos: la base de "todo es un objeto" (fase 2), sin contenido todavía.
--
-- Eventos, lugares, perfiles, series… pasan a ser filas de `objects` conectadas por `edges`. Los
-- tipos núcleo (evento, lugar…) están definidos en código (src/lib/server/objects/types/); desde
-- el panel, más adelante, solo se agregan campos extra y tipos simples. Ver docs/objetos.md.
--
-- Reglas que el esquema hace cumplir por sí mismo (además de las del código):
-- - `objects.type` tiene que existir en `object_types` (foreign key).
-- - `edges` apunta a objetos que existen: ON DELETE CASCADE. El borrado normal es "suave"
--   (`deleted_at`); el borrado de verdad (purga) se lleva sus edges.
-- - `version` solo puede subir de a 1 en cada UPDATE: si alguien guarda con una versión vieja,
--   el trigger aborta toda la tanda (edición concurrente → error claro, nunca pisar en silencio).
-- - `objects_fts` (búsqueda) es FTS5 con contenido externo: la mantienen los triggers y el
--   backup la reconstruye con 'rebuild' (src/lib/server/backup/dump.js).
--
-- Solo se escribe desde saveObject() (src/lib/server/objects/save.js); hay un test que lo
-- verifica. Nada de esto se usa todavía en las páginas públicas.

-- Registro de tipos. Los 'core' los da de alta saveObject() desde el registro en código (no hace
-- falta migración por cada tipo núcleo nuevo); los 'panel' llegan con los tipos simples del panel.
CREATE TABLE IF NOT EXISTS object_types (
	type TEXT PRIMARY KEY CHECK (type GLOB '[a-z]*' AND type NOT GLOB '*[^a-z0-9_]*'),
	origin TEXT NOT NULL CHECK (origin IN ('core', 'panel')),
	created_at INTEGER NOT NULL -- ms desde epoch
);

CREATE TABLE IF NOT EXISTS objects (
	-- Entero y AUTOINCREMENT: no se reusa nunca (edges, historial y redirecciones viejas no pueden
	-- terminar apuntando a otro objeto) y sirve de rowid estable para objects_fts.
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	type TEXT NOT NULL REFERENCES object_types (type) ON DELETE RESTRICT,
	-- Dirección de la página, única por tipo. Se puede cambiar siempre (decisión P6.4).
	slug TEXT NOT NULL CHECK (length(slug) BETWEEN 1 AND 100),
	title TEXT NOT NULL CHECK (length(title) >= 1),
	-- Campos del tipo, validados en código. Las referencias a otros objetos NO van acá: son edges.
	data TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data) AND json_type(data) = 'object'),
	-- Texto para la búsqueda, lo arma el tipo (searchText) al guardar.
	search_text TEXT NOT NULL DEFAULT '',
	-- Visible por defecto; 'hidden' a pedido (lo ven les admins y quien lo creó). Lo decide
	-- src/lib/server/objects/visibility.js, en ningún otro lado.
	visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'members', 'hidden')),
	version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
	created_at INTEGER NOT NULL, -- ms desde epoch
	created_by TEXT NOT NULL, -- quién lo creó (hoy, el login de GitHub de le admin)
	updated_at INTEGER NOT NULL,
	updated_by TEXT NOT NULL,
	deleted_at INTEGER, -- borrado suave (se puede deshacer); NULL = vivo
	UNIQUE (type, slug)
);
CREATE INDEX IF NOT EXISTS objects_type_updated ON objects (type, updated_at DESC);

CREATE TABLE IF NOT EXISTS edges (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	from_id INTEGER NOT NULL REFERENCES objects (id) ON DELETE CASCADE,
	-- Qué relación es ('lugar', 'serie', 'organiza'…); qué tipos puede unir lo dice el tipo de
	-- `from_id` en código.
	kind TEXT NOT NULL CHECK (kind GLOB '[a-z]*' AND kind NOT GLOB '*[^a-z0-9_]*'),
	to_id INTEGER NOT NULL REFERENCES objects (id) ON DELETE CASCADE,
	position INTEGER NOT NULL DEFAULT 0, -- orden dentro de (from_id, kind)
	data TEXT CHECK (data IS NULL OR (json_valid(data) AND json_type(data) = 'object')),
	created_at INTEGER NOT NULL,
	created_by TEXT NOT NULL,
	UNIQUE (from_id, kind, to_id),
	CHECK (from_id != to_id)
);
-- "¿Qué apunta a este objeto?" (eventos de un lugar, ediciones de una serie).
CREATE INDEX IF NOT EXISTS edges_to ON edges (to_id, kind);

-- Control optimista de versión: todo UPDATE tiene que poner version = la anterior + 1. Quien
-- guardó con una versión vieja pone un número que ya no corresponde y se aborta la tanda entera.
CREATE TRIGGER IF NOT EXISTS objects_version_check BEFORE UPDATE ON objects
WHEN NEW.version IS NOT OLD.version + 1
BEGIN
	SELECT RAISE(ABORT, 'objects_version_conflict');
END;

-- Búsqueda: FTS5 con contenido externo (el texto vive una sola vez, en `objects`). Sin tildes
-- para buscar ("cordoba" encuentra "Córdoba"). La visibilidad se filtra con un JOIN a `objects`.
CREATE VIRTUAL TABLE IF NOT EXISTS objects_fts USING fts5 (
	title,
	search_text,
	content = 'objects',
	content_rowid = 'id',
	tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS objects_fts_insert AFTER INSERT ON objects
BEGIN
	INSERT INTO objects_fts (rowid, title, search_text)
	VALUES (NEW.id, NEW.title, NEW.search_text);
END;

CREATE TRIGGER IF NOT EXISTS objects_fts_delete AFTER DELETE ON objects
BEGIN
	INSERT INTO objects_fts (objects_fts, rowid, title, search_text)
	VALUES ('delete', OLD.id, OLD.title, OLD.search_text);
END;

CREATE TRIGGER IF NOT EXISTS objects_fts_update AFTER UPDATE OF title, search_text ON objects
BEGIN
	INSERT INTO objects_fts (objects_fts, rowid, title, search_text)
	VALUES ('delete', OLD.id, OLD.title, OLD.search_text);
	INSERT INTO objects_fts (rowid, title, search_text)
	VALUES (NEW.id, NEW.title, NEW.search_text);
END;
