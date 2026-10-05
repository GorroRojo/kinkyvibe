# Bot de Telegram

Decisión: [0029](decisiones/0029-bot-de-telegram.md). Es otra **vista** del sitio, no un reemplazo:
el sitio sigue siendo lo que encuentra la gente, el CMS y el lugar donde se paga. El bot lee los
mismos datos y manda un link para todo lo demás.

## Qué hace (fase 1, solo lectura)

- `/start`, `/ayuda`: qué podés pedirle.
- `/proximos`: los próximos eventos públicos, con link al sitio y un botón «Ver: …» por evento.
- `/evento`: los próximos eventos como botones, para elegir sin saberse el nombre.
- `/evento <texto>`: el detalle de un evento (título, fecha y link). Busca sin importar tildes ni
  mayúsculas, con pedazos de palabra («cuer» encuentra «cuerdas»), por la dirección exacta o por
  la fecha («sábado», «sab», «octubre», «15/10»). Si hay varios que coinciden, un botón por cada
  uno.

### Los botones

Son teclados "inline" de Telegram (`src/lib/server/telegram/keyboards.js`):

- Cada botón de un evento lleva `ev:<dirección>` en `callback_data` (o `ev:#<hash corto>` si la
  dirección no entra en los 64 bytes que admite Telegram o tiene caracteres raros).
- Al tocarlo, el pedido llega al mismo webhook (con el mismo secreto) y el evento se busca **entre
  los próximos públicos**, igual que `/proximos`. Si ya no está (pasó, se ocultó o se despublicó),
  contesta «Ese evento ya no está disponible.» y no cambia el mensaje.
- Si está, **cambia el mensaje por el detalle** (`editMessageText`), con «Abrir en el sitio» y
  «« Próximos eventos» para volver a la lista.
- Telegram acepta **un solo método** como respuesta del webhook. Por eso, al mostrar el detalle no
  se contesta el botón con `answerCallbackQuery`: el "cargando" del botón se va solo a los pocos
  segundos. Cuando no hay detalle para mostrar (evento que ya no está, error), se contesta el
  botón con el aviso en lugar de cambiar el mensaje.

No muestra lugares, precios, entradas ni datos de compradores. Todo lo que implique plata o
cuentas es un link al sitio.

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
- `/desvincular`: desconecta el chat. También se puede desde la tarjeta («Desconectar Telegram»).

### Los avisos

En Lo que sigo, la grilla de avisos tiene la columna **Telegram** (`notifyChannels` en
`src/lib/utils/sigo.js`):

- sin el bot: «Próximamente», como antes;
- con el bot y sin chat vinculado: apagada, «Sin conectar», con una nota que manda a la tarjeta;
- con el chat vinculado: «Algo nuevo» y «Recordatorio» por Telegram, por cada cosa seguida
  (columnas `tg_new` y `tg_reminder` de `follows`, apagadas por defecto).

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
- **Sin datos de compradores ni de lugares con dirección privada** (0005, 0007, 0029).
- El secreto del webhook se chequea **antes** que el interruptor y en tiempo constante.
- Todo texto del bot, en español rioplatense con el lenguaje inclusivo del sitio.

## Cómo está armado

| Archivo                                       | Para qué                                                            |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `src/routes/api/telegram/+server.js`          | La ruta del webhook: junta secreto, interruptor y eventos           |
| `src/lib/server/telegram/webhook.js`          | Verifica el secreto, lee el update y contesta (probable sin Svelte) |
| `src/lib/server/telegram/router.js`           | Interpreta el comando o el botón y elige la respuesta               |
| `src/lib/server/telegram/keyboards.js`        | Los botones (`callback_data` corto y validado)                      |
| `src/lib/server/telegram/format.js`           | Los textos (HTML de Telegram), funciones puras                      |
| `src/lib/server/telegram/events.js`           | De dónde salen los eventos (el único lugar para cambiar)            |
| `src/lib/server/flags.js`                     | El interruptor `telegram_bot` (`TELEGRAM_BOT_ENABLED`)              |
| `src/lib/server/telegram/link.js`             | Fase 2: códigos de un solo uso y chats vinculados                   |
| `src/lib/server/telegram/send.js`             | Fase 2: mandar un mensaje desde el cron (`TELEGRAM_BOT_TOKEN`)      |
| `src/lib/server/telegram/quiet.js`            | Fase 2: el horario de silencio (23 a 9, hora de Argentina)          |
| `src/lib/server/telegram/web.js`              | Fase 2: los dos interruptores y lo que necesita Mi rincón           |
| `src/lib/components/sigo/TelegramCard.svelte` | Fase 2: la tarjeta «Telegram» de Lo que sigo                        |
| `src/routes/(content)/mi-rincon/telegram/`    | Fase 2: las acciones de la tarjeta (`?/codigo`, `?/desconectar`)    |

El webhook **contesta en el mismo pedido** (Telegram acepta un método de la API como respuesta),
así que no necesita el token del bot. El token solo lo usa el cron de la fase 2 para mandar los
avisos (`send.js`); es el único lugar que llama a la API de Telegram.

## Puesta en marcha (la hace gorrite)

1. Crear el bot con @BotFather (un bot propio de la comunidad, no el de avisos personales).
2. Elegir un secreto largo (16 caracteres o más) y cargarlo como secret `TELEGRAM_WEBHOOK_SECRET`
   en Cloudflare (nunca en el repo).
3. Apuntar el webhook del bot a `https://kinkyvibe.ar/api/telegram` con `setWebhook`, pasando ese
   mismo valor como `secret_token`. El token del bot se usa solo en ese paso, desde tu compu.
4. Prender el interruptor **Bot de Telegram** en Ajustes → Interruptores.

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
npx vitest run src/lib/server/telegram src/lib/server/sigo src/lib/utils/sigo-telegram.test.js "src/routes/(content)/mi-rincon/telegram"
```

Los tests usan eventos y chats inventados. Para probar a mano, un POST al endpoint con el header
`x-telegram-bot-api-secret-token` y un update de ejemplo (`{"message":{"chat":{"id":1},"text":"/proximos"}}`,
o un botón tocado: `{"callback_query":{"id":"1","data":"ls","message":{"message_id":1,"chat":{"id":1}}}}`).

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

## Qué sigue

- ~~Cambiar `events.js` a `sitePosts` cuando `contenido_db` esté en `main`.~~ Hecho: el bot lee
  por la capa compartida (tests con el interruptor apagado y prendido en
  `src/lib/server/telegram/events-source.test.js`).
- ~~Fase 2: vincular un chat con una cuenta y sumar Telegram a "Lo que sigo" (0025).~~ Hecha
  (arriba), con la migración 0033.
- Fase 3: avisos y estado para organizadores (0029).
