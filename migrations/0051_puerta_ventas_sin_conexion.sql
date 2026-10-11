-- Migration number: 0051 	 Vender en la puerta sin conexión: id del celu y marca para revisar.
--
-- Decisión 0035 (gorrite, 11/10): el modo puerta vende aunque no haya conexión. La venta queda en
-- el celu y, cuando vuelve la conexión, se manda al servidor (`applyQueuedSales` de
-- src/lib/server/tickets/door.js), que la registra con la misma función que la venta en la puerta
-- de siempre (`sellAtDoor`).
--
-- - `client_sale_id`: el id que el celu le puso a la venta. Único (índice parcial): si el celu
--   reintenta (se cortó la conexión en el medio del envío), la segunda vez no crea otra orden.
--   NULL en todas las órdenes de antes y en las que no vienen de una venta sin conexión.
-- - `offline_review`: si al sincronizar la venta pasó algún límite (cupo, tipo agotado, máximo por
--   venta, solo anticipadas, cancelado), la venta se guarda igual (decide quien organiza) y acá
--   quedan esos límites en JSON (los mismos de overrides.js, sin datos de personas). La orden sale
--   en «Para revisar» hasta que une admin la marca como revisada (vuelve a NULL).
--
-- Solo agrega dos columnas y dos índices: no toca nada de lo que ya existe. El código que está en
-- `main` no las usa, así que se puede aplicar antes del merge
-- (docs/decisiones/0028-migraciones-antes-del-merge.md).
ALTER TABLE orders ADD COLUMN client_sale_id TEXT
	CHECK (client_sale_id IS NULL OR length(client_sale_id) BETWEEN 8 AND 64);

ALTER TABLE orders ADD COLUMN offline_review TEXT
	CHECK (offline_review IS NULL OR json_valid(offline_review));

CREATE UNIQUE INDEX IF NOT EXISTS orders_client_sale_id ON orders (client_sale_id)
	WHERE client_sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_offline_review ON orders (offline_review)
	WHERE offline_review IS NOT NULL;
