# Mails

## Qué hace

El sitio manda mails a quienes compran entradas: las entradas con su QR, las instrucciones de una
transferencia, el link de la transmisión de un evento online, los recordatorios antes del evento,
el aviso de reembolso, el aviso de cambio de fecha («Avisar a les compradores») y los avisos que
les admins escriben desde el panel ("Mail a compradores", en la ficha del evento → Mails → Mandar un
aviso).
Salen con **Resend**, desde `entradas@kinkyvibe.ar` (se cambia en el panel). Les admins pueden
cambiar el asunto, el título, el texto de arriba y los detalles del diseño (etiqueta, texto del
botón, línea de ayuda y «por qué te llega») de cada mail sin tocar código, en general o solo para
un evento, y mandarse una prueba.

**En el panel, todo lo de mails está en Mensajes** (gorrite, 11/10): **Plantillas**
(`/admin/mensajes/plantillas`, el texto de cada mail) y **Configuración**
(`/admin/mensajes/configuracion`: remitente, respuesta, pie, recordatorios y envíos en tandas; la
vieja `/admin/ajustes/mails` redirige ahí). Lo de un evento (mandar un aviso a quienes compraron y
sus plantillas propias) está en la ficha del evento.

## Lo que nunca se tiene que romper

- **Nadie recibe un mail dos veces por el mismo envío.** Cada envío masivo reserva a cada
  destinatarie con un `INSERT` atómico antes de mandar y lo libera si falla (`reminder_sends`,
  `stream_link_sends`, `date_change_sends`, `event_mail_recipients`). Un doble click, dos pestañas
  o un reintento no duplican.
- **Nada sale solo después de cambiar un evento.** Cambiar la fecha anota el cambio y el panel
  ofrece avisar; el mail sale solo si une admin toca «Avisar a les compradores» y confirma.
- **Los previews no le mandan mails a gente real.** En un deploy de preview solo llegan mails a
  las direcciones de `EMAIL_ALLOWLIST`; cualquier otra se desvía a la primera de esa lista con
  `[DEMO]` en el asunto, y sin la lista no sale nada (`src/lib/server/tickets/emailGuard.js`).
  Todo mail pasa por `deliver()` de `src/lib/server/tickets/index.js`: no se llama a Resend por
  otro lado.
- **Una plantilla no puede romper un mail.** Solo se editan asunto, título, texto de arriba,
  etiqueta, texto del botón, línea de ayuda y pie, en un formato seguro (`{{variable}}`,
  `**negrita**`, `[texto](dirección)`, párrafos), todo escapado; algo que parece HTML no se puede
  guardar. QR, códigos, los links de las entradas y a dónde lleva el botón, precios y la política
  de devoluciones los pone siempre el código.
- **Links en las plantillas:** `[texto](https://…)` sale como link en el HTML y como
  «texto (dirección)» en el texto plano (la etiqueta y el botón, que son texto solo, también así).
  Solo a `https://`, `http://`, `mailto:` y `tel:` (`isSafeLinkUrl` en `emailTemplates.js`): con
  otra dirección (`javascript:`, `data:`…) no se puede guardar y, si igual llega, se ve como texto.
  La dirección puede ser una variable (`[tu compra]({{link_estado}})`): su valor se revisa al
  armar el mail. El valor de una variable nunca se vuelve link. En el asunto no se interpretan.
- **"Mandarme una prueba" solo va a direcciones de la organización** (el email público de GitHub
  de le admin, la de respuesta, el contacto y las de `EMAIL_ALLOWLIST`), nunca a una cualquiera.
