-- Migration number: 0027 	 Nivel de privacidad «Sólo dirección» (`address`) en el lugar de cada evento.
--
-- `event_venues.privacy` (migración 0017) tiene un CHECK con 'public', 'name', 'area' y 'hidden'.
-- gorrite aprobó un nivel nuevo, `address`: la dirección (calle y número, barrio, ciudad) y el
-- mapa, sin el nombre del lugar (por ejemplo una casa particular). SQLite no deja cambiar un
-- CHECK, así que la tabla se rehace con el CHECK nuevo, igual que 0024.
--
-- - Nada apunta a `event_venues` (ninguna foreign key ni trigger), así que se puede borrar y
--   renombrar sin tocar otras tablas. Su índice se borra con la tabla y se vuelve a crear.
-- - Las filas pasan tal cual: el CHECK nuevo solo agrega un valor.
-- - El código que está en `main` nunca escribe `address`, así que se puede aplicar antes del
--   merge (docs/decisiones/0028-migraciones-antes-del-merge.md).
-- - 0026 queda libre para otro PR abierto.
CREATE TABLE event_venues_new (
	event_slug TEXT PRIMARY KEY CHECK (length(event_slug) BETWEEN 1 AND 100),
	venue_id INTEGER NOT NULL REFERENCES objects (id) ON DELETE CASCADE,
	privacy TEXT CHECK (privacy IS NULL OR privacy IN ('public', 'name', 'address', 'area', 'hidden')),
	created_at INTEGER NOT NULL,
	created_by TEXT NOT NULL,
	updated_at INTEGER NOT NULL,
	updated_by TEXT NOT NULL
) WITHOUT ROWID;

INSERT INTO event_venues_new (event_slug, venue_id, privacy, created_at, created_by, updated_at,
	updated_by)
SELECT event_slug, venue_id, privacy, created_at, created_by, updated_at, updated_by
FROM event_venues;

DROP TABLE event_venues;

ALTER TABLE event_venues_new RENAME TO event_venues;

-- "Los eventos de este lugar".
CREATE INDEX IF NOT EXISTS event_venues_venue ON event_venues (venue_id);
