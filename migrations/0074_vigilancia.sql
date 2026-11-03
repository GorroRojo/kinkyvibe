-- Migration number: 0074 	 2026-11-03T15:13:28.146Z
-- Avisos «Fallas del sitio» por Telegram (docs/workers-migracion.md, plan `errores-alertas`). Creada con
-- `npm run db:migrations:new`.
--
-- - `error_counts`: cuántas respuestas 5xx dio el sitio, por tramo de 10 minutos, ruta (el patrón
--   de SvelteKit, como `/entradas/[order]/estado`: nunca la dirección con datos ni la query) y
--   estado. `purchase` = 1 si la ruta es de una compra (el webhook de Mercado Pago, el checkout, la
--   página de la orden). `last_error_id`: el código corto del último error de esa fila (el de
--   errorLog.js, el mismo que se busca en los registros); NULL si fue una respuesta 5xx sin
--   excepción. Nada de compradores, mensajes ni IPs. Las filas de más de 7 días las borra el cron
--   de vigilancia.
-- - `cron_heartbeats`: una fila por cron de wrangler.toml con la última vez que arrancó y la última
--   que terminó bien (la escribe el `scheduled()` del Worker). `first_seen_at`: cuándo se empezó a
--   mirar (así un cron que nunca anduvo también avisa).
--
-- Solo agrega dos tablas; no toca ninguna que ya exista, así que anda con el código de `main`
-- (decisión 0028). Fechas: milisegundos desde epoch (INTEGER, UTC), como el resto de la base.

CREATE TABLE IF NOT EXISTS error_counts (
	-- Comienzo del tramo de 10 minutos (milisegundos, múltiplo de 600000).
	bucket_start INTEGER NOT NULL,
	route TEXT NOT NULL CHECK (length(route) BETWEEN 1 AND 200),
	status INTEGER NOT NULL CHECK (status BETWEEN 500 AND 599),
	purchase INTEGER NOT NULL DEFAULT 0 CHECK (purchase IN (0, 1)),
	hits INTEGER NOT NULL,
	last_error_id TEXT CHECK (last_error_id IS NULL OR length(last_error_id) <= 16),
	last_at INTEGER NOT NULL,
	PRIMARY KEY (bucket_start, route, status)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS cron_heartbeats (
	-- La expresión del cron, tal cual está en wrangler.toml (`*/15 * * * *`…).
	cron TEXT PRIMARY KEY CHECK (length(cron) BETWEEN 1 AND 40),
	first_seen_at INTEGER NOT NULL,
	last_started_at INTEGER,
	last_ok_at INTEGER
) WITHOUT ROWID;
