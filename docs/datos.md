# Datos: la base D1

## Qué es

Todo lo que cambia mientras el sitio funciona (órdenes, entradas, ingresos en la puerta,
códigos de descuento, ajustes del panel, plantillas de mails, notas sobre personas, registro de
actividad) se guarda en una base de datos **Cloudflare D1** (un SQLite en Cloudflare). Las
publicaciones (eventos, material, amigues, wiki) **no** están ahí por ahora: son archivos `.md` en
el repo (ver [contenido.md](contenido.md)). Hay tres copias separadas de la base: la de tu compu,
la de los previews y la de producción.

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

| Dónde                     | Qué base                                                                                         | Cómo se le aplican las migraciones                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Tu compu (`npm run dev`)  | copia simulada en `.wrangler/state/`                                                             | solas, antes de cada `npm run dev*` (`scripts/db-migrate-local.js`)                  |
| Previews de cada PR       | `kinkyvibe-preview` (el binding `DB` del entorno Preview se configura en el panel de Cloudflare) | a mano, cuando un PR trae una migración nueva                                        |
| Producción (kinkyvibe.ar) | `kinkyvibe` (su id está en `wrangler.toml`)                                                      | a mano, `npm run db:migrate:remote`, **antes** de deployar el código que la necesita |
| Pruebas (vitest)          | una nueva en memoria por prueba                                                                  | solas: `createTestDB()` aplica todas                                                 |

Las migraciones `0001` a `0010` ya están aplicadas en producción (30/9/2026, antes de mergear el
panel, #115). Con la migración a Workers los bindings pasan a configurarse distinto: ver
[workers-migracion.md](workers-migracion.md) cuando esté.

## Las tablas y quién las usa

| Tabla                                             | Migración                            | Para qué                                                                                    | Código                                                     |
| ------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `rate_limits`                                     | 0001                                 | límites de intentos (sin IPs)                                                               | `src/lib/server/db/rateLimit.js`                           |
| `orders`, `tickets`                               | 0002 (+0003, 0005, 0010, 0013, 0016) | órdenes y entradas; canal `online` / `puerta` / `manual`; `ticket_tier` (tramo de preventa) | `src/lib/server/tickets/orders.js`, `door.js`, `manual.js` |
| `discount_codes`                                  | 0002                                 | códigos de descuento                                                                        | `src/lib/server/tickets/discounts.js`                      |
| `ticket_settings`                                 | 0002                                 | Ajustes de venta (cobros, Fondo, mails, recordatorios)                                      | `src/lib/server/tickets/settings.js`                       |
| `event_ticket_settings`, `stream_link_sends`      | 0002                                 | link de transmisión por evento y a quién se le mandó                                        | `src/lib/server/tickets/stream.js`                         |
| `reminder_sends`                                  | 0002                                 | recordatorios ya mandados (no repetir)                                                      | `src/lib/server/tickets/reminders.js`                      |
| `admin_audit`                                     | 0004                                 | registro de actividad del panel                                                             | `src/lib/server/admin/audit.js`                            |
| `event_mail_sends`, `event_mail_recipients`       | 0006                                 | "Mail a compradores" de un evento, en tandas                                                | `src/lib/server/tickets/buyerMail.js`                      |
| `admin_last_seen`                                 | 0007                                 | "Desde tu última visita" del Inicio                                                         | `src/lib/server/admin/lastSeen.js`                         |
| `email_templates`                                 | 0008                                 | textos de los mails cambiados desde el panel                                                | `src/lib/server/tickets/templates.js`                      |
| `person_notes`                                    | 0009                                 | notas internas sobre personas                                                               | `src/lib/server/admin/people.js`                           |
| `object_types`, `objects`, `edges`, `objects_fts` | 0012                                 | objetos y relaciones (todavía sin uso en páginas; ver [objetos.md](objetos.md))             | `src/lib/server/objects/` (solo `saveObject()` escribe)    |
| `integrity_runs`                                  | 0012                                 | resultado del chequeo nocturno de los objetos ("Para revisar")                              | `src/lib/server/objects/integrity.js`                      |
| `feature_flags`                                   | 0013                                 | interruptores de funciones nuevas (Ajustes → Interruptores)                                 | `src/lib/server/flags.js`                                  |
| `accounts`, `account_sessions`, `login_codes`     | 0013                                 | cuentas del público, sesiones y códigos por mail (ver [cuentas.md](cuentas.md))             | `src/lib/server/cuentas/`                                  |
| `agenda_day_notes`                                | 0030                                 | notas de colores en los días de la Agenda (solo admins; nunca en páginas públicas ni .ics)  | `src/lib/server/admin/dayNotes.js`                         |
| `demo_files`                                      | ninguna                              | solo en previews: los "commits" del modo demo                                               | `src/lib/server/demo/overlay.js`                           |

`demo_files` no es una migración a propósito: producción no la tiene (ver [demo.md](demo.md)).

## Dónde está el código

- `migrations/NNNN_nombre.sql`: el esquema, en orden. Cada archivo explica arriba para qué es.
- `src/lib/server/db/index.js`: `getDB(platform)` y `logDBError(contexto, error)` (avisa si faltan
  migraciones).
- `src/lib/server/db/testing.js`: `createTestDB()` y `applyMigrations()` para las pruebas.
- `wrangler.toml`: el binding `DB`. **No tiene `pages_build_output_dir` a propósito** (los
  bindings de producción viven en el panel de Cloudflare); no se agrega.
- En Cloudflare: **Workers & Pages → kinkyvibe → Settings → Bindings**, variable `DB`, con
  `kinkyvibe` en Production y `kinkyvibe-preview` en Preview.

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

Solo `kinkyvibe-preview`, nunca `kinkyvibe`. Para vaciar los cambios del modo demo:
`DELETE FROM demo_files;` (ver [demo.md](demo.md)).
