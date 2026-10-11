# 0036. La puerta por Telegram: les admins marcan ingresos desde el bot

- Fecha: 2026-10-11
- Estado: Aceptada (gorrite, Mesa, 11/10: «Sí, que sea real»). Cambia una parte de
  [0034](0034-bot-seguir-y-token.md), que dejaba los ingresos en la puerta afuera del bot.

## Contexto

0034 dejó «Seguir» como única acción del bot que escribe y la puerta con el escáner de QR de
Telegram como un prototipo en una rama aparte (PR #273). Con el escáner nativo de Telegram, la
puerta se puede usar desde el celular sin abrir el panel ni iniciar sesión con GitHub en ese
celular. gorrite decidió que deje de ser prototipo.

## Decisión

- **Marcar ingresos desde Telegram** es la segunda acción del bot que escribe, solo para
  **admins**: una Mini App (`/telegram/puerta`) con el escáner de QR de Telegram, que marca con lo
  mismo que el modo puerta del panel.
- **Cada admin vincula su Telegram desde el panel** (Ajustes → Admins → «Vincular Telegram»): un
  link de un solo uso, que vence en 15 minutos, que abre el bot por chat privado. Desvincular, en
  el mismo lugar. Las dos cosas quedan en Actividad.
- **En cada pedido**: `initData` de Telegram válido (firmado con el token del bot, de menos de una
  hora), Telegram vinculado a une admin y ese id de GitHub todavía en la lista de admins. Sacar a
  alguien de la lista le corta la puerta aunque siga vinculade.
- De Telegram solo se guarda el id del usuario.
- Sale detrás del interruptor **Puerta por Telegram** (`telegram_puerta`), apagado (0001), que
  además pide el bot prendido. Se prueba primero en un preview.
- La migración `0050` va a producción antes del merge (0028).

## Descartado

- Una lista de ids de Telegram en una variable de entorno (`TELEGRAM_DOOR_ADMINS`, la primera
  versión del prototipo): se cambiaba a mano, con ids copiados, y no se cortaba al sacar a alguien
  de la lista de admins.
- Vincular por la cuenta pública (Mi rincón): les admins entran con GitHub y no tienen cuenta del
  sitio.
- Vender en la puerta, buscar personas o escribir el código a mano desde Telegram: no están en
  esta versión (solo escanear); siguen en el modo puerta del panel.

## Consecuencias

- `docs/telegram.md` («La puerta por Telegram») explica cómo anda y cómo se pone en marcha;
  `docs/interruptores.md` suma `telegram_puerta`.
- Las demás escrituras desde el bot (ventas, mails, anuncios) siguen afuera (0034).
