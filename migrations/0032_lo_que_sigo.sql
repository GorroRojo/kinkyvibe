-- Migration number: 0032 	 «Lo que sigo» (decisión 0025): etiquetas, perfiles y lugares que sigue una cuenta.
--
-- Solo agrega tablas (no toca ninguna existente). Todo detrás del interruptor `lo_que_sigo`
-- (tabla feature_flags, migración 0013), apagado por defecto, además de `cuentas`. Anda con el
-- código que ya está en `main`: nada lo lee hasta que se prende el interruptor. Ver
-- docs/lo-que-sigo.md y src/lib/server/sigo/.
--
-- Fechas: milisegundos desde epoch (INTEGER, UTC), como el resto de la base.
-- Privado: lo que sigue cada cuenta no se muestra nunca en público ni a otras cuentas. No se
-- guarda ningún mail acá: los avisos usan el de la cuenta.

-- Una fila por cuenta y cosa seguida, con lo que la persona quiere de esa cosa.
CREATE TABLE IF NOT EXISTS follows (
	account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
	-- `etiqueta`: una etiqueta (las series son etiquetas), por su `key` (el nombre en los posts,
	-- igual con el archivo de etiquetas y con la base: interruptor `etiquetas_db`).
	-- `perfil`: un perfil de la base (persona, proyecto o lugar), por el id del objeto.
	target_kind TEXT NOT NULL CHECK (target_kind IN ('etiqueta', 'perfil')),
	target_key TEXT NOT NULL CHECK (length(target_key) BETWEEN 1 AND 100),
	-- "En mi calendario": sus eventos aparecen en el .ics personal.
	in_calendar INTEGER NOT NULL DEFAULT 1 CHECK (in_calendar IN (0, 1)),
	-- "Mail cuando se anuncia algo nuevo".
	mail_new INTEGER NOT NULL DEFAULT 0 CHECK (mail_new IN (0, 1)),
	-- "Recordatorio el día antes".
	mail_reminder INTEGER NOT NULL DEFAULT 0 CHECK (mail_reminder IN (0, 1)),
	-- Si vino de "Avisame si se repite" (`series_subscriptions.id`, migración 0020): así el link
	-- de baja de los mails que ya salieron sigue andando después de pasarla a este sistema.
	series_subscription_id TEXT
		CHECK (series_subscription_id IS NULL OR length(series_subscription_id) = 36),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (account_id, target_kind, target_key)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS follows_target ON follows (target_kind, target_key);
CREATE UNIQUE INDEX IF NOT EXISTS follows_series_subscription
	ON follows (series_subscription_id) WHERE series_subscription_id IS NOT NULL;

-- Cuándo el cron vio por primera vez cada evento próximo (para "se anunció algo nuevo"). Se
-- avisa solo a quienes empezaron a seguir antes de ese momento.
CREATE TABLE IF NOT EXISTS follow_events_seen (
	event_slug TEXT PRIMARY KEY NOT NULL,
	first_seen_at INTEGER NOT NULL
) WITHOUT ROWID;

-- Un mail por cuenta, evento y tipo, nunca dos (la fila se toma antes de mandar el mail).
CREATE TABLE IF NOT EXISTS follow_notifications (
	account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
	event_slug TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('nuevo', 'recordatorio')),
	sent_at INTEGER NOT NULL,
	PRIMARY KEY (account_id, event_slug, kind)
) WITHOUT ROWID;
