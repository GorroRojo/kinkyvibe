# 0036. Seguir desde el bot prende los avisos por Telegram

- Fecha: 2026-10-11
- Estado: Aceptada (decisión de gorrite en la Mesa, 11/10). Cambia una parte de 0034: los avisos
  por Telegram ya no se eligen solo en Mi rincón.

## Contexto

Con 0034, tocar «Seguir» en el bot seguía la etiqueta o serie con las opciones de siempre
(calendario y mail de lo nuevo), y los avisos por Telegram había que prenderlos aparte en Mi rincón
→ Lo que sigo. Quien sigue algo desde Telegram casi seguro quiere enterarse por Telegram.

## Decisión

- Seguir algo **desde el bot** también prende «Algo nuevo» por Telegram para eso (el
  recordatorio queda apagado, como el del mail). El aviso del botón lo dice en una línea: «Te aviso
  por acá cuando haya algo nuevo. Podés apagarlo en Mi rincón.».
- Solo si el chat está vinculado y **no** está en `/silenciar`: pausar es apagarlos a propósito, y
  no se pisa.
- Solo al **empezar** a seguir. Si ya lo seguía, sus opciones quedan como estaban: la base no
  distingue «nunca tocó Telegram» de «lo apagó» (las columnas `tg_new` y `tg_reminder` arrancan en
  0), así que no se adivina.
- Seguir **desde el sitio** no cambia nada (Telegram sigue apagado por defecto). **Dejar de
  seguir** no apaga ni pausa nada más (borra la fila de esa cosa).

## Descartado

- Una columna o migración para distinguir «nunca» de «apagado»: no hace falta para esto. Quien
  apagó Telegram para algo, lo dejó de seguir y lo vuelve a seguir desde el bot, lo tiene prendido
  otra vez; por eso la línea dice cómo apagarlo.

## Consecuencias

- `BOT_FOLLOW_OPTIONS` y `telegramAvisosAllowed` en `src/lib/server/telegram/seguir.js`; `follow`
  (`src/lib/server/sigo/follows.js`) guarda las opciones de Telegram si vienen.
- `docs/telegram.md` y `docs/lo-que-sigo.md` lo cuentan.
