-- Migration number: 0050 	 2026-10-11T13:30:49.476Z
-- Prototipo de la puerta por Mini App de Telegram (PR #273): vincular el Telegram de une admin
-- (GitHub) desde el panel, Ajustes → Admins. Reemplaza la variable TELEGRAM_DOOR_ADMINS.
--
-- Solo agrega dos tablas (y un índice); no toca ninguna tabla que ya exista, así que anda con el
-- código de `main` (decisión 0028). Ver docs/telegram.md («Prototipo: la puerta»).
--
-- Fechas: milisegundos desde epoch (INTEGER, UTC), como el resto de la base.
-- Privado: de Telegram solo se guarda el id del usuario (ni nombre ni usuario).
-- Si es admin se mira en cada pedido con la lista ADMINS (src/lib/server/auth.js, por id de
-- GitHub): sacar a alguien de ADMINS le corta la puerta aunque la fila siga acá.

-- Une admin ↔ su cuenta de Telegram (una por admin y une admin por cuenta de Telegram).
CREATE TABLE IF NOT EXISTS telegram_admin_links (
	-- El id del usuario de Telegram (un número de hasta 52 bits, guardado como texto).
	telegram_user_id TEXT PRIMARY KEY NOT NULL CHECK (length(telegram_user_id) BETWEEN 1 AND 32),
	-- El id numérico de GitHub (no cambia); el login es solo una etiqueta para el registro.
	github_id INTEGER NOT NULL UNIQUE,
	github_login TEXT NOT NULL CHECK (length(github_login) BETWEEN 1 AND 100),
	linked_at INTEGER NOT NULL
) WITHOUT ROWID;

-- Códigos de un solo uso («Vincular Telegram» → `t.me/<bot>?start=adm_<código>`), 15 minutos.
-- Se guarda solo el hash (SHA-256) del código, nunca el código.
CREATE TABLE IF NOT EXISTS telegram_admin_link_codes (
	code_hash TEXT PRIMARY KEY NOT NULL CHECK (length(code_hash) = 64),
	github_id INTEGER NOT NULL,
	github_login TEXT NOT NULL CHECK (length(github_login) BETWEEN 1 AND 100),
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	used_at INTEGER
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS telegram_admin_link_codes_github ON telegram_admin_link_codes (github_id);
