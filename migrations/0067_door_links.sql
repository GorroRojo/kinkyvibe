-- Migration number: 0067 	 2026-10-26T23:55:00.000Z
-- Links de puerta (docs/tickets.md, «Link de puerta»): une admin crea, para un solo evento, un
-- link que abre solo el modo puerta de ese evento, sin cuenta. Creada con
-- `npm run db:migrations:new` (salió 0065) y pasada a 0067 porque la 0065 y la 0066 ya las usan
-- otros PRs.
--
-- - `id`: id público del link (al azar, no secreto): es el que queda en el registro de actividad
--   y en las acciones del panel (revocar).
-- - `token_hash`: SHA-256 del token del link. El token nunca se guarda: se muestra una sola vez al
--   crearlo.
-- - `label`: para reconocerlo («Puerta: voluntarie 1»); lo escribe une admin.
-- - `expires_at`: hasta cuándo anda (milisegundos); `revoked_at`/`revoked_by`: si une admin lo
--   cortó antes.
-- - `last_used_at`: la última vez que alguien entró con el link.
--
-- Solo agrega una tabla nueva: anda con el código de `main` (decisión 0028).
CREATE TABLE IF NOT EXISTS door_links (
	id TEXT PRIMARY KEY NOT NULL,
	event_slug TEXT NOT NULL,
	token_hash TEXT NOT NULL UNIQUE,
	label TEXT NOT NULL DEFAULT '',
	created_by TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	revoked_at INTEGER,
	revoked_by TEXT,
	last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS door_links_event ON door_links (event_slug, expires_at);
