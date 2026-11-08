-- Migration number: 0076 	 2026-11-04T18:32:36.988Z
-- «Facturada»: la marca que pone une admin cuando ya facturó una compra (Ventas › Órdenes de cada
-- evento y Ventas › Compras para facturar; docs/tickets.md, «Compras para facturar»). Solo la ve
-- el panel de admins: ni les organizadores ni la página pública. Creada con
-- `npm run db:migrations:new` (salió 0076).
--
-- Dos columnas nuevas en `orders`, vacías (NULL) en todas las órdenes que ya existen (ninguna
-- está facturada todavía; no se rellena nada):
-- - `invoiced_at`: cuándo se marcó, en ms. NULL = sin facturar. Desmarcarla la vuelve a NULL.
-- - `invoiced_by`: el login de quien la marcó (como `confirmed_by` y `refunded_by`).
--
-- Marcarla no toca `updated_at`: el panel y el bot usan esa columna como el momento de la venta.
--
-- El índice parcial es para la lista de las que faltan (las aprobadas con plata, sin marcar),
-- de la más vieja a la más nueva; las facturadas no entran.
--
-- Solo agrega columnas que pueden quedar vacías y un índice: anda con el código de `main`
-- (decisión 0028) y se puede aplicar antes del merge.

ALTER TABLE orders ADD COLUMN invoiced_at INTEGER
	CHECK (invoiced_at IS NULL OR invoiced_at > 0);

ALTER TABLE orders ADD COLUMN invoiced_by TEXT;

CREATE INDEX IF NOT EXISTS orders_to_invoice ON orders (created_at)
	WHERE status = 'approved' AND total > 0 AND invoiced_at IS NULL;
