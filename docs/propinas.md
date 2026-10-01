# Propinas

## Qué hace

Al pie de las publicaciones con la etiqueta **KinkyVibe** (material y eventos), un bloque "¿Te
sirvió? Dejá una propina" en lugar de la nota del cafecito. La persona elige $ 1.000, $ 2.000,
$ 5.000 u "Otro monto" (entre $ 500 y $ 500.000), puede sumar un mensaje (hasta 280 caracteres,
solo lo leen les admins) y paga con **Mercado Pago**. Al volver, ve una página de gracias.

- No hace falta cuenta y no pedimos datos: ni nombre ni mail (MP pide lo suyo en su checkout).
- La plata entra a **la misma cuenta de MP que las entradas**. No va al Fondo KinkyVibe.
- El link a Cafecito del pie de página (Footer) sigue igual.

Está detrás del interruptor **Propinas** (Ajustes → Interruptores), apagado por defecto. Apagado,
las publicaciones muestran la nota del cafecito de siempre y `/propinas` da 404. La variable
`PROPINAS_ENABLED` manda sobre el panel (`1` prendido, `0` apagado; ver `src/lib/server/flags.js`).

## Lo que nunca se tiene que romper

- **El monto lo decide el servidor.** El formulario manda un monto sugerido u "otro" + el número;
  `validateTip` (`src/lib/utils/propinas.js`) lo valida en el servidor con el mínimo y el máximo.
- **Nadie aprueba una propina desde el navegador.** El estado (`pending` → `approved` /
  `rejected` / `refunded`) lo cambia solo un pago pedido a la API de MP: el webhook firmado o el
  re-chequeo de la página de gracias (que pregunta a MP por la referencia, no lee la URL).
- **Webhooks verificados.** Es el mismo endpoint de las entradas
  (`/api/mercadopago/webhook`, firma `x-signature` con `MP_WEBHOOK_SECRET`). Las propinas se
  reconocen porque su `external_reference` es `propina:<id>`; el monto y la moneda del pago tienen
  que coincidir con la propina.
- **Límite de intentos** por cliente (hash de la conexión, como en la compra de entradas) y un
  techo general: `TIP_RATE_LIMITS` en `src/lib/server/propinas/index.js` (`rate_limits`).
- **Sin redirecciones abiertas.** Solo se redirige al `init_point` que devuelve MP si es
  `https://*.mercadopago.com(.ar)` (o una ruta del sitio, el checkout simulado de dev); el link
  "Volver a la publicación" se arma en el servidor con la categoría y el slug guardados.
- **Privacidad.** La tabla no guarda nada de la persona. Los reembolsos se hacen desde MP con el
  número de pago (`mp_payment_id`), así que tampoco hace falta guardar un mail para eso. El
  mensaje es privado: se ve en el panel y en el CSV, nunca en páginas públicas ni en el feed.

## Dónde está el código

| Qué                                     | Dónde                                                           |
| --------------------------------------- | --------------------------------------------------------------- |
| Montos, validación, helpers compartidos | `src/lib/utils/propinas.js`                                     |
| Propinas en D1, webhook, panel          | `src/lib/server/propinas/index.js`                              |
| Crear la propina y la preferencia de MP | `src/lib/server/propinas/checkout.js` (`startTip`)              |
| Pie de las publicaciones                | `src/lib/components/propinas/` (`PostSupport`, `TipBlock`, …)   |
| Form action y gracias                   | `src/routes/(content)/propinas/`                                |
| Panel (lista, CSV)                      | `src/routes/(authed)/admin/propinas/` (menú: Ventas → Propinas) |
| Tabla                                   | `migrations/0019_propinas.sql` (`tips`)                         |
| Datos de demo (inventados)              | `scripts/demo/n3-propinas.sql`                                  |

Reutiliza lo de las entradas: el cliente de MP y su gateway (`getGateway`), el cuerpo común de la
preferencia (`checkoutProPreference` en `tickets/mercadopago.js`), la firma del webhook, la máquina
de estados de los pagos (`mapPaymentStatus` / `nextStatus` de `tickets/orders.js`), el checkout
simulado (`completeMockCheckout` en `tickets/mock.js`) y el CSV del panel (`$lib/admin/csv.js`).

## En el panel

- **Ventas → Propinas** (`/admin/propinas`): total recibido, por mes (hora de Argentina, por fecha
  de aprobación), por publicación y las últimas propinas con su mensaje. "CSV" descarga todas
  (también las pendientes que nunca se pagaron).
- **Inicio**: las propinas aprobadas aparecen en la actividad reciente.
- Los montos son lo que pagó la persona, antes de la comisión de MP.

## Probarlo

- `npx vitest run src/lib/utils/propinas.test.js src/lib/server/propinas src/routes/\(content\)/propinas src/routes/\(authed\)/admin/propinas`
- En local, con MP simulado: `PROPINAS_ENABLED=1 npm run dev:tickets`, entrá a un material de
  KinkyVibe, elegí un monto y aprobá el pago en el checkout simulado (`/propinas/simular-pago/…`).
- Datos de demo en la base local: `npx wrangler d1 execute kinkyvibe --local --file scripts/demo/n3-propinas.sql`
  (nunca con `--remote`).

## Decisiones para confirmar con gorrite

Tomadas por Claude, a confirmar: montos ($ 1.000 / $ 2.000 / $ 5.000, otro entre $ 500 y
$ 500.000), la plata a la cuenta de MP de las entradas (no al Fondo), sin cuenta ni datos, mensaje
opcional de 280 caracteres solo para admins, página de gracias, y el Cafecito del pie de página
sin cambios.
