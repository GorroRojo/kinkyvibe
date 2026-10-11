# 0035. La puerta vende sin conexión

- Fecha: 2026-10-11
- Estado: Aceptada (decisión de gorrite, 11/10). Completa 0006 (venta en puerta y pasar límites):
  sin conexión, un límite no frena la venta, solo avisa.

## Contexto

El modo puerta ya validaba QR y códigos sin conexión (lista guardada en el celu e ingresos en
cola), pero «Vender en puerta» necesitaba conexión: el servidor controla el cupo en la misma
sentencia que crea la orden. En la puerta la señal se corta justo cuando más gente llega, y quien
vende no puede decirle a alguien con la plata en la mano que vuelva más tarde.

## Decisión

- **Sin conexión, «Vender en puerta» sigue andando.** La venta queda en el celu (la misma
  `localStorage` que la cola de ingresos sin conexión) con un id que le pone el celu, el medio y la
  hora.
- **Los medios son los de siempre: efectivo o transferencia ya recibida.** Con transferencia sin
  conexión, quien vende confirma que la vio llegar («Vi que llegó la transferencia»).
- **Las personas cuentan como adentro al toque en ese celu**, y la venta se ve como «pendiente de
  sincronizar». El aviso de sin conexión pone «vender en la puerta» entre lo que sigue andando y
  dice cuántas ventas faltan («2 ventas por sincronizar»).
- **Al volver la conexión, las ventas se mandan solas y en orden**, con la misma función que la
  venta con conexión (`sellAtDoor`) y la misma validación (`parseDoorSale`). **Idempotente**: el id
  del celu queda en la orden (`orders.client_sale_id`, único), así un reintento nunca crea otra
  orden.
- **Si mientras tanto se llenó el cupo o se agotó un tipo, la venta se guarda igual** («les
  organizadores tienen que tener el control de su propio evento; como mucho, un aviso»). Lo mismo
  si pasa el máximo por venta, el evento es solo anticipadas o se canceló. Queda en
  «Para revisar» (`orders.offline_review`, con los límites que pasó) y el celu muestra un aviso
  después de sincronizar. Nunca se pierde una venta en silencio: si el servidor no la puede
  registrar (un tipo que ya no existe), el celu la deja a la vista hasta que alguien la descarta.
- Antes de guardar, el celu avisa con el mismo diálogo de siempre si, con lo que sabe (la lista de
  cuando había conexión y las ventas sin conexión), pasaría un límite. Es solo un aviso.
- **Con conexión nada cambia.** Sin conexión no se ve el DNI completo (como antes) y **el DNI no
  se guarda en el celu**: la venta sin conexión se hace sin DNI.

## Descartado

- Rechazar la venta al sincronizar si ya no hay cupo: la plata ya se cobró y la persona ya entró.
- IndexedDB para la cola: la cola de ingresos ya usa `localStorage` y alcanza para unas decenas de
  ventas; dos almacenamientos distintos para lo mismo complican sin ganar nada.
- Guardar el DNI en el celu para mandarlo después: el DNI nunca va a `localStorage` (docs/entradas.md).

## Consecuencias

- Migración 0051 (solo agrega): `orders.client_sale_id` (índice único parcial) y
  `orders.offline_review` (JSON). Va a producción antes del merge (0028).
- «Para revisar» suma las órdenes con `offline_review` (fila «Venta sin conexión de … que pasó un
  límite», con «Marcar como revisada» en Órdenes, que limpia la marca).
- Ver docs/tickets.md (modo puerta, «Sin conexión») y docs/entradas.md.
