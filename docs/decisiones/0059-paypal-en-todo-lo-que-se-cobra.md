# 0059. PayPal en todo lo que se cobra: propinas y entradas

- Fecha: 2026-11-06
- Estado: Aceptada. Pedido de gorrite (6/11: «PayPal como forma de pago para todo»); lo que
  estaba «A confirmar» lo respondió gorrite en #652 (7/11). Queda A CONFIRMAR solo la tarifa de
  PayPal por defecto (5,4 % + US$ 0,30), contra la cuenta de verdad.
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
- **PayPal es una opción por evento**, como la transferencia, prendida por defecto (`paypal: false`
  en el evento la apaga).
- **Con recargo, como Mercado Pago**: quien compra paga la comisión de PayPal (porcentaje + fijo en
  dólares, en Ajustes › PayPal), en `surcharge_amount`; los reportes y el reparto lo tratan igual
  que el de MP.
- Las propinas se eligen en pesos y se convierten, sin recargo. Cancelar en PayPal cancela la
  compra. «Reembolsar todas» devuelve también las de PayPal por la API. Con una cotización de más
  de 5 días PayPal no se ofrece y la vigilancia avisa a les admins una vez por día.

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
