-- Migration number: 0039 	 Talleres en varias partes: ingreso por parte con una sola entrada.
--
-- Un taller en varias partes es un evento (el taller, que es también la parte 1) con edges
-- `parte` hacia los eventos de las otras partes (docs/talleres-partes.md). Los edges no necesitan
-- migración (saveObject() los escribe); esta tabla sí: con la entrada del taller (por defecto, una
-- sola entrada vale para todas las partes), el modo puerta de cada parte marca el ingreso ACÁ, por
-- parte, y no en `tickets.checked_in_at` (que sigue siendo el ingreso de la parte 1, el taller).
--
-- - `ticket_id`: la entrada (del taller); se borra con ella.
-- - `part_slug`: la dirección de la página de la parte («…-parte-2»), como `tickets.event_slug`.
-- - Una fila por entrada y parte: marcar dos veces la misma parte da «Ya ingresó».
CREATE TABLE IF NOT EXISTS ticket_part_checkins (
	ticket_id TEXT NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
	part_slug TEXT NOT NULL CHECK (length(part_slug) BETWEEN 1 AND 200),
	checked_in_at INTEGER NOT NULL,
	checked_in_by TEXT NOT NULL,
	PRIMARY KEY (ticket_id, part_slug)
);

CREATE INDEX IF NOT EXISTS ticket_part_checkins_part ON ticket_part_checkins (part_slug);
