# Datos: la base D1

## Qué es

Todo lo que cambia mientras el sitio funciona (órdenes, entradas, ingresos en la puerta,
códigos de descuento, ajustes del panel, plantillas de mails, notas sobre personas, registro de
actividad) se guarda en una base de datos **Cloudflare D1** (un SQLite en Cloudflare). Las
publicaciones (eventos, material, perfiles de amigues, la wiki) y las etiquetas también: son
objetos de la base (ver [contenido.md](contenido.md) y [objetos.md](objetos.md)); ya no hay `.md`
en el repo. Hay tres copias separadas de la base: la de tu compu, la de los previews y la de
producción. La de tu compu y la de las pruebas E2E arrancan con la semilla de contenido público
(`npm run db:semilla`, `src/lib/server/semilla/`).

## Lo que nunca se tiene que romper

- **Las migraciones son solo para agregar.** Una migración que pudo haberse aplicado (en
  producción o en preview) no se edita nunca: se agrega una nueva con el número siguiente.
- **Producción no se toca para probar.** Ni datos de demo, ni `DELETE`, ni pruebas de
  migraciones contra `kinkyvibe` (la base de producción). Para probar está la local y la de
  preview.
- **La base es opcional para el sitio público:** si no está (durante el build, o si falla), cada
  página que la usa degrada sin romperse. `getDB(platform)` devuelve `null` y el código tiene que
  contemplarlo.
- **Siempre consultas preparadas** (`db.prepare('… WHERE x = ?1').bind(valor)`), nunca SQL armado
  con texto.
- **Nada de DNI, tokens ni datos bancarios en el registro de actividad** (`admin_audit`):
  `logAdminAction` los filtra; no lo esquives.
- Un ID de base (o cualquier ID) no se tipea a mano: se copia de `npx wrangler d1 list --json`.

## Las tres bases

| Dónde                     | Qué base                                                                                      | Cómo se le aplican las migraciones                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Tu compu (`npm run dev`)  | copia simulada en `.wrangler/state/`                                                          | solas, antes de cada `npm run dev*` (`scripts/db-migrate-local.js`)                  |
| Previews de cada PR       | `kinkyvibe-preview` (el binding `DB` de los Previews está en `[previews]` de `wrangler.toml`) | a mano, cuando un PR trae una migración nueva                                        |
| Producción (kinkyvibe.ar) | `kinkyvibe` (su id está en `wrangler.toml`)                                                   | a mano, `npm run db:migrate:remote`, **antes** de deployar el código que la necesita |
| Pruebas (vitest)          | una nueva en memoria por archivo de pruebas                                                   | solas: `createTestDB()` aplica todas                                                 |

