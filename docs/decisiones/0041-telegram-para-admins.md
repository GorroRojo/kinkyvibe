# 0041. Telegram para admins: estado de la venta y avisos (organizadores, más adelante)

- Fecha: 2026-10-12
- Estado: Aceptada (gorrite, por chat, 12/10). Adelanta para admins la parte «Organizadores (más
  adelante)» de [0029](0029-bot-de-telegram.md) y usa el vínculo de admins de
  [0037](0037-puerta-por-telegram.md).

## Contexto

0029 dejó planeado, para más adelante, que les organizadores vean por el bot el estado y los
avisos de **sus** eventos. El rol de organizadore todavía no existe. Les admins ya pueden vincular
su Telegram desde el panel (Ajustes → Admins, 0037, migración 0050) y el bot ya les reconoce en
cada pedido para la puerta.

## Decisión

- **Primero para admins**, con el mismo vínculo que la puerta: Telegram vinculado desde el panel
  y ese id de GitHub todavía en `ADMINS`. **Más adelante, lo mismo para organizadores**, cada une
  solo con **sus** eventos (otra decisión cuando exista el rol).
- **Cuatro partes**:
  1. **Estado a pedido** («📊 Estado»): elegir un evento próximo → vendidas contra cupo por tipo
     y tramo, reservas sin pagar (y las que vencen en la próxima hora), transferencias por
     confirmar, órdenes para revisar y la lista de espera (si existe), con «Ver en el panel».
  2. **Resumen diario de ventas.**
  3. **Avisos en el momento**: cada venta y cada transferencia que llega.
  4. **Día del evento**: un resumen ese día y recordatorios (el evento de mañana, falta el lugar o
     el link de la transmisión).
- **Los avisos son a elección de cada admin, apagados por defecto**: cada une elige cuáles quiere
  («🔔 Mis avisos» en el bot). Nadie recibe nada que no prendió.
- **En tres PR**: (1) la base (esta decisión, dónde se guarda lo que elige cada admin, «🔔 Mis
  avisos») y el estado a pedido; (2) el resumen diario y los avisos en el momento; (3) el día del
  evento y los recordatorios.
- **Las reglas de 0029 siguen**: solo por chat privado con esa misma persona (nunca en grupos),
  los permisos se revisan **en cada mensaje y cada botón** (no una vez) y **sin datos de
  compradores**: solo cantidades y links al panel.
- A quien no es admin vinculade, el bot le contesta lo mismo que a un comando o un botón que no
  existen (no dice que hay algo para admins), también con un botón armado a mano.
- Sale detrás de un interruptor nuevo, **Telegram para admins** (`telegram_admin`), apagado
  (0001), que además pide el bot prendido. Vincular el Telegram (Ajustes → Admins) anda con este
  o con la puerta prendidos.

## Descartado

- Esperar al rol de organizadore: les admins lo necesitan ya, y lo de organizadores es lo mismo
  con menos eventos.
- Avisos prendidos por defecto: mandan mensajes a gente que no los pidió.
- Elegir los avisos en Mi rincón: les admins entran con GitHub y no tienen cuenta pública (como
  en 0037). Si hace falta, puede sumarse en Ajustes → Admins.
- Mandar nombres, mails o cualquier dato de quien compra por Telegram, aunque sea a admins: queda
  en el panel.

## Consecuencias

- Migración `0054_telegram_admin_avisos.sql` (qué avisos prendió cada admin, por id de GitHub);
  va a producción antes del merge (0028).
- `docs/telegram.md` («Estado y avisos para admins») explica cómo anda; `docs/interruptores.md`
  suma `telegram_admin`.
- `/estado` y `/avisos` no van en el menú «/» de nadie (el menú es el mismo para todes); les
  admins usan los botones del inicio.

## Cómo va (12/10)

- PR 1: la base y el estado a pedido. «📊 Estado · 🔔 Mis avisos» en el inicio de les admins
  vinculades, `/estado` y `/avisos`. «Mis avisos» ya guarda lo que elige cada admin (los cinco
  tipos: resumen diario, cada venta, cada transferencia, día del evento, recordatorios), con un
  aviso de que todavía no sale ninguno.
- PR 2: el resumen diario (a las 9 de Argentina, por evento con movimiento) y los avisos de cada
  venta y cada transferencia (en el momento; en el horario de silencio, sin sonido). Migración
  `0055_telegram_admin_enviados.sql` (lo ya enviado, para no repetir). Pendiente: el PR 3.
- PR 3: el día del evento («📣 Hoy», el día del evento) y los recordatorios («⏰ Mañana» el día
  antes y, si el mismo día todavía falta el lugar o el link de la transmisión, «⚠️ Hoy» a quien no
  prendió «Día del evento»), a las 9 con el resumen diario. Sin migración. Están las cuatro partes.
