-- Migration number: 0038 	 Resumen mensual de las visitas (analíticas anónimas, docs/analiticas.md).
--
-- Analytics Engine guarda los datos unos 3 meses. El cron nocturno (06:00 UTC) escribe acá un
-- resumen por mes para que la historia sobreviva: el total de visitas, las páginas, orígenes,
-- países y dispositivos más vistos, y el embudo de compra de cada evento. Solo números agregados:
-- nada de personas, IPs, cookies ni cuentas.
--
-- (0034–0037 están reservadas por otras ramas: esta es 0038.)
--
-- Cada noche se reemplazan el mes anterior y el mes en curso (borrar y volver a escribir).
CREATE TABLE IF NOT EXISTS analytics_monthly (
	-- Mes en UTC, `YYYY-MM`.
	month TEXT NOT NULL CHECK (length(month) = 7),
	-- total | page | source | country | device | funnel
	dimension TEXT NOT NULL CHECK (
		dimension IN ('total', 'page', 'source', 'country', 'device', 'funnel')
	),
	-- La ruta, el dominio, el país, el dispositivo o `slug|paso|medio` ('' para el total y para
	-- «directo»).
	key TEXT NOT NULL DEFAULT '',
	value INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (month, dimension, key)
);
