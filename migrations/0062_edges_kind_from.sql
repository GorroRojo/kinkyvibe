-- Migration number: 0062 	 2026-10-25T06:38:36.620Z
-- Índice de los vínculos por clase y origen: las consultas que buscan todos los vínculos de una
-- clase (por ejemplo, todos los «lugar» de los eventos, `eventVenuesStamp` en
-- src/lib/server/amigues/venues.js, o todas las etiquetas de los posts) recorrían la tabla entera
-- (`edges_to` empieza por `to_id` y el índice único, por `from_id`).
--
-- Solo agrega un índice; no cambia ninguna tabla, así que anda con el código de `main`
-- (decisión 0028).
CREATE INDEX IF NOT EXISTS edges_kind_from ON edges (kind, from_id);
