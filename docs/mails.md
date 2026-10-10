# Mails

## Qué hace

El sitio manda mails a quienes compran entradas: las entradas con su QR, las instrucciones de una
transferencia, el link de la transmisión de un evento online, los recordatorios antes del evento,
el aviso de reembolso y los avisos que les admins escriben desde el panel ("Mail a compradores").
Salen con **Resend**, desde `entradas@kinkyvibe.ar` (se cambia en el panel). Les admins pueden
cambiar el asunto, el título, el texto de arriba y los detalles del diseño (etiqueta, texto del
botón, línea de ayuda y «por qué te llega») de cada mail sin tocar código, en general o solo para
un evento, y mandarse una prueba.

## Lo que nunca se tiene que romper

- **Nadie recibe un mail dos veces por el mismo envío.** Cada envío masivo reserva a cada
  destinatarie con un `INSERT` atómico antes de mandar y lo libera si falla (`reminder_sends`,
  `stream_link_sends`, `event_mail_recipients`). Un doble click, dos pestañas o un reintento no
  duplican.
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
- El DNI nunca va en un mail. Los tokens de las entradas no se loguean completos.
- Un mail que falla no frena la compra: se loguea y se puede reenviar desde el panel.

## Los mails

| Mail                      | Cuándo sale                                                             | Plantilla  | Código                               |
| ------------------------- | ----------------------------------------------------------------------- | ---------- | ------------------------------------ |
| Tus entradas              | al aprobarse una compra o confirmarse una transferencia; "Reenviar"     | `tickets`  | `buildTicketEmail` en `email.js`     |
| Reserva por transferencia | al reservar pagando por transferencia                                   | `transfer` | `buildTransferEmail`                 |
| Link de la transmisión    | "Enviar el link a todes" en un evento online                            | `stream`   | `buildStreamLinkEmail`, `stream.js`  |
| Recordatorio              | antes del evento, según Ajustes → Mails y plantillas                    | `reminder` | `buildReminderEmail`, `reminders.js` |
| Reembolso                 | al reembolsar (desde el panel o desde Mercado Pago)                     | `refund`   | `buildRefundEmail`                   |
| Mail a compradores        | une admin lo escribe en la ficha del evento → Mail                      | —          | `buyerMail.js`                       |
| Código para ingresar      | al pedirlo en /ingresar (cuentas del público, [cuentas.md](cuentas.md)) | —          | `src/lib/server/cuentas/email.js`    |

Todo en `src/lib/server/tickets/` salvo que se indique. Las plantillas: definición y variables en
`src/lib/utils/emailTemplates.js`, lo guardado en D1 en `templates.js`, el editor
(`src/lib/components/admin/MailTemplateEditor.svelte`) en `/admin/mensajes/plantillas` y en la
pestaña **Plantillas de mails** de la ficha de cada evento que vende entradas.

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
(«Kinky Vibe · Buenos Aires») se cambian en Panel → Ajustes → Mails → Pie de los mails
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

**Recordatorios:** el cron del propio Worker (`src/lib/server/scheduled.js`) le pasa cada 15
minutos `POST /api/cron/recordatorios`, con el header `x-cron-secret`, al sitio. El sitio decide qué mandar. Por
defecto: 2 días antes y el mismo día a las 9:00; un evento los apaga con `recordatorios: false`.

**Mail a compradores:** se manda en tandas (un Worker tiene un límite de pedidos a otros servicios
por pedido); la página pide tandas y muestra el progreso.

## Configuración

| Qué                                | Dónde                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Remitente y dirección de respuesta | Panel → Ajustes → Mails y plantillas (si está vacío, `TICKETS_FROM_EMAIL` / `TICKETS_REPLY_TO`) |
| Pie de los mails (contacto, firma) | Panel → Ajustes → Mails (vacío = el de siempre)                                                 |
| Recordatorios (cuándo)             | Panel → Ajustes → Mails y plantillas                                                            |
| Clave de Resend                    | `RESEND_API_KEY`, Secret en Cloudflare. Sin ella no sale ningún mail                            |
| Dominio                            | `kinkyvibe.ar` verificado en Resend (SPF/DKIM en Cloudflare DNS)                                |
| Secreto del cron                   | `CRON_SECRET`, Secret del Worker `kinkyvibe` (lo usan el cron y `/api/cron/*`)                  |
| Previews                           | `EMAIL_ALLOWLIST` en el entorno Preview de Cloudflare                                           |

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
  general → código, validación), `buyerMail.test.js`, `reminders.test.js`, `emailGuard.test.js`).
- En un preview: con `EMAIL_ALLOWLIST` cargada, comprá con cualquier mail y el mail llega a la
  primera dirección de la lista con `[DEMO]`. `GET /api/preview-status` muestra si está configurada.

## Tareas comunes

**Cambiar el texto de un mail.** Panel → Ajustes → Mails y plantillas → Plantillas → el mail.
Vista previa con datos de ejemplo y "Mandarme una prueba". "Restaurar el original" borra la
fila y vuelve al del código.

**Cambiar un mail solo para un evento.** Ficha del evento → Plantillas de mails → el mail. Lo
vacío sale como en la plantilla general. "Volver a la plantilla general" borra lo del evento (también guardar todo vacío); antes guarda
una copia en `panel_deletions`, así se recupera desde Ajustes › Actividad («Recuperar», decisión
0030).

**Cambiar un mail desde el código.** Editá la función `build…Email` en `email.js` y actualizá
`email.golden.json` en el mismo PR, explicando el cambio. Si agregás una variable, sumala en
`emailTemplates.js`.

**Agregar un mail nuevo.** Armalo en `email.js`, mandalo con `deliver()` (nunca directo a
Resend) y, si es masivo, con una tabla de envíos que reserve a cada destinatarie antes de mandar
(como `buyerMail.js`). Nueva migración si hace falta tabla ([datos.md](datos.md)).

**Un recordatorio no salió.** Mirá los logs del Worker `kinkyvibe` en Cloudflare
(**Observability → Logs**, buscar `recordatorios:`): 503 = falta `CRON_SECRET`.
