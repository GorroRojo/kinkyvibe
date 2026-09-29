-- Migration number: 0001 	 Contador anónimo de "Me interesa" para eventos del calendario.
--
-- Privacidad: no se guarda nada que identifique a una persona. `visitor_hash` es
-- SHA-256(sal : evento : id aleatorio de la cookie), así que no se puede relacionar
-- el mismo navegador entre eventos distintos ni volver al id original.

CREATE TABLE IF NOT EXISTS event_interest (
	event_slug TEXT NOT NULL,
	visitor_hash TEXT NOT NULL,
	PRIMARY KEY (event_slug, visitor_hash)
) WITHOUT ROWID;

-- Ventanas de rate limiting de vida corta (las viejas se borran en cada escritura).
CREATE TABLE IF NOT EXISTS rate_limits (
	bucket TEXT NOT NULL,
	window_start INTEGER NOT NULL,
	hits INTEGER NOT NULL,
	PRIMARY KEY (bucket, window_start)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS rate_limits_window_start ON rate_limits (window_start);
