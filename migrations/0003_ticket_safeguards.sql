-- Migration number: 0003 	 Venta de entradas: límites por cliente y órdenes para revisar.
--
-- client_hash: hash con sal (que rota cada día) de la conexión que creó la orden, para limitar
--   cuántas entradas puede tener reservadas a la vez un mismo cliente. Nunca se guarda la IP.
-- needs_review / review_detail: una orden que une admin tiene que mirar (se muestra en
--   /admin/entradas): 'late_payment' (pago aprobado con la reserva vencida, sin cupo),
--   'duplicate_payment' (otro pago aprobado para una orden ya pagada).

ALTER TABLE orders ADD COLUMN client_hash TEXT;
ALTER TABLE orders ADD COLUMN needs_review TEXT
	CHECK (needs_review IS NULL OR needs_review IN ('late_payment', 'duplicate_payment'));
ALTER TABLE orders ADD COLUMN review_detail TEXT;

CREATE INDEX IF NOT EXISTS orders_event_client ON orders (event_slug, client_hash, status);
CREATE INDEX IF NOT EXISTS orders_event_email ON orders (event_slug, buyer_email, status);
CREATE INDEX IF NOT EXISTS orders_needs_review ON orders (needs_review) WHERE needs_review IS NOT NULL;
