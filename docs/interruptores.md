# Interruptores

## Qué son

Todo lo nuevo sale **apagado** y se prende desde el panel cuando está listo (decisión
[0001](decisiones/0001-ritmo-y-orden.md)). Cada interruptor prende una parte del sitio; apagado,
el sitio se ve y anda como antes de esa parte.

- **Dónde**: Ajustes → Sistema → Interruptores (`/admin/ajustes/interruptores`). Cada cambio queda
  en Actividad.
- **Tarda hasta 30 segundos** en verse en todo el sitio: cada isolate recuerda el valor un rato
  (`FLAG_CACHE_MS`). Lo recordado es el valor ya leído: la lectura en camino se comparte solo
  dentro del pedido (ver [contenido.md](contenido.md), `readAndKeep`).
- **Cada entorno tiene los suyos**: se guardan en la tabla `feature_flags` de cada base. Prender
  algo en un preview (base `kinkyvibe-preview`, compartida por todos los previews) no lo prende en
  producción, y al revés. Sin fila en la tabla, apagado.
- **Variable de entorno**: cada interruptor tiene una que manda sobre el panel. `1` lo fuerza
  prendido (tests E2E, `vite dev`), `0` lo fuerza apagado aunque el panel diga otra cosa (sirve para
  **cortarlo de golpe** desde el panel de Cloudflare si algo sale mal). Vacía o ausente: manda el
  panel. La página de Interruptores muestra cuando una variable lo está forzando.
- **En el menú**: las secciones de un interruptor apagado se ven solo para les superadmins, con la
  etiqueta "prueba" ([panel.md](panel.md), «Ciclo de vida de una sección»).

La lista y los textos salen de `src/lib/server/flags.js` (`FLAGS`). Para agregar uno: sumalo ahí,
con su `envVar` y un atajo (`algoEnabled(platform)`), y documentalo en esta guía.

## Pausas de emergencia

Dos variables del Worker para **frenar de golpe** la venta online o los mails en tanda si algo sale
mal (un precio mal cargado, una sobreventa, un aviso que salió con un error), sin PR ni build y sin
borrar `MP_ACCESS_TOKEN` o `RESEND_API_KEY` (Cloudflare no deja volver a ver su valor). No son
interruptores de la base: se prenden y se apagan **solo desde el panel de Cloudflare**, a propósito,
para que anden aunque la base o el panel del sitio estén mal. Código:
`src/lib/server/emergencia.js`.

