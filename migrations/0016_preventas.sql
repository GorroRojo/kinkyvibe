-- Migration number: 0016 	 Preventas escalonadas: tramo de precio de cada orden.
--
-- Un tipo de entrada puede tener tramos (`tiers` en el frontmatter): "los primeros 5 a $ 8.000,
-- los 10 siguientes a $ 9.000…" o "hasta el 9/10 a $ 8.000, después $ 10.000". Cada orden online
-- guarda el tramo con el que se compró (`ticket_tier`, el `id` del tramo), para contar cuántas
-- entradas quedan en cada tramo dentro de la misma sentencia atómica que reserva el cupo.
--
-- NULL = el tipo no tiene tramos, o la orden es del panel (venta en la puerta, carga a mano):
-- esas no gastan lugares de las preventas. Solo agrega una columna y un índice (aditiva).

ALTER TABLE orders ADD COLUMN ticket_tier TEXT;

CREATE INDEX IF NOT EXISTS orders_event_type_tier ON orders (event_slug, ticket_type, ticket_tier)
	WHERE ticket_tier IS NOT NULL;
