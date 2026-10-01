-- Migration number: 0018 	 Personas en eventos (roles) y preguntas de inscripción.
--
-- Todo detrás del interruptor `personas_eventos` (src/lib/server/flags.js), apagado. Solo
-- agrega tablas: nada de lo que ya existe cambia. Ver docs/personas-eventos.md.
--
-- Roles: los vínculos evento/publicación → perfil viven en el frontmatter de los .md
-- (`personas: [{ perfil, rol }]`) mientras los eventos sigan siendo archivos; acá va solo la
-- lista de roles que les admins agregan desde el panel (los fijos están en el código,
-- src/lib/utils/personas.js).
CREATE TABLE IF NOT EXISTS persona_roles (
	name TEXT PRIMARY KEY NOT NULL COLLATE NOCASE CHECK (length(name) BETWEEN 2 AND 40),
	created_at INTEGER NOT NULL, -- ms desde epoch
	created_by TEXT NOT NULL -- login de le admin
) WITHOUT ROWID;

-- Preguntas de inscripción. `event_slug` NULL = pregunta general (se define una vez y cada evento
-- elige si la usa, en event_signup_general); con slug = pregunta propia de ese evento.
CREATE TABLE IF NOT EXISTS signup_fields (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	event_slug TEXT CHECK (event_slug IS NULL OR length(event_slug) BETWEEN 1 AND 100),
	label TEXT NOT NULL CHECK (length(label) BETWEEN 2 AND 120),
	kind TEXT NOT NULL CHECK (kind IN ('text', 'choice', 'checkbox')),
	required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1)),
	options TEXT NOT NULL DEFAULT '[]', -- JSON: las opciones de `choice`
	position INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS signup_fields_event ON signup_fields (event_slug, position);

-- Qué preguntas generales usa cada evento.
CREATE TABLE IF NOT EXISTS event_signup_general (
	event_slug TEXT NOT NULL CHECK (length(event_slug) BETWEEN 1 AND 100),
	field_id INTEGER NOT NULL REFERENCES signup_fields (id) ON DELETE CASCADE,
	position INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (event_slug, field_id)
) WITHOUT ROWID;

-- Respuestas de quien compra, con la orden (datos de la persona: solo admins). Se guarda la
-- pregunta tal como estaba al comprar (JSON `[{ id, label, value }]`), así cambiar o borrar una
-- pregunta después no cambia lo que se respondió.
CREATE TABLE IF NOT EXISTS order_answers (
	order_id TEXT PRIMARY KEY NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
	answers TEXT NOT NULL,
	created_at INTEGER NOT NULL
) WITHOUT ROWID;
