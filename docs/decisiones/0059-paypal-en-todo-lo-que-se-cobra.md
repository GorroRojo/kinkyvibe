# 0059. PayPal en todo lo que se cobra: propinas y entradas

- Fecha: 2026-11-06
- Estado: Propuesta. Pedido de gorrite (6/11: «PayPal como forma de pago para todo»); lo marcado
  «A confirmar» lo eligió Claude como opción por defecto y espera el visto bueno de gorrite.
  Completa [0054](0054-paypal-en-las-propinas.md).

## Contexto

0054 decidió PayPal para las propinas (app compartida con el Fondo, dólares netos, cotización
propia). gorrite pidió PayPal para todo lo que cobra el sitio: también la compra de entradas. La
puerta (efectivo o MP) y las suscripciones del Fondo (fondo.kinkyvibe.ar) quedan afuera.

## Decisión

- **Mismo cobro para propinas y entradas**: Orders v2 por REST con `fetch` (sin SDK), captura al
  volver de PayPal y el webhook como respaldo; nunca se confía en el navegador ni en el cuerpo del
  webhook (el estado sale de la API). `custom_id` `kv-propina:<id>` o `kv-entrada:<orden>`; lo que
  no empieza con `kv-` se ignora (la app es la del Fondo también).
- **Las entradas entran por el mismo camino que Mercado Pago** (`processPayment`), con
  `payment_method = 'paypal'` (migración 0082, que reconstruye `orders`). El total sigue en pesos;
  lo cobrado en dólares, la base y el ajuste se guardan en la orden. Así reportes, reparto, Fondo,
  mails y «Cada venta» no cambian.
- **Cuánto se cobra**: `ceil(pesos / (base × (1 + ajuste / 100)))` al centavo de dólar, con la base
  del día (o la última de hasta 5 días antes). Quien paga ve los dólares antes de ir a PayPal.
- **A confirmar**: PayPal en todos los eventos con MP (sin casilla por evento); sin recargo por la
  comisión de PayPal; la conversión usa el ajuste; las propinas siguen eligiéndose en pesos;
  cancelar en PayPal cancela la compra enseguida; «Reembolsar todas» no incluye las de PayPal.

## Descartado

- **El SDK de PayPal**: es para Node; en Workers alcanza con `fetch`.
- **Guardar el cobro de PayPal en `mp_payment_id`**: mezclaría los dos medios en los reembolsos y
  los reportes; va en `paypal_capture_id`.
- **Una tabla aparte para los pagos de PayPal de las entradas**: `payment_method` tiene un CHECK y
  todo el panel lee el medio de ahí; sin `paypal` en `orders` habría que tocar cada reporte.

## Consecuencias

- La migración 0082 reconstruye `orders` (como 0005 y 0010) y copia antes lo que el `DROP` borraría
  en cascada (`order_answers`, `free_order_choices`). Va a producción antes del merge (0028), con
  un marcador de Time Travel.
- Detrás del interruptor `paypal`; sin las credenciales o sin cotización reciente, no se ofrece.
- Detalle y la lista para prenderlo: [paypal.md](../paypal.md).
