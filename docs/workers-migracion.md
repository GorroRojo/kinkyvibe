# Migración de Cloudflare Pages a Workers (y backups de la base)

Guía para pasar kinkyvibe.ar de **Cloudflare Pages** a **Cloudflare Workers** sin que el sitio
cambie, y para los **backups nocturnos** de la base de datos. Está escrita para hacerla paso a
paso desde el panel de Cloudflare, en orden. Nada de esto se hace solo al mergear el código.

## En pocas palabras

**Qué no cambia:** las páginas, las URLs, el panel de admin, la venta de entradas, los mails,
Mercado Pago, GitHub, la base de datos (es la misma, `kinkyvibe`) y los datos. El código del sitio
es el mismo: lo que cambia es dónde y cómo se publica.

**Qué cambia:**

| Antes (Pages)                                                       | Después (Workers)                                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Proyecto de Pages `kinkyvibe`                                       | Worker `kinkyvibe`, conectado al repo con **Workers Builds**                                  |
| Los recordatorios los dispara otro Worker aparte (`kinkyvibe-cron`) | Los dispara el propio sitio (un cron del Worker). El Worker aparte se borra                   |
| Previews `<rama>.kinkyvibe.pages.dev`                               | Previews `<rama>-kinkyvibe.<tu-subdominio>.workers.dev`, con su propia base, variables y logs |
| Bindings (base de datos) en el panel de Pages                       | Bindings en `wrangler.toml` (en el repo). Variables y secretos siguen en el panel             |
| Sin backups propios (solo Time Travel de D1: 30 días)               | **Backup de la base todas las noches en R2**, guardado meses (y uno por año para siempre)     |

Mientras no hagas los pasos de abajo, **el sitio sigue en Pages exactamente como hoy**: Pages
ignora `wrangler.toml` y compila igual que antes (verificado: el build de Pages da los mismos
archivos; lo único nuevo es `POST /api/cron/backup`, que en Pages responde 503).

## Cómo está armado (para quien programa)

- **`wrangler.toml`**: el Worker `kinkyvibe`. `main = "worker/index.js"`, archivos estáticos en
  `.svelte-kit/cloudflare` (binding `ASSETS`), `nodejs_compat`, crons, D1 `DB` (producción),
  R2 `BACKUPS`, y un bloque `[previews]` con la base `kinkyvibe-preview` para los Previews.
  `keep_vars = true` para que un deploy no borre las variables cargadas en el panel.
- **`worker/index.js`**: el adapter de SvelteKit genera un Worker que solo tiene `fetch`. Este
  archivo lo envuelve y le suma `scheduled()` (los crons). Las páginas se atienden igual.
- **`wrangler.adapter.toml`**: le dice al adapter dónde escribir su Worker
  (`.svelte-kit/cloudflare/_worker.js`). Hace falta aparte porque el adapter pisa el archivo que
  figure como `main`, y el `main` real es `worker/index.js` (`svelte.config.js` → `config`). En
  Pages (variable `CF_PAGES`) el adapter ignora esto y compila para Pages como siempre.
- **Crons** (`src/lib/server/scheduled.js`, UTC):
  - `*/15 * * * *` → recordatorios: le pasa `POST /api/cron/recordatorios` (con `CRON_SECRET`)
    directo al fetch de SvelteKit, sin salir a internet. Es el mismo endpoint de siempre, así que
    corre la misma función que corría con el Worker aparte.
  - `0 6 * * *` (03:00 en Argentina) → backup de la base a R2 y limpieza de los viejos.
  - Los crons **solo corren en producción**; los Previews no los ejecutan.
- **Modo demo en los Previews**: `__DEPLOY_BRANCH__` se fija al compilar con `WORKERS_CI_BRANCH`
  (la pone Workers Builds) o, mientras siga Pages, `CF_PAGES_BRANCH`
  (`src/lib/server/deployBranch.js`). En `main` (y en local) queda `false` y el modo demo no
  entra en el bundle, igual que hoy.
