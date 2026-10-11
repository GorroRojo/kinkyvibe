-- Migration number: 0046 	 «Dejar como texto» en Lugares → Vincular lugares.
--
-- Vincular lugares (/admin/eventos/lugares/vincular, docs/amigues.md) le sugiere a le admin, para
-- cada «Dónde» escrito a mano en los eventos sin lugar, el perfil de lugar que probablemente es.
-- Si le admin elige «Dejar como texto», ese evento no se vuelve a sugerir. Va en una tabla aparte
-- y no en `objects.data` del evento: no es un dato del evento (no cambia lo que se ve) y guardarlo
-- ahí le subiría la versión y lo marcaría como editado.
--
-- - Una fila por evento. Sin fila = se sugiere.
-- - `place_key`: el «Dónde» del evento cuando se dejó como texto (nombre y dirección normalizados,
--   `placeKeyOf` en src/lib/utils/venueMatch.js). Si después alguien cambia el «Dónde», la clave
--   ya no coincide y el evento se vuelve a sugerir. No es un id: es el mismo texto que ya tiene el
--   evento, normalizado.
-- - «Volver a sugerir» borra la fila. Borrar el evento (de verdad) borra la fila.
-- - Solo agrega una tabla: no toca nada de lo que ya existe. El código que está en `main` no la
--   usa, así que se puede aplicar antes del merge (docs/decisiones/0028-migraciones-antes-del-merge.md).
CREATE TABLE IF NOT EXISTS event_venue_dismissals (
	event_id INTEGER PRIMARY KEY REFERENCES objects (id) ON DELETE CASCADE,
	place_key TEXT NOT NULL CHECK (length(place_key) <= 600),
	dismissed_at INTEGER NOT NULL, -- ms desde epoch
	dismissed_by TEXT NOT NULL -- login de GitHub de le admin
) WITHOUT ROWID;
