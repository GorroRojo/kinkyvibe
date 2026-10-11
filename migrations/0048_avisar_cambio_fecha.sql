-- Migration number: 0048 	 «Avisar a les compradores» cuando cambia la fecha de un evento.
--
-- Cuando une admin guarda un evento con otro inicio o fin, el panel ofrece mandarles un mail a
-- quienes compraron (nunca solo: hace falta tocar «Avisar a les compradores» y confirmar). Ver
-- src/lib/server/tickets/dateChange.js y docs/mails.md.
--
-- `event_date_changes`: el último cambio de fecha de cada evento (una fila por evento).
-- - `changed_at`: cuándo se guardó el cambio (ms). Se avisa a las órdenes aprobadas de antes:
--   las que compraron después ya recibieron la fecha nueva en el mail de las entradas.
-- - `version`: la versión del .ics del aviso (ms; el minuto siguiente a `changed_at`), así su
--   SEQUENCE es más alto que el de cualquier mail anterior y el calendario reemplaza la entrada
--   vieja. Cada cambio nuevo tiene una versión más alta: se puede volver a avisar.
-- - `old_start` / `old_end`: la fecha que tenían les compradores (para «Antes era…»);
--   `new_start` / `new_end`: la nueva. Tal como están en el evento (texto ISO).
-- - `send_requested_at` / `send_requested_by`: se tocó «Avisar» (el cron sigue mandando tandas
--   hasta terminar); `send_done_at`: ya no queda nadie. `dismissed_at`: «No hace falta avisar»
--   (el aviso del panel no se muestra más; la pestaña «Mail a compradores» lo sigue ofreciendo).
--
-- `date_change_sends`: a qué orden ya se le mandó qué versión del aviso, con el mismo estado que
-- `stream_link_sends` (migración 0011): 'sending', 'sent', 'retry', 'failed'. Sin clave foránea a
-- `orders` (el reseteo de los datos de prueba borra órdenes).
--
-- Solo agrega dos tablas: no toca nada de lo que ya existe. El código que está en `main` no las
-- usa, así que se puede aplicar antes del merge (docs/decisiones/0028-migraciones-antes-del-merge.md).
CREATE TABLE IF NOT EXISTS event_date_changes (
	event_slug TEXT PRIMARY KEY NOT NULL,
	changed_at INTEGER NOT NULL, -- ms desde epoch
	version INTEGER NOT NULL, -- ms desde epoch
	old_start TEXT,
	old_end TEXT,
	new_start TEXT NOT NULL,
	new_end TEXT,
	changed_by TEXT NOT NULL, -- login de GitHub de le admin
	send_requested_at INTEGER,
	send_requested_by TEXT,
	send_done_at INTEGER,
	dismissed_at INTEGER
);

CREATE TABLE IF NOT EXISTS date_change_sends (
	order_id TEXT NOT NULL,
	version INTEGER NOT NULL,
	sent_at INTEGER NOT NULL,
	status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sending', 'sent', 'retry', 'failed')),
	attempts INTEGER NOT NULL DEFAULT 1,
	PRIMARY KEY (order_id, version)
);

CREATE INDEX IF NOT EXISTS date_change_sends_unsent ON date_change_sends (status)
	WHERE status != 'sent';
