-- Migration number: 0087 	 2026-11-25T20:00:00.000Z
-- Formularios: un link por entrada (docs/formularios.md, «El link personal»; plan
-- `formularios-link-por-entrada`). Creada a mano con el formato de `npm run db:migrations:new`
-- (0084, 0085 y 0086 están reservadas para otros PRs). Solo agrega una tabla (vacía) y una columna
-- NULL, así que anda con el código de antes (decisión 0028).
--
-- Una orden con varias entradas recibe un mail con un link por entrada. La entrada 1 sigue usando
-- el link de siempre y su marca `form_sends.used`; las demás se marcan acá.
--
-- - `form_ticket_uses`: una fila cuando ya se usó el link de la entrada `ticket` (2 o más, por el
--   orden de `tickets.rowid` dentro de la orden) de una orden para un formulario. No guarda cuándo
--   ni qué se respondió. Sin foreign key a `orders`, a propósito (como `form_sends`, ver 0079).
-- - `form_responses.ticket`: en una respuesta con nombre que llegó por un link personal, el número
--   de entrada (1, 2…). NULL en las anónimas (lo impide el CHECK) y en las demás. Las respuestas con
--   nombre de antes, con orden y sin número, son de la entrada 1 (lo resuelve el código al leer).

CREATE TABLE IF NOT EXISTS form_ticket_uses (
	form_id INTEGER NOT NULL REFERENCES forms (id) ON DELETE CASCADE,
	order_id TEXT NOT NULL,
	ticket INTEGER NOT NULL CHECK (ticket >= 2),
	PRIMARY KEY (form_id, order_id, ticket)
);

ALTER TABLE form_responses ADD COLUMN ticket INTEGER CHECK (ticket IS NULL OR (anonymous = 0 AND ticket >= 1));
