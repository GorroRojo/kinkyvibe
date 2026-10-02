-- Migration number: 0033 	 Bot de Telegram, fase 2 (decisión 0029): vincular un chat con una cuenta y avisos de «Lo que sigo» por Telegram.
--
-- Anda con el código que ya está en `main` (0028): agrega dos tablas, dos columnas con valor por
-- defecto en `follows` y suma el canal a la clave de `follow_notifications` (las filas que ya hay
-- quedan como `mail`; el código de `main` inserta sin canal y cae en `mail`). Nada manda por
-- Telegram hasta que estén prendidos `telegram_bot`, `lo_que_sigo` y `cuentas`, la cuenta tenga un
-- chat vinculado y esté cargado el secret TELEGRAM_BOT_TOKEN. Ver docs/telegram.md.
--
-- Fechas: milisegundos desde epoch (INTEGER, UTC), como el resto de la base.
-- Privado: no se guarda nada del perfil de Telegram (ni nombre ni usuario), solo el id del chat.

-- El chat privado de Telegram de cada cuenta (uno por cuenta y una cuenta por chat).
CREATE TABLE IF NOT EXISTS telegram_chats (
	account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
	-- El id del chat privado con el bot (un número de hasta 52 bits, guardado como texto).
	chat_id TEXT NOT NULL UNIQUE CHECK (length(chat_id) BETWEEN 1 AND 32),
	linked_at INTEGER NOT NULL,
	-- /silenciar: ningún aviso por Telegram hasta /reanudar (lo elegido en «Lo que sigo» queda).
	muted INTEGER NOT NULL DEFAULT 0 CHECK (muted IN (0, 1)),
	updated_at INTEGER NOT NULL
) WITHOUT ROWID;

-- Códigos de un solo uso para vincular («Conectar Telegram» en Mi rincón → `/vincular <código>`).
-- Se guarda solo el hash (SHA-256) del código, nunca el código.
CREATE TABLE IF NOT EXISTS telegram_link_codes (
	code_hash TEXT PRIMARY KEY NOT NULL CHECK (length(code_hash) = 64),
	account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	used_at INTEGER
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS telegram_link_codes_account ON telegram_link_codes (account_id);

-- «Algo nuevo» y «Recordatorio» por Telegram, por cada cosa seguida (apagados por defecto).
ALTER TABLE follows ADD COLUMN tg_new INTEGER NOT NULL DEFAULT 0 CHECK (tg_new IN (0, 1));
ALTER TABLE follows ADD COLUMN tg_reminder INTEGER NOT NULL DEFAULT 0 CHECK (tg_reminder IN (0, 1));

-- Un aviso por cuenta, evento, tipo **y canal**, nunca dos. SQLite no deja cambiar la clave de
-- una tabla: se arma de nuevo con la columna `channel` y se copian las filas (todas `mail`).
-- Nada referencia a esta tabla.
CREATE TABLE follow_notifications_0033 (
	account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
	event_slug TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('nuevo', 'recordatorio')),
	channel TEXT NOT NULL DEFAULT 'mail' CHECK (channel IN ('mail', 'telegram')),
	sent_at INTEGER NOT NULL,
	PRIMARY KEY (account_id, event_slug, kind, channel)
) WITHOUT ROWID;

INSERT INTO follow_notifications_0033 (account_id, event_slug, kind, channel, sent_at)
	SELECT account_id, event_slug, kind, 'mail', sent_at FROM follow_notifications;

DROP TABLE follow_notifications;

ALTER TABLE follow_notifications_0033 RENAME TO follow_notifications;
