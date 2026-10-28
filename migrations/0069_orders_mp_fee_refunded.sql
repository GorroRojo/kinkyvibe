-- Migration number: 0069 	 2026-10-26T23:41:41.845Z
-- Comisión real de Mercado Pago y reembolsos parciales hechos desde MP (solo para los reportes
-- del panel; decisión de gorrite, Mesa `plata-numeros-panel`; auditoría de plata M9 y M11).
--
-- Dos columnas nuevas en `orders`, vacías (NULL) en todas las órdenes que ya existen: no se
-- rellena nada. Las escribe el aviso de Mercado Pago (`recordPaymentAmounts` en
-- src/lib/server/tickets/orders.js) desde el pago que devuelve `GET /v1/payments/{id}`:
-- - `mp_fee_amount`: lo que cobró MP por el pago, en pesos (la suma de `fee_details[].amount` con
--   `fee_payer = 'collector'`). NULL = MP no lo informó: el panel usa la estimación con la tasa de
--   Ajustes (el recargo) y lo dice («Neto estimado»).
-- - `refunded_amount`: lo reembolsado desde el panel de MP en un pago que sigue aprobado
--   (`transaction_amount_refunded`, reembolso parcial), en pesos. NULL o 0 = nada. Un reembolso
--   total sigue pasando la orden a `refunded`, como siempre.
--
-- Nada de esto cambia lo que se cobra ni lo que ve quien compra. El código de `main` no lee estas
-- columnas: se puede aplicar antes del merge (docs/decisiones/0028-migraciones-antes-del-merge.md),
-- y el código nuevo las necesita aplicadas.

ALTER TABLE orders ADD COLUMN mp_fee_amount INTEGER
	CHECK (mp_fee_amount IS NULL OR mp_fee_amount >= 0);

ALTER TABLE orders ADD COLUMN refunded_amount INTEGER
	CHECK (refunded_amount IS NULL OR refunded_amount >= 0);
