-- Migration number: 0008 	 Entradas: reembolsos desde el admin.
--
-- Quién reembolsó (o marcó como reembolsada una transferencia devuelta a mano) y cuándo. Una
-- orden `refunded` ya no cuenta para el cupo, los usos de códigos ni los totales del fondo, y sus
-- entradas quedan anuladas en el control de ingreso. Si el reembolso llega por el webhook de MP,
-- `refunded_by` queda NULL.
ALTER TABLE orders ADD COLUMN refunded_at INTEGER;
ALTER TABLE orders ADD COLUMN refunded_by TEXT;
