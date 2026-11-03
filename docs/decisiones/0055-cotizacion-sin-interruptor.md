# 0055. La cotización para kv-fondo anda aunque PayPal esté apagado

- Fecha: 2026-11-03
- Estado: Aceptada. Decidido por gorrite (Mesa de trabajo). Cambia un punto de
  [0054](0054-paypal-en-las-propinas.md): «Todo sale detrás del interruptor `paypal`».

## Contexto

fondo.kinkyvibe.ar convierte sus suscripciones mensuales en dólares con `GET /api/fondo/cotizacion`
para calcular el porcentaje del Fondo. Con el endpoint detrás del interruptor `paypal`, si el
interruptor estaba apagado cuando entraba la primera suscripción en dólares, el porcentaje quedaba
congelado en el último valor.

## Decisión

- `GET /api/fondo/cotizacion` contesta siempre, con o sin el interruptor `paypal`, igual que
  `GET /api/fondo/propinas-total`, que no depende de `propinas_fondo`. Sigue siendo de solo lectura y
  con el secreto compartido, y no muestra nada en el sitio.
- Todo lo demás de [0054](0054-paypal-en-las-propinas.md) sigue igual: el campo `paypal` de
  `propinas-total` y lo del panel siguen detrás del interruptor.
