# Propinas

## Qué hace

Al pie de las publicaciones con la etiqueta **KinkyVibe** (material y eventos) y de las páginas
de la Kinkipedia que tienen texto, un bloque "¿Te sirvió? Dejá una propina" en lugar de la nota
del cafecito. La persona elige $ 1.000, $ 2.000,
$ 5.000 u "Otro monto" (entre $ 500 y $ 500.000), puede sumar un mensaje (hasta 280 caracteres,
solo lo leen les admins) y paga con **Mercado Pago**. Al volver, ve una página de gracias. **Toda
propina va al Fondo KinkyVibe** (decisión de gorrite, octubre de 2026): ya no se elige a dónde va,
y el bloque lo dice.

- No hace falta cuenta y no pedimos datos: ni nombre ni mail (MP pide lo suyo en su checkout).
- La plata entra siempre a **la misma cuenta de MP que las entradas**. El destino solo cambia
  cómo se cuenta: las propinas "Para el Fondo" aprobadas suman a los **aportes al Fondo
  KinkyVibe** del panel, igual que el aporte de una entrada solidaria (ver "En el panel"). Las
  propinas viejas "Para KinkyVibe" (de cuando se podía elegir) quedan como están y no suman.
- En el pie de página (Footer), "Dejá una propina" lleva al Fondo (`fondo.kinkyvibe.ar`) en
  lugar del link a Cafecito (decisión de gorrite, 2/10): `/propinas` sin `?de=` no deja dejar
  una propina, solo explica que se dejan desde cada publicación de KinkyVibe.
