# 0051. «Reembolsar todas» para un evento cancelado

- Fecha: 2026-10-26
- Estado: Aceptada. Decidido por gorrite en la Mesa (tarjeta `plata-detalles-venta`, opción 4b).
  Cambia una parte de [0044](0044-reglas-de-la-venta-de-entradas.md): cómo se devuelve todo cuando
  se cancela un evento.

## Contexto

Con 0044, cuando se cancela un evento se le devuelve todo a todes desde el panel, orden por orden
(«Reembolsar…» en cada orden de Ventas › Órdenes). Con muchas ventas eso son decenas de clicks, es
fácil saltearse una y no hay un resumen de qué salió y qué no.

## Decisión

- La pestaña Órdenes de un evento **cancelado** muestra «Reembolsar todas», con la **cantidad
  exacta** de órdenes de Mercado Pago sin reembolsar y el **total**.
- Es **solo para admins** (`requireAdmin`) y solo para las órdenes de ese evento.
- Hay un paso de confirmación en la misma página (sin `window.confirm`): hay que escribir
  **REEMBOLSAR**. El servidor vuelve a contar y, si la cantidad o el total cambiaron desde que se
  abrió la página, no hace nada y muestra los números nuevos.
- Cada orden pasa por **el mismo paso que «Reembolsar…»** (`refundFromPanel`, sin lógica nueva de
  Mercado Pago): el reembolso total en MP, con la clave de idempotencia `refund-<orden>`, y después
  la orden se marca como reembolsada. Lo que sigue también es lo mismo: el mail «Reembolsamos tu
  compra», la entrada en Actividad (`order.refund`) y la lista de espera.
- Se procesan **una después de otra, de a 10 por pedido**, en orden de compra. Si quedan más,
  aparece «Seguir con las N que faltan».
- **Nunca reembolsa dos veces:** una orden ya reembolsada no se le vuelve a pedir a MP. Dos
  pedidos a la vez mandan la misma clave de idempotencia, y la orden se marca una sola vez, así que
  sale un solo mail.
- **Si MP da error** (o la respuesta se corta), antes de darla por fallida se le pregunta a MP por
  el pago: si ya figura reembolsado, la orden se marca y cuenta como hecha. Si no, queda como estaba
  (aprobada) y el resumen pide revisar el pago en Mercado Pago antes de devolverlo a mano, para no
  pagarlo dos veces. Un error en una orden no corta la tanda. Al final se ve un resumen:
  reembolsadas y sin reembolsar, con el motivo.
- Cada tanda queda en Actividad (`event.refund_all`, con el resultado de cada orden) y en el log
  del Worker.
- **Las ventas en la puerta, las cargadas a mano y las transferencias no pasan por MP:** se listan
  aparte como «Para devolver a mano». Después de devolver la plata por fuera, se marcan con
  «Reembolsar…» en su orden, como hoy.

## Descartado

- Reembolsar solo al cancelar el evento: cancelar tiene que poder hacerse sin mover plata, y la
  decisión de devolver queda a la vista y confirmada aparte.
- Reembolsarlas todas en un solo pedido: con muchas órdenes, se pasaría de los límites de tiempo y
  de subpedidos de un pedido del Worker.
- Un `window.confirm`: es fácil de aceptar sin leer. Escribir la palabra obliga a mirar la cantidad
  y el total.
- Marcar como reembolsadas las de la puerta o las transferencias sin devolver la plata.

## Consecuencias

- Código: `src/lib/server/admin/refunds.js` (`refundFromPanel`, `refundAllPreview`,
  `refundAllBatch`), la acción `refundAll` y `afterRefund` en `src/lib/server/admin/eventActions.js`,
  y la pestaña `admin/eventos/[slug]/ordenes`. «Reembolsar…» de una orden usa el mismo
  `refundFromPanel`.
- Sigue sin haber reembolsos parciales desde el panel (0044) y cancelar un evento no reembolsa solo
  ni avisa por mail: «Reembolsar todas» es un paso aparte.
- Detalle en [tickets.md](../tickets.md#reembolsos). Plan: `plata-reembolsar-todas`.
