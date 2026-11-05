-- Migration number: 0077 	 2026-11-04T12:00:00.000Z
-- Extras en la compra de entradas (docs/tickets.md, «Extras»; decisión 0056; plan
-- `extras-compra`): tragos, una remera… que se suman a las entradas en la misma compra y se
-- canjean en la puerta o en la barra. Prototipo detrás del interruptor `extras` (apagado).
-- Número 0077: la 0075 de main ya está, #549 tiene otra 0075 sin mergear (se va a renumerar) y #627
-- usa la 0076.
--
-- Solo agrega: una columna con valor por defecto en `orders`, una columna con valor por defecto
-- en `door_links` y una tabla nueva. Anda con el código de `main` de antes de este PR (decisión
-- 0028): ese código no nombra nada de esto, `SELECT *` trae las columnas nuevas y las ignora, y
-- los INSERT de `orders` y `door_links` que no las nombran quedan con el valor por defecto (0 y
-- 'puerta', lo de siempre).
--
-- 1. `orders.extras_amount`: lo que suman los extras de la orden (precio de lista × cantidad; sin
--    Fondo ni descuento, decisión 0056). Los CHECK de 0002/0010 sobre `total` no cambian:
--    `total = subtotal − descuento + recargo` sigue siendo la parte de las **entradas**, y el
--    recargo de Mercado Pago (`surcharge_amount`) es el de todo lo que se paga por MP. Lo que se
--    paga en total es `total + extras_amount` (`orderPaid` en src/lib/utils/extras.js): eso cobra la
--    preferencia de MP y eso compara el webhook. Así no hay que reconstruir `orders` (que borraría
--    en cascada `order_answers`) y la recaudación por entradas de los reportes no se mezcla con
--    los extras.
ALTER TABLE orders ADD COLUMN extras_amount INTEGER NOT NULL DEFAULT 0 CHECK (extras_amount >= 0);

-- 2. Una fila por extra de cada orden: nombre y precio copiados al comprar (si después cambian en
--    el evento, la orden queda como se compró). `delivered`: cuántos se entregaron en la puerta o
--    la barra («Entregar 1»); nunca más que `quantity`.
--    `extras_stock`: el tope de un extra se controla en la misma tanda que la orden. Si no alcanza,
--    el INSERT pone cantidad 0, este CHECK falla y la tanda entera (con la orden) se deshace
--    (src/lib/server/tickets/extras.js).
CREATE TABLE IF NOT EXISTS order_extras (
	order_id TEXT NOT NULL REFERENCES orders (id),
	event_slug TEXT NOT NULL,
	extra_id TEXT NOT NULL,
	name TEXT NOT NULL,
	unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
	quantity INTEGER NOT NULL CONSTRAINT extras_stock CHECK (quantity >= 1),
	delivered INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL,
	updated_at INTEGER,
	PRIMARY KEY (order_id, extra_id),
	CHECK (delivered >= 0 AND delivered <= quantity)
);
-- Lo vendido y entregado de cada extra del evento (el tope y el resumen de la barra).
CREATE INDEX IF NOT EXISTS order_extras_event ON order_extras (event_slug, extra_id);

-- 3. Links de barra: el mismo link de 0067 con otro alcance. `puerta` (lo de siempre) abre la
--    puerta; `barra` abre solo /barra/<evento> (ver y entregar extras, sin ingreso ni ventas).
ALTER TABLE door_links ADD COLUMN scope TEXT NOT NULL DEFAULT 'puerta'
	CHECK (scope IN ('puerta', 'barra'));
