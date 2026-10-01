-- Migration number: 0020 	 Series de eventos: "Avisame si se repite" y calendarios personales.
--
-- Solo agrega tablas (no toca ninguna existente). Todo detrás del interruptor `series` (tabla
-- feature_flags, migración 0013), apagado por defecto. Ver src/lib/server/series/.
-- Una serie es una etiqueta hija de «evento recurrente» (src/lib/utils/hardcodedTags.js): acá se
-- guarda su id tal cual (`series_tag`), como las etiquetas de los posts.
--
-- Fechas: milisegundos desde epoch (INTEGER, UTC), como el resto de la base.
-- Secretos: nunca en claro. Los tokens de confirmación y de los calendarios se guardan como hash
-- SHA-256. El mail se guarda solo mientras la suscripción existe (hace falta para mandar el
-- aviso); con cuenta, ni eso: se usa el mail de la cuenta. Darse de baja borra la fila.

-- Quién quiere que le avisen cuando se publica una nueva edición de una serie.
CREATE TABLE IF NOT EXISTS series_subscriptions (
	-- UUID v4 al azar.
	id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
	series_tag TEXT NOT NULL CHECK (length(series_tag) BETWEEN 1 AND 100),
	-- Con cuenta: la cuenta (sin mail acá). Sin cuenta: el mail normalizado.
	account_id TEXT REFERENCES accounts (id) ON DELETE CASCADE,
	email TEXT
		CHECK (email IS NULL OR (email = lower(trim(email)) AND length(email) BETWEEN 3 AND 254)),
	-- Para no repetir: "e:" + hash del mail (el mismo de las cuentas) o "a:" + id de la cuenta.
	subscriber_key TEXT NOT NULL CHECK (length(subscriber_key) BETWEEN 3 AND 80),
	-- Doble confirmación (sin cuenta): hash del token del link; NULL una vez confirmada.
	confirm_hash TEXT CHECK (confirm_hash IS NULL OR length(confirm_hash) = 64),
	confirm_expires_at INTEGER,
	created_at INTEGER NOT NULL,
	-- NULL = falta confirmar (no se le manda nada salvo el mail para confirmar).
	confirmed_at INTEGER,
	CHECK ((account_id IS NULL) <> (email IS NULL)),
	CHECK (confirmed_at IS NOT NULL OR confirm_hash IS NOT NULL),
	UNIQUE (series_tag, subscriber_key)
);

CREATE INDEX IF NOT EXISTS series_subscriptions_tag
	ON series_subscriptions (series_tag, confirmed_at);
CREATE INDEX IF NOT EXISTS series_subscriptions_account
	ON series_subscriptions (account_id) WHERE account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS series_subscriptions_confirm
	ON series_subscriptions (confirm_hash) WHERE confirm_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS series_subscriptions_pending
	ON series_subscriptions (confirm_expires_at) WHERE confirmed_at IS NULL;

-- Cuándo el cron vio por primera vez cada edición próxima de cada serie (publicada en el deploy).
-- Se avisa solo a quienes se suscribieron antes de ese momento.
CREATE TABLE IF NOT EXISTS series_editions_seen (
	series_tag TEXT NOT NULL,
	event_slug TEXT NOT NULL,
	first_seen_at INTEGER NOT NULL,
	PRIMARY KEY (series_tag, event_slug)
) WITHOUT ROWID;

-- Un aviso por suscripción y edición, nunca dos (la fila se toma antes de mandar el mail).
CREATE TABLE IF NOT EXISTS series_notifications (
	subscription_id TEXT NOT NULL REFERENCES series_subscriptions (id) ON DELETE CASCADE,
	event_slug TEXT NOT NULL,
	sent_at INTEGER NOT NULL,
	PRIMARY KEY (subscription_id, event_slug)
) WITHOUT ROWID;

-- Calendario personal ("lo tuyo": los eventos con entradas de la cuenta) con un link secreto.
-- Una fila por link; revocar = borrar la fila (el link deja de andar al instante).
CREATE TABLE IF NOT EXISTS calendar_feeds (
	-- SHA-256 (hex) del token del link. El token en sí no se guarda nunca.
	token_hash TEXT PRIMARY KEY NOT NULL CHECK (length(token_hash) = 64),
	account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	-- Se actualiza como mucho una vez por día (para mostrar "usado por última vez").
	last_used_at INTEGER
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS calendar_feeds_account ON calendar_feeds (account_id);
