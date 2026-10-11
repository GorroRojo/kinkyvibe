# 0034. El bot de Telegram: «Seguir» como primera acción que escribe, y el webhook usa el token

- Fecha: 2026-10-11
- Estado: Aceptada (decisiones de gorrite, 11/10). Amplía 0029, que dejaba afuera las acciones
  que escriben y contestaba todo sin token.

## Contexto

0029 armó el bot como otra vista del sitio, **solo lectura** y contestando cada mensaje en el
mismo pedido del webhook (un solo método de la API, sin token). Para navegar por pantallas
(`docs/telegram.md`) hacen falta cosas que con un solo método no se pueden: contestar el botón al
instante, mandar una tarjeta con foto y volver a texto, saber si Telegram rechazó una edición o
pidió ir más despacio. Y «Lo que sigo» (0025) se puede elegir en el sitio pero no desde el bot.

## Decisión

- **El webhook puede usar el token del bot** (`TELEGRAM_BOT_TOKEN`, el secret que ya existe) para
  llamar a la API: `answerCallbackQuery`, `sendPhoto`, `editMessageMedia`, los métodos de
  mensajes efímeros, `deleteMessage`. Siempre por `callTelegramApi` (`send.js`), que nunca loguea
  ni devuelve el token. Contesta 200 enseguida y llama en `waitUntil`. Sin el token, todo sigue
  como antes (un método en el mismo pedido, tarjetas con vista previa en lugar de foto).
- **Límites de Telegram**: editar en vez de mandar; ante un 429, «Más despacio 🙂» y sin
  reintentos; «message is not modified» no es un error.
- **«Seguir» es la primera acción que escribe**, y solo esta:
  - solo por **chat privado vinculado a una cuenta** (0029, fase 2) y con «Lo que sigo» prendido,
    mirado en cada mensaje;
  - por el mismo camino que el botón «Seguir» del sitio (`resolveTag` + `follow`), con sus topes
    (cambios por hora, cosas seguidas) y sus opciones por defecto;
  - etiquetas y series de un evento; perfiles y lugares, por ahora desde el sitio; dejar de seguir
    y elegir avisos, desde Mi rincón;
  - en un grupo el botón es un link al chat privado (`?start=seguir-<id>`) y el bot no mira ni
    muestra nada de ninguna cuenta.
- **Registro**: como en el sitio, seguir algo **no** va al registro de actividad del panel (lo
  que sigue cada cuenta es privado, 0025 y `docs/lo-que-sigo.md`, y ese registro lo ven les
  admins). Queda una línea en el log sin cuenta ni etiqueta.
- **Grupos**: solo lo público, con comandos y respuestas **efímeros** (Bot API 10.2/10.3): solo
  los ve quien preguntó. Un botón de una respuesta pública muestra la pantalla nueva solo a quien
  tocó (`replace_callback_query_message`); si su app no puede, el botón abre el chat privado. Nada
  personal en efímeros, aunque los vea una sola persona.
- **Mini App del calendario** (`/telegram/app`): sin login, lo mismo que `/calendario` le muestra
  a cualquiera; pagar se abre en el sitio, afuera de Telegram.
- **Comandos del menú «/»**: se registran solos desde el cron de 15 minutos cuando cambia la
  lista (hash guardado en `ticket_settings`); el botón del panel queda para hacerlo ya.

## Sigue descartado

- Cualquier otra escritura desde el bot (ventas, ingresos en la puerta, mails, anuncios): cada
  una, una decisión nueva. La puerta con el escáner de Telegram es un **prototipo** en una rama
  aparte, sin mergear.
- Cobrar adentro de Telegram (Stars, pagos): los pagos siguen en el sitio con Mercado Pago.

## Consecuencias

- El webhook necesita el token para la experiencia completa; sin él sigue andando como en 0029.
- `docs/telegram.md` explica las pantallas, el `callback_data`, los grupos y la Mini App.