| Variable         | Valor                                                                                       | Qué frena                                                                                                                                                                                                                                                                  | Qué sigue igual                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TICKETS_PAUSED` | el texto que ven les compradores (p. ej. `Volvemos en un rato`); `1` = un texto por defecto | la venta online: la página del evento y la de compra (`/calendario/<slug>/entradas`) muestran el texto en lugar de los botones, y el servidor no crea ninguna orden nueva (Mercado Pago, transferencia ni gratis; responde 503 con el texto). La lista de espera no avanza | la puerta (con y sin conexión), la carga a mano desde el panel, los webhooks de Mercado Pago (una orden ya creada se aprueba cuando llega su pago), la página de estado de una compra, confirmar transferencias, los reembolsos y salir de la lista de espera |
| `MAILS_PAUSED`   | cualquier texto (una nota para el panel) o `1`                                              | los mails en tanda: recordatorios, «Enviar el link a todes», «Avisar a les compradores», «Mail a compradores», avisos de series, «Lo que sigo» (mail y Telegram) y los de la lista de espera. La lista de espera no avanza                                                 | los mails de cada compra: entradas (y su reintento), datos para transferir, reembolso, códigos para ingresar, confirmaciones (lista de espera, avisos de series), «Tu link» del Fondo y «Mandarme una prueba»                                                 |

Vacía, ausente o `0`: apagada. Cada una anda sola (se pueden prender las dos).

### Cómo prenderla y apagarla (panel de Cloudflare)

Lo hace quien tiene acceso a la cuenta de Cloudflare.

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **kinkyvibe** →
   **Settings** → **Variables and Secrets**.
2. **Prender:** **+ Add** → Type **Text** → Variable name `TICKETS_PAUSED` (o `MAILS_PAUSED`) →
   Value: el texto (`Volvemos en un rato`, o `1`) → **Deploy**. El texto de `TICKETS_PAUSED` es lo
   que lee el público: en voseo y corto.
3. **Apagar:** en la misma pantalla, borrar la variable (o cambiar su valor a `0`) → **Deploy**.

Guardar publica una versión nueva del Worker al instante. Las páginas públicas guardadas en la
caché de 1 minuto ([0049](decisiones/0049-cache-de-1-minuto-sin-sesion.md)) pueden mostrar los
botones hasta 1 minuto más, pero comprar ya no anda. Con `keep_vars = true` (`wrangler.toml`), la
próxima publicación desde `main` no borra la variable: **hay que sacarla a mano**.

**Cómo se ve en el panel:** Ajustes → Sistema → Interruptores tiene arriba la tarjeta «Pausas de
emergencia» con el estado de cada una (y el texto que ve el público); la tarjeta de Interruptores
de la portada de Ajustes dice «En pausa: …» en amarillo, y «Para revisar» del Inicio suma una fila
roja por pausa, que se va sola al sacarla. La respuesta del cron (`POST /api/cron/recordatorios`)
suma `paused: { tickets, mails }` y cada cosa que no sale deja una línea `[pausa] MAILS_PAUSED: …`
en los logs del Worker.

### Qué pasa con lo pendiente

Con `MAILS_PAUSED` nada se descarta ni gasta intentos: lo que no salió queda pendiente y lo manda
el cron (cada 15 minutos) cuando se saca la variable. Salvo lo que vence antes:

- **Recordatorios:** salen después si el evento todavía no empezó (un «faltan 2 días» puede llegar
  más tarde de lo previsto); los de un evento que ya empezó no salen.
- **«Enviar el link a todes» y «Avisar a les compradores»:** el botón dice que los mails están en
  pausa y deja el envío pedido; el cron lo manda solo después.
- **«Mail a compradores»:** el botón dice que está en pausa; el texto (y, si había empezado, el
  avance) queda en la página. Después de la pausa, tocar **Mandar** otra vez **sin recargar la
  página**: sigue el mismo envío y a quien ya le llegó no le llega de nuevo (recargando, es un envío
  nuevo y les llegaría otra vez a todes).
- **Series:** el aviso de una edición nueva sale después, si la edición todavía no pasó.
- **«Lo que sigo»:** «algo nuevo» sale después; el «recordatorio el día antes» solo si el evento
  todavía empieza en las próximas 24 h. Los avisos por Telegram de «Lo que sigo» también esperan.
- **Lista de espera:** con cualquiera de las dos pausas no se guardan lugares nuevos (un lugar que
  no se puede comprar, o del que nadie se entera, se vencería igual). Los lugares que ya estaban
  guardados siguen corriendo su tiempo. Sus mails (último aviso, «se venció», «se cerró la lista»)
  salen después de la pausa si pasaron hace menos de 48 h. Si une admin pasa un lugar a mano durante
  `MAILS_PAUSED`, el lugar se guarda pero el mail sale recién después (y el tiempo corre).

Con `TICKETS_PAUSED`, una reserva por transferencia o un pago de Mercado Pago ya empezados siguen
su curso (vencen a su hora, como siempre); quien tiene un lugar guardado en la lista de espera ve
el texto de la pausa al querer comprar.

## Los interruptores

| Interruptor (clave)                                     | Variable                        | Qué prende                                                                                                                                                                                                                                                                                                                                                         | Antes de prenderlo                                                                                                                | Guía                             |
| ------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Lo que sigo (`lo_que_sigo`)                             | `LO_QUE_SIGO_ENABLED`           | con cuenta, seguir etiquetas (y series), perfiles y lugares: «Seguir» en sus páginas y Mi rincón → Lo que sigo, con calendario y mails. Apagado, `/mi-rincon/sigo` da 404                                                                                                                                                                                          | migración `0032_lo_que_sigo.sql`                                                                                                  | [lo-que-sigo.md](lo-que-sigo.md) |
| Bot de Telegram (`telegram_bot`)                        | `TELEGRAM_BOT_ENABLED`          | el bot contesta `/proximos` y `/evento`; con «Lo que sigo» prendido, además conecta chats con cuentas y manda esos avisos por Telegram. Apagado, el bot no contesta                                                                                                                                                                                                | `TELEGRAM_WEBHOOK_SECRET` y el webhook apuntando a `/api/telegram`; migración 0033                                                | [telegram.md](telegram.md)       |
| Donaciones únicas al Fondo (`propinas_fondo`)           | `PROPINAS_FONDO_ENABLED`        | `/propinas?de=fondo` y `/propinas` a secas: el formulario de propina para el Fondo, sin publicación, al que lleva «Una vez» de fondo.kinkyvibe.ar. Apagado, esas páginas solo explica que las propinas se dejan desde cada publicación (y el POST con `source=fondo` da 404). El total `GET /api/fondo/propinas-total` no depende de este interruptor              | migración `0052_propinas_origen.sql`                                                                                              | [propinas.md](propinas.md)       |
| Puerta por Telegram (`telegram_puerta`)                 | `TELEGRAM_PUERTA_ENABLED`       | les admins con el Telegram vinculado (Ajustes → Admins → «Vincular Telegram») marcan ingresos desde la Mini App `/telegram/puerta`, con el escáner de QR de Telegram. Pide el bot prendido. Apagado, `/telegram/puerta` da 404 (y no se puede vincular, salvo con `telegram_admin`)                                                                                | migración 0050; `TELEGRAM_BOT_TOKEN` y `TELEGRAM_BOT_USERNAME`                                                                    | [telegram.md](telegram.md)       |
| Telegram enriquecido (`telegram_enriquecido`)           | `TELEGRAM_ENRIQUECIDO_ENABLED`  | lo que el bot manda del sitio (Kinkipedia, material, eventos) se lee adentro del chat como mensaje enriquecido, con «Ver en el sitio»; «Mandar a un chat» en la Mini App del calendario y «Abrir en el calendario» en los eventos mandados. Pide el bot prendido. Apagado, las tarjetas de siempre                                                                 | `TELEGRAM_BOT_TOKEN`; para «Abrir en el calendario», `TELEGRAM_BOT_USERNAME` y la Main Mini App en @BotFather                     | [telegram.md](telegram.md)       |
| Telegram para admins (`telegram_admin`)                 | `TELEGRAM_ADMIN_ENABLED`        | les admins con el Telegram vinculado ven «📊 Estado» (vendidas contra cupo, reservas, lo que hay para revisar; solo cantidades) y eligen sus avisos en «🔔 Mis avisos» (apagados por defecto). Pide el bot prendido. Apagado, el bot contesta como si no existiera                                                                                                 | migración 0054 (para «Mis avisos»)                                                                                                | [telegram.md](telegram.md)       |
| Telegram: estadísticas de uso (`telegram_estadisticas`) | `TELEGRAM_ESTADISTICAS_ENABLED` | cuenta cómo se usa el bot para Estadísticas → Bot de Telegram: quién lo usa y cuánto (un número por persona y por día) y, aparte y sumado por semana, qué pantallas, búsquedas y cosas públicas se usan. Nunca qué buscó o miró cada persona. Pide el bot prendido. Apagado, no se cuenta nada                                                                     | migración `0057_telegram_uso.sql`; para los resultados inline, `/setinlinefeedback` en @BotFather y volver a registrar el webhook | [telegram.md](telegram.md)       |
| Lista de espera (`lista_espera`)                        | `LISTA_ESPERA_ENABLED`          | en construcción: cuando un evento o un tipo se agota, la gente se anota en una lista; si se libera un lugar, se le avisa a la próxima persona y se le guarda un rato. Se activa por evento (`lista_espera`). Apagado, la venta anda como siempre                                                                                                                   | migración `0053_lista_de_espera.sql`                                                                                              | [tickets.md](tickets.md)         |
| Códigos combo (`combo_codigos`)                         | `COMBO_CODIGOS_ENABLED`         | en la pestaña Códigos de un evento se arma un combo con otro: cada venta del primero (online, puerta o a mano, con email) trae en su mail un código personal (un uso, solo su mail) para el segundo; se anula si la compra se reembolsa. Apagado, no se arman combos ni se generan códigos (los ya mandados siguen valiendo)                                       | migración `0056_combo_codigos.sql`                                                                                                | [tickets.md](tickets.md)         |
| Gastos y reparto (`gastos_reparto`)                     | `GASTOS_REPARTO_ENABLED`        | prototipo: en la ficha de un evento que vende entradas, Ventas › Gastos y reparto: lo que entró (sin comisión de MP ni lo del Fondo), los gastos y el reparto entre les organizadores con «quién le pasa a quién». Lo cargado no va a la base (queda en el navegador, con exportar e importar). Apagado, la vista no se ve y `/admin/eventos/<slug>/gastos` da 404 | nada (sin migración)                                                                                                              | [tickets.md](tickets.md)         |
| Interruptor (clave)                                     | Variable                        | Qué prende                                                                                                                                                                                                                                                                                                                    | Antes de prenderlo                                                                                                                | Guía                             |
| ------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Lo que sigo (`lo_que_sigo`)                             | `LO_QUE_SIGO_ENABLED`           | con cuenta, seguir etiquetas (y series), perfiles y lugares: «Seguir» en sus páginas y Mi rincón → Lo que sigo, con calendario y mails. Apagado, `/mi-rincon/sigo` da 404                                                                                                                                                     | migración `0032_lo_que_sigo.sql`                                                                                                  | [lo-que-sigo.md](lo-que-sigo.md) |
| Bot de Telegram (`telegram_bot`)                        | `TELEGRAM_BOT_ENABLED`          | el bot contesta `/proximos` y `/evento`; con «Lo que sigo» prendido, además conecta chats con cuentas y manda esos avisos por Telegram. Apagado, el bot no contesta                                                                                                                                                           | `TELEGRAM_WEBHOOK_SECRET` y el webhook apuntando a `/api/telegram`; migración 0033                                                | [telegram.md](telegram.md)       |
| Donaciones únicas al Fondo (`propinas_fondo`)           | `PROPINAS_FONDO_ENABLED`        | `/propinas?de=fondo`: el formulario de propina para el Fondo, sin publicación, al que lleva «Una vez» de fondo.kinkyvibe.ar. Apagado, esa página solo explica que las propinas se dejan desde cada publicación (y el POST con `source=fondo` da 404). El total `GET /api/fondo/propinas-total` no depende de este interruptor | migración `0052_propinas_origen.sql`                                                                                              | [propinas.md](propinas.md)       |
| Puerta por Telegram (`telegram_puerta`)                 | `TELEGRAM_PUERTA_ENABLED`       | les admins con el Telegram vinculado (Ajustes → Admins → «Vincular Telegram») marcan ingresos desde la Mini App `/telegram/puerta`, con el escáner de QR de Telegram. Pide el bot prendido. Apagado, `/telegram/puerta` da 404 (y no se puede vincular, salvo con `telegram_admin`)                                           | migración 0050; `TELEGRAM_BOT_TOKEN` y `TELEGRAM_BOT_USERNAME`                                                                    | [telegram.md](telegram.md)       |
| Telegram enriquecido (`telegram_enriquecido`)           | `TELEGRAM_ENRIQUECIDO_ENABLED`  | lo que el bot manda del sitio (Kinkipedia, material, eventos) se lee adentro del chat como mensaje enriquecido, con «Ver en el sitio»; «Mandar a un chat» en la Mini App del calendario y «Abrir en el calendario» en los eventos mandados. Pide el bot prendido. Apagado, las tarjetas de siempre                            | `TELEGRAM_BOT_TOKEN`; para «Abrir en el calendario», `TELEGRAM_BOT_USERNAME` y la Main Mini App en @BotFather                     | [telegram.md](telegram.md)       |
| Telegram para admins (`telegram_admin`)                 | `TELEGRAM_ADMIN_ENABLED`        | les admins con el Telegram vinculado ven «📊 Estado» (vendidas contra cupo, reservas, lo que hay para revisar; solo cantidades) y eligen sus avisos en «🔔 Mis avisos» (apagados por defecto). Pide el bot prendido. Apagado, el bot contesta como si no existiera                                                            | migración 0054 (para «Mis avisos»)                                                                                                | [telegram.md](telegram.md)       |
| Telegram: estadísticas de uso (`telegram_estadisticas`) | `TELEGRAM_ESTADISTICAS_ENABLED` | cuenta cómo se usa el bot para Estadísticas → Bot de Telegram: quién lo usa y cuánto (un número por persona y por día) y, aparte y sumado por semana, qué pantallas, búsquedas y cosas públicas se usan. Nunca qué buscó o miró cada persona. Pide el bot prendido. Apagado, no se cuenta nada                                | migración `0057_telegram_uso.sql`; para los resultados inline, `/setinlinefeedback` en @BotFather y volver a registrar el webhook | [telegram.md](telegram.md)       |
| Lista de espera (`lista_espera`)                        | `LISTA_ESPERA_ENABLED`          | en construcción: cuando un evento o un tipo se agota, la gente se anota en una lista; si se libera un lugar, se le avisa a la próxima persona y se le guarda un rato. Se activa por evento (`lista_espera`). Apagado, la venta anda como siempre                                                                              | migración `0053_lista_de_espera.sql`                                                                                              | [tickets.md](tickets.md)         |
| Códigos combo (`combo_codigos`)                         | `COMBO_CODIGOS_ENABLED`         | en la pestaña Códigos de un evento se arma un combo con otro: cada venta del primero (online, puerta o a mano, con email) trae en su mail un código personal (un uso, solo su mail) para el segundo; se anula si la compra se reembolsa. Apagado, no se arman combos ni se generan códigos (los ya mandados siguen valiendo)  | migración `0056_combo_codigos.sql`                                                                                                | [tickets.md](tickets.md)         |
| Carrusel en la portada (`carrusel_portada`)             | `CARRUSEL_PORTADA_ENABLED`      | arriba de la portada, un carrusel con los próximos eventos de Kinky Vibe con imagen (hasta 5, por fecha; la regla en [estilo.md](estilo.md), «Carrusel de la portada»). Con `?carrousel` en la dirección se ve aunque esté apagado (para revisarlo en un preview). Apagado, la portada se ve como siempre                     | nada                                                                                                                              | [estilo.md](estilo.md)           |

Las migraciones las aplica gorrite antes del merge del código que las necesita
([0028](decisiones/0028-migraciones-antes-del-merge.md), [datos.md](datos.md)).

### Cómo se relacionan

- **`telegram_puerta` + `telegram_bot`**: la puerta por Telegram pide los dos. Con el bot
  apagado, la puerta no anda aunque su interruptor esté prendido.
- **`telegram_estadisticas` + `telegram_bot`**: las estadísticas de uso cuentan solo lo que el bot
  contesta: con el bot apagado no cuentan nada.
- **`telegram_admin` + `telegram_bot`**: el estado y los avisos para admins piden los dos.
  Vincular el Telegram de une admin (Ajustes → Admins) anda con `telegram_puerta` o con
  `telegram_admin`.
- **`telegram_bot` + `lo_que_sigo`**: vincular un chat con una cuenta (Mi rincón → Lo que sigo) y
  los avisos por Telegram piden los dos prendidos. Solo con `telegram_bot`, el bot contesta
  `/proximos` y `/evento` y nada más.
- Las cuentas del público ya no tienen interruptor (ver abajo): «Lo que sigo» solo mira el suyo.

### Estado recomendado

Ninguno se prende directo en producción: **primero en un preview** (con «🧪 Entrar como admin de
prueba», [demo.md](demo.md)), se revisa, y después en producción. Antes de prender uno en
producción, fijate en su guía que estén aplicadas sus migraciones y hechos sus pasos previos (la
columna «Antes de prenderlo»).

## Interruptores que quedaron fijos

Interruptores que quedaron **prendidos para siempre** y salieron de la lista. Sus variables ya
no hacen nada y una fila vieja en `feature_flags` se ignora (no hace falta borrarla). No se
pueden apagar: el camino «apagado» ya no existe en el código.

- «Contenido solo en la base» (paso 2, decisión de gorrite): `contenido_db`, `etiquetas_db` y
  `series` (variables `CONTENIDO_DB_ENABLED`, `ETIQUETAS_DB_ENABLED`, `SERIES_ENABLED`).
- «Interruptores permanentes»: `cuentas`, `perfiles_publicos`, `personas_eventos`, `propinas` y
  `borrar_desde_panel` (variables `CUENTAS_ENABLED`, `PERFILES_PUBLICOS_ENABLED`,
  `PERSONAS_EVENTOS_ENABLED`, `PROPINAS_ENABLED`, `BORRAR_DESDE_PANEL_ENABLED`). Con la variable
  en `0` ya **no** se cortan: si hace falta frenar una de estas partes, es con un PR.

| Era                                          | Qué quedó                                                                                                                                                                           | Guía                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `contenido_db` (Contenido en la base)        | los eventos y el material se leen y se guardan **solo** en la base; un `.md` de evento o material que la base no tiene no se muestra; «Descargar todo» arma los `.md` desde la base | [contenido.md](contenido.md)               |
| `etiquetas_db` (Etiquetas en la base)        | el árbol sale de la base (el archivo es solo respaldo si la base no tiene etiquetas) y el editor guarda solo en la base (sin commits al archivo)                                    | [etiquetas.md](etiquetas.md)               |
| `series` (Series de eventos)                 | «Edición N de…», páginas de serie, «Avisame si se repite», calendarios `.ics` y Eventos → Series, siempre                                                                           | [etiquetas.md](etiquetas.md)               |
| `cuentas` (Cuentas del público)              | «Entrar» y «Mi rincón» (código por mail o contraseña, compras de cada mail) siempre; el link del encabezado y del pie siempre                                                       | [cuentas.md](cuentas.md)                   |
| `perfiles_publicos` (Perfiles públicos)      | con base, `/amigues` lee los perfiles de la base (las fichas `.md` que la base no tiene se siguen mostrando desde su archivo), «Es mi perfil», mapas y la privacidad de los lugares | [amigues.md](amigues.md)                   |
| `personas_eventos` (Personas en eventos)     | roles entre eventos o material y perfiles, y preguntas extra al comprar o inscribirse (Eventos → Roles y preguntas, pestaña Preguntas), siempre                                     | [personas-eventos.md](personas-eventos.md) |
| `propinas` (Propinas)                        | el bloque de propina al pie de las publicaciones de KinkyVibe y «Dejá una propina» en el pie de página, siempre (ya no hay nota del cafecito); `/propinas`                          | [propinas.md](propinas.md)                 |
| `borrar_desde_panel` (Borrar desde el panel) | el botón «Borrar» en eventos, material y amigues, con «Deshacer» y «Recuperar», siempre                                                                                             | `src/lib/server/admin/deletions.js`        |

Una base local nueva se llena con la semilla de contenido (`npm run db:semilla`, que
`npm run dev` ya corre solo): eventos, material, fichas de amigues y, si la base no tiene ninguna,
etiquetas y wiki ([contenido.md](contenido.md)). Los importadores del panel ya no existen
([0032](decisiones/0032-borrar-los-md.md)).

## Cómo prender `lo_que_sigo`

Lo que sigo (decisión [0025](decisiones/0025-lo-que-sigo.md)): los pasos están en
[lo-que-sigo.md](lo-que-sigo.md#cómo-prenderlo). Antes y después de prenderlo, el estado (los
interruptores, los números y los avisos que salieron) se mira en Mensajes › Lo que sigo
(`/admin/mensajes/lo-que-sigo`), que se ve también con el interruptor apagado.