Las migraciones `0001` a `0010` ya están aplicadas en producción (30/9/2026, antes de mergear el
panel, #115). Con la migración a Workers los bindings pasan a configurarse distinto: ver
[workers-migracion.md](workers-migracion.md) cuando esté.

## Las tablas y quién las usa

| Tabla                                             | Migración                            | Para qué                                                                                                                                                                     | Código                                                     |
| ------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `rate_limits`                                     | 0001                                 | límites de intentos (sin IPs)                                                                                                                                                | `src/lib/server/db/rateLimit.js`                           |
| `orders`, `tickets`                               | 0002 (+0003, 0005, 0010, 0013, 0016) | órdenes y entradas; canal `online` / `puerta` / `manual`; `ticket_tier`; venta sin conexión (0051: `client_sale_id`); precio cambiado en la puerta (0063: `door_list_price`) | `src/lib/server/tickets/orders.js`, `door.js`, `manual.js` |
| `discount_codes`                                  | 0002 (+0056, 0058)                   | códigos de descuento; los combo (0056) con `buyer_email` y `source_order_id`; `max_tickets` (0058): entradas por compra                                                      | `src/lib/server/tickets/discounts.js`                      |
| `ticket_settings`                                 | 0002                                 | Ajustes del panel (cobros, Fondo, mails, recordatorios; `link_preview_texts`: textos de la vista previa, docs/compartir.md)                                                  | `src/lib/server/tickets/settings.js`                       |
| `event_ticket_settings`, `stream_link_sends`      | 0002                                 | link de transmisión por evento y a quién se le mandó                                                                                                                         | `src/lib/server/tickets/stream.js`                         |
| `reminder_sends`                                  | 0002                                 | recordatorios ya mandados (no repetir)                                                                                                                                       | `src/lib/server/tickets/reminders.js`                      |
| `admin_audit`                                     | 0004                                 | registro de actividad del panel                                                                                                                                              | `src/lib/server/admin/audit.js`                            |
| `event_mail_sends`, `event_mail_recipients`       | 0006                                 | "Mail a compradores" de un evento, en tandas                                                                                                                                 | `src/lib/server/tickets/buyerMail.js`                      |
| `admin_last_seen`                                 | 0007                                 | "Desde tu última visita" del Inicio                                                                                                                                          | `src/lib/server/admin/lastSeen.js`                         |
| `email_templates`                                 | 0008, 0034                           | textos de los mails cambiados desde el panel                                                                                                                                 | `src/lib/server/tickets/templates.js`                      |
| `event_email_templates`                           | 0034                                 | textos de los mails cambiados solo para un evento                                                                                                                            | `src/lib/server/tickets/templates.js`                      |
| `person_notes`                                    | 0009, 0045, 0049                     | notas internas sobre personas (por mail; las de una cuenta borrada, por `account_id`)                                                                                        | `src/lib/server/admin/people.js`                           |
| `object_types`, `objects`, `edges`, `objects_fts` | 0012                                 | objetos y relaciones (todavía sin uso en páginas; ver [objetos.md](objetos.md))                                                                                              | `src/lib/server/objects/` (solo `saveObject()` escribe)    |
| `integrity_runs`                                  | 0012                                 | resultado del chequeo nocturno de los objetos ("Para revisar")                                                                                                               | `src/lib/server/objects/integrity.js`                      |
| `feature_flags`                                   | 0013                                 | interruptores de funciones nuevas (Ajustes → Interruptores)                                                                                                                  | `src/lib/server/flags.js`                                  |
| `accounts`, `account_sessions`, `login_codes`     | 0013                                 | cuentas del público, sesiones y códigos por mail (ver [cuentas.md](cuentas.md))                                                                                              | `src/lib/server/cuentas/`                                  |
| `agenda_day_notes`                                | 0030                                 | notas de colores en los días de la Agenda (solo admins; nunca en páginas públicas ni .ics)                                                                                   | `src/lib/server/admin/dayNotes.js`                         |
| `review_snapshots`                                | 0047                                 | sin uso desde la decisión 0032 (era la última revisión del importador de contenido)                                                                                          | ninguno                                                    |
| `event_date_changes`, `date_change_sends`         | 0048                                 | último cambio de fecha de cada evento y a qué orden se le avisó (por versión)                                                                                                | `src/lib/server/tickets/dateChange.js`                     |
| `waitlist_entries`, `waitlist_sends`              | 0053                                 | lista de espera de las entradas (por evento o tipo) y sus mails por ronda; interruptor `lista_espera`, en construcción                                                       | `src/lib/server/tickets/waitlist.js`                       |
| `ticket_combos`                                   | 0056                                 | combos entre eventos (la compra de A genera un código para B); interruptor `combo_codigos`                                                                                   | `src/lib/server/tickets/combos.js`                         |
| `email_suppressions`                              | 0060                                 | «No fui yo»: hash de las direcciones que no quieren más mails (solo los que no son de una compra pagada; ver mails.md)                                                       | `src/lib/server/email/suppressions.js`                     |
| `resend_webhook_events`                           | 0064                                 | avisos de Resend ya procesados (rebotes y quejas; también `orders.email_id` y `email_problem`; ver mails.md)                                                                 | `src/lib/server/email/resendWebhook.js`                    |
| `door_notices`                                    | 0068                                 | avisos de puerta: hash del mail y cuenta, motivo privado y vencimiento obligatorio (decisión 0053; ver tickets.md)                                                           | `src/lib/server/tickets/doorNotices.js`                    |

**Borrados suaves (0049, decisión [0033](decisiones/0033-borrados-recuperables.md)).**
`signup_fields`, `persona_roles` y `person_notes` tienen `deleted_at` (NULL = está). Borrar desde el
panel lo marca y escribe la fila de `panel_deletions` (0021) en la misma tanda, para «Recuperar» en
Actividad; toda consulta de esas tablas lleva `deleted_at IS NULL`. No hay purga.

**Lista de espera (0053, decisión [0040](decisiones/0040-lista-de-espera.md)).** Una fila de
`waitlist_entries` por anotación; `ticket_type` NULL es la lista de todo el evento. Viva
(`pending_confirmation`, `waiting`, `offered`) hay una sola por mail y alcance (índice único
parcial); al terminar (`purchased`, `expired`, `cancelled`) se puede volver a anotar. El orden de la
fila es `confirmed_at`. Con `offered`, `hold_until` es hasta cuándo se guarda el lugar (NULL = aviso
a toda la fila, sin lugar guardado) y `offer_count` la ronda; con `purchased`, `order_id` es la
orden que hizo con su oferta. `end_reason` dice por qué terminó (`hold_expired`, `left`, `admin`,
`closed`, `event_cancelled`, `type_removed`) y `ended_by`, le admin si fue desde el panel. Los
tokens (confirmar y oferta) se guardan solo como SHA-256; `client_hash` como en `orders` (sin IP).
`waitlist_sends` lleva cada mail del cron una vez por anotación, mail (`offer`, `reminder`,
`expired`, `closed`) y ronda, con los estados de los envíos en tandas (`sending`, `sent`, `retry`,
`failed`). Mismo trato que `orders`: sin purga, solo admins, nunca el mail en `admin_audit`; las
anotaciones sin confirmar se borran a las 48 h. Borrar una anotación borra sus `waitlist_sends`.
Los tiempos (tramos de reserva, aviso a todes, cierre) son fijos, en el código
(`WAITLIST_SETTINGS`); una clave `waitlist` que haya quedado en `ticket_settings` no se lee. Ahí sí
van las claves de los links (`waitlist_leave_key`, `waitlist_offer_key`, se crean solas). Lo de
cada evento va en su `lista_espera`. Detalle en [tickets.md](tickets.md), «Lista de espera».

`demo_files` (solo en la base de los previews, nunca fue una migración) era la capa de "commits"
del modo demo: desde la decisión 0032 nadie la usa; se puede borrar a mano en el preview.

## Dónde está el código

- `migrations/NNNN_nombre.sql`: el esquema, en orden. Cada archivo explica arriba para qué es.
- `src/lib/server/db/index.js`: `getDB(platform)` y `logDBError(contexto, error)` (avisa si faltan
  migraciones).
- `src/lib/server/db/testing.js`: `createTestDB()`, `applyMigrations()`, `resetDB()` y
  `snapshotDB()`/`restoreDB()` (copia de las filas para reusar datos caros) para las pruebas;
  `startTemplateDB()` arma la plantilla migrada que copian las bases de prueba (globalSetup de
  vitest, ver [pruebas-y-ci.md](pruebas-y-ci.md)).
- `wrangler.toml`: el binding `DB`, con `kinkyvibe` en producción y `kinkyvibe-preview` en los
  Previews (bloque `[previews]`). **No tiene `pages_build_output_dir` a propósito**; no se agrega.

## Cómo probar

```sh
npm run dev                                   # aplica las migraciones locales y arranca
npx vitest run src/lib/server/db              # pruebas de la base y de migraciones
npx wrangler d1 execute kinkyvibe --local --command "SELECT name FROM sqlite_master"
```

Para empezar de cero en tu compu: borrá `.wrangler/state/`. Para probar el build de producción
en el runtime de Workers con la base local: `npm run build && npm run preview:worker` (puerto 8880).

## Tareas comunes

### Agregar una migración

1. `npm run db:migrations:new -- nombre_descriptivo` (crea `migrations/00NN_nombre_descriptivo.sql`).
2. Escribí el SQL con un comentario arriba que diga para qué es. Valores por defecto que
   mantengan cómo funciona hoy (decisión 0006).
3. Si reconstruye una tabla (SQLite no deja cambiar un `CHECK` sin copiar la tabla), sumá una
   prueba con datos como `src/lib/server/db/migration0010.test.js`: que no se pierdan filas y
   que las claves foráneas sigan valiendo.
4. `npm run db:migrate:local` y `npx vitest run`.
5. En el PR, avisá que trae migración: quien tiene acceso a Cloudflare (hoy gorrite) la aplica en
   preview y, **antes** del deploy, en producción (`npm run db:migrate:remote`). Wrangler solo
   aplica las que faltan.
6. Si más de un PR agrega migraciones a la vez, el segundo en mergearse renumera la suya (nunca
   dos con el mismo número).

### Mirar datos

```sh
npx wrangler d1 execute kinkyvibe --local --command "SELECT id, status FROM orders"   # tu compu
```

Contra la base remota, solo lectura y solo si hace falta (`--remote`); los datos de producción
son de personas reales: no los copies a issues, PRs ni capturas.

### Resetear la base de preview

Solo `kinkyvibe-preview`, nunca `kinkyvibe`. Los datos de prueba del modo demo se recargan con
«Recargar datos de prueba» (ver [demo.md](demo.md)). La tabla vieja `demo_files` ya no se usa:
`DROP TABLE IF EXISTS demo_files;` la saca.
