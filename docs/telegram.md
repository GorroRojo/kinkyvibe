# Bot de Telegram

Decisión: [0029](decisiones/0029-bot-de-telegram.md). Es otra **vista** del sitio, no un reemplazo:
el sitio sigue siendo lo que encuentra la gente, el CMS y el lugar donde se paga. El bot lee los
mismos datos y manda un link para todo lo demás.

## Qué hace (fase 1, solo lectura)

- `/start`, `/ayuda`: qué podés pedirle.
- `/proximos`: los próximos eventos públicos, con link al sitio.
- `/evento <nombre o dirección>`: el detalle de un evento (título, fecha y link). Si hay varios
  que coinciden, deja elegir.

No muestra lugares, precios, entradas ni datos de compradores. Todo lo que implique plata o
cuentas es un link al sitio.

## Lo que nunca se tiene que romper

- **Sin reglas propias de visibilidad.** El bot solo muestra lo que le da
  `src/lib/server/telegram/events.js`, que es el único lugar que sabe cómo se leen los eventos
  (hoy de los `.md`; cuando `contenido_db` esté en `main`, de `sitePosts`). No armar consultas
  propias ni leer los `.md` desde otro lado.
- **Nada oculto, no listado ni ya empezado.**
- **Sin datos de compradores ni de lugares con dirección privada** (0005, 0007, 0029).
- El secreto del webhook se chequea **antes** que el interruptor y en tiempo constante.
- Todo texto del bot, en español rioplatense con el lenguaje inclusivo del sitio.

## Cómo está armado

| Archivo                              | Para qué                                                            |
| ------------------------------------ | ------------------------------------------------------------------- |
| `src/routes/api/telegram/+server.js` | La ruta del webhook: junta secreto, interruptor y eventos           |
| `src/lib/server/telegram/webhook.js` | Verifica el secreto, lee el update y contesta (probable sin Svelte) |
| `src/lib/server/telegram/router.js`  | Interpreta el comando y elige la respuesta                          |
| `src/lib/server/telegram/format.js`  | Los textos (HTML de Telegram), funciones puras                      |
| `src/lib/server/telegram/events.js`  | De dónde salen los eventos (el único lugar para cambiar)            |
| `src/lib/server/flags.js`            | El interruptor `telegram_bot` (`TELEGRAM_BOT_ENABLED`)              |

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
`x-telegram-bot-api-secret-token` y un update de ejemplo (`{"message":{"chat":{"id":1},"text":"/proximos"}}`).

## Qué sigue

- Cambiar `events.js` a `sitePosts` cuando #166 (`contenido_db`) esté en `main`.
- Fase 2: vincular un chat con una cuenta y sumar Telegram a "Lo que sigo" (0025). Trae una
  migración.
- Fase 3: avisos y estado para organizadores (0029).
