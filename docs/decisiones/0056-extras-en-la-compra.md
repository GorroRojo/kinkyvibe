# 0056. Extras en la compra: descuentos solo para las entradas, canje en la puerta o la barra

- Fecha: 2026-11-04
- Estado: Aceptada

## Contexto

Les organizadores quieren vender, junto con las entradas, cosas que se entregan en el evento
(tragos, una remera…), pagadas en la misma compra, y tener una forma simple de pasarle la info a
quien está en la barra. Había que decidir cómo se mezclan con el Fondo, los códigos y el recargo
de Mercado Pago, cómo se cuentan en los reportes y cómo se entregan. gorrite aprobó el diseño en la
Mesa (4/11).

## Decisión

- Los extras se definen por evento, en la sección Entradas del editor: nombre, precio (pesos,
  mayor a 0), descripción corta y, opcionales, un tope total y un máximo por compra. Se guardan
  con la configuración de las entradas del evento (clave `extras`), sin tabla propia.
- Se eligen en la página de compra, después de las entradas (0 por defecto), y se pagan juntos
  (Mercado Pago o transferencia).
- **El Fondo y los códigos de descuento son solo para las entradas**; los extras van siempre a
  precio de lista. **El recargo de Mercado Pago es sobre todo lo que se paga por MP**, como hoy.
- El tope de un extra se controla como el cupo de las entradas: cuentan las aprobadas y las
  reservas vigentes, en la misma tanda que crea la orden (nunca se vende de más).
- Se ven en el mail de la compra, en la página de la entrada y en el panel (Órdenes, el CSV y
  Ventas, donde van en una línea «Extras» aparte: no se mezclan con lo recaudado por entradas).
- La puerta y la carga a mano también pueden sumar extras.
- **Canje:** se entregan de a uno («Entregar 1»), nunca más que lo comprado, y cada entrega queda
  en Actividad. En la puerta, al escanear una entrada. Para la barra, un **«Link de barra»** con el
  mismo modelo que el link de puerta (0052: token en el fragmento, vencimiento, revocable, mirado
  en cada pedido) que abre solo la barra de ese evento: buscar una entrada y entregar sus extras,
  con el nombre de la entrada y nada más (sin ingresos, ventas ni datos de quien compró), y un
  resumen «vendidos · entregados».
- Todo detrás del interruptor `extras`, apagado: apagado no cambia nada.

## Descartado

- Aplicar el Fondo o los códigos también a los extras: el Fondo cubre entradas y los códigos los
  pone la organización para las entradas.
- Una tabla aparte para definir los extras: la configuración de la venta ya vive en el evento.
- Cambiar los CHECK de `orders` para que `total` incluya los extras: exige reconstruir la tabla
  (borraría en cascada `order_answers`). `total` sigue siendo lo de las entradas y los extras van
  en `extras_amount` (migración 0077).
- Un link de puerta con permisos para la barra: la barra no tiene por qué ver ingresos, ventas ni
  mails; un alcance aparte es más simple de explicar y de revocar.

## Consecuencias

- Lo que se paga en total es `total + extras_amount` (`orderPaid`): lo cobra la preferencia de MP
  y lo compara el webhook. El recargo de MP (`surcharge_amount`) incluye la parte de los extras.
- Migración 0077: `orders.extras_amount`, tabla `order_extras` (con `delivered`) y
  `door_links.scope` (`puerta` o `barra`). Se aplica antes del merge (0028).
- Una venta en la puerta sin conexión no lleva extras (la pantalla los esconde sin conexión).
- Detalles en [tickets.md](../tickets.md#extras).