- **«No fui yo» se respeta.** Una dirección que usó el link «No fui yo» no recibe más mails que no
  sean de una compra pagada (ver [abajo](#no-fui-yo)). Los de una compra pagada salen siempre.
- El DNI nunca va en un mail. Los tokens de las entradas no se loguean completos.
- Un mail que falla no frena la compra: se loguea, el de las entradas lo reintenta el cron (ver
  [abajo](#reintento-del-mail-de-las-entradas)) y se puede reenviar desde el panel.

## Los mails

| Mail                      | Cuándo sale                                                             | Plantilla     | Código                                  |
| ------------------------- | ----------------------------------------------------------------------- | ------------- | --------------------------------------- |
| Tus entradas              | al aprobarse una compra o confirmarse una transferencia; "Reenviar"     | `tickets`     | `buildTicketEmail` en `email.js`        |
| Reserva por transferencia | al reservar pagando por transferencia                                   | `transfer`    | `buildTransferEmail`                    |
| Link de la transmisión    | "Enviar el link a todes" en un evento online                            | `stream`      | `buildStreamLinkEmail`, `stream.js`     |
| Recordatorio              | antes del evento, según Mensajes → Configuración                        | `reminder`    | `buildReminderEmail`, `reminders.js`    |
| Reembolso                 | al reembolsar (desde el panel o desde Mercado Pago)                     | `refund`      | `buildRefundEmail`                      |
| Cambió la fecha           | «Avisar a les compradores» después de cambiar la fecha de un evento     | `date_change` | `buildDateChangeEmail`, `dateChange.js` |
| Mail a compradores        | une admin lo escribe en la ficha del evento → Mail                      | —             | `buyerMail.js`                          |
| Código para ingresar      | al pedirlo en /ingresar (cuentas del público, [cuentas.md](cuentas.md)) | —             | `src/lib/server/cuentas/email.js`       |
| Tu link (Fondo KinkyVibe) | lo pide fondo.kinkyvibe.ar («¿Ya sos Mecenas?», ver abajo)              | —             | `src/lib/server/fondo/email.js`         |

**Lista de espera** (en construcción, interruptor `lista_espera`; ver abajo y
[tickets.md](tickets.md#lista-de-espera-en-construcción)):

| Mail                | Cuándo sale                                                        | Plantilla           | Código (`waitlistEmail.js`)  |
| ------------------- | ------------------------------------------------------------------ | ------------------- | ---------------------------- |
| Confirmá tu mail    | al anotarse sin cuenta (o con otro mail que el de la cuenta)       | `waitlist_confirm`  | `buildWaitlistConfirmEmail`  |
| Se liberó un lugar  | le toca (lugar guardado) o, cerca del evento, a toda la lista      | `waitlist_offer`    | `buildWaitlistOfferEmail`    |
| Último aviso        | faltan 3 h de un lugar guardado de 12 h o más (no a toda la lista) | `waitlist_reminder` | `buildWaitlistReminderEmail` |
| Se venció tu lugar  | venció el lugar guardado sin comprar; «Volver a anotarme»          | `waitlist_expired`  | `buildWaitlistExpiredEmail`  |
| Se terminó tu lugar | une admin terminó la reserva desde el panel y eligió avisarle      | `waitlist_ended`    | `buildWaitlistEndedEmail`    |
| Se cerró la lista   | la lista cierra (cerca del comienzo, fin de la venta) o se cancela | `waitlist_closed`   | `buildWaitlistClosedEmail`   |

Todo en `src/lib/server/tickets/` salvo que se indique. Las plantillas: definición y variables en
`src/lib/utils/emailTemplates.js`, lo guardado en D1 en `templates.js`, el editor
(`src/lib/components/admin/MailTemplateEditor.svelte`) en `/admin/mensajes/plantillas` y en la
pestaña **Mails** de la ficha de cada evento que vende entradas (vista **Plantillas**, `/mails`).

**Plantillas por evento.** Cada parte se puede cambiar solo para los mails de un evento
(`event_email_templates`, migración 0034; una fila por evento y mail, cada parte en NULL = sin
cambiar). Al mandar, cada parte sale de lo del evento → la plantilla general (`email_templates`)
→ el texto del código (`resolveTemplate` en `templates.js`, `mergeTemplates` en
`emailTemplates.js`). Las partes opcionales vacías = el texto de siempre; el texto plano solo
cambia con asunto, título, texto o línea de ayuda propios. La vista previa de la ficha usa el
título, la fecha y el lugar del evento con una compra de ejemplo. Van en su propia tabla (no en el
objeto `evento`) porque los eventos todavía salen de sus `.md` y no siempre están en la base.

**Plantilla común (diseño):** todos los mails (los de esta tabla y los de series, «Lo que sigo» e
invitaciones a perfiles) se arman con `mailLayout()` de `src/lib/server/email/layout.js`: logo
centrado (URL absoluta del sitio, nunca `data:`), tarjeta blanca con borde rosa, etiqueta gris,
título, detalles, un botón rosa y una línea de ayuda; abajo, por qué te llega, el contacto, la
baja (si el mail la tiene) y «Kinky Vibe · Buenos Aires». Lo editable de las plantillas va dentro
de la tarjeta.

**Pie configurable:** la línea de contacto («¿Dudas? Escribinos a {{contacto}}») y la firma
(«Kinky Vibe · Buenos Aires») se cambian en Panel → Mensajes → Configuración → Pie de los mails
(`mail_footer_contact` y `mail_footer_signoff` en `ticket_settings`), con el mismo formato seguro
(negrita y links; `{{contacto}}` es la dirección de contacto con su `mailto:`). Valen para todos
los mails: los pone `deliver()` al mandar (`withMailFooter` de `layout.js`, que reemplaza solo
esas dos partes del pie) y la vista previa del editor de plantillas. Vacíos = el texto de siempre,
byte a byte (`footer.test.js`). El «por qué te llega» sigue siendo de cada plantilla. El texto plano no pasa por la plantilla. `src/lib/server/email/layout.test.js`
comprueba que cada builder la usa y que el asunto y el texto plano siguen iguales
(`mails.text.json`).

**Talleres en varias partes:** en un taller con una sola entrada, los mails de entradas,
transferencia y recordatorios llevan la lista «Las N partes del taller» con la fecha y el lugar de
cada parte ([talleres-partes.md](talleres-partes.md)); los demás mails no cambian.

**Botón y número de compra:** en «Tus entradas», los recordatorios y «Cambió la fecha», el botón
lleva a la transmisión si el evento es online y el link ya está; si no, con **una sola entrada**
lleva a esa entrada con su QR (`/entradas/t/<token>`, «Ver mi entrada»), que se abre en cualquier
navegador, y con varias a la página de la compra («Ver mis entradas»; ahí las entradas se ven solo
en el navegador donde se compró, y la página lo dice; cada entrada tiene además su link en el
mail). Todos los mails de una compra dicen «Número de compra: KV-…», la referencia corta
(`orderReference`), la misma de la página de la compra, del mail de la transferencia y del panel
(el buscador del panel la encuentra), nunca el id entero.

**Calendario («Agregalo a tu calendario»):** solo los mails que salen con el pago ya acreditado
llevan el calendario: «Tus entradas», los **recordatorios**, «Link de la transmisión» («Enviar el
link a todes», con el `.ics` actualizado: el link como lugar) y «Cambió la fecha» (el `.ics` con la
fecha nueva). Abajo de la fecha y el lugar (o del
link), una línea que dice que va adjunto `<slug>.ics` (un solo evento; en un recordatorio de una
parte de un taller, el de esa parte) y el link «Agregar a Google Calendar». «Tus entradas» lleva
además, en el `<head>`, el marcado schema.org `EventReservation` (JSON-LD) para Gmail. El de los
datos para transferir (la compra todavía no está pagada) no lleva nada de esto ni el link de la
transmisión. «Mail a compradores» tampoco, por ahora. Todo sale de
`src/lib/server/tickets/calendarFile.js` (`calendarEvent`: las mismas horas, el mismo lugar y la
misma descripción) y de `calendarExtras` en `email.js`:

- **El .ics** (`ticketCalendarFile`, con `buildEventIcs` de `src/lib/utils/icsFeed.js`): título,
  inicio y fin en UTC (la hora argentina bien pasada), el link a la página del evento, el estado y
  el mismo UID que los calendarios del sitio (`eventUid`), así no se duplica si la persona además
  está suscripta. `METHOD:PUBLISH` y sin `ATTENDEE`: es un evento para agregar, no una invitación
  (con `REQUEST` los clientes muestran botones de «Asistiré / No asistiré»). Va a Resend en
  `attachments` (base64) con `content_type: text/calendar; method=PUBLISH; charset=UTF-8`
  explícito. Pesa ~1 KB.
- **Versión (`SEQUENCE` y `DTSTAMP`):** un archivo con el mismo UID y un `SEQUENCE` más alto
  reemplaza al anterior en el calendario en lugar de duplicarlo. Sin columnas nuevas: el
  `SEQUENCE` son los minutos desde 1970 de la versión (`calendarSequence` en `icsFeed.js`), y la
  versión (`calendarStamp`) es la más nueva entre la compra, el último cambio del link de la
  transmisión y el último cambio de fecha del evento (`event_date_changes.version`). Tiene que ser
  la misma en cada reintento de un envío: Resend rechaza (409) una clave de idempotencia reusada
  con otro contenido, así que no puede ser «la hora del envío». Un link o una fecha nuevos dan un
  `SEQUENCE` más alto; dos mails que dicen lo mismo, el mismo. «Reenviar» desde el
  panel (sin clave) usa la hora del envío. «Enviar el link a todes» sigue sin repetirle el mail a
  nadie (`stream_link_sends`, igual que antes).
- **Lugar:** presencial, el lugar como lo dice el mail (quien compró recibe la dirección completa).
  Online con el link de la transmisión ya cargado al mandar el mail: ese link como lugar y en la
  descripción, con «Si el link cambia, te llega por mail.» (el link es el mismo para todes les que
  compraron). Online sin link todavía: «Online» y que el link llega por mail. El link de la
  transmisión va **solo** en el mail de quien compró: nunca en un calendario público ni en una
  página.
- **Google Calendar** (`googleCalendarUrl`): `calendar.google.com/calendar/render?action=TEMPLATE`
  con título, las mismas horas UTC, la página del evento (y la nota de online) y el mismo lugar.
- **Marcado para Gmail** (`eventReservationScript`): número de compra (`KV-…`), estado confirmado, solo el
  nombre de quien compró (nunca mail ni DNI) y el evento con fechas `-03:00`, la página y el lugar
  (`Place`, o `VirtualLocation` con el link de la transmisión si ya está o la página si no). El
  JSON va con `<` escapado (`\u003c`) para que nada cierre el `<script>`. **Gmail solo lo muestra a
  remitentes registrados con Google**
  ([requisitos](https://developers.google.com/workspace/gmail/markup/registering-with-google): DKIM
  o SPF alineados con el dominio del remitente, remitente fijo, cientos de mails por día a Gmail y
  pocas quejas; se pide mandando un mail con el marcado a `schema.whitelisting+sample@gmail.com` y
  completando el formulario). Hasta entonces Gmail lo ignora, salvo en un mail que una cuenta se
  manda a sí misma (así se prueba). El .ics no necesita registro.
- Un evento cancelado no lleva nada de esto, y las vistas previas y `email.golden.json` tampoco
  (sin `event.slug` el mail sale como siempre).

**El link de la transmisión es el mismo para todes** les que compraron: los mails (entradas,
«Link de la transmisión», recordatorios) y la página de la entrada lo muestran como «Link de la
transmisión: …», sin «personal, no lo compartas».

**Recordatorios:** el cron del propio Worker (`src/lib/server/scheduled.js`) le pasa cada 15
minutos `POST /api/cron/recordatorios`, con el header `x-cron-secret`, al sitio. El sitio decide qué mandar. Por
defecto: 2 días antes y el mismo día a las 9:00; un evento los apaga con `recordatorios: false`.

### Reintento del mail de las entradas

El mail con las entradas sale una vez, al aprobarse la orden (en segundo plano). Si ese envío
falla (Resend caído, un timeout, el Worker que se cortó), la orden queda aprobada con
`email_sent_at` vacío y el cron de cada 15 minutos (`POST /api/cron/recordatorios`) lo reintenta:
`resendUnsentOrderEmails` en `src/lib/server/tickets/unsentOrders.js`.

- **Cuáles:** órdenes `approved`, sin `email_sent_at`, con mail, aprobadas hace más de 10 minutos
  (`EMAIL_GRACE_MS`, el mismo margen del aviso «mails sin enviar» del Inicio) y hace menos de 48 h;
  las más viejas primero, 5 por corrida. Va aparte de la tanda de mails (no usa su tope) y en su
  propio try/catch: si falla, lo demás sale igual. La respuesta del cron suma
  `unsentOrders: { sent, failed }`.
- **Sin duplicar:** usa `sendOrderEmail` con la clave de siempre (`tickets-<orden>`). Si el primer
  intento sí había llegado a Resend (un timeout), Resend no lo manda de nuevo. Ojo: Resend guarda
  las claves 24 h.
- **Lo cortado a propósito no se reintenta:** una orden gratis a una dirección con «No fui yo» (o un
  preview sin `EMAIL_ALLOWLIST`, o dev sin clave) vuelve `simulated`; se marca `email_sent_at`, como
  los envíos en tandas marcan 'sent' lo simulado, y no se vuelve a tomar. Las órdenes gratis pasan
  además por el tope de mails a una dirección sin confirmar (5 por día): el reintento no lo saltea.
- **Una dirección que falla siempre** (Resend la rechaza) se intenta como mucho 3 veces por día
  (`rate_limits`, la clave lleva el id de la orden) y no frena a las demás. Después de 48 h queda
  en «mails sin enviar» del Inicio para «Reenviar» a mano.

### Códigos copiables

Pedido de gorrite (11/10/2026): que Gmail y el celu reconozcan el código de los mails de
«Código para ingresar» y «Tu código para confirmar» (`src/lib/server/cuentas/email.js`), así se
copia o se completa solo. Gmail para Android e iOS muestra un botón «Copiar código» abajo del
asunto (desde septiembre de 2026; en la web todavía no) y, desde iOS 17 y macOS Sonoma, Safari
ofrece el código que llegó a Mail de Apple en el campo del código.

**Nadie publicó cómo los detectan.** Ni Google ni Apple tienen marcado oficial para códigos en
mails: el marcado de Gmail (schema.org) no tiene nada para códigos, y la documentación de Apple
sobre códigos de un solo uso habla solo de SMS. Hay dos borradores de la IETF con un encabezado
para el código (`One-Time-Code`, de Apple, de 2023 y vencido; `OTP-Token`, de Google, de
septiembre de 2026), pero ninguno dice que un cliente de mail lo use, así que por ahora no los
mandamos. Lo que sigue sale de lo que se observa y de las reglas publicadas para SMS:

- **6 cifras, sin letras ni separadores.** El formato de nuestros códigos ya es el más fácil de
  reconocer (Android, para SMS, busca de 4 a 10 caracteres con al menos una cifra).
- **«código» en el asunto, sin el código**: «Tu código para entrar a Kinky Vibe» y «Tu código
  para confirmar en Kinky Vibe». El código no va en el asunto porque se ve en las notificaciones
  del celu. Se probó ponerlo al principio («482913 es tu código…»): en dos pruebas de gorrite con
  mails reales en Gmail para celu (11/10/2026), no apareció «Copiar código» ni con el código en el
  asunto ni sin él, así que volvió a salir. Igual, los logs de producción y de los previews tapan
  los números de 6 cifras o más del asunto (`subjectForLog` en `emailGuard.js`), por si alguna vez
  vuelve.
- **Un preencabezado en castellano y sin números** (lo que se lee en la lista de mails, oculto en
  el mail abierto; `preheader` de `mailLayout`).
- **El código es lo primero del mail**, solo en su renglón y justo después de una frase con
  «código» («Tu código para entrar a Kinky Vibe es:»), igual en el HTML (en su recuadro, en
  monoespaciada) y en el texto plano. Va una sola vez y no hay otro número suelto cerca.
- **El remitente es del mismo dominio que el sitio** (`kinkyvibe.ar`): Mail de Apple parece no
  ofrecer códigos de un dominio distinto.
- Los campos donde se escribe tienen `autocomplete="one-time-code"` e `inputmode="numeric"`.

Los demás códigos no se arman así, a propósito: el de cada entrada se dicta en la puerta (y un
mail puede tener varios), el de descuento ya está aplicado y la referencia de una transferencia
no es un código para escribir en el sitio. Un botón «Copiar código» ahí confundiría.

`email.test.js` comprueba todo esto, y `mails.text.json` el asunto y el texto plano exactos.

**«Parece que este mensaje está en inglés».** En la misma prueba, Gmail ofreció traducir el mail
de código, que está en castellano. Google no dice cómo decide el idioma. Lo que vimos: el mail ya
tenía `<html lang="es">` y ningún texto en inglés salvo «Kinky Vibe» (logo, asunto, cuerpo, firma
y el nombre del remitente), y es muy corto. Por eso ahora todos los mails salen con el encabezado
`Content-Language: es` (`MAIL_HEADERS` en `tickets/email.js`, que Resend manda tal cual), y los de
código con un preencabezado en castellano. En la segunda prueba Gmail siguió ofreciendo traducir:
no alcanzó. Quedan igual, porque dicen la verdad sobre el mail y no molestan; la causa sigue sin
saberse.

Fuentes: [9to5Google](https://9to5google.com/2026/09/19/gmail-copy-code/) (botón de Gmail),
[foro de desarrolladores de Apple](https://developer.apple.com/forums/thread/738690) (códigos en
Mail, dominio), [Google, SMS User Consent](https://developers.google.com/identity/sms-retriever/user-consent/request)
(formato de SMS), [borrador `One-Time-Code`](https://www.ietf.org/archive/id/draft-wells-origin-bound-one-time-codes-00.html),
[borrador `OTP-Token`](https://www.ietf.org/archive/id/draft-goto-otp-token-01.html) y
[acciones de Gmail](https://developers.google.com/workspace/gmail/markup/actions/declaring-actions).

### No fui yo

Varios formularios públicos le mandan un mail a la dirección que escribe quien los llena, sin
confirmarla antes: entradas gratis, reservas por transferencia, el de confirmar de la lista de
espera y el de confirmar «Avisame si se repite». Quien lo recibe tiene que poder decir «no fui yo».
Todo en `src/lib/server/email/suppressions.js`; la tabla es `email_suppressions` (migración
`0060_email_suppressions.sql`).

- **El link:** esos cuatro mails llevan en el pie (después de la baja, antes de la firma) «¿No
  pediste vos estas entradas? / ¿No reservaste vos? / ¿No te anotaste vos? Alguien escribió tu mail
  por error. Tocá acá y no te mandamos más mails de Kinky Vibe a esta dirección.» (`mailOptOut` de
  `layout.js`; en el texto plano, con la dirección). Lo pone el código: no se edita en las
  plantillas. Las entradas gratis llevan la línea en «Tus entradas» solo si la orden es `gratis`.
- **La dirección del link:** `/mails/no-fui-yo/<hash>.<firma>`. El hash es `emailHash` de las
  cuentas (el mismo de los límites; nunca el mail) y la firma, de `signedLinks.js` con la clave
  `mail_opt_out_key` (se crea sola en `ticket_settings`). Un link tocado no sirve.
- **La página:** GET solo muestra el botón «No quiero más mails» (`MailLinkCard`, con
  `Referrer-Policy: same-origin`, como los otros links de mails) y el POST anota el hash. Dos veces
  es lo mismo que una. Las visitas no se cuentan en las analíticas.
- **Qué deja de salir** (`deliver()` con `optOut`): todo mail que no es de una compra pagada. Los
  de una orden gratis o de una reserva sin pagar (entradas, datos para transferir, recordatorios,
  link de la transmisión, cambio de fecha, «Mail a compradores» si la persona no tiene ninguna orden
  paga en el evento), todos los de la lista de espera, los de series y los de «Lo que sigo». Un mail
  cortado vuelve como `simulated` (no se reintenta) y se loguea sin la dirección; si no se puede
  leer la tabla, no sale (`failed`, se reintenta). La orden o la anotación se crean igual: las
  entradas gratis quedan aprobadas.
- **Qué sale siempre:** los de una compra pagada (entradas, recordatorios, reembolsos y demás de
  una orden que no es `gratis`, `isFreeOrder`), los códigos para entrar a Mi rincón, el mail del
  Fondo y las pruebas de las plantillas.
- **Tope por dirección sin confirmar** (`UNCONFIRMED_MAIL_CAP`, 5 por día): suma los cuatro
  formularios para una misma dirección (`rate_limits`, clave con el hash), además de los límites de
  cada uno. No cuenta si la dirección es la de la cuenta con sesión. Si la base falla, no sale.
- **Entradas gratis, una por mail y evento**, salvo con la cuenta de ese mail (ver
  [tickets.md](tickets.md)). El «por qué te llega» de los mails de una orden gratis dice «Te llega
  porque se pidieron entradas gratis con este mail en kinkyvibe.ar.» (`WHY_FREE`), no «porque
  compraste».
- **Parte 2: Mi rincón pregunta** (decisión
  [0048](decisiones/0048-entradas-gratis-sin-sesion-se-preguntan.md)). Una orden gratis hecha sin
  la sesión de la cuenta de ese mail no aparece en Mi rincón, en «Mis entradas» del bot ni en el
  calendario personal hasta que la persona la confirma: Mi rincón la muestra aparte, en «¿Son
  tuyas?», con «Sí, son mías» y «No es mía» (la esconde para esa cuenta). Las pagas se ven siempre,
  igual que las gratis que cargan les admins (puerta, carga a mano) y las de antes de la migración.
  Detalle en [cuentas.md](cuentas.md) (migración 0061, `free_order_choices`).

### Mail del Fondo (tu link)

fondo.kinkyvibe.ar («¿Ya sos Mecenas?», `/mi-link`) no tiene clave de Resend: le pide a este sitio
que mande el mail con el link de cada suscripción de une mecenas para elegir cómo aparece en el
Fondo (issue #265). Es un pedido de servidor a servidor, no un relay genérico: quien llama elige
solo la dirección y los links; el asunto, los textos y el remitente están fijos en el código.

- **Endpoint:** `POST /api/fondo/mi-link` (`src/routes/api/fondo/mi-link/+server.js`; la lógica en
  `src/lib/server/fondo/miLink.js`, el mail en `src/lib/server/fondo/email.js`).
- **Secreto:** header `x-fondo-secret` = `FONDO_MAIL_SECRET`, comparado en tiempo constante (sobre
  los SHA-256). Es un Secret del Worker `kinkyvibe` con el mismo valor que en el Worker del Fondo;
  se genera con un comando, nunca se escribe a mano ni va a `wrangler.toml`. Sin él (o con menos de
  16 caracteres) el endpoint contesta 401 siempre. El secreto se revisa antes de leer el body.
- **Body:** JSON (`content-type: application/json`), 4 KB como mucho, exactamente
  `{ "to": "<mail>", "links": [{ "tier": "Casual", "url": "https://fondo.kinkyvibe.ar/gracias?preapproval_id=<hex>" }] }`:
  - `to`: un mail válido (`normalizeEmail` de cuentas: hasta 254 caracteres, se pasa a minúsculas);
  - `links`: de 1 a 5;
  - `tier`: Visitante, Casual, Regular, Sugar, Estrella, Leyenda o Super, tal cual;
  - `url`: exactamente `https://fondo.kinkyvibe.ar/gracias?preapproval_id=` + hexadecimal (sin
    otros parámetros), 200 caracteres como mucho;
  - cualquier otra clave, arriba o en un link, es un 400.
- **El mail:** remitente `Fondo KinkyVibe <fondo@kinkyvibe.ar>` (no el de entradas de Ajustes;
  `deliver()` acepta un `from` fijo solo para esto; la dirección de respuesta y el pie siguen siendo
  los de Ajustes), asunto «Tu link para elegir cómo aparecés en el Fondo KinkyVibe», un botón
  «Mecenas <nivel>: elegir cómo aparezco» por link y el aviso «No compartas este mail…». Es el único
  mail con más de un botón (uno por suscripción). Sale por `deliver()`, así que en un preview solo
  llega a `EMAIL_ALLOWLIST`.
- **Respuestas** (sin detalles, a lo sumo un código corto): `204` si salió (o se simuló o desvió en
  un preview), `400` si el pedido no es válido, `401` sin el secreto correcto, `429` (con
  `Retry-After`) si se pasó el tope, `502` si Resend o `deliver()` fallaron y `503` si no hay base
  para contar el tope.
- **Tope:** 30 mails por hora para todo el sitio (`rate_limits` de D1, clave `fondo:mi-link:global`),
  contados solo después de validar. Es grueso a propósito: el límite por mail y por IP lo hace el
  Fondo de su lado.
- **Logs:** nunca la dirección ni los links; solo el resultado y cuántos links.
- **El mismo secreto** autentica `GET /api/fondo/propinas-total`, el total de propinas al Fondo de
  un «mes Fondo» que pide fondo.kinkyvibe.ar para su porcentaje (ver
  [propinas.md](propinas.md#total-para-el-fondo-get-apifondopropinas-total)).

### Mails de la lista de espera

En construcción (interruptor `lista_espera`; [tickets.md](tickets.md#lista-de-espera-en-construcción)).
Los seis usan la plantilla común y tienen su plantilla editable (`waitlist_*`, general y por
evento, como los de entradas); en Mensajes → Plantillas y en la pestaña Mails de cada evento
aparecen con la etiqueta «prueba» mientras el interruptor está apagado.

- **Sin nombre:** la lista guarda solo el mail. Variables: `evento`, `fecha`, `tipo` (vacío si la
  lista es de todo el evento) y, en la oferta y el último aviso, `vence` (hasta cuándo se guarda el
  lugar; vacío si se le avisó a toda la lista).
- **Lo fijo** (lo pone el código): el evento con su fecha (y el tipo), el recuadro con hasta cuándo
  se guarda el lugar (o «Le avisamos a toda la lista a la vez: se lo queda quien compre primero»,
  o por qué cerró la lista), el botón con su link y, en el pie, **el link para salir de la lista**
  (en todos; en el de confirmar dice «Borrar el pedido ahora»).
- **Sin plantilla guardada** sale el texto de partida de cada plantilla (sus `defaults`, byte a byte
  la golden de `email.golden.json`, casos `waitlistEmailCases` de `email.fixtures.js`).
- **Envío:** el de confirmar sale en el momento por `deliver()` (`waitlistSender`, sin clave de
  idempotencia, como «Avisame si se repite»). Los otros cuatro los manda el cron con
  `sendWaitlistEntryMail` (`waitlistMail.js`): una fila de `waitlist_sends` por anotación, mail y
  ronda, con los estados de los envíos en tandas (`sendState.js`, que ahora también sirve para
  filas por anotación), y la clave de Resend `waitlist-<mail>-<anotación>-<ronda>`
  (`waitlist-closed-<anotación>` para el cierre).
- **Quién los dispara** (el motor, `sendWaitlistMails` en `waitlistEngine.js`): no hay cola aparte,
  lo que falta sale del estado de cada anotación y de `waitlist_sends`. La oferta, a cada oferta
  vigente sin su mail; el último aviso, con 3 h por delante de una reserva de 12 h o más y la oferta
  ya mandada; «se venció», si venció la reserva con la oferta ya mandada; «se terminó tu lugar»
  (`waitlist_ended`, mismo envío `expired` y mismo «Volver a anotarme»), si une admin terminó la
  reserva con «Mandarle un mail» marcada y la oferta ya había salido (el pedido es la fila de
  `waitlist_sends`, `queueEndedMail`); «se cerró la lista», al
  cerrar (cerca del comienzo, fin de la venta, «Cerrar la lista» en el panel) o si se cancela el
  evento. Los dos últimos, solo si pasó hace menos de 48 h. En el cron van **primero** en la tanda
  (`runMailQueueWith`, `sendWaitlist`) y comparten el «de a cuántos»; las acciones del panel y los
  empujones mandan los de ese evento en el momento.
- **Sin mail:** «Terminar la reserva y pasar a la siguiente» con la casilla destildada (o con la
  lista apagada), «Sacar de la lista» (panel), salir
  con el link, y un tipo de entrada que ya no existe ([decisión 0040](decisiones/0040-lista-de-espera.md)).
- **Si no sale** después de 3 intentos: una fila en «Para revisar» que lleva a Ventas › Lista de espera
  del evento, con «Volver a probar».
- **Links:** confirmar `/lista-de-espera/confirmar/<token>` (48 h); salir
  `/lista-de-espera/salir/<id>.<firma>` y volver `/lista-de-espera/volver/<id>.<firma>`, firmados con
  `waitlist_leave_key` (se crea sola en `ticket_settings`), cada uno con su propio mensaje; la oferta
  `/calendario/<slug>/entradas?lista=<token>`. GET solo muestra el botón y el POST hace el cambio
  (`MailLinkCard`), así los antivirus del correo no confirman ni sacan a nadie.
- **Las páginas de los links de los mails** (`MailLinkCard`: avisos de series, «Lo que sigo», lista
  de espera) van con `Referrer-Policy: same-origin`, nunca `no-referrer`: con no-referrer el
  navegador manda el POST de un formulario común con `Origin: null` y SvelteKit lo rechaza
  («Cross-site POST form submissions are forbidden»; gorrite, 12/10). Afuera no se manda nada
  igual. Lo controla `src/routes/referrer-forms.test.js` para todo el sitio. Las de confirmar
  (`auto`) mandan el formulario solas una vez al abrirse en un navegador (los antivirus casi nunca
  corren JavaScript; el GET nunca cambia nada y el botón queda por si no hay JavaScript); salir,
  darse de baja y volver a anotarse siguen pidiendo el botón.
- **Logs:** nunca el mail; solo el id de la anotación.

**Mail a compradores:** se manda en tandas (un Worker tiene un límite de pedidos a otros servicios
por pedido); la página pide tandas y muestra el progreso.

**Cambió la fecha («Avisar a les compradores»)** (`src/lib/server/tickets/dateChange.js`,
migración `0048_avisar_cambio_fecha.sql`):

- **Detectar el cambio.** Al guardar un evento en Editar (`editar/+page.server.js`), si el inicio o
  el fin cambiaron (se comparan instantes, con `eventEnd`), se anota en `event_date_changes`: una
  fila por evento con la fecha de antes, la nueva, cuándo y quién. No manda nada. Si el cambio
  anterior todavía no se avisó a nadie, «antes» sigue siendo la fecha original (dos cambios
  seguidos avisan «de la original a la última»), y volver a la original sin avisar borra el cambio.
- **Ofrecerlo.** Si hay compras aprobadas (con mail) de antes del cambio, arriba de todas las
  pestañas de la ficha aparece «Cambiaste la fecha. ¿Avisamos a las N personas que compraron?»
  con **Avisar a les compradores** y **No hace falta** (deja de mostrarse). No aparece con el
  evento cancelado o ya terminado. En **Mails → Mandar un aviso** está siempre la tarjeta **Avisar el
  cambio de fecha**, para usarla más tarde. El botón pide confirmación.
- **A quiénes.** Cada orden aprobada, con mail, de antes del cambio (las que compraron después ya
  recibieron la fecha nueva en sus entradas). Reembolsadas, canceladas y sin pagar no. Una vez por
  orden y versión (`date_change_sends`, con los estados de los envíos en tandas): tocar dos veces
  no manda dos veces, y un cambio nuevo se puede volver a avisar. Clave de Resend
  `datechange-<orden>-<versión>`.
- **En tandas.** El botón manda la primera («Mails por tanda») y deja el envío pedido
  (`send_requested_at`); el cron sigue con el resto después de los recordatorios y los links
  (`mailQueue.js`). Queda en Actividad (`event.date_change.send`, solo cuántos: nunca mails).
- **El mail.** Asunto «Cambió la fecha: <evento>», la fecha nueva en un recuadro (hora argentina,
  con el fin: «sábado 21 de noviembre de 2026, 21:00 a 02:00») con el lugar, «Antes era: …», el
  `.ics` y el link «Agregar a Google Calendar» con el mismo UID y la **versión del cambio**: el
  minuto siguiente al guardado, así el `SEQUENCE` es más alto que el de cualquier mail anterior y
  el calendario reemplaza la entrada vieja. En un evento online, el link de la transmisión (recuadro
  y botón) si ya está, como en los demás mails. Plantilla `date_change` (variables: `nombre`,
  `evento`, `fecha`, `fecha_anterior`, `lugar`, `entradas`). El texto por defecto dice que lo comprado sigue valiendo y, debajo del botón, que si con la fecha nueva no puede, responda el mail y le devolvemos lo que pagó (como la política de devoluciones).

## Configuración

| Qué                                | Dónde                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Remitente y dirección de respuesta | Panel → Mensajes → Configuración (si está vacío, `TICKETS_FROM_EMAIL` / `TICKETS_REPLY_TO`) |
| Pie de los mails (contacto, firma) | Panel → Mensajes → Configuración (vacío = el de siempre)                                    |
| Recordatorios (cuándo)             | Panel → Mensajes → Configuración                                                            |
| Clave de Resend                    | `RESEND_API_KEY`, Secret en Cloudflare. Sin ella no sale ningún mail                        |
| Dominio                            | `kinkyvibe.ar` verificado en Resend (SPF/DKIM en Cloudflare DNS)                            |
| Secreto del cron                   | `CRON_SECRET`, Secret del Worker `kinkyvibe` (lo usan el cron y `/api/cron/*`)              |
| Secreto del mail del Fondo         | `FONDO_MAIL_SECRET`, Secret del Worker `kinkyvibe` (el mismo valor en el del Fondo)         |
| Previews                           | `EMAIL_ALLOWLIST` en el entorno Preview de Cloudflare                                       |

Las respuestas a `entradas@kinkyvibe.ar` llegan al Gmail de la organización (Cloudflare Email
Routing). La bandeja dentro del panel es una decisión tomada (0010) pero todavía no existe.

## Cómo probar

- `npm run dev:tickets`: sin `RESEND_API_KEY`, cada mail se imprime en la consola en vez de
  mandarse.
- Recordatorios en local:
  `curl -X POST localhost:5173/api/cron/recordatorios -H "x-cron-secret: dev-cron-secret-solo-local"`
  (el secreto de prueba está en `.env.tickets`).
- Pruebas: `npx vitest run src/lib/server/tickets` (incluye `templates.test.js`, que compara cada
  mail con `email.golden.json`, `eventTemplates.test.js` (partes opcionales, orden evento →
  general → código, validación), `buyerMail.test.js`, `reminders.test.js`, `emailGuard.test.js`,
  `dateChange.test.js` y `dateChange.send.test.js`).
- En un preview: con `EMAIL_ALLOWLIST` cargada, comprá con cualquier mail y el mail llega a la
  primera dirección de la lista con `[DEMO]`. `GET /api/preview-status` muestra si está configurada.

## Tareas comunes

**Cambiar el texto de un mail.** Panel → Mensajes → Plantillas → el mail.
Vista previa con datos de ejemplo y "Mandarme una prueba". "Restaurar el original" borra la
fila y vuelve al del código.

**Cambiar un mail solo para un evento.** Ficha del evento → Mails → Plantillas → el mail. Lo
vacío sale como en la plantilla general. "Volver a la plantilla general" borra lo del evento (también guardar todo vacío); antes guarda
una copia en `panel_deletions`, así se recupera desde Ajustes › Actividad («Recuperar», decisión
0030).

**Cambiar un mail desde el código.** Editá la función `build…Email` en `email.js` y actualizá
`email.golden.json` en el mismo PR, explicando el cambio. Si agregás una variable, sumala en
`emailTemplates.js`.

**Agregar un mail nuevo.** Armalo en `email.js`, mandalo con `deliver()` (nunca directo a
Resend) y, si es masivo, con una tabla de envíos que reserve a cada destinatarie antes de mandar
(como `buyerMail.js`). Nueva migración si hace falta tabla ([datos.md](datos.md)).

**A alguien no le llegaron las entradas («no me llegó»).** Buscá la orden en la ficha del evento
→ Órdenes. Si dice que el mail salió, que revise spam y que la dirección esté bien escrita (si
está mal, no hay reintento que sirva). Si no salió y la orden tiene menos de 48 h, el cron la
reintenta sola cada 15 minutos. Si no, «Reenviar» manda las entradas de nuevo (sin clave de
idempotencia: sale aunque ya hubiera salido). Una orden gratis a una dirección que tocó «No fui
yo» no sale nunca, tampoco con «Reenviar». Quien compró también ve sus entradas en la página de
la compra (`/entradas/<orden>/estado`) desde el navegador en que compró.

**Un recordatorio no salió.** Mirá los logs del Worker `kinkyvibe` en Cloudflare
(**Observability → Logs**, buscar `recordatorios:`): 503 = falta `CRON_SECRET`.
