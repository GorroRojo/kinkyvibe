-- Migration number: 0084 	 Preguntas de inscripción con todos los tipos de los formularios
-- (docs/personas-eventos.md, docs/formularios.md «Tipos de pregunta»).
--
-- - `signup_fields.kind`: el CHECK de 0018 solo deja 'text', 'choice' y 'checkbox'. Ahora las
--   preguntas de inscripción usan los tipos de los formularios (menos «Foto»): 'short', 'number',
--   'date', 'multi', 'select' y 'rating'. El tipo lo valida el código (`SIGNUP_KINDS` en
--   src/lib/utils/questions.js); el CHECK queda en un largo razonable, así un tipo nuevo de los
--   formularios no obliga a reconstruir otra vez la tabla.
-- - `signup_fields.settings`: lo propio de cada tipo, en JSON (`{}` = nada): `help` (la ayuda
--   debajo de la pregunta), `min` y `max` (número), `low` y `high` (los extremos del puntaje).
--
-- SQLite no deja cambiar un CHECK con ALTER TABLE: se reconstruye `signup_fields` como en 0082
-- (foreign keys diferidas, copia a `kv_bak_*`, DROP, CREATE con el mismo nombre y recarga).
-- - OJO: el DROP borra en cascada `event_signup_general` (qué generales usa cada evento, `ON DELETE
--   CASCADE` hacia `signup_fields`), aun con las foreign keys diferidas: se copia antes y se vuelve
--   a cargar después.
-- - Los ids se conservan (las respuestas guardadas en `order_answers` los nombran). El DROP también
--   borra el contador de AUTOINCREMENT: se repone con una fila de paso con el id más alto que se
--   había dado, que se borra enseguida, así una pregunta nueva nunca toma el id de una que se borró
--   del todo antes de los borrados suaves (0049).
--
-- Anda con el código de `main` (decisión 0028): mismas columnas que hoy (0018 + 0026, 0049 y 0083)
-- más una con valor por defecto, y el CHECK solo se afloja.
-- Antes de aplicarla en producción: un marcador de Time Travel (`wrangler d1 time-travel info`).

PRAGMA defer_foreign_keys = on;

CREATE TABLE IF NOT EXISTS kv_bak_signup_fields AS SELECT * FROM signup_fields;
CREATE TABLE IF NOT EXISTS kv_bak_event_signup_general AS SELECT * FROM event_signup_general;
CREATE TABLE IF NOT EXISTS kv_bak_signup_fields_seq AS
	SELECT seq FROM sqlite_sequence WHERE name = 'signup_fields';

DROP TABLE signup_fields;

CREATE TABLE signup_fields (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	event_slug TEXT CHECK (event_slug IS NULL OR length(event_slug) BETWEEN 1 AND 100),
	label TEXT NOT NULL CHECK (length(label) BETWEEN 2 AND 120),
	kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 20),
	required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1)),
	options TEXT NOT NULL DEFAULT '[]', -- JSON: las opciones de los tipos con opciones
	position INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	updated_by TEXT NOT NULL,
	per_ticket INTEGER NOT NULL DEFAULT 0 CHECK (per_ticket IN (0, 1)),
	ticket_types TEXT NOT NULL DEFAULT '[]',
	deleted_at INTEGER,
	short_label TEXT,
	-- Nuevo: lo propio de cada tipo (ayuda, mínimo y máximo, extremos del puntaje).
	settings TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(settings))
);

INSERT INTO signup_fields (id, event_slug, label, kind, required, options, position, created_at,
	updated_at, updated_by, per_ticket, ticket_types, deleted_at, short_label)
SELECT id, event_slug, label, kind, required, options, position, created_at,
	updated_at, updated_by, per_ticket, ticket_types, deleted_at, short_label
FROM kv_bak_signup_fields;

-- El contador de AUTOINCREMENT, de vuelta (una fila de paso con el id más alto que se había dado).
INSERT INTO signup_fields (id, event_slug, label, kind, required, options, position, created_at,
	updated_at, updated_by, deleted_at)
SELECT seq, NULL, 'kv-contador', 'text', 0, '[]', 0, 0, 0, 'migracion-0084', 0
FROM kv_bak_signup_fields_seq
WHERE seq > (SELECT COALESCE(MAX(id), 0) FROM signup_fields);
DELETE FROM signup_fields WHERE updated_by = 'migracion-0084' AND label = 'kv-contador';

-- Lo que borró la cascada del DROP, de vuelta.
INSERT OR IGNORE INTO event_signup_general SELECT * FROM kv_bak_event_signup_general;
DROP TABLE kv_bak_signup_fields;
DROP TABLE kv_bak_event_signup_general;
DROP TABLE kv_bak_signup_fields_seq;

CREATE INDEX IF NOT EXISTS signup_fields_event ON signup_fields (event_slug, position);

PRAGMA defer_foreign_keys = off;
