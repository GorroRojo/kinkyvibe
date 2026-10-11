# Bot de Telegram

Decisión: [0029](decisiones/0029-bot-de-telegram.md). Es otra **vista** del sitio, no un reemplazo:
el sitio sigue siendo lo que encuentra la gente, el CMS y el lugar donde se paga. El bot lee los
mismos datos y manda un link para todo lo demás.

## Qué hace: navegación por pantallas

Decisiones [0029](decisiones/0029-bot-de-telegram.md) y [0034](decisiones/0034-bot-seguir-y-token.md).

- **`/start` (o `/inicio`) es el inicio**: un mensaje con botones `Hoy · Semana · Finde` /
  `🔎 Buscar · ⭐ Lo que sigo` / `💗 Fondo · ❓ Ayuda` / `📅 Calendario` (la Mini App, solo en
  privado) · `Abrir kinkyvibe.ar ↗`. «Lo que sigo» solo aparece con ese interruptor prendido. Para
  les admins con el Telegram vinculado, suma «🚪 Puerta» (abajo, «La puerta por Telegram»).
  `/inicio` es lo mismo que `/start` sin nada, por el mismo camino del router (`/start <código>` y
  `/start adm_<código>` siguen vinculando; `/inicio <algo>` no vincula nada).
- **Cada botón cambia ese mismo mensaje** (no manda otro). Las listas van de a 5 con
  «‹ 2/3 ›» (el del medio es un botón deshabilitado, Bot API 10.3) e «🏠 Inicio»; la tarjeta de un
  evento, «‹ 2/7 ›» entre los eventos de la lista, «‹ Volver» (a la página de la lista que lo
  tiene) e «🏠 Inicio».
- **Los comandos son atajos a las mismas pantallas** (no hay dos lógicas): `/inicio`, `/hoy`,
  `/semana`, `/finde`, `/proximos`, `/evento [texto]`, `/buscar`, `/fondo`, `/ayuda`, `/sigo`. `/hoy`,
  `/semana` y `/finde` siguen siendo hoy, los próximos 7 días y el finde (viernes a domingo), en
  hora de Argentina (`windows.js`).
- **La tarjeta de un evento**: foto (la imagen destacada, como URL absoluta) o, sin token o en
  grupos, vista previa grande del link del evento; el título; la fecha con la entidad `date_time`
  (Bot API 9.5: Telegram la muestra en el idioma y la hora de quien lee; adentro va el texto en
  castellano para las apps viejas); el lugar **solo como lo muestra la página pública del evento**
  (`feedVenues` + `eventPlace`: un lugar oculto dice «Lugar a confirmar», nunca la dirección) y
  los botones:
  - «🎟 Comprar en el sitio» (verde, Bot API 9.4) a `/calendario/<evento>/entradas`, o el estado de
    la venta deshabilitado («Agotadas», «Abre el 5/10»), igual que las tarjetas del calendario;
    sin entradas acá, «Abrir en el sitio»;
  - «📅 Agregar al calendario» (link de Google Calendar con título, fecha, link y el lugar público;
    sin fin cargado, 2 horas);
  - «🗺 Cómo llegar», solo si la página muestra el mapa (`googleMapsLink` del lugar o el
    `location_map` del evento);
  - «⭐ Seguir» (abajo).
- **Buscar**: un mensaje nuevo que abre «responder» (`force_reply` en el teclado, Bot API 10.3)
  con «Cancelar». La respuesta trae los eventos que coinciden (el mismo buscador que
  `/evento <texto>`: título, dirección o fecha). En grupos no abre nada: explica `/evento cuerdas`.
