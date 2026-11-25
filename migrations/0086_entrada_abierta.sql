-- Migration number: 0086 	 2026-11-25T18:31:33.360Z
-- «Con la entrada abierta ahora» en la Puerta (docs/tickets.md, «Entrada abierta»): la última vez
-- que la página de una entrada (`/entradas/t/<token>`) avisó que estaba abierta y a la vista en un
-- celu. Solo eso: ni el celu, ni la IP, ni la hora de cada aviso. Se escribe solo el día del evento
-- (como mucho una vez por minuto por entrada) y se borra sola después del evento (cron de cada 15
-- minutos, `clearPresenceAfterEvents` en src/lib/server/tickets/presence.js).
--
-- Solo agrega una columna (NULL = nunca o ya borrada) y un índice parcial, así que anda con el
-- código de `main` (decisión 0028). El código que la usa no se rompe si todavía no está: cada
-- consulta va en try/catch y la Puerta no muestra la sección.

ALTER TABLE tickets ADD COLUMN last_seen_at INTEGER;

-- Solo las entradas con valor (pocas, y solo el día del evento): la Puerta y la limpieza las leen
-- sin recorrer toda la tabla.
CREATE INDEX IF NOT EXISTS tickets_last_seen ON tickets (event_slug, last_seen_at)
	WHERE last_seen_at IS NOT NULL;