- **Donaciones únicas al Fondo** (decisión de gorrite, 11/10, issue #265): el botón «Una vez» de
  fondo.kinkyvibe.ar lleva a `/propinas?de=fondo` (ver abajo). Así hay un solo flujo de pago.

## Donaciones únicas desde el Fondo (`/propinas?de=fondo`)

Con el interruptor **`propinas_fondo`** prendido ([interruptores.md](interruptores.md); sale
apagado, como todo lo nuevo, decisión 0001):

- `https://kinkyvibe.ar/propinas?de=fondo&monto=<n>` muestra el mismo formulario de propina sin
  publicación, con el título «Dejá una propina para el Fondo Kinky Vibe». Sin cuenta ni datos.
- `https://kinkyvibe.ar/propinas` a secas (sin `?de=`) muestra lo mismo: como toda propina va al
  Fondo, no hace falta llegar desde una publicación.
- `monto` es opcional (el Fondo manda 1500, 3000, 7500, 15000, 30000 o 45000). Si es un entero
  entre el mínimo y el máximo de las propinas, queda elegido: el botón sugerido si coincide con
  uno, si no «Otro monto» con ese número (`presetFromQuery` / `presetValues`). Si no, se ignora.
  Es solo la elección inicial: el monto del POST lo vuelve a validar `validateTip`.
- El formulario manda `source=fondo` en lugar de `category`/`slug`. La propina se guarda igual que
  las demás (`destination = 'fondo'`, pendiente hasta que MP la apruebe) con **`source = 'fondo'`**
  (migración 0052). Como `post_category`/`post_slug` no aceptan `NULL` (0019), se guardan
  `material` y `''`; lo que manda es `source`.
- El gracias es el de siempre, con «Volver al Fondo Kinky Vibe» (`https://fondo.kinkyvibe.ar`) en
  lugar de «Volver a la publicación».
- En el panel van en su propia fila («Fondo (una vez)») en «Por publicación», con ese link en la
  lista y la columna `origen` del CSV.
- Apagado, `/propinas?de=fondo` muestra solo la explicación de siempre y un POST con
  `source=fondo` da 404. Las propinas de las publicaciones no cambian en ningún caso.

## Total para el Fondo (`GET /api/fondo/propinas-total`)

Para el porcentaje de fondo.kinkyvibe.ar (issue #265). Pedido de servidor a servidor; la lógica en
`src/lib/server/fondo/propinasTotal.js`.

- **Secreto:** header `x-fondo-secret` = `FONDO_MAIL_SECRET`, el mismo chequeo en tiempo constante
  que `/api/fondo/mi-link` ([mails.md](mails.md)). Sin el correcto (o sin el secreto configurado):
  `401` sin cuerpo.
- **`?mes=AAAA-MM`** (mes 01 a 12): si no, `400` sin cuerpo.
- **Mes Fondo:** del 5 de `mes` a las 00:00 de Argentina (UTC−3, sin horario de verano) hasta el 4
  del mes siguiente a las 23:59:59. `mes=2026-10` = desde `2026-10-05T03:00:00Z` (inclusive) hasta
  `2026-11-05T03:00:00Z` (exclusive) (`fondoMonthRange`).
- **Qué suma:** las propinas con `destination = 'fondo'` **aprobadas** cuyo `approved_at` (lo pone
  el webhook o el re-chequeo cuando pasan a aprobadas) cae en ese mes Fondo: las del pie de las
  publicaciones y las «Una vez» del Fondo. Las reembolsadas no cuentan (ya no están aprobadas), así
  que el total de un mes cerrado puede bajar. Es la misma definición del panel
  (`FONDO_TIP_WHERE` / `fondoTipTotals`).
- **Respuesta:** `{ "total": <ARS>, "count": <n>, "month": "<mes>", "updatedAt": "<ISO>" }`, sin
  nombres, mails, mensajes ni ids de pago. `Cache-Control: private, max-age=300`.
- Si la base falla: `503` sin cuerpo (el Fondo usa el último valor que tenía).
- **No depende de `propinas_fondo`:** las propinas de las publicaciones ya van todas al Fondo, así
  que el total sirve aunque el formulario `?de=fondo` esté apagado, y el endpoint es de solo
  lectura y con secreto.
- **PayPal, aparte:** con el interruptor `paypal` prendido, la respuesta suma
  `"paypal": { "usd": <neto en dólares>, "ars": <pesos estimados>, "count": <n> }` con las
  propinas al Fondo con PayPal aprobadas en ese mes Fondo (sin ninguna: ceros). `total` y `count`
  siguen siendo **solo de Mercado Pago**, exactamente como antes: el Fondo suma `paypal.ars` por su
  cuenta. Apagado, la respuesta no trae `paypal`. Ver abajo.

## PayPal: cotización, ajuste y retiros

Decisión [0054](decisiones/0054-paypal-en-las-propinas.md) (gorrite, 2/11, issue #265). PayPal va a
ser una segunda forma de pagar en el mismo formulario de propina (también `?de=fondo`), con una
sola app de PayPal compartida con fondo.kinkyvibe.ar. **El cobro todavía no existe**: llega cuando
estén las credenciales de prueba. Lo que ya está, sin credenciales y detrás del interruptor
**`paypal`** (apagado):

- **La cuenta:** los pagos son en dólares y cuenta lo **neto** (después de la comisión de PayPal).
  Pesos = `floor(neto × base × (1 + ajuste / 100))`, cada pago por separado, en enteros exactos
  (`estimateArs` en `src/lib/utils/paypal.js`).
- **La base** es el dólar MEP «compra» del día, que guarda un cron diario en `mep_rates`
  (migración 0071). Cada pago guarda la base de su día en `tips.rate_base`, que no cambia nunca.
- **El ajuste** lo fija gorrite en Ajustes › Plata › Propinas (por ejemplo −4; de −50 a 50, hasta 2
  decimales). Se guarda en `ticket_settings` (`paypal_rate_adjustment_pct`), queda en Actividad y
  se aplica **al leer**: cambiarlo cambia todas las estimaciones, también las de meses pasados.
- **Son estimaciones.** Los pesos de verdad son los de cada retiro (abajo).

### El cron de la cotización

`RATES_CRON` (`15 21 * * *`, 18:15 de Argentina, después del cierre) en
`src/lib/server/scheduled.js` → `runMepRates` (`src/lib/server/paypal/rates.js`):

- **Hoy** sale de [DolarApi](https://dolarapi.com/v1/dolares/bolsa)
  (`{ compra, venta, fechaActualizacion }`) y se guarda como el día de Argentina de la corrida. Un
  dato de DolarApi de hace más de 5 días no se guarda (la API quedó trabada).
- **Los días que faltan** de los últimos 10 (un cron que no corrió) salen de
  [ArgentinaDatos](https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa/2026/10/30)
  (`{ compra, venta, fecha }`, por día; rellena fines de semana y feriados con el último día hábil;
  hoy puede venir atrasado, por eso hoy sale de DolarApi).
- Cada pedido tiene 8 segundos como mucho; cada número tiene que ser finito, mayor que 0 y menor que
  un tope, y la `fecha` de ArgentinaDatos tiene que ser el día pedido. **Un día guardado no se
  pisa** (`ON CONFLICT DO NOTHING`): correrlo dos veces no cambia nada y un dato malo nunca
  reemplaza a uno bueno.
- Si no pudo traer el de hoy, la corrida falla (se ve en Cron Events de Cloudflare) y queda el
  último guardado; la corrida siguiente rellena lo que falte.
- **Corre aunque `paypal` esté apagado:** no se ve, y así la historia ya está cuando llegue el
  primer pago. Los Previews no corren crons.

### `GET /api/fondo/cotizacion[?fecha=AAAA-MM-DD]`

Para que fondo.kinkyvibe.ar convierta sus suscripciones con el mismo número. La lógica en
`src/lib/server/fondo/cotizacion.js`.

- **Secreto:** el mismo `x-fondo-secret` que `propinas-total` (tiempo constante). Sin el correcto:
  `401` sin cuerpo.
- Con `paypal` apagado: `404` sin cuerpo.
- **`fecha`** opcional (sin ella, hoy en Argentina); si no es un día de verdad: `400` sin cuerpo.
- **Respuesta:** `{ "base", "adjustmentPct", "rate", "date", "stale", "updatedAt" }`. `base` es el
  MEP «compra» de `date`: el de `fecha` o, si ese día no tiene, el del último día guardado antes.
  `rate` = base × (1 + adjustmentPct / 100), con 2 decimales. `stale` es `true` si `date` le lleva
  más de un día a `fecha` (el cron no pudo traer los últimos). `updatedAt`: cuándo se guardó.
  `Cache-Control: private, max-age=300`.
- Sin ninguna cotización guardada (hasta esa fecha) o si la base falla: `503` sin cuerpo.

### En el panel (Ajustes › Plata › Propinas, con `paypal` prendido)

- **Por mes del Fondo** (los últimos 6, del 5 al 4): Mercado Pago (pesos), PayPal neto (dólares),
  PayPal en pesos (estimado) y el total. Por fecha de aprobación, solo aprobadas al Fondo.
- **Cotización del dólar:** la efectiva, la base, el ajuste, de qué día es y «dato viejo» si el
  cron no pudo traer los últimos días. Ahí mismo se cambia el ajuste.
- **Retiros:** se cargan (fecha, dólares que salieron, pesos que llegaron, nota opcional) y se
  borran. Cada uno muestra la cotización real (pesos ÷ dólares), la estimada de ese día con el
  ajuste de ahora y la diferencia en %. Cargar y borrar queda en Actividad (sin la nota). Tabla
  `paypal_withdrawals`.
- Solo admins (`requireAdmin`), como los demás ajustes de plata. Apagado, nada de esto se carga y
  sus actions dan 404.

### Las propinas de PayPal en la tabla `tips`

Migración 0071: `provider` (`mp` por defecto, `paypal`), `currency`, `usd_gross_cents`,
`usd_net_cents`, `rate_base`, `paypal_order_id` (único) y `paypal_capture_id`. **Todos los totales
de Mercado Pago filtran `provider = 'mp'`**: `FONDO_TIP_WHERE` (el Inicio, `propinas-total`), el
resumen de esta página (`tipSummary`) y la actividad del Inicio. Un pago de Mercado Pago nunca toca
una propina de PayPal (`applyTipPayment`). Qué guarda `amount` en una propina de PayPal, y cómo se
ven en la lista y el CSV, lo define el PR del cobro.

Está siempre prendido: el interruptor `propinas` quedó fijo ([interruptores.md](interruptores.md))
y la variable `PROPINAS_ENABLED` ya no hace nada. La nota del cafecito y el link a Cafecito del
pie de página ya no existen.

## Lo que nunca se tiene que romper

- **El monto lo decide el servidor.** El formulario manda un monto sugerido u "otro" + el número;
  `validateTip` (`src/lib/utils/propinas.js`) lo valida en el servidor con el mínimo y el máximo.
- **El destino también.** Toda propina nueva se guarda con `destination = 'fondo'`
  (`TIP_DESTINATION`): `validateTip` lo pone siempre e ignora cualquier `destination` que llegue
  en el POST (un formulario viejo o armado). La columna sigue aceptando `kinkyvibe` por las
  propinas viejas. El webhook nunca lo cambia: solo toca el estado.
- **Las listas de valores viven en el código, no en la base.** Desde la migración 0070,
  `post_category`, `source` y `destination` no tienen `CHECK`: las clases de publicación están en
  `TIP_POST_KINDS` (`src/lib/utils/propinas.js`, con su nombre, su ruta y la forma de su
  dirección) y `createTip` se niega a guardar un destino o una categoría que no conoce. Sumar una
  clase nueva es agregarla ahí y enseñarle a `findTipPost` (`src/lib/server/propinas/posts.js`) a
  buscarla, sin migración. Quedan en la base los `CHECK` del monto, el estado y el mensaje.
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
| Pie de las publicaciones                | `src/lib/components/propinas/` (`TipBlock`, …)                                   |
| Link del pie de página (Footer)         | `supportLink` en `src/lib/utils/footer.js`                                       |
| Form action y gracias                   | `src/routes/(content)/propinas/`                                                 |
| Panel (lista, CSV)                      | `src/routes/(authed)/admin/ajustes/propinas/` (menú: Ajustes › Plata › Propinas) |
| Tabla                                   | `migrations/0019_propinas.sql` (`tips`)                                          |
| Destino (`destination`)                 | `migrations/0022_propinas_destino.sql`                                           |
| Origen (`source`: publicación o Fondo)  | `migrations/0052_propinas_origen.sql`                                            |
| Sin listas fijas en la base             | `migrations/0070_propinas_sin_listas_fijas.sql`                                  |
| Total para el Fondo                     | `src/lib/server/fondo/propinasTotal.js`, `src/routes/api/fondo/propinas-total/`  |
| PayPal: cuentas en pesos                | `src/lib/utils/paypal.js`                                                        |
| PayPal: ajuste, totales, retiros        | `src/lib/server/paypal/index.js`                                                 |
| Cotización del dólar (cron)             | `src/lib/server/paypal/rates.js`                                                 |
| Cotización para el Fondo                | `src/lib/server/fondo/cotizacion.js`, `src/routes/api/fondo/cotizacion/`         |
| PayPal en la base                       | `migrations/0071_paypal_base.sql`                                                |
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
  `destino` al final y las fechas (`fecha`, `aprobada`) en hora de Argentina, `2026-10-02 22:30`.
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

- `npx vitest run src/lib/utils/propinas.test.js src/lib/utils/footer.test.js src/lib/components/Footer.test.js src/lib/server/propinas src/routes/\(content\)/propinas src/routes/\(authed\)/admin/ajustes/propinas src/routes/api/fondo/propinas-total`
- PayPal: `npx vitest run src/lib/utils/paypal.test.js src/lib/server/paypal src/routes/api/fondo src/routes/\(authed\)/admin/ajustes/propinas`. En local, `PAYPAL_ENABLED=1 npm run dev:admin` muestra la parte de PayPal de Ajustes › Propinas (sin cotización hasta que alguien corra el cron).
- La página del Fondo en local: `PROPINAS_FONDO_ENABLED=1 npm run dev:tickets` y entrá a
  `/propinas?de=fondo&monto=3000`.
- En local, con MP simulado: `npm run dev:tickets`, entrá a un material de
  KinkyVibe, elegí un monto y aprobá el pago en el checkout simulado (`/propinas/simular-pago/…`).
- Datos de demo en la base local: `npx wrangler d1 execute kinkyvibe --local --file scripts/demo/n3-propinas.sql`
  (nunca con `--remote`).

## Qué necesita la base

Las migraciones **0019**, **0022**, **0052** y **0070** (0022 agrega `destination`, 0052 `source`
y 0070 reconstruye la tabla sin los `CHECK` de esas listas; sin 0070 no se pueden guardar
propinas desde la Kinkipedia). Lo de PayPal necesita además la **0071** (`mep_rates`, `paypal_withdrawals` y las columnas
de PayPal de `tips`); el código la necesita para los totales de Mercado Pago (`provider = 'mp'`),
así que se aplica en producción antes del merge. 0052 solo agrega una columna con valor por defecto: se aplica
en producción **antes** de mergear el código que la usa (decisión 0028).

## Decisiones

Confirmadas por gorrite:

- Montos: $ 1.000 / $ 2.000 / $ 5.000 ($ 2.000 elegido por defecto) y "otro monto" entre $ 500 y
  $ 500.000.
- Solo en las publicaciones con la etiqueta KinkyVibe.
- **Destino** (cambiado por gorrite, octubre de 2026): toda propina va al Fondo KinkyVibe; ya no
  se elige entre "Para KinkyVibe" y "Para el Fondo". La plata va a la misma cuenta de MP; cuentan
  como aportes al Fondo, igual que la entrada solidaria. Las viejas "Para KinkyVibe" se siguen
  mostrando como están (panel, filtro y CSV).
- **Pie de página** (cambiado por gorrite): "Dejá una propina" (al Fondo) reemplaza al link a
  Cafecito (el interruptor `propinas` quedó fijo).

Tomadas por Claude, a confirmar: sin cuenta ni datos, mensaje opcional de 280 caracteres solo
para admins y página de gracias.
