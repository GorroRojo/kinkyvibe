-- Migration number: 0072 	 2026-11-02T19:53:40.620Z
-- Conector de Claude, parte 2: edición (docs/conector-claude.md). Creada con
-- `npm run db:migrations:new` (salió 0065) y pasada a 0072 porque de la 0065 a la 0071 ya las usan
-- otros PRs.
--
-- - `mcp_llaves`: las llaves de larga duración del conector, para las rutinas que corren solas
--   (Ajustes → Admins → «Llaves para rutinas»). Cada una es de une admin, con un nombre, cuándo se
--   creó, cuándo se usó por última vez, cuándo vence y cuándo se revocó. La llave nunca se guarda:
--   solo su SHA-256 (se muestra una sola vez, al crearla).
-- - `object_revisions.confirmed_by`: en un cambio hecho por Claude (`source` = 'claude'), quién del
--   equipo lo confirmó (texto libre, corto). Vacío en todo lo demás: el historial de siempre no
--   cambia.
--
-- Solo agrega una tabla y una columna que puede quedar vacía: anda con el código de `main`
-- (decisión 0028).
CREATE TABLE IF NOT EXISTS mcp_llaves (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	admin_id INTEGER NOT NULL, -- id de GitHub de le admin (público, como en auth.js)
	name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
	token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
	created_at INTEGER NOT NULL, -- ms desde epoch
	created_by TEXT NOT NULL, -- login de GitHub
	expires_at INTEGER NOT NULL,
	last_used_at INTEGER,
	revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS mcp_llaves_admin ON mcp_llaves (admin_id, created_at);
ALTER TABLE object_revisions ADD COLUMN confirmed_by TEXT
	CHECK (confirmed_by IS NULL OR length(confirmed_by) BETWEEN 1 AND 60);