- **Backups**: `src/lib/server/backup/` (ver [Backups](#backups-de-la-base)).
- **Scripts**: `npm run db:restore` (`scripts/d1-restore.js`), `npm run db:migrate:preview`
  (migraciones en la base de los Previews), `npm run preview:worker` (el build de producción en
  el runtime de Workers, con `--test-scheduled`).

## Antes de empezar

- Hacelo en un momento tranquilo: **no durante una venta de entradas**. El único corte (de uno o
  dos minutos) es al mover el dominio (paso 8).
- Tené a mano los valores de los secretos (Mercado Pago, Resend, GitHub, `CRON_SECRET`…): Cloudflare
  no deja ver los secretos ya cargados, así que hay que volver a pegarlos.
- Necesitás `npx wrangler login` en tu compu solo para las migraciones de la base de Previews y
  para restaurar backups.

## Pasos en el panel (en orden)

### 0. Anotar cómo está Pages hoy

En **Workers & Pages → kinkyvibe (Pages) → Settings** anotá (sin copiar valores secretos a ningún
lado público):

- **Variables and Secrets**, en **Production** y en **Preview**: los **nombres** de todas.
- **Runtime → Compatibility date y flags** (sirve si algo se comporta distinto, ver
  [Dudas](#dudas-y-riesgos-conocidos)).
- **Custom domains**: `kinkyvibe.ar` y si también está `www.kinkyvibe.ar`.

### 1. Crear el bucket de backups en R2

**R2 Object Storage → Create bucket** → nombre **`kinkyvibe-backups`**, ubicación automática,
clase Standard. Sin acceso público (no hace falta ningún dominio ni URL pública).

Tiene que existir **antes** del paso 2: si no, el primer deploy falla porque `wrangler.toml` lo
vincula.

### 2. Crear el Worker desde el repo (Workers Builds)

**Workers & Pages → Create → Import a repository** → GitHub → `GorroRojo/kinkyvibe`.

- **Project name:** `kinkyvibe` (tiene que ser igual al `name` de `wrangler.toml`; puede llamarse
  igual que el proyecto de Pages).
- **Production branch:** `main`.
- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy`
- **Builds for non-production branches:** activado. **Preview command:** `npx wrangler preview`
  (es el que viene por defecto en los Workers nuevos).
- **Root directory:** vacío (la raíz del repo).
- **Build variables:** ninguna. Node sale de `.node-version`. **No** agregues `CF_PAGES`.

Al guardar, arranca el primer build y deploya el Worker en
`https://kinkyvibe.<tu-subdominio>.workers.dev`. Todavía sin secretos: es normal que falten cosas
hasta el paso 3. El dominio kinkyvibe.ar sigue en Pages.

> Desde este momento el cron nocturno ya hace backups (solo necesita la base y el bucket). El de
> los recordatorios va a fallar con 503 hasta que cargues `CRON_SECRET` (no pasa nada: el Worker
> viejo sigue mandándolos, y los envíos no se repiten).

### 3. Variables y secretos de producción

**Worker kinkyvibe → Settings → Variables and Secrets**, con el selector en **Production**.
Cargá las mismas que tiene Pages en Production (paso 0). Los secretos como **Secret**, el resto
como **Text**. Las que usa el código (solo nombres):

| Nombre                                                                                                                                          | Tipo   | Para qué                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| `GITHUB_CLIENT_ID`                                                                                                                              | Text   | Login de admin con GitHub                                   |
| `GITHUB_CLIENT_SECRET`                                                                                                                          | Secret | Login de admin con GitHub                                   |
| `MP_ACCESS_TOKEN`                                                                                                                               | Secret | Mercado Pago                                                |
| `MP_WEBHOOK_SECRET`                                                                                                                             | Secret | Firma de los webhooks de Mercado Pago                       |
| `RESEND_API_KEY`                                                                                                                                | Secret | Mails                                                       |
| `CRON_SECRET`                                                                                                                                   | Secret | El mismo valor que hoy (lo usan el cron y `/api/cron/*`)    |
| `SITE_URL`                                                                                                                                      | Text   | `https://kinkyvibe.ar`                                      |
| `TICKETS_CLIENT_SALT`                                                                                                                           | Secret | Si está en Pages                                            |
| `TICKETS_TRANSFER_INFO`                                                                                                                         | Secret | Si está en Pages (datos de transferencia: nunca en el repo) |
| `TICKETS_FROM_EMAIL`, `TICKETS_REPLY_TO`, `TICKETS_CONTACT_EMAIL`, `TICKETS_TRANSFER_HOLD_HOURS`, `TICKETS_MP_FEE_PERCENT`, `FONDO_PERCENT_URL` | Text   | Si están en Pages                                           |

`EMAIL_ALLOWLIST` **no** va en producción (es solo para Previews). Detalle de cada variable:
[`docs/tickets.md`](tickets.md).

Al guardar, Cloudflare crea una versión nueva con los secretos (no hace falta otro build). Los
**bindings** (base `DB`, bucket `BACKUPS`) no se tocan en el panel: vienen de `wrangler.toml`.

### 4. Previews: variables, secretos y base

Los Previews **no heredan nada de producción**.

- **Base:** ya está en `wrangler.toml` (`[previews]` → `kinkyvibe-preview`). No hay que hacer nada
  en el panel. Para aplicarle migraciones: `npm run db:migrate:preview`.
- **Variables y secretos:** **Settings → Variables and Secrets**, selector en **Previews Base**.
  Cargá las que tiene Pages en **Preview** (paso 0): típicamente el `MP_ACCESS_TOKEN` y
  `MP_WEBHOOK_SECRET` **de prueba**, `RESEND_API_KEY`, `EMAIL_ALLOWLIST` y `CRON_SECRET`. En
  Previews cargalas **todas como Secret** (así ningún deploy las borra). **No** cargues `SITE_URL`
  en Previews (los links tienen que apuntar al preview).
- Cada Preview nuevo arranca con lo que haya en Previews Base en ese momento.
- El webhook de la aplicación de prueba de Mercado Pago tiene que apuntar a
  `https://<rama>-kinkyvibe.<tu-subdominio>.workers.dev/api/mercadopago/webhook` (la URL exacta
  la muestra el build y el comentario en el PR).

### 5. Probar en workers.dev (sin tocar el dominio)

> Desde la noche del 1/10/2026 `wrangler.toml` tiene `workers_dev = false`: con el dominio ya en
> el Worker, `kinkyvibe.<tu-subdominio>.workers.dev` era una segunda puerta pública a producción.
> Si hubiera que repetir este paso (por ejemplo, después de un rollback), poné `workers_dev = true`
> en una rama, probá y volvé a apagarlo. Los Previews de cada rama no dependen de esto: siguen
> andando mientras `preview_urls = true`.

Hacé un push cualquiera a `main` (o **Deployments → Retry build**) para que el Worker quede con
todo cargado, y revisá en `https://kinkyvibe.<tu-subdominio>.workers.dev` la
[lista de verificación](#lista-de-verificación) (menos el login de admin: GitHub solo acepta
kinkyvibe.ar, así que eso se prueba en el paso 9).

En **Worker → Settings → Trigger Events → View events** tienen que aparecer los dos crons con
corridas OK: el de las 06:00 UTC deja `d1/AAAA-MM-DD.sql.gz` en el bucket.

Probá también un Preview: pusheá una rama cualquiera, abrí la URL que queda en el PR y entrá con
«🧪 Entrar como admin de prueba» (`/api/preview-status` muestra qué está configurado).

### 6. (Opcional) Backup manual antes de mover el dominio

```sh
curl -X POST https://kinkyvibe.<tu-subdominio>.workers.dev/api/cron/backup -H "x-cron-secret: $CRON_SECRET"
```

Responde la clave del archivo (`d1/manual/…`) y cuántas filas tiene.

### 7. Sacar el dominio de Pages

1. **Pages kinkyvibe → Custom domains**: quitar `kinkyvibe.ar` (y `www.kinkyvibe.ar` si está).
2. **DNS (zona kinkyvibe.ar) → Records**: si quedó el registro `CNAME kinkyvibe.ar → kinkyvibe.pages.dev`
   (y el de `www`), borralo. Un Custom Domain de Workers no se puede crear sobre un CNAME existente.

Desde acá el sitio está caído hasta el paso 8: hacelos seguidos.

### 8. Poner el dominio en el Worker

**Worker kinkyvibe → Settings → Domains & Routes → Add → Custom domain** → `kinkyvibe.ar`.
Cloudflare crea el registro DNS y el certificado solo (tarda un par de minutos).

Para `www`: agregalo también como Custom domain del Worker, o (mejor) una **Redirect Rule** de
`www` a la raíz con un registro DNS `www` con proxy (ver la doc de Custom Domains).

### 9. Verificar en kinkyvibe.ar

Toda la [lista de verificación](#lista-de-verificación), ahora sí con login de admin.

### 10. Borrar el Worker viejo del cron

Cuando en **Settings → Trigger Events → View events** del Worker `kinkyvibe` veas corridas OK de los recordatorios (cada 15
minutos): **Workers & Pages → kinkyvibe-cron → Settings → Delete**. Si quedara vivo no rompe nada
(los envíos no se repiten), pero sobra. La carpeta `workers/cron/` del repo se borra en un PR
aparte, después de esto.

### 11. Apagar Pages (sin borrarlo todavía)

**Pages kinkyvibe → Settings → Builds → Branch control**: desactivá los deploys automáticos
(producción y previews). Dejá el proyecto un par de semanas por si hay que volver; después
**Settings → Delete project**.

## Volver atrás (rollback)

Si algo sale mal después del paso 8:

1. **Worker kinkyvibe → Settings → Domains & Routes**: quitar `kinkyvibe.ar`.
2. **Pages kinkyvibe → Custom domains → Set up a custom domain** → `kinkyvibe.ar` (Pages vuelve a
   crear el CNAME). El proyecto de Pages sigue con su último deploy y sus variables.
3. Si ya habías borrado `kinkyvibe-cron`: `cd workers/cron && npx wrangler deploy` y
   `npx wrangler secret put CRON_SECRET` (ver `workers/cron/README.md`).

La base es la misma en los dos, así que no se pierde nada al ir y volver. Si el problema es solo
de una versión del código, más rápido: **Worker → Deployments → (versión anterior) → Rollback**.

## Lista de verificación

- [ ] Home, `/calendario`, un evento, `/wiki`, un post de `/material`: se ven igual que en Pages.
- [ ] Una URL que no existe muestra la página 404 del sitio.
- [ ] `/rss.xml`, `/calendario.ics`, `/sitemap.xml`, `/robots.txt` y el favicon responden.
- [ ] Imágenes de posts y fuentes cargan (DevTools → Network sin 404).
- [ ] Login de admin con GitHub y el panel `/admin` (solo en kinkyvibe.ar).
- [ ] Página de compra de un evento con entradas (sin comprar de verdad).
- [ ] **Trigger Events → View events**: recordatorios cada 15 minutos con respuesta `{"sent":…,"failed":…}` en los
      logs (**Observability → Logs**, buscar `recordatorios:`).
- [ ] Al día siguiente: en R2 → `kinkyvibe-backups` → `d1/` hay un archivo de hoy (buscar
      `backup:` en los logs).
- [ ] Un Preview: la URL del PR anda, usa la base de prueba (`/api/preview-status`) y el modo demo.
- [ ] Mercado Pago: el siguiente webhook real llega bien (Observability → Logs,
      `/api/mercadopago/webhook` con 200).

## Backups de la base

- **Qué:** toda la base `kinkyvibe` (esquema y filas, cualquier tabla nueva incluida), como SQL
  comprimido con gzip. Genérico: no usa `wrangler d1 export` (que no funciona desde un Worker ni
  con tablas virtuales FTS5).
- **Cuándo:** todas las noches a las 06:00 UTC (03:00 en Argentina), y cuando quieras con
  `POST /api/cron/backup` (ver paso 6).
- **Dónde:** bucket R2 `kinkyvibe-backups`: `d1/AAAA-MM-DD.sql.gz` (nocturnos) y
  `d1/manual/<fecha y hora>Z.sql.gz` (manuales). Cada archivo tiene metadatos con la cantidad de
  tablas y filas.
- **Cuánto tiempo:** todos los de los **últimos 30 días**; el primero de **cada mes durante 12
  meses**; y el primero de **cada año, para siempre**. Los manuales y cualquier otro archivo del
  bucket **nunca** se borran solos. Un backup viejo solo se borra después de que el de esa noche
  quedó guardado y verificado. (Con la base actual cada archivo pesa unos pocos KB: el costo de R2
  es cero en la práctica.)
- **Además** D1 tiene **Time Travel**: volver la base a cualquier minuto de los últimos 30 días,
  sin hacer nada de antemano.
- **Extra recomendado:** una vez por mes, bajá el último backup a tu compu
  (`npx wrangler r2 object get kinkyvibe-backups/d1/AAAA-MM-DD.sql.gz --remote --file backup.sql.gz`),
  así también hay una copia fuera de Cloudflare. Y, si querés que ni un error humano pueda borrar
  backups, en el bucket se puede activar un **Bucket lock** (R2 → bucket → Settings) para el
  prefijo `d1/`.

### Restaurar un backup

Nunca se restaura encima de una base con datos: el script se niega. Hay tres caminos:

**a) Algo salió mal hace menos de 30 días → Time Travel** (vuelve la base entera a ese momento;
se puede deshacer con el bookmark que devuelve):

```sh
npx wrangler d1 time-travel info kinkyvibe                     # bookmark actual (anotalo)
npx wrangler d1 time-travel restore kinkyvibe --timestamp=2026-10-01T05:00:00Z
```

**b) Simulacro en tu compu (no toca Cloudflare)** — conviene hacerlo de vez en cuando para saber
que los backups sirven:

```sh
npm run db:restore -- 2026-10-01 --local        # baja d1/2026-10-01.sql.gz y lo restaura en .wrangler/restore
npx wrangler d1 execute DB --local --persist-to .wrangler/restore --command "SELECT count(*) FROM orders"
```

El script compara tabla por tabla la cantidad de filas con la que anotó el backup y avisa si algo
no coincide. También acepta un archivo ya bajado (`npm run db:restore -- backup.sql.gz --local`)
o un manual (`d1/manual/…`). Para repetir el simulacro, borrá `.wrangler/restore`.

**c) Restaurar de verdad un backup viejo → en una base nueva:**

```sh
npx wrangler d1 create kinkyvibe-restaurada
npm run db:restore -- 2026-03-01 --remote --to kinkyvibe-restaurada
```

Después, según el caso: copiar a mano solo las filas que hagan falta (consultando las dos bases),
o pasar el sitio a la base restaurada cambiando el `database_id` de `DB` en `wrangler.toml` por el
de `kinkyvibe-restaurada` (copiado de `npx wrangler d1 list --json`, **nunca a mano**) en un PR.

Detalles del formato: `PRAGMA defer_foreign_keys` al principio, las tablas, las filas (enteros
grandes, decimales, textos y BLOBs exactos), después índices, vistas y triggers. Las tablas
virtuales FTS se recrean (con contenido externo, con `'rebuild'`). Los contadores AUTOINCREMENT
siguen desde el id más alto restaurado (D1 no deja escribir `sqlite_sequence`). Una fila de más
de ~100 KB no se podría restaurar con `wrangler d1 execute` (límite de D1 por sentencia): hoy no
hay ninguna así.

## Después de migrar (PR de limpieza)

- Borrar `workers/cron/`, y la mención de `CF_PAGES_BRANCH` en `src/lib/server/deployBranch.js`.
- Actualizar `README.md`, `CLAUDE.md` (dice «Cloudflare Pages») y `docs/demo.md` (menciona
  `CF_PAGES_BRANCH` y `pages.dev`).
- Con el sitio en Workers se pueden sumar Queues (mails), Email Workers (casilla de entrada), etc.

## Dudas y riesgos conocidos

- **Compatibility date:** el Worker usa `2026-09-25` con `nodejs_compat`. Pages usa la fecha que
  tenga en su panel (paso 0). Probado en local con el runtime de Workers (páginas, 404, headers,
  crons, backup), pero si en workers.dev algo se comporta distinto que en Pages, poné en
  `wrangler.toml` la misma fecha que Pages para descartar.
- **Worker Previews** están en beta abierta (septiembre 2026). Si fallan, se puede cambiar el
  Preview command a `npx wrangler versions upload`, pero **ojo**: esas versiones usan los
  bindings y secretos de producción (base real, Mercado Pago real). No hacerlo sin cambiar antes
  cómo se separan las bases.
- **Variables en Previews Base:** la doc dice que la configuración de Previews generada en el panel
  hay que copiarla a `wrangler.toml`. Los secretos no (se guardan en Cloudflare y cada Preview los
  recibe al crearse); por eso en Previews conviene cargar todo como Secret.
- Mientras convivan (pasos 2 a 10), el Worker nuevo y el viejo disparan recordatorios los dos:
  está bien, cada envío se reserva en la base antes de mandarse y no se repite.

## Fuentes (documentación consultada, septiembre 2026)

- Migrar de Pages a Workers: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/
- Adapter de SvelteKit para Cloudflare (Workers con assets, `config`): https://svelte.dev/docs/kit/adapter-cloudflare
- Assets y binding `ASSETS`: https://developers.cloudflare.com/workers/static-assets/binding/
- `_headers` en Workers: https://developers.cloudflare.com/workers/static-assets/headers/
- Workers Builds (build/deploy/preview command, variables `WORKERS_CI_BRANCH`): https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- Variables por defecto de Workers Builds: https://developers.cloudflare.com/changelog/post/2025-06-10-default-env-vars/
- Ramas y preview builds: https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
- Versión de Node en Workers Builds: https://developers.cloudflare.com/workers/ci-cd/builds/build-image/
- Worker Previews: https://developers.cloudflare.com/workers/previews/
- Configuración de Previews (bloque `previews`, Previews Base, secretos): https://developers.cloudflare.com/workers/previews/configuration/
- Recursos y límites de Previews (crons solo en producción): https://developers.cloudflare.com/workers/previews/resources/
- Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Handler `scheduled()`: https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/
- Custom Domains: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Configuración de wrangler (`keep_vars`, fuente de verdad): https://developers.cloudflare.com/workers/wrangler/configuration/
- Secretos: https://developers.cloudflare.com/workers/configuration/secrets/
- Compatibility dates: https://developers.cloudflare.com/workers/configuration/compatibility-dates/
- Importar/exportar D1 (límites de export con FTS5, `defer_foreign_keys`): https://developers.cloudflare.com/d1/best-practices/import-export-data/
- D1 Time Travel: https://developers.cloudflare.com/d1/reference/time-travel/
- R2 desde Workers: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- Bucket locks de R2: https://developers.cloudflare.com/r2/buckets/bucket-locks/
