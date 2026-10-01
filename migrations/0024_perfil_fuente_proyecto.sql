-- Migration number: 0024 	 La clasificación de las fichas de amigues usa «proyecto» en vez de «grupo».
--
-- `profile_sources.suggested_kind` (migración 0017) tiene un CHECK con 'persona', 'grupo' y
-- 'lugar'. Desde 0023 el tipo de perfil se llama `proyecto` (decisión de gorrite, docs/decisiones/
-- 0019-proyecto.md) y la importación propone 'proyecto'. SQLite no deja cambiar un CHECK, así que
-- la tabla se rehace con el CHECK nuevo y las filas que decían 'grupo' pasan a 'proyecto'.
--
-- - Nada apunta a `profile_sources` (ninguna foreign key ni trigger), así que se puede borrar y
--   renombrar sin tocar otras tablas.
-- - Solo cambia esa columna; las demás pasan tal cual.
-- - El código que está en `main` no usa esta tabla: se puede aplicar antes del merge
--   (docs/decisiones/0028-migraciones-antes-del-merge.md).
CREATE TABLE profile_sources_new (
	profile_id INTEGER PRIMARY KEY REFERENCES objects (id) ON DELETE CASCADE,
	legacy_slug TEXT NOT NULL UNIQUE CHECK (length(legacy_slug) BETWEEN 1 AND 100),
	source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
	imported_version INTEGER NOT NULL CHECK (imported_version >= 1),
	suggested_kind TEXT NOT NULL CHECK (suggested_kind IN ('persona', 'proyecto', 'lugar')),
	kind_reason TEXT NOT NULL DEFAULT '',
	kind_confirmed_at INTEGER, -- ms desde epoch; NULL = "a confirmar"
	kind_confirmed_by TEXT, -- login de GitHub de le admin
	imported_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

INSERT INTO profile_sources_new (profile_id, legacy_slug, source_hash, imported_version,
	suggested_kind, kind_reason, kind_confirmed_at, kind_confirmed_by, imported_at, updated_at)
SELECT profile_id, legacy_slug, source_hash, imported_version,
	CASE suggested_kind WHEN 'grupo' THEN 'proyecto' ELSE suggested_kind END,
	kind_reason, kind_confirmed_at, kind_confirmed_by, imported_at, updated_at
FROM profile_sources;

DROP TABLE profile_sources;

ALTER TABLE profile_sources_new RENAME TO profile_sources;
