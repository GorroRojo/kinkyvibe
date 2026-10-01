-- Migration number: 0030 	 Notas en los días de la agenda del panel (/admin/eventos/agenda).
--
-- Una nota corta en un día ("feriado", "no reservar el lugar"), con un color de una paleta fija.
-- Solo las ven y escriben les admins, en el calendario y la planilla de la agenda: nunca van a
-- páginas públicas ni al .ics. Cada alta, cambio y baja queda en admin_audit.
--
-- - Solo agrega una tabla: el código que está en `main` no la usa, así que se puede aplicar antes
--   del merge (docs/decisiones/0028-migraciones-antes-del-merge.md).
-- - `color` no lleva CHECK a propósito: la paleta vive en el código ($lib/utils/dayNotes.js) y un
--   color que ya no existe se muestra con el de por defecto. Así cambiar la paleta no pide rehacer
--   la tabla.
-- - 0028 y 0029 quedan para otros PRs abiertos.
CREATE TABLE IF NOT EXISTS agenda_day_notes (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 200),
	color TEXT NOT NULL,
	created_at INTEGER NOT NULL, -- ms desde epoch
	created_by TEXT NOT NULL, -- login de le admin
	updated_at INTEGER NOT NULL,
	updated_by TEXT NOT NULL
);

-- Las notas de un rango de días (lo que muestra la agenda).
CREATE INDEX IF NOT EXISTS agenda_day_notes_date ON agenda_day_notes (date);
