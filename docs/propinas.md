# Propinas

## Qué hace

Al pie de las publicaciones con la etiqueta **KinkyVibe** (material y eventos), un bloque "¿Te
sirvió? Dejá una propina" en lugar de la nota del cafecito. La persona elige $ 1.000, $ 2.000,
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

Está siempre prendido: el interruptor `propinas` quedó fijo ([interruptores.md](interruptores.md))
y la variable `PROPINAS_ENABLED` ya no hace nada. La nota del cafecito y el link a Cafecito del
pie de página ya no existen.

## Lo que nunca se tiene que romper

- **El monto lo decide el servidor.** El formulario manda un monto sugerido u "otro" + el número;
  `validateTip` (`src/lib/utils/propinas.js`) lo valida en el servidor con el mínimo y el máximo.
- **El destino también.** Toda propina nueva se guarda con `destination = 'fondo'`
  (`TIP_DESTINATION`): `validateTip` lo pone siempre e ignora cualquier `destination` que llegue
  en el POST (un formulario viejo o armado). La columna sigue aceptando `kinkyvibe` por las
  propinas viejas; la base lo controla con un `CHECK` (migración 0022). El webhook nunca lo
  cambia: solo toca el estado.
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
| Total para el Fondo                     | `src/lib/server/fondo/propinasTotal.js`, `src/routes/api/fondo/propinas-total/`  |
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
- La página del Fondo en local: `PROPINAS_FONDO_ENABLED=1 npm run dev:tickets` y entrá a
  `/propinas?de=fondo&monto=3000`.
- En local, con MP simulado: `npm run dev:tickets`, entrá a un material de
  KinkyVibe, elegí un monto y aprobá el pago en el checkout simulado (`/propinas/simular-pago/…`).
- Datos de demo en la base local: `npx wrangler d1 execute kinkyvibe --local --file scripts/demo/n3-propinas.sql`
  (nunca con `--remote`).

## Qué necesita la base

Las migraciones **0019**, **0022** y **0052** (0022 agrega `destination` y 0052 `source`; sin
ellas no se pueden crear propinas). 0052 solo agrega una columna con valor por defecto: se aplica
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