- **`/fondo`**: cuánto juntó el Fondo este mes, la meta y el descuento de este mes en las
  entradas. Solo lectura, con la memoria de `tickets/fondoMonth.js` (10 minutos, último valor
  guardado) y solo los campos de `/api/porcentaje` (issue #265); nada de quiénes aportan ni de
  propinas.
- Nada de estado en la base: el botón lleva todo. Un botón viejo (también los `ev:`/`ls` de antes)
  sigue andando; si el evento ya no está entre los próximos públicos, contesta «Ese evento ya no
  está disponible.» y no cambia el mensaje.

### El `callback_data` de cada botón (`nav.js`, hasta 64 bytes)

| Pantalla                                                             | `callback_data`                 |
| -------------------------------------------------------------------- | ------------------------------- |
| Inicio                                                               | `h`                             |
| Lista (`d` hoy, `w` semana, `f` finde, `p` próximos; página desde 0) | `l:<v>:<p>`                     |
| Tarjeta (`v`: a qué lista vuelve; `n`: al inicio)                    | `e:<id>:<v>`                    |
| Buscar / Cancelar                                                    | `s` / `sx`                      |
| Lo que sigo / Fondo / Ayuda                                          | `g` / `fo` / `a`                |
| Seguir: opciones / seguir una                                        | `f:<id>` / `fy:<id>:<etiqueta>` |
| Contador (no hace nada)                                              | `x`                             |

`id` es la dirección del evento si es simple y tiene hasta 40 bytes; si no, `#<hash>`.
`<etiqueta>` es un hash corto del nombre, que se busca entre las etiquetas de ese evento.

**Deep links** (`t.me/<bot>?start=…`, solo `A-Za-z0-9_-`): `hoy`, `semana`, `finde`, `proximos`,
`ev-<id>` (la tarjeta), `seguir-<id>`, `sigo`, `fondo`, `buscar`, `inicio`. El código de vincular
(8 letras y números) sigue entrando por `?start=<código>`.

### Con token y sin token

- **Con `TELEGRAM_BOT_TOKEN`** (0034): el webhook contesta 200 enseguida y llama a la API en
  `waitUntil` (`run.js`, siempre por `callTelegramApi`, que nunca muestra el token). Así el botón
  deja de «cargar» apenas cambia la pantalla, las tarjetas pueden ir con foto (texto → foto con
  `editMessageMedia`; de foto a texto se borra y se manda de nuevo) y se sabe si algo falló:
  - 429 (demasiado rápido): el botón contesta «Más despacio 🙂» y no se reintenta;
  - «message is not modified»: se ignora;
  - si una edición falla (mensaje borrado, muy viejo, foto que Telegram no pudo bajar), se manda
    la pantalla de nuevo o la tarjeta sin foto, una sola vez.
- **Sin token**: como antes, un solo método en el mismo pedido; tarjetas con vista previa grande.

### Grupos y efímeros

En un grupo el bot muestra **solo lo público** (lo mismo que el sitio sin sesión) y no necesita
ser admin (con el modo privacidad de fábrica solo ve los comandos y las respuestas a él).

- **Comandos efímeros** (Bot API 10.2): en los grupos los comandos se registran con
  `is_ephemeral` (alcance `all_group_chats`). Si alguien manda `/semana` así, la respuesta también
  es efímera (`ephemeral_message_parameters` + `reply_parameters.ephemeral_message_id`, dentro de
  los 15 segundos): **solo la ve quien preguntó**. Sus botones cambian solo su vista
  (`editEphemeralMessageText`).
- **Un comando común** (app vieja o escrito a mano): una sola respuesta pública. Tocar un botón de
  esa respuesta **no la edita para todes**: manda un efímero en su lugar solo para quien tocó
  (`replace_callback_query_message`, Bot API 10.3).
- **Si un efímero no se puede** (la app no los soporta, pasaron los 15 segundos): lo más privado
  posible, contestar el botón con el link al chat privado con el bot (con token; sin token no se
  puede saber que falló).
- En grupos no hay fotos (un efímero de foto no puede volver a texto), ni «Buscar» con
  `force_reply`, ni nada de cuentas: «Lo que sigo» y «Seguir» son links al chat privado.
- Telegram avisa que un efímero puede no llegar y desaparecer: por eso nada personal en
  efímeros, aunque los vea una sola persona.

### «Seguir» y «Lo que sigo» (0034)

La primera acción que escribe. Solo con «Lo que sigo» prendido y **por chat privado vinculado a
una cuenta** (mirado en cada mensaje):

- «⭐ Seguir» en una tarjeta muestra las etiquetas y series de ese evento que se pueden seguir
  (hasta 5, primero las series; las que ya sigue, deshabilitadas). Tocar una la sigue por el mismo
  camino que el botón del sitio (`resolveTag` + `follow` de `sigo/follows.js`), con sus topes y
  sus opciones por defecto (calendario y mail de lo nuevo), **más «Algo nuevo» por Telegram**
  ([0036](decisiones/0036-seguir-en-el-bot-prende-avisos.md)): el aviso del botón suma «Te aviso
  por acá cuando haya algo nuevo. Podés apagarlo en Mi rincón.». No los prende si el chat está en
  `/silenciar` ni si ya lo seguía (sus opciones quedan como estaban: la base no distingue «nunca
  lo tocó» de «lo apagó»). Seguir desde el sitio no los prende; dejar de seguir no apaga nada más.
  El resto de los avisos y dejar de seguir, en Mi rincón → Lo que sigo.
- `/sigo` y «⭐ Lo que sigo»: los nombres de lo que sigue la cuenta.
- Sin chat vinculado: explica cómo conectarlo. En un grupo: link al privado
  (`?start=seguir-<id>` o `?start=sigo`), sin mirar ninguna cuenta.
- Como en el sitio, no va al registro de actividad del panel (lo que sigue cada cuenta es
  privado); queda una línea en el log sin cuenta ni etiqueta.

### La Mini App del calendario (`/telegram/app`)

El calendario del sitio en formato compacto para abrir adentro de Telegram, **sin login**: los
próximos eventos públicos por día, con el lugar público y el estado de la venta (las mismas
funciones que `/calendario`).

- Carga `telegram-web-app.js` como dicen las docs y usa los colores del tema de Telegram
  (`--tg-theme-*`, con los del modo claro de respaldo). En un navegador común también anda.
- «📲 Agregar a la pantalla de inicio» (`addToHomeScreen`, Bot API 8.0) solo si Telegram dice que
  se puede y todavía no está.
- Los links (el evento, comprar) se abren en el navegador, afuera de Telegram (`openLink`): pagar
  sigue en el sitio, con Mercado Pago.
- Se abre con el botón «📅 Calendario» del inicio (solo en privado: `web_app` no anda en grupos).
  El botón de menú del bot sigue siendo la lista de comandos.

## El menú de comandos (autocompletado)

Cuando alguien escribe «/», Telegram sugiere los comandos que se le registraron con
`setMyCommands`. La lista vive en **un solo lugar**, `src/lib/server/telegram/commands.js`: de ahí
salen lo que entiende el router y lo que se registra (un test, `commands.test.js`, chequea que
coincidan).

- **Para todes** (alcance `default`): `/inicio` (primero), `/proximos`, `/hoy`, `/semana`,
  `/finde`, `/evento`, `/buscar`, `/fondo`, `/ayuda`.
- **En grupos** (alcance `all_group_chats`): los mismos, **efímeros** (`is_ephemeral`).
- **En chats privados** (alcance `all_private_chats`): esos y, solo con «Lo que sigo» prendido,
  `/vincular`, `/sigo`, `/silenciar`, `/reanudar`, `/desvincular`.
- `/start` y `/help` funcionan pero no van en el menú: en su lugar están `/inicio` (lo mismo que
  `/start` sin nada) y `/ayuda`. Sin `language_code`.

**Se registran solos**: el cron de cada 15 minutos (`/api/cron/recordatorios`,
`commandsSync.js`) arma las listas, les saca un hash y lo compara con el último registrado
(`ticket_settings`, clave `telegram_commands_sync`). Si cambió (otra lista en el código, o se
prendió o apagó «Lo que sigo») y está el token, manda los tres `setMyCommands`, guarda el hash y
lo anota en el registro de actividad (`telegram.commands`, «automático»). Si Telegram falla, lo
loguea sin el token y no guarda el hash: se reintenta en la próxima corrida. Sin token, no hace
nada. **Ya no hace falta tocar el botón después de cada deploy.**

El botón **Actualizar comandos del bot** (Ajustes → Automatizaciones → tarjeta **Bot de
Telegram**, solo admins) queda para registrarlos ya: hace lo mismo, lo anota con quién fue y
guarda el mismo hash. La tarjeta muestra «Último registro: <fecha> (automático/manual)». No hace
falta `/setcommands` en @BotFather (se pisa).

**Después de mergear un cambio en la lista** (por ejemplo, cuando se sumó `/inicio`): gorrite
toca **Actualizar comandos del bot** para que Telegram la muestre ya (si no, la registra el cron
en los 15 minutos siguientes). En la app de Telegram puede hacer falta cerrar y abrir el chat.

## Fase 2: vincular la cuenta y avisos de «Lo que sigo»

Detrás de **dos** interruptores: `telegram_bot` y `lo_que_sigo` (las cuentas ya no tienen
interruptor). Con cualquiera apagado no se ve nada de Telegram en Mi rincón, el bot contesta «Todavía no se puede conectar una
cuenta con el bot» y el cron no manda nada por Telegram. Trae la migración
`0033_telegram_avisos.sql`.

### Vincular

1. En **Mi rincón → Lo que sigo**, la tarjeta **Telegram** tiene «Conectar Telegram». Da un código
   de 8 caracteres (`ABCD-2345`), al azar, **de un solo uso**, que **vence en 15 minutos**. Se
   guarda solo su hash (SHA-256); pedir otro anula el anterior.
2. La persona le manda al bot, **por chat privado**, `/vincular ABCD-2345`. Si está cargada la
   variable `TELEGRAM_BOT_USERNAME`, la tarjeta tiene además «Abrir el bot en Telegram»
   (`t.me/<bot>?start=<código>`), que manda el código solo (llega como `/start <código>`).
3. El chat queda vinculado a la cuenta. Un chat es de una sola cuenta y una cuenta tiene un solo
   chat: vincular de nuevo reemplaza el anterior.

En grupos el bot **no** vincula ni toca nada de cuentas (contesta que se hace por chat privado).
Los intentos de `/vincular` se topean por chat (10 por hora) y pedir códigos, por cuenta (10 por
hora). No se guarda nada del perfil de Telegram, solo el id del chat. Borrar la cuenta borra el
chat vinculado y sus códigos.

### Comandos de la cuenta (solo por chat privado)

- `/vincular <código>`: conecta este chat.
- `/silenciar`: pausa **todos** los avisos por Telegram (lo elegido en Lo que sigo queda) hasta
  `/reanudar`.
- `/reanudar`: vuelve a mandarlos.
- `/sigo`: lo que sigue la cuenta (y «⭐ Seguir» en las tarjetas, arriba).
- `/desvincular`: desconecta el chat. También se puede desde la tarjeta («Desconectar Telegram»).

### Los avisos

En Lo que sigo, la grilla de avisos tiene la columna **Telegram** (`notifyChannels` en
`src/lib/utils/sigo.js`):

- sin el bot: «Próximamente», como antes;
- con el bot y sin chat vinculado: apagada, «Sin conectar», con una nota que manda a la tarjeta;
- con el chat vinculado: «Algo nuevo» y «Recordatorio» por Telegram, por cada cosa seguida
  (columnas `tg_new` y `tg_reminder` de `follows`, apagadas por defecto; seguir desde el bot
  prende «Algo nuevo», 0036).

Los manda el mismo cron que los mails de Lo que sigo (`src/lib/server/sigo/notify.js`, cada 15
minutos), con estas reglas:

- **Uno por cuenta, evento, tipo y canal**: `follow_notifications` tiene ahora la columna
  `channel` (`mail` o `telegram`) en la clave. La fila se toma antes de mandar; si Telegram falla,
  se suelta y se reintenta en la próxima corrida.
- **Horario de silencio**: entre las 23 y las 9, hora de Argentina, no sale nada por Telegram ni
  se toma ninguna fila. Lo pendiente sale en la primera corrida desde las 9 (el recordatorio sale
  igual si el evento todavía no empezó). Los mails no esperan.
- **Algo nuevo** solo de eventos que el cron vio **después** de vincular el chat (así conectar
  Telegram no manda una tanda de todo lo ya anunciado).
- El mensaje lleva **solo título, fecha y link**: nada del lugar ni de qué más sigue la cuenta.
- Si Telegram dice que el chat ya no recibe (bloqueó al bot o borró el chat), se desvincula.
- Hasta 50 por corrida, aparte de los mails.
- Para mandar hace falta el token del bot (`TELEGRAM_BOT_TOKEN`). **Sin el token, los avisos por
  Telegram se saltean** con una línea en el log (`falta TELEGRAM_BOT_TOKEN`); el resto sigue.

## Lo que nunca se tiene que romper

- **Sin reglas propias de visibilidad.** El bot solo muestra lo que le da
  `src/lib/server/telegram/events.js`, que es el único lugar que sabe cómo se leen los eventos
  (con `sitePosts` de `src/lib/server/contenido/posts.js`: de la base o de los `.md`, según
  `contenido_db`). No armar consultas propias ni leer los `.md` o la base desde otro lado.
- **Nada oculto, no listado ni ya empezado.**
- **Sin datos de compradores ni de lugares con dirección privada** (0005, 0007, 0029): el lugar de
  una tarjeta sale de las mismas funciones que la página pública del evento.
- **Nada personal en grupos** (tampoco en efímeros) ni sin chat vinculado; «Seguir» es lo único
  que escribe (0034).
- El secreto del webhook se chequea **antes** que el interruptor y en tiempo constante.
- Todo texto del bot, en español rioplatense con el lenguaje inclusivo del sitio.

## Cómo está armado

| Archivo                                       | Para qué                                                            |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `src/routes/api/telegram/+server.js`          | La ruta del webhook: junta secreto, interruptor y eventos           |
| `src/lib/server/telegram/webhook.js`          | Verifica el secreto, lee el update y contesta (probable sin Svelte) |
| `src/lib/server/telegram/router.js`           | Interpreta el comando o el botón y elige la respuesta               |
| `src/lib/server/telegram/nav.js`              | El `callback_data` de las pantallas y los deep links                |
| `src/lib/server/telegram/screens.js`          | Las pantallas (texto y botones), funciones puras                    |
| `src/lib/server/telegram/navigate.js`         | Qué pantalla va para cada botón                                     |
| `src/lib/server/telegram/deliver.js`          | Cómo se manda: editar, foto, efímero en grupos                      |
| `src/lib/server/telegram/run.js`              | Con token: llama a la API (429, «not modified», fallback)           |
| `src/lib/server/telegram/seguir.js`           | «Seguir» y «Lo que sigo» desde el bot (0034)                        |
| `src/lib/server/telegram/miniapp.js`          | La Mini App del calendario (`/telegram/app`)                        |
| `src/lib/server/telegram/commandsSync.js`     | El registro automático del menú «/» (cron)                          |
| `src/lib/server/telegram/commands.js`         | La lista de comandos y el `setMyCommands` del menú «/»              |
| `src/lib/server/telegram/keyboards.js`        | Los botones de antes (`ev:`/`ls`), que siguen andando               |
| `src/lib/server/telegram/format.js`           | Los textos (HTML de Telegram), funciones puras                      |
| `src/lib/server/telegram/events.js`           | De dónde salen los eventos (el único lugar para cambiar)            |
| `src/lib/server/flags.js`                     | El interruptor `telegram_bot` (`TELEGRAM_BOT_ENABLED`)              |
| `src/lib/server/telegram/link.js`             | Fase 2: códigos de un solo uso y chats vinculados                   |
| `src/lib/server/telegram/send.js`             | Llamar a la API (`TELEGRAM_BOT_TOKEN`): avisos del cron y comandos  |
| `src/lib/server/telegram/quiet.js`            | Fase 2: el horario de silencio (23 a 9, hora de Argentina)          |
| `src/lib/server/telegram/web.js`              | Fase 2: los dos interruptores y lo que necesita Mi rincón           |
| `src/lib/components/sigo/TelegramCard.svelte` | Fase 2: la tarjeta «Telegram» de Lo que sigo                        |
| `src/routes/(content)/mi-rincon/telegram/`    | Fase 2: las acciones de la tarjeta (`?/codigo`, `?/desconectar`)    |

Sin token, el webhook **contesta en el mismo pedido** (un método de la API como respuesta). Con el
token (0034), llama a la API en `waitUntil`. El token también lo usan el cron (avisos y comandos)
y el botón «Actualizar comandos del bot»; todo pasa por `send.js` (`callTelegramApi`), el único
lugar que llama a la API de Telegram. Nunca se loguea ni se devuelve la URL (lleva el token) y los
errores se muestran sin él.

## Puesta en marcha (la hace gorrite)

1. Crear el bot con @BotFather (un bot propio de la comunidad, no el de avisos personales).
2. Elegir un secreto largo (16 caracteres o más) y cargarlo como secret `TELEGRAM_WEBHOOK_SECRET`
   en Cloudflare (nunca en el repo).
3. Apuntar el webhook del bot a `https://kinkyvibe.ar/api/telegram` con `setWebhook`, pasando ese
   mismo valor como `secret_token`. El token del bot se usa solo en ese paso, desde tu compu.
4. Prender el interruptor **Bot de Telegram** en Ajustes → Interruptores.
5. Con el token cargado (fase 2, abajo), los comandos se registran solos en la próxima corrida
   del cron (o ya, con **Actualizar comandos del bot** en Ajustes → Automatizaciones).
6. Mini App (opcional): en @BotFather → el bot → **Bot Settings → Configure Mini App** (o «Main
   Mini App»), la URL `https://kinkyvibe.ar/telegram/app`. El botón «📅 Calendario» del inicio
   anda igual sin eso (abre la misma URL); registrarla suma el botón «Abrir» en el perfil del bot.
   **No** cambiar el botón de menú: queda la lista de comandos. No hace falta el modo inline.

Apagado, el endpoint contesta 200 sin hacer nada (con un error, Telegram acumularía reintentos).

### Fase 2 (la hace gorrite)

1. **Aplicar la migración `0033_telegram_avisos.sql` en producción y en preview antes de mergear**
   (0028): `npx wrangler d1 migrations apply <base> --remote` (el nombre de la base, de
   `npx wrangler d1 list`). Anda con el código de `main`.
2. Cargar el token del bot (el que da @BotFather) como **secret `TELEGRAM_BOT_TOKEN`** en
   Cloudflare (Worker kinkyvibe → Settings → Variables and Secrets, Production; también Previews
   Base si querés probar ahí). **Nunca en el repo.**
3. Opcional: la variable `TELEGRAM_BOT_USERNAME` (el usuario del bot, sin `@`; no es un secreto)
   para el botón «Abrir el bot en Telegram».
4. Con **Bot de Telegram**, **Lo que sigo** y **Cuentas del público** prendidos, aparece la
   tarjeta en Mi rincón → Lo que sigo. Sin el token, la vinculación anda pero los avisos por
   Telegram no salen (queda la línea en el log).

## Cómo probarlo

```bash
npx vitest run src/lib/server/telegram src/lib/server/sigo src/lib/components/admin/telegram "src/routes/(authed)/admin/ajustes/automatizaciones" src/lib/utils/sigo-telegram.test.js "src/routes/(content)/mi-rincon/telegram"
```

Los tests usan eventos y chats inventados. Para probar a mano, un POST al endpoint con el header
`x-telegram-bot-api-secret-token` y un update de ejemplo (`{"message":{"chat":{"id":1},"text":"/proximos"}}`,
o un botón tocado: `{"callback_query":{"id":"1","data":"l:w:0","message":{"message_id":1,"chat":{"id":1}}}}`).
Sin `TELEGRAM_BOT_TOKEN` la respuesta del POST es el método que se mandaría; con el token cargado,
no probarlo a mano contra producción (llamaría a la API de verdad).

## Decisiones (confirmadas por gorrite, 5/10)

Propuestas por Claude; **confirmado por gorrite (5/10)**: todo tal como está escrito.

- Código de 8 caracteres sin 0/O ni 1/I, 15 minutos, uno vivo por cuenta; topes de 10 intentos de
  `/vincular` por chat y 10 códigos por cuenta, por hora.
- Un chat por cuenta y una cuenta por chat: vincular de nuevo reemplaza sin preguntar.
- La tarjeta va en Lo que sigo, abajo de lo seguido; sus acciones viven en `/mi-rincon/telegram`
  (que sin JavaScript muestra la misma tarjeta), para no tocar las acciones de Lo que sigo.
- «Algo nuevo» por Telegram solo de lo visto después de vincular el chat.
- En horario de silencio no se encola nada: el cron simplemente no manda por Telegram y lo
  pendiente sale a las 9 (lo que se debe se calcula de nuevo en cada corrida).
- Si Telegram contesta 403 (bloqueó al bot), el chat se desvincula.
- Al vincular y desvincular, las casillas de Telegram elegidas en cada cosa seguida se guardan
  (desconectado no mandan nada; al reconectar vuelven).
- `/start <código>` también vincula (para el link `t.me/<bot>?start=<código>`).

## La puerta por Telegram (0037)

Les admins marcan ingresos desde Telegram, con el escáner de QR del celular. Es la segunda acción
del bot que escribe (decisión [0037](decisiones/0037-puerta-por-telegram.md)) y sale detrás del
interruptor **Puerta por Telegram** (`telegram_puerta`, `TELEGRAM_PUERTA_ENABLED`), apagado
(0001). Pide además el bot prendido (`telegram_bot`). Con cualquiera de los dos apagado:
`/telegram/puerta` y su API dan 404, el panel no deja vincular y `/start adm_<código>` contesta
que ahora no se puede.

- `/telegram/puerta` (opcional `?evento=<dirección>`): abre adentro de Telegram, se escribe la
  dirección del evento, escanea con el escáner nativo (`showScanQrPopup`) y manda cada código a
  `/telegram/puerta/api`. Fuera de Telegram no hace nada.
- **Cómo se abre**: con el botón «🚪 Abrir la puerta» que manda el bot cuando confirma el vínculo,
  o con «🚪 Puerta» en el inicio (`/start`, `/inicio`, «🏠 Inicio»). Los dos son el mismo botón
  `web_app` a `/telegram/puerta`, solo en chat privado (`web_app` no anda en grupos).
- **«🚪 Puerta» en el inicio** solo si quien escribe es une admin vinculade (`telegram_admin_links`)
  que **sigue** en `ADMINS`, con `telegram_puerta` y el bot prendidos. Se mira solo al mostrar el
  inicio por chat privado: una consulta por id del usuario de Telegram (`botDoor` de `puerta.js`,
  la misma que usa la Mini App). Si falla, el inicio sale sin el botón. Les demás ven el inicio de
  siempre.
- En **cada pedido** el servidor (`puerta.js`): valida el `initData` (`initData.js`: HMAC-SHA-256
  con la clave `HMAC-SHA-256("WebAppData", token)`, todos los campos menos `hash` ordenados y
  unidos con `\n`, comparación en tiempo constante, `auth_date` de menos de 1 hora y no del
  futuro, sin claves repetidas); busca a le admin vinculade a ese usuario de Telegram
  (`telegram_admin_links`); y exige que ese id de GitHub **siga siendo admin** (`isAdmin` de
  `auth.js`, con `ADMINS`): sacar a alguien de la lista le corta la puerta aunque el vínculo siga
  en la base. Si no: 403 (`not_linked` / `not_admin`).
- **Vincular** (les admins entran con GitHub y no tienen cuenta pública, así que no usa
  `telegram_chats` ni Mi rincón; `adminLink.js`, migración `0050`):
  1. En el panel, Ajustes → Admins → «Tu Telegram para la puerta» → **Vincular Telegram**: crea un
     código al azar (8 caracteres, 40 bits), de un solo uso, que vence en 15 minutos; se guarda
     solo su SHA-256 (`telegram_admin_link_codes`). Hay uno solo vivo por admin y un tope de 10
     por hora. Muestra el link `t.me/<bot>?start=adm_<código>` y su QR (necesita los
     interruptores `telegram_bot` y `telegram_puerta` y `TELEGRAM_BOT_USERNAME`).
  2. El bot recibe `/start adm_<código>` **solo por chat privado** (en un grupo contesta que se
     hace por privado). Marca el código usado en la misma sentencia que lo lee, vuelve a chequear
     `isAdmin` y guarda `id de GitHub ↔ id del usuario de Telegram` (una cuenta de Telegram por
     admin y viceversa: vincular de nuevo reemplaza). Confirma en el chat. Código inválido,
     vencido o ya usado: «Ese link no sirve…». Tope de 10 intentos por hora por usuario de
     Telegram. No depende de «Lo que sigo».
  3. **Desvincular** en el mismo lugar borra el vínculo y los códigos.
  4. Vincular y desvincular quedan en Actividad (`telegram.admin_link`, `telegram.admin_unlink`).
     «Seguir» desde el bot sigue sin registro.
- De Telegram solo se guarda el id del usuario (ni nombre ni usuario). La lista muestra quién
  tiene Telegram vinculado.
- Marca con lo mismo que el modo puerta del panel (`extractToken` + `checkIn`), con el login de le
  admin; contesta solo el resultado y el nombre de la entrada. Tope de 600 escaneos por hora.
- Solo Telegram Web puede embeberla (`frame-ancestors https://web.telegram.org`).

### Puesta en marcha de la puerta (la hace gorrite)

1. **Aplicar la migración `0050_telegram_admins_puerta.sql` en producción y en preview antes de
   mergear** (0028): `npx wrangler d1 migrations apply <base> --remote` (el nombre de la base, de
   `npx wrangler d1 list`). Solo crea dos tablas y un índice: anda con el código de `main`.
2. Tienen que estar el secret `TELEGRAM_BOT_TOKEN` (valida el `initData`) y la variable
   `TELEGRAM_BOT_USERNAME` (el link de «Vincular Telegram»), los mismos de la fase 2.
3. Prender **Puerta por Telegram** primero en un preview, con el bot prendido, y probar: vincular
   desde Ajustes → Admins, abrir la puerta con el botón del bot y escanear una entrada de prueba.
4. Después, en producción. Cada admin vincula su Telegram una vez.
5. Para cortarla de golpe: `TELEGRAM_PUERTA_ENABLED=0` en Cloudflare o apagar el interruptor.
   Sacar a alguien de `ADMINS` le corta la puerta aunque siga vinculade.

## Qué sigue

- ~~Cambiar `events.js` a `sitePosts` cuando `contenido_db` esté en `main`.~~ Hecho: el bot lee
  por la capa compartida (tests con el interruptor apagado y prendido en
  `src/lib/server/telegram/events-source.test.js`).
- ~~Fase 2: vincular un chat con una cuenta y sumar Telegram a "Lo que sigo" (0025).~~ Hecha
  (arriba), con la migración 0033.
- ~~Navegación por pantallas, efímeros, Seguir, Mini App del calendario.~~ Hecho (0034).
- ~~La puerta con el escáner de QR de Telegram.~~ Hecha (0037, arriba), detrás de
  `telegram_puerta`.
- Puerta por Telegram: elegir el evento de una lista (los de hoy) en lugar de escribir la
  dirección. (~~Un botón para abrirla sin volver a vincular~~: «🚪 Puerta» en el inicio.)
- Fase 3: avisos y estado para organizadores (0029).
