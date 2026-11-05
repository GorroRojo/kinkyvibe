-- Migration number: 0079 	 2026-11-05T12:00:00.000Z
-- Formularios (docs/formularios.md, decisión 0057, plan `formularios`; interruptor `formularios`,
-- apagado). Creada a mano con el formato de `npm run db:migrations:new` (0076, 0077 y 0078 están
-- reservadas para otros PRs).
--
-- Solo agrega tres tablas (vacías): no toca ninguna tabla que ya exista, así que anda con el código
-- de `main` de antes de este PR (decisión 0028). Las preguntas de inscripción no cambian: su orden
-- ya vive en `signup_fields.position` (0018). Las plantillas (encuesta, propuesta, beca y
-- comentarios) las crea el código la primera vez que hacen falta
-- (src/lib/server/formularios/templates.js), no esta migración.
--
-- - `forms`: cada formulario. `kind`: 'form' (uno común, en /formularios/<slug>), 'survey' (la
--   encuesta de un evento, en /calendario/<evento>/encuesta; una por evento) o 'template' (una
--   plantilla para copiar: nunca se publica). `questions`: la lista de preguntas en su orden (JSON,
--   ver src/lib/utils/formularios.js). `access`: quién puede responder ('link' cualquiera con el
--   link, 'account' con cuenta, 'ticket' quien tenía entrada para `event_slug`, con un link
--   personal por mail). `privacy`: 'named', 'anonymous' o 'choose' (cada persona elige).
--   `audience`: quién ve las respuestas ('admins', u 'organizers': admins y les organizadores de
--   `event_slug`, como las respuestas de inscripción, decisión 0024). `open`: 1 si recibe
--   respuestas (en una encuesta, también si se manda). `send_at`: en un formulario 'ticket' que no
--   es encuesta, desde cuándo se manda el link (lo pide une admin); la encuesta se calcula con el fin
--   del evento.
-- - `form_responses`: cada respuesta. `answers`: `[{ id, label, value }]` con la pregunta copiada
--   como estaba. `day`: solo la fecha (AAAA-MM-DD, hora de Argentina). Si `anonymous` = 1 no hay
--   nombre, mail, cuenta, orden ni hora: lo controla el CHECK, así ningún camino del código las
--   puede guardar.
-- - `form_sends`: el link personal de un formulario 'ticket' a cada orden (mismo esquema de estados
--   que `reminder_sends`, src/lib/server/tickets/sendState.js) y `used` = 1 cuando ese link ya se
--   usó (sirve una vez). No guarda cuándo se usó ni qué se respondió. Sin foreign key a `orders`, a
--   propósito: así una migración futura que rehaga `orders` no tiene que acordarse de esta tabla.

CREATE TABLE IF NOT EXISTS forms (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	slug TEXT NOT NULL CHECK (length(slug) BETWEEN 1 AND 80),
	kind TEXT NOT NULL DEFAULT 'form' CHECK (kind IN ('form', 'survey', 'template')),
	title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
	intro TEXT NOT NULL DEFAULT '' CHECK (length(intro) <= 1000),
	questions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(questions) AND json_type(questions) = 'array'),
	access TEXT NOT NULL DEFAULT 'link' CHECK (access IN ('link', 'account', 'ticket')),
	privacy TEXT NOT NULL DEFAULT 'named' CHECK (privacy IN ('named', 'anonymous', 'choose')),
	audience TEXT NOT NULL DEFAULT 'organizers' CHECK (audience IN ('admins', 'organizers')),
	event_slug TEXT CHECK (event_slug IS NULL OR length(event_slug) BETWEEN 1 AND 200),
	open INTEGER NOT NULL DEFAULT 0 CHECK (open IN (0, 1)),
	send_at INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	updated_by TEXT NOT NULL DEFAULT '',
	CHECK (kind != 'survey' OR (event_slug IS NOT NULL AND access = 'ticket')),
	CHECK (access != 'ticket' OR event_slug IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS forms_slug ON forms (slug);
CREATE UNIQUE INDEX IF NOT EXISTS forms_event_survey ON forms (event_slug) WHERE kind = 'survey';
CREATE INDEX IF NOT EXISTS forms_event ON forms (event_slug) WHERE event_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS form_responses (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	form_id INTEGER NOT NULL REFERENCES forms (id) ON DELETE CASCADE,
	answers TEXT NOT NULL CHECK (json_valid(answers) AND json_type(answers) = 'array'),
	day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	anonymous INTEGER NOT NULL CHECK (anonymous IN (0, 1)),
	name TEXT CHECK (name IS NULL OR length(name) <= 120),
	email TEXT CHECK (email IS NULL OR length(email) <= 254),
	account_id TEXT,
	order_id TEXT,
	created_at INTEGER,
	CHECK (
		anonymous = 0
		OR (name IS NULL AND email IS NULL AND account_id IS NULL AND order_id IS NULL
			AND created_at IS NULL)
	)
);
CREATE INDEX IF NOT EXISTS form_responses_form ON form_responses (form_id);

CREATE TABLE IF NOT EXISTS form_sends (
	order_id TEXT NOT NULL,
	form_id INTEGER NOT NULL REFERENCES forms (id) ON DELETE CASCADE,
	sent_at INTEGER NOT NULL,
	status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'retry', 'failed')),
	attempts INTEGER NOT NULL DEFAULT 1,
	used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1)),
	PRIMARY KEY (order_id, form_id)
);
CREATE INDEX IF NOT EXISTS form_sends_unsent ON form_sends (status) WHERE status != 'sent';
