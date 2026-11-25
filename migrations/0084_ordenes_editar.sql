-- Migration number: 0084 	 «Editar» una compra en Ventas › Órdenes (docs/tickets.md, «Editar una
-- compra»). Cada vez que une admin corrige los datos de una compra (quien compró, cada entrada o
-- las respuestas) queda una fila acá con lo que había y lo que quedó; «Deshacer» agrega otra fila
-- (con `undoes`), nunca borra ni cambia una vieja.
--
-- Va en su propia tabla y no en `admin_audit` porque guarda datos de quien compró (nombres, mail,
-- respuestas), y el registro de actividad no guarda datos de personas: ahí solo va qué se cambió.
-- Mismo trato que `orders`: solo admins, sin purga.
--
-- Sin foreign key a `orders` a propósito: `orders` se reconstruyó varias veces (0005, 0010, 0082)
-- y una tabla más que apunte a ella es una más para cuidar en la próxima. `order_id` se busca
-- siempre junto con `event_slug`.
--
-- Solo agrega una tabla; no toca ninguna que ya exista, así que anda con el código de `main`
-- (decisión 0028).
--
--   order_id   la orden;
--   event_slug su evento (para leer todas las de un evento de una vez);
--   at         cuándo (ms);
--   by         login de quien lo cambió;
--   changes    JSON `[{ key, label, before, after }]`: `key` es `buyer.name`, `buyer.pronouns`,
--              `buyer.email`, `holder.<n>.name`, `holder.<n>.pronouns` (n desde 0) o
--              `answer.<pregunta>` / `answer.<pregunta>.<entrada>` (entrada desde 1); `''` es vacío;
--   undoes     si es un «Deshacer», el id de la fila que deshace.

CREATE TABLE IF NOT EXISTS order_edits (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	order_id TEXT NOT NULL,
	event_slug TEXT NOT NULL,
	at INTEGER NOT NULL,
	by TEXT NOT NULL,
	changes TEXT NOT NULL CHECK (json_valid(changes)),
	undoes INTEGER
);

CREATE INDEX IF NOT EXISTS order_edits_event ON order_edits (event_slug, order_id);
CREATE UNIQUE INDEX IF NOT EXISTS order_edits_undoes ON order_edits (undoes) WHERE undoes IS NOT NULL;
