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

| Archivo                                | Para qué                                                            |
| -------------------------------------- | ------------------------------------------------------------------- |
| `src/routes/api/telegram/+server.js`   | La ruta del webhook: junta secreto, interruptor y eventos           |
| `src/lib/server/telegram/webhook.js`   | Verifica el secreto, lee el update y contesta (probable sin Svelte) |
| `src/lib/server/telegram/router.js`    | Interpreta el comando o el botón y elige la respuesta               |
| `src/lib/server/telegram/keyboards.js` | Los botones (`callback_data` corto y validado)                      |
| `src/lib/server/telegram/format.js`    | Los textos (HTML de Telegram), funciones puras                      |
| `src/lib/server/telegram/events.js`    | De dónde salen los eventos (el único lugar para cambiar)            |
| `src/lib/server/flags.js`              | El interruptor `telegram_bot` (`TELEGRAM_BOT_ENABLED`)              |

El webhook **contesta en el mismo pedido** (Telegram acepta un método de la API como respuesta),
así que no hace falta guardar el token del bot en el sitio ni llamar a la API de Telegram.

## Puesta en marcha (la hace gorrite)

1. Crear el bot con @BotFather (un bot propio de la comunidad, no el de avisos personales).
2. Elegir un secreto largo (16 caracteres o más) y cargarlo como secret `TELEGRAM_WEBHOOK_SECRET`
   en Cloudflare (nunca en el repo).
3. Apuntar el webhook del bot a `https://kinkyvibe.ar/api/telegram` con `setWebhook`, pasando ese
   mismo valor como `secret_token`. El token del bot se usa solo en ese paso, desde tu compu.
4. Prender el interruptor **Bot de Telegram** en Ajustes → Interruptores.

Apagado, el endpoint contesta 200 sin hacer nada (con un error, Telegram acumularía reintentos).

## Cómo probarlo

```bash
npx vitest run src/lib/server/telegram
```

Los tests usan eventos y chats inventados. Para probar a mano, un POST al endpoint con el header
`x-telegram-bot-api-secret-token` y un update de ejemplo (`{"message":{"chat":{"id":1},"text":"/proximos"}}`,
o un botón tocado: `{"callback_query":{"id":"1","data":"ls","message":{"message_id":1,"chat":{"id":1}}}}`).

## Qué sigue

- ~~Cambiar `events.js` a `sitePosts` cuando `contenido_db` esté en `main`.~~ Hecho: el bot lee
  por la capa compartida (tests con el interruptor apagado y prendido en
  `src/lib/server/telegram/events-source.test.js`).
- Fase 2: vincular un chat con una cuenta y sumar Telegram a "Lo que sigo" (0025). Trae una
  migración.
- Fase 3: avisos y estado para organizadores (0029).
