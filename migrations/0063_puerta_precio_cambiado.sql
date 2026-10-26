-- Migration number: 0063 	 2026-10-26T16:32:25.300Z
-- Vender en la puerta: precio cambiado a mano.
--
-- gorrite (12/10, probando la puerta con celus): en la puerta tiene que poder cobrar cualquier
-- precio y anotar algo. La nota va en la columna que ya existe (`admin_note`, la de la carga a
-- mano) y lo que se cobró en `unit_price`, como siempre. Lo que falta guardar es cuánto se
-- hubiera cobrado, para que el panel diga «Precio cambiado en la puerta: $ 5.000 en vez de
-- $ 12.000» aunque después cambie el `door_price` del evento.
--
-- - `door_list_price`: el precio en la puerta del tipo (`doorPrice` de
--   src/lib/utils/ticketTiers.js) en el momento de la venta, solo cuando quien vendió cobró otro
--   precio por entrada. NULL en todas las órdenes de antes y en las que se cobraron al precio de
--   siempre (sin relleno).
--
-- Solo agrega una columna que acepta NULL: no toca nada de lo que ya existe. El código que está en
-- `main` no la usa, así que se puede aplicar antes del merge
-- (docs/decisiones/0028-migraciones-antes-del-merge.md).
ALTER TABLE orders ADD COLUMN door_list_price INTEGER
	CHECK (door_list_price IS NULL OR door_list_price >= 0);
