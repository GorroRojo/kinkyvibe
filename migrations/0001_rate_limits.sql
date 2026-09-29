-- Migration number: 0001 	 Ventanas de rate limiting (ver src/lib/server/db/rateLimit.js).
--
-- Filas de vida corta: las de más de una hora se borran en cada escritura. Los `bucket`
-- nunca contienen datos que identifiquen a una persona (ni IPs).

CREATE TABLE IF NOT EXISTS rate_limits (
	bucket TEXT NOT NULL,
	window_start INTEGER NOT NULL,
	hits INTEGER NOT NULL,
	PRIMARY KEY (bucket, window_start)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS rate_limits_window_start ON rate_limits (window_start);
