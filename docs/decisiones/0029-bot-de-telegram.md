# 0029. Un bot de Telegram como otra vista del sitio

- Fecha: 2026-10-01
- Estado: Aceptada. Fase 1 con código (#175): `/proximos` y `/evento`, interruptor `telegram_bot`.
  Fase 2 en un PR aparte: vincular la cuenta y avisos de «Lo que sigo» (migración 0033).

## Contexto

La comunidad ya vive en Telegram (0001) y el CRM lo cuenta como canal de base (0008). Un bot
sería otra vista de los mismos datos, no un reemplazo del sitio: el sitio sigue siendo lo que
encuentra la gente (búsqueda, links), el CMS y el lugar donde se paga.

Hay trabajo en curso que condiciona el diseño:

- Los eventos pasan de `.md` a la base detrás del interruptor `contenido_db` (0026, paso 5). Hay
  una sola capa de lectura; el bot tiene que leer por ahí y no tocar los `.md` ni armar sus
  propias consultas.
- "Lo que sigo" (0025) va a ser el único sistema de seguimientos y avisos. Telegram es un canal
  más de ese sistema, no uno aparte.

## Decisión

- **El bot es una capa de vista**: interpreta comandos y da formato a mensajes, con una lógica
  de datos compartida con el sitio. No tiene reglas propias de visibilidad ni de precios.
- **Solo lectura al principio**: próximos eventos, detalle de un evento, lugares. Todo lo que
  sea pagar, comprar entradas o editar manda al sitio con un link.
- **Respeta la privacidad del sitio**: nada de eventos no listados u ocultos, y sin nombre ni
  dirección del lugar cuando su nivel los oculta (0005, 0007).
- **Bot propio de la comunidad**, con su propio token (secret de Cloudflare). No se usa el bot
  personal de avisos de gorrite.
- **Detrás de un interruptor** (`telegram_bot`), apagado hasta que se prenda desde el panel
  (0001). El webhook verifica el secreto de Telegram.
- **Fases**:
  1. Solo lectura, sin cambios de base: `/proximos` y `/evento`. Código nuevo y aislado en
     `src/lib/server/telegram/` y una ruta `api/telegram`. Se construye sobre la capa de
     lectura de contenido, así que espera a que `contenido_db` (#166) esté en `main`.
  2. Avisos: vincular un chat con una cuenta por código de un solo uso, y sumar Telegram como
     canal de "Lo que sigo" (con horario de silencio y clave única por envío, 0008). Espera a 0025. Trae una migración, que se aplica a producción antes del merge (0028), con el
     número elegido después de revisar todas las ramas `claude/*`.
  3. Organizadores (abajo).

### Organizadores (más adelante)

Solo avisos y estado de **sus** eventos, con los permisos que ya tienen (0003, 0024):

- avisos de ventas (resumen diario por defecto, aviso en el momento opcional);
- estado a pedido: vendidas contra cupo, tramos, reservas por vencer, órdenes pendientes;
- resumen del día del evento: ingresos, ventas en puerta, pendientes;
- aviso de que llegó una respuesta a un formulario, con link (sin pegar la respuesta);
- recordatorios: evento de mañana, falta el lugar o el link de transmisión.

Reglas:

- El chat se vincula a una cuenta con código de un solo uso y **los permisos se revisan en cada
  mensaje**, no una vez.
- Solo por chat privado con la persona verificada, nunca en grupos.
- **Sin datos de compradores** (nombres, mails, teléfonos, DNI): solo cantidades y links.

## Descartado

- Reemplazar el sitio por el bot.
- Un sistema de suscripciones de Telegram aparte de "Lo que sigo".
- Que el bot lea los `.md` o arme sus propias consultas de eventos.
- Publicaciones libres, feeds o chat entre personas en el bot (0001).
- Por ahora, **acciones que escriben**: ventas o ingresos en la puerta, mails a compradores,
  anunciar eventos. Tocan plata, entrada o mensajes públicos; si se quieren, van en una decisión
  nueva, una por una.
- Usar el bot personal de gorrite.

## Consecuencias

- La fase 1 no toca la base ni archivos compartidos, así que se puede construir en paralelo con
  los demás agentes.
- Todo texto del bot, en español rioplatense con el lenguaje inclusivo del sitio.
- Cada fase actualiza esta decisión en el mismo PR.

## Cómo va (1/10)

- Fase 1 en un PR aparte: webhook `/api/telegram`, `/proximos`, `/evento`, interruptor
  `telegram_bot`. Guía: [`docs/telegram.md`](../telegram.md). Lee los eventos por la capa
  compartida (`sitePosts`: de la base o de los `.md`, según `contenido_db`).
- Botones (teclados inline): `/proximos` y `/evento` sin nada muestran un botón por evento; al
  tocarlo, el mensaje cambia al detalle. `/evento <texto>` también busca por fecha. Sigue sin
  base ni token: todo se contesta en el mismo pedido.

## Cómo va (2/10)

- Fase 2 en un PR aparte, con la migración `0033_telegram_avisos.sql` (tablas `telegram_chats` y
  `telegram_link_codes`, columnas `tg_new` y `tg_reminder` en `follows` y el canal en la clave de
  `follow_notifications`). Detrás de `telegram_bot`, `lo_que_sigo` y `cuentas`.
- Vincular: código de un solo uso desde Mi rincón → Lo que sigo y `/vincular <código>` por chat
  privado; `/silenciar`, `/reanudar` y `/desvincular`.
- Telegram es un canal más de «Lo que sigo» (como dice esta decisión): la columna de la grilla se
  prende con el chat vinculado y los avisos salen del mismo cron, uno por cuenta, evento, tipo y
  canal, con horario de silencio de 23 a 9 (hora de Argentina). Solo título, fecha y link.
- Mandar necesita un secret nuevo, `TELEGRAM_BOT_TOKEN` (lo carga gorrite en Cloudflare); sin él,
  los avisos por Telegram se saltean con una línea en el log. El webhook sigue sin usarlo.
- Detalle y lo decidido por Claude a confirmar: [`docs/telegram.md`](../telegram.md).
