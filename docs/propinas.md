# Propinas

## Qué hace

Al pie de las publicaciones con la etiqueta **KinkyVibe** (material y eventos), un bloque "¿Te
sirvió? Dejá una propina" en lugar de la nota del cafecito. La persona elige $ 1.000, $ 2.000,
$ 5.000 u "Otro monto" (entre $ 500 y $ 500.000), elige **para quién es** ("Para KinkyVibe", por
defecto, o "Para el Fondo"), puede sumar un mensaje (hasta 280 caracteres, solo lo leen les
admins) y paga con **Mercado Pago**. Al volver, ve una página de gracias.

- No hace falta cuenta y no pedimos datos: ni nombre ni mail (MP pide lo suyo en su checkout).
- La plata entra siempre a **la misma cuenta de MP que las entradas**, elija lo que elija. El
  destino solo cambia cómo se cuenta: las propinas "Para el Fondo" aprobadas suman a los
  **aportes al Fondo KinkyVibe** del panel, igual que el aporte de una entrada solidaria (ver
  "En el panel").
- En el pie de página (Footer), "Dejá una propina" lleva al Fondo (`fondo.kinkyvibe.ar`) en
  lugar del link a Cafecito (decisión de gorrite, 2/10): `/propinas` sin `?de=` no deja dejar
  una propina, solo explica que se dejan desde cada publicación de KinkyVibe.

Está detrás del interruptor **Propinas** (Ajustes → Interruptores), apagado por defecto. Apagado,
las publicaciones muestran la nota del cafecito de siempre, el pie de página sigue con el link a
Cafecito y `/propinas` da 404. La variable
`PROPINAS_ENABLED` manda sobre el panel (`1` prendido, `0` apagado; ver `src/lib/server/flags.js`).

## Lo que nunca se tiene que romper

- **El monto lo decide el servidor.** El formulario manda un monto sugerido u "otro" + el número;
  `validateTip` (`src/lib/utils/propinas.js`) lo valida en el servidor con el mínimo y el máximo.
- **El destino también.** `destination` tiene que ser `kinkyvibe` o `fondo` (vacío = `kinkyvibe`;
  cualquier otra cosa, error). La base lo vuelve a controlar con un `CHECK` (migración 0022). El
  webhook nunca lo cambia: solo toca el estado.
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

| Qué                                     | Dónde                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| Montos, validación, helpers compartidos | `src/lib/utils/propinas.js`                                                      |
| Propinas en D1, webhook, panel          | `src/lib/server/propinas/index.js`                                               |
| Crear la propina y la preferencia de MP | `src/lib/server/propinas/checkout.js` (`startTip`)                               |
| Pie de las publicaciones                | `src/lib/components/propinas/` (`PostSupport`, `TipBlock`, …)                    |
| Link del pie de página (Footer)         | `supportLink` en `src/lib/utils/footer.js`, dato `propinas` del layout raíz      |
| Form action y gracias                   | `src/routes/(content)/propinas/`                                                 |
| Panel (lista, CSV)                      | `src/routes/(authed)/admin/ajustes/propinas/` (menú: Ajustes › Plata › Propinas) |
| Tabla                                   | `migrations/0019_propinas.sql` (`tips`)                                          |
| Destino (`destination`)                 | `migrations/0022_propinas_destino.sql`                                           |
| Datos de demo (inventados)              | `scripts/demo/n3-propinas.sql`                                                   |

Reutiliza lo de las entradas: el cliente de MP y su gateway (`getGateway`), el cuerpo común de la
preferencia (`checkoutProPreference` en `tickets/mercadopago.js`), la firma del webhook, la máquina
de estados de los pagos (`mapPaymentStatus` / `nextStatus` de `tickets/orders.js`), el checkout
simulado (`completeMockCheckout` en `tickets/mock.js`) y el CSV del panel (`$lib/admin/csv.js`).

## En el panel

- **Ajustes › Plata › Propinas** (`/admin/ajustes/propinas`): total recibido y separado por destino ("Para
  KinkyVibe" / "Para el Fondo"), por mes (hora de Argentina, por fecha de aprobación), por
  publicación y las últimas propinas con su destino y su mensaje. Las pestañas Todas / Para
  KinkyVibe / Para el Fondo filtran la lista (`?destino=kinkyvibe|fondo`; los totales no se
  filtran). "CSV" descarga todas (también las pendientes que nunca se pagaron), con la columna
  `destino` al final.
- **Inicio**: las propinas aprobadas aparecen en la actividad reciente. La tarjeta **Neto del
  fondo** (del mes) suma como aportes, además de los de las entradas solidarias
  (`orders.fondo_contribution`), las propinas "Para el Fondo" **aprobadas** en el mes (por fecha de
  aprobación); el detalle dice cuánto es de propinas. Pendientes, rechazadas, reembolsadas y las
  "Para KinkyVibe" no suman. Hay una sola definición de qué propina cuenta
  (`FONDO_TIP_WHERE` / `fondoTipTotals` en `src/lib/server/propinas/index.js`), la misma que usa el
  resumen de Propinas.
- Los aportes por evento y por tipo de entrada (`/admin/ventas`, la página de ventas de cada
  evento) siguen siendo solo los de las entradas: una propina no es de ningún evento ni tipo de
  entrada, así que no se reparte ahí (y no se cuenta dos veces).
- Los montos son lo que pagó la persona, antes de la comisión de MP.

## Probarlo

- `npx vitest run src/lib/utils/propinas.test.js src/lib/utils/footer.test.js src/lib/components/Footer.test.js src/lib/server/propinas src/routes/\(content\)/propinas src/routes/\(authed\)/admin/ajustes/propinas`
- En local, con MP simulado: `PROPINAS_ENABLED=1 npm run dev:tickets`, entrá a un material de
  KinkyVibe, elegí un monto y aprobá el pago en el checkout simulado (`/propinas/simular-pago/…`).
- Datos de demo en la base local: `npx wrangler d1 execute kinkyvibe --local --file scripts/demo/n3-propinas.sql`
  (nunca con `--remote`).

## Antes de prender el interruptor

Aplicar las migraciones **0019** y **0022** en la base (0022 agrega `destination`; sin ella no se
pueden crear propinas). Con el interruptor apagado nada de esto se usa.

## Decisiones

Confirmadas por gorrite:

- Montos: $ 1.000 / $ 2.000 / $ 5.000 ($ 2.000 elegido por defecto) y "otro monto" entre $ 500 y
  $ 500.000.
- Solo en las publicaciones con la etiqueta KinkyVibe.
- **Destino** (cambiado por gorrite): quien deja la propina elige "Para KinkyVibe" (por defecto) o
  "Para el Fondo". La plata va a la misma cuenta de MP; las del Fondo cuentan como aportes al
  Fondo, igual que la entrada solidaria.
- **Pie de página** (cambiado por gorrite): con el interruptor prendido, "Dejá una propina"
  (`/propinas`) reemplaza al link a Cafecito; apagado, sigue Cafecito.

Tomadas por Claude, a confirmar: sin cuenta ni datos, mensaje opcional de 280 caracteres solo
para admins y página de gracias.
