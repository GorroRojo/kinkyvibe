# Migración de Cloudflare Pages a Workers (y backups de la base)

Guía para pasar kinkyvibe.ar de **Cloudflare Pages** a **Cloudflare Workers** sin que el sitio
cambie, y para los **backups nocturnos** de la base de datos. Está escrita para hacerla paso a
paso desde el panel de Cloudflare, en orden. Nada de esto se hace solo al mergear el código.

> **Estado (octubre 2026): la migración está hecha.** El sitio corre como Worker en
> kinkyvibe.ar, Pages está desconectado, el Worker `kinkyvibe-cron` se borró y la carpeta
> `workers/cron/` ya no está en el repo. Los pasos quedan como registro; cómo se vuelve atrás
> hoy está en [Volver atrás](#volver-atrás-rollback).

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
  - `0 6 * * *` (03:00 en Argentina) → backup de la base a R2 y limpieza de los viejos. Después,
    sin hacer fallar la corrida: el chequeo de integridad de los objetos, el resumen mensual de las
    visitas y la limpieza de las sesiones de cuentas que ya no tienen cookie
    ([cuentas.md](cuentas.md)).
  - Los crons **solo corren en producción**; los Previews no los ejecutan.
- **Modo demo en los Previews**: `__DEPLOY_BRANCH__` se fija al compilar con `WORKERS_CI_BRANCH`
  (la pone Workers Builds; `src/lib/server/deployBranch.js`). `CF_PAGES_BRANCH`, la de Pages,
  ya no se lee. En `main` (y en local) queda `false` y el modo demo no
  entra en el bundle, igual que hoy.
- **Backups**: `src/lib/server/backup/` (ver [Backups](#backups-de-la-base)).
- **Errores con código**: `handleError` (`src/lib/server/errorLog.js`) deja, por cada error que no
  es un 404, una línea JSON en los logs (`"area":"error"`, con `id`, estado, método, ruta, el
  `cf-ray` del pedido, el mensaje y el principio del stack). La página de un error 5xx muestra ese
  `id` («pasanos este código»): se busca en **Observability → Logs** y aparece el error exacto.
- **Workers Issues** (`[observability.issues]` en `wrangler.toml`): Cloudflare agrupa en
  **Observability → Issues** las excepciones, las invocaciones fallidas (también los `throw` de los
  crons), las respuestas 5xx y los `console.error`. La clave tiene que quedar en el archivo: sin
  ella, la próxima publicación lo apaga. Que alguien se entere es aparte: gorrite arma en el panel
  una automatización de Issues (**Issues → Automations**) hacia un webhook o un chat; mientras no
  esté, los Issues se ven solo entrando al panel. Después de prenderlo, conviene mirar que una
  corrida de cron fallida aparezca ahí.
- **Convención de logs** (para que se encuentren en Observability → Logs y no tapen lo importante
  en Issues): cada línea empieza con el área entre corchetes y en minúsculas (`[backup]`,
  `[recordatorios]`, `[tickets]`, `[mails]`, `[telegram]`, `[auth]`, `[analiticas]`,
  `[sesiones]`, `[conciliacion]`…), en castellano y sin datos de personas (ids sí; mails,
  nombres o tokens nunca). `console.error` solo para lo que alguien tiene que mirar (va a Issues);
  `console.warn` para una degradación que se arregla sola o con un reintento; `console.log` para
  resultados (cuántos mails salieron, qué backup se guardó). Quedan líneas viejas sin corchetes
  (por ejemplo, las de la integridad de los objetos en `scheduled.js`): se pasan al tocarlas.
- **Salud**: `GET /api/health` (`src/routes/api/health/+server.js`) responde un JSON con `ok`, `db`,
  `migrations` y `sha`, sin caché, para un monitor externo o para mirar después de un deploy. `db`:
  la base responde (`SELECT 1`); sin base, 503. `migrations`: `ok` si la base tiene aplicada la
  última migración del código (`__LATEST_MIGRATION__`, la lee vite.config.js de `migrations/` al
  compilar; se mira que esté, no que sea la última, porque la base de producción puede ir
  adelantada), `atrasada` si falta (503; nunca dice cuál) y `sin registro` si la base no tiene
  `d1_migrations` (las locales y las de los E2E, que se migran sin wrangler; no es error). `sha`: el
  commit del build (`WORKERS_CI_COMMIT_SHA`, que pone Workers Builds; vacío en local). No cuenta en
  las visitas (`/api` está excluido en `src/lib/server/analytics/classify.js`).
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
Los secretos como **Secret**, el resto como **Text**. Este es el **inventario** de lo que lee el
código en producción (solo nombres, nunca valores): para qué es, qué pasa si falta y con qué hay
que sincronizarlo al rotarlo. Quién tiene acceso a cada cuenta: ver Mesa.

| Nombre                                                                                                           | Tipo         | Para qué                                                                                    | Si falta                                                                                        | Al rotar                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_CLIENT_ID`                                                                                               | Text         | Login de admin con GitHub (OAuth App).                                                      | Nadie puede entrar al panel con GitHub.                                                         | Va con el secreto (la OAuth App de producción; la de los Previews está en `wrangler.toml`).                           |
| `GITHUB_CLIENT_SECRET`                                                                                           | Secret       | Login de admin con GitHub.                                                                  | Igual que arriba.                                                                               | Generar uno nuevo en la OAuth App, cargarlo y borrar el viejo.                                                        |
| `MP_ACCESS_TOKEN`                                                                                                | Secret       | Cobros con Mercado Pago, reembolsos, conciliación del cron.                                 | Sin Mercado Pago: la compra online no lo ofrece y el webhook no puede leer pagos.               | Panel de MP (credenciales de producción).                                                                             |
| `MP_WEBHOOK_SECRET`                                                                                              | Secret       | Verificar la firma de los webhooks de MP.                                                   | Todo webhook se rechaza (503): los pagos solo entran por la página de estado o la conciliación. | Panel de MP (Webhooks → clave secreta): cambiarla allá y acá a la vez.                                                |
| `RESEND_API_KEY`                                                                                                 | Secret       | Todos los mails.                                                                            | No sale ningún mail; el log dice `falta RESEND_API_KEY` y quedan para reintentar.               | Panel de Resend (API keys).                                                                                           |
| `RESEND_WEBHOOK_SECRET`                                                                                          | Secret       | Rebotes y quejas de Resend ([mails.md](mails.md)).                                          | El webhook contesta 503 y no se registran rebotes.                                              | Panel de Resend (Webhooks).                                                                                           |
| `CRON_SECRET`                                                                                                    | Secret       | Protege `/api/cron/*` (el cron del Worker lo usa por dentro).                               | El cron contesta 503: no salen recordatorios, tandas ni backups manuales.                       | Solo acá (el cron lo lee del mismo Worker).                                                                           |
| `FONDO_MAIL_SECRET`                                                                                              | Secret       | Clave compartida con fondo.kinkyvibe.ar ([mails.md](mails.md), [propinas.md](propinas.md)). | Esos endpoints contestan 401 siempre.                                                           | El mismo valor en el Worker del Fondo, a la vez.                                                                      |
| `TELEGRAM_BOT_TOKEN`                                                                                             | Secret       | El bot de Telegram ([telegram.md](telegram.md)).                                            | El bot no contesta ni manda avisos.                                                             | @BotFather; después `npm run telegram:webhook`.                                                                       |
| `TELEGRAM_WEBHOOK_SECRET`                                                                                        | Secret       | Verificar los pedidos que manda Telegram.                                                   | El webhook del bot contesta 503.                                                                | Volver a registrar el webhook con `npm run telegram:webhook` (si no, Telegram sigue mandando el viejo y todo da 401). |
| `TELEGRAM_BOT_USERNAME`                                                                                          | Text         | Links `t.me/<bot>` del sitio y del panel.                                                   | Sin links al bot ni vínculo de admins.                                                          | —                                                                                                                     |
| `CF_ACCOUNT_ID`, `CF_ANALYTICS_TOKEN`                                                                            | Text, Secret | Leer las visitas ([analiticas.md](analiticas.md)).                                          | Estadísticas → Visitas vacía y sin resumen mensual.                                             | Token nuevo en Cloudflare (solo lectura de Analytics Engine).                                                         |
| `INDEXNOW_KEY`                                                                                                   | Secret       | Avisar a los buscadores ([seo.md](seo.md)).                                                 | No se avisa (nada más).                                                                         | Cualquier clave nueva válida.                                                                                         |
| `SITE_URL`                                                                                                       | Text         | Origen público para links de mails y de MP.                                                 | Se usa el origen del pedido.                                                                    | —                                                                                                                     |
| `TICKETS_CLIENT_SALT`                                                                                            | Secret       | Sal del hash anónimo de los límites anti-abuso.                                             | Se usa una fija que igual rota cada día.                                                        | Cualquier texto largo al azar; cambiarla solo reinicia los contadores del día.                                        |
| `TICKETS_TRANSFER_INFO`                                                                                          | Secret       | Respaldo de los datos para transferir (nunca en el repo).                                   | Se usan los de Ajustes de venta; sin ninguno, no se ofrece transferencia.                       | —                                                                                                                     |
| `TICKETS_FROM_EMAIL`, `TICKETS_REPLY_TO`, `TICKETS_CONTACT_EMAIL`, `TICKETS_MP_FEE_PERCENT`, `FONDO_PERCENT_URL` | Text         | Respaldos de Ajustes de venta ([tickets.md](tickets.md#variables-de-entorno)).              | Los valores por defecto.                                                                        | —                                                                                                                     |
| `TICKETS_PAUSED`, `MAILS_PAUSED`                                                                                 | Text         | Pausas de emergencia ([interruptores.md](interruptores.md#pausas-de-emergencia)).           | Sin pausa (lo normal).                                                                          | —                                                                                                                     |
| `*_ENABLED`                                                                                                      | Text         | Fuerzan un interruptor prendido o apagado ([interruptores.md](interruptores.md)).           | Manda el interruptor del panel.                                                                 | —                                                                                                                     |

Para revisar que no falte nada: `grep -rhoE "env\.[A-Z_]+" src` y los `FLAGS` de
`src/lib/server/flags.js`. Lo que solo existe en desarrollo (`MP_MOCK`, `ADMIN_DEV_MOCK`,
`TICKETS_DEV_*`, `FONDO_PERCENT_OVERRIDE`) no va en producción.

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
> Si hubiera que repetir este paso (por ejemplo, volviendo a Pages y de nuevo al Worker), poné `workers_dev = true`
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
(los envíos no se repiten), pero sobra. La carpeta `workers/cron/` del repo ya se borró (está
en el historial de git).

### 11. Apagar Pages (sin borrarlo todavía)

**Pages kinkyvibe → Settings → Builds → Branch control**: desactivá los deploys automáticos
(producción y previews). Dejá el proyecto un par de semanas por si hay que volver; después
**Settings → Delete project**.

## Ubicación del Worker

La base D1 vive en el este de EE. UU. (ENAM) y no tiene réplicas en Sudamérica. `wrangler.toml` no
tiene `[placement]`, a propósito: el Worker corre en el centro de datos de quien visita (desde
Buenos Aires, EZE). Así la caché de 1 minuto y los archivos responden desde ahí, y cada consulta a
la base que espera a la anterior cruza el continente (~130 ms). Por eso las consultas de un pedido
van en tanda (`src/lib/server/db/autoBatch.js`) y cada página trata de hacer las menos idas en fila
posibles (`Server-Timing`: `d1;desc="N consultas en M idas"`).

Cómo se llegó acá:

- 24/10: `mode = "smart"` mandó los pedidos a San José (oeste de EE. UU.), más lejos de la base;
  desde EE. UU. las páginas pesadas tardaron 0,2–0,5 s más.
- 24/10–25/10: región fija `region = "aws:us-east-1"`, al lado de la base. La página de un evento,
  que entonces hacía ~19 idas en fila, bajó de 1,7 s a ~0,6 s desde Buenos Aires; las livianas
  subieron ~0,1–0,4 s.
- 25/10, con las páginas ya en 2–4 idas: dos horas sin ubicación, medido desde Buenos Aires contra
  las corridas del día con región fija. Inicio 0,87 → 0,38 s, /calendario 0,66 → 0,37 s, /material
  0,40 → 0,23 s, /amigues 0,39 → 0,27 s, wiki 0,51 → 0,38 s, perfil 0,44 → 0,37 s, material igual
  (0,71 → 0,73 s) y evento 0,60 → 0,68 s. gorrite decidió dejarlo sin ubicación (#449 y este PR).

- **Verificar:** sin `[placement]` no hay header `cf-placement`.
- **Medir:** tiempo hasta el primer byte de las mismas páginas desde Argentina
  (`curl -w "%{time_starttransfer}"`) y las idas en `Server-Timing`.
- **Volver a la región fija:** en `wrangler.toml`, `[placement]` con `region = "aws:us-east-1"`, y el
  test de `scheduled.test.js` que lo verifica.

## Caché de 1 minuto para quien no tiene sesión

Decisión [0049](decisiones/0049-cache-de-1-minuto-sin-sesion.md). `worker/index.js` envuelve al
Worker de SvelteKit con `withEdgeCache` (`src/lib/server/edgeCache.js`): las páginas públicas que
pide alguien **sin ninguna cookie del sitio** se guardan 1 minuto en la caché de Cloudflare
(`caches.default`, por centro de datos). Quien tiene sesión (cuenta o admin), o cualquier cookie
que no sea de Cloudflare, siempre recibe la página recién hecha. Las reglas exactas (rutas, query
string, respuestas) están en la decisión y en el archivo.

No va en los hooks con `s-maxage`: el adapter busca en su caché por URL antes de los hooks y le
serviría la página anónima a quien tiene sesión. La clave es propia (`/__kv-edge-cache/<versión del
build><ruta>?<query>`), así que cada deploy empieza de cero. El navegador recibe el mismo
`cache-control` que sin caché (no guarda la página por su cuenta). Los Previews (`workers.dev`) y
local nunca la usan.

- **Verificar:** el header `x-kv-cache` dice `HIT`, `MISS` o `BYPASS`. Hay que pedir HTML con GET
  (`curl -I` hace HEAD y da `BYPASS`):

  ```sh
  # dos veces seguidas: la primera MISS (o HIT), la segunda HIT
  curl -s -o /dev/null -D - -H 'accept: text/html' https://kinkyvibe.ar/calendario | grep -i x-kv-cache
  # con una cookie de sesión (cualquier valor): siempre BYPASS
  curl -s -o /dev/null -D - -H 'accept: text/html' -H 'cookie: kvRincon=x' https://kinkyvibe.ar/calendario | grep -i x-kv-cache
  ```

- **Apagar sin deploy:** en el panel, Worker kinkyvibe → Settings → Variables and Secrets, sumar
  la variable de texto `KV_EDGE_CACHE` = `off` (todo pasa a `BYPASS`). Lo ya guardado vence solo
  en 1 minuto. Para volver a prenderla, borrar la variable.
- **Sacarla del todo:** en `worker/index.js`, llamar a `app.fetch` directo en vez de
  `withEdgeCache`.

## Caché de los archivos estáticos (`_headers`)

Los archivos de `static/` (favicon, íconos, `site.webmanifest`, `og-*.jpg`, `fonts/`) los sirve
Cloudflare sin pasar por el Worker, con `cache-control: public, max-age=0, must-revalidate` por
defecto: el navegador pregunta cada vez. El archivo `_headers` de la **raíz del repo** les pone
`public, max-age=86400` (1 día). Va en la raíz y no en `static/`: el adapter lo copia a
`.svelte-kit/cloudflare/_headers` y le suma sus reglas de `/_app/` (`/_app/immutable/*` por 1 año);
si lo encuentra en `static/`, el build falla.

- **Solo archivos estáticos**: Cloudflare no aplica `_headers` a lo que responde el Worker (páginas,
  rutas, 404), aunque la ruta coincida.
- **Nunca largo ni `immutable`**: esos nombres no llevan hash; un cambio de favicon tarda hasta un
  día en verse. Lo que tiene hash ya está en `/_app/immutable/`.
- **Archivo nuevo en `static/`**: sumarle su regla (o a `DEFAULT_ON_PURPOSE` si debe quedar con el
  header por defecto, como `robots.txt`). Lo chequea `src/lib/server/staticHeaders.test.js`.
- **Verificar:** `curl -sI https://kinkyvibe.ar/favicon.ico | grep -i cache-control`.

## Cuánto tardó: `Server-Timing`

Toda respuesta del Worker lleva `Server-Timing` (`src/lib/server/serverTiming.js`):

- `app;dur=<ms>`: lo que tardó el Worker. En Workers el reloj solo avanza con la entrada y salida
  (la base, la caché, fetch): es casi todo espera; armar el HTML (CPU) no suma acá.
- `d1;dur=<ms>;desc="<n> consultas en <k> idas"`: lo que le pidió el pedido a D1
  (`src/lib/server/d1Timing.js`). `n` cuenta sentencias (`first`, `all`, `run`, `raw`, cada
  sentencia de un `batch`, `exec`) y `k` idas a la base (un `batch` es una sola). `dur` es el tiempo
  con al menos una en camino: las que van a la par no se suman, así que `app` menos `d1` es lo que
  tardó el Worker fuera de la base. Una página servida de la caché da `0 consultas`. Cómo cuenta:
  `worker/index.js` le pasa a SvelteKit el binding `DB` envuelto (el mismo envoltorio para todo el
  isolate) y corre cada pedido con su propio contador en un `AsyncLocalStorage`; no toca las filas
  ni lee el SQL. No cuenta lo que sigue después de responder (`waitUntil`) ni los crons.
- `iso;desc="n=<pedido> age=<s>"`: el número de pedido del isolate (`n=1`: recién arrancado, sin
  las listas en memoria) y hace cuánto atendió el primero.

```sh
curl -s -o /dev/null -D - https://kinkyvibe.ar/ | grep -i -E 'server-timing|x-kv-cache'
```

### Tandas automáticas de D1

En un pedido de lectura (`GET`/`HEAD`), las lecturas (`SELECT`) que salen mientras el Worker no
espera nada más van juntas en una sola ida (`db.batch`), detrás de `getDB`
(`src/lib/server/db/autoBatch.js`). Una lectura igual se lee una vez por pedido; una escritura
manda lo pendiente y olvida lo leído; si la tanda falla, cada consulta se corre sola con su error.
`POST`, crons y scripts no cambian. En `Server-Timing` se ve como menos idas que consultas.

- **Apagar sin deploy:** variable de texto `KV_D1_TANDAS` = `off` en el panel (como
  `KV_EDGE_CACHE`).
- Juntar no saca tandas en fila: lo que depende de una respuesta sale en la tanda siguiente. Para
  bajar de idas, una página tiene que pedir antes (por la dirección en vez de por el id ya leído,
  o adelantando lo que se puede saber).
- Las páginas de un evento y de un material, sin sesión y con el isolate caliente, van en una
  ida: piden las relaciones, la portada y el lugar por la dirección, y adelantan lo demás con lo
  que saben las listas del isolate (`src/lib/server/contenido/adelantar.js`, `peekSitePost`, las
  pistas de `DbState`). Lo de después recibe lo ya leído; si el post cambió, sale aparte. Nunca
  decide qué se muestra.
- Los lugares de los eventos (como los ve cualquiera) y las etiquetas «Parte N de M» se recuerdan
  junto a las listas mientras no cambie la marca del contenido (`fromContentState` en
  `src/lib/server/contenido/posts.js`): `/`, `/calendario` y la wiki no los vuelven a pedir. La
  primera vez en el isolate (o después de un cambio) se piden a la par de la marca, no después.
- **Isolate nuevo o cachés de 30 s vencidas** (`src/lib/server/adelantarPedido.js`): cuando
  `hooks.server.js` tiene que esperar a la base por el árbol de etiquetas, en las páginas públicas
  pide en esa misma ida la marca del contenido, los interruptores y los textos de la vista previa
  que vencieron y, en un isolate recién nacido, las dos consultas con que se arman las listas (los
  posts y a qué perfiles y etiquetas se puede vincular, que ya no se esperan una a la otra); antes
  de los loads arma las listas sin otra ida, así la página adelanta lo suyo. Si a lo recordado le
  quedan menos de 10 s (el árbol, la venta de las tarjetas), se renueva sin esperar con las
  primeras consultas del pedido: con visitas seguidas, ninguna página espera porque venció una
  caché. Nada se recuerda más de 30 s que antes. Resultado (`npm run medir:publico`): 1 ida en
  caliente en todas las páginas públicas, también la primera vez que el isolate ve esa página;
  2 en frío y con las cachés vencidas.
- Para ver cada tanda y quién pidió cada consulta en las pruebas de cuentas:
  `KV_CONSULTAS=detalle npx vitest run --silent=false --disableConsoleIntercept <archivo>`.

Un `curl` sin `-H 'accept: text/html'` nunca usa la caché de 1 minuto (`BYPASS`): mide la página
recién hecha, que es lo que ve quien llega cuando no hay una guardada.

## Volver atrás (rollback)

Si una publicación rompió algo, hay tres caminos, del más rápido al más lento. La base es la misma
en todas las versiones: volver atrás el código no toca los datos.

1. **Volver a la versión anterior del Worker** (necesita la cuenta de Cloudflare): **Workers →
   kinkyvibe → Deployments** → la versión anterior → **Rollback**, o `npx wrangler rollback`.
   Cloudflare guarda las últimas 100 versiones; no cambia los recursos conectados (base, buckets,
   variables) y no deja volver a una versión que usaba un binding que ya no existe. Dura **hasta
   el próximo push a `main`**, que vuelve a publicar lo que haya en `main`: por eso el paso 2 va
   igual.
2. **Revertir el PR en `main`** (lo puede hacer una sesión de noche, sin la cuenta de
   Cloudflare): `git revert -m 1 <sha del merge>` en una rama nueva, PR, CI verde y merge, como
   cualquier otro PR ([decisión 0027](decisiones/0027-merges-de-noche.md)); Workers Builds publica
   solo. Avisarle a gorrite.
3. **Volver la base atrás** solo si el problema fue de datos (un script que borró o pisó filas),
   nunca por un problema de código. Time Travel ([Restaurar un backup](#restaurar-un-backup), a)
   pisa **todo** lo escrito después, ventas y webhooks de Mercado Pago incluidos. Antes: un backup
   manual (`POST /api/cron/backup`, paso 6) y anotar el bookmark que da
   `npx wrangler d1 time-travel info kinkyvibe`, para poder volver y rehacer lo posterior.

**Por qué revertir el código es seguro con la base:** las migraciones solo agregan (tablas,
columnas con nulos o con valor por defecto) y se aplican en producción antes del merge
([decisión 0028](decisiones/0028-migraciones-antes-del-merge.md)). El código anterior no usa lo
nuevo y sigue andando con la base ya migrada. Una migración no se «des-aplica».

**Volver a Pages** (el camino de la migración) ya no es una opción real: Pages está desconectado,
el Worker `kinkyvibe-cron` se borró y el proyecto viejo de Pages queda solo por las dudas
(`cf-dashboard-limpiar` en el plan). Si alguna vez hiciera falta, los pasos eran quitar
`kinkyvibe.ar` del Worker (Settings → Domains & Routes), ponerlo en Pages (Custom domains) y
volver a publicar el Worker del cron desde el historial de git (`workers/cron/`). No ensayar la
vuelta atrás prendiendo `workers_dev`: abriría otra URL pública a producción.

## Lista de verificación

- [ ] Home, `/calendario`, un evento, `/wiki`, un post de `/material`: se ven igual que en Pages.
- [ ] Una URL que no existe muestra la página 404 del sitio.
- [ ] `/rss.xml`, `/calendario.ics`, `/sitemap.xml`, `/robots.txt` y el favicon responden.
- [ ] Imágenes de posts y fuentes cargan (DevTools → Network sin 404).
- [ ] Login de admin con GitHub y el panel `/admin` (solo en kinkyvibe.ar).
- [ ] Página de compra de un evento con entradas (sin comprar de verdad).
- [ ] **Trigger Events → View events**: recordatorios cada 15 minutos con respuesta `{"sent":…,"failed":…}` en los
      logs (**Observability → Logs**, buscar `[recordatorios]`).
- [ ] Al día siguiente: en R2 → `kinkyvibe-backups` → `d1/` hay un archivo de hoy (buscar
      `[backup]` en los logs).
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
  quedó guardado y verificado. **Si borrar los viejos falla, la corrida no falla**: el backup ya
  está guardado, el log dice `[backup] la poda de los backups viejos falló` y la noche siguiente se
  vuelve a intentar (`nightlyBackup` en `src/lib/server/backup/index.js`). El tamaño real de cada
  backup (comprimido y del SQL, en bytes) queda en el log (la línea `[backup]` de cada noche) y
  en los metadatos del archivo (`sqlBytes`); el costo de R2 es cero en la práctica.
- **Memoria:** el SQL se comprime a medida que sale (`streamDatabase` en `backup/dump.js`): en la
  memoria del Worker (128 MB) queda solo lo comprimido, nunca el volcado entero.
- **Además** D1 tiene **Time Travel**: volver la base a cualquier minuto de los últimos 30 días,
  sin hacer nada de antemano.
- **Extra recomendado:** una vez por mes, bajá el último backup a tu compu
  (`npx wrangler r2 object get kinkyvibe-backups/d1/AAAA-MM-DD.sql.gz --remote --file backup.sql.gz`),
  así también hay una copia fuera de Cloudflare. Y, si querés que ni un error humano pueda borrar
  backups, en el bucket se puede activar un **Bucket lock** (R2 → bucket → Settings):
  - `d1/manual/`: sin vencimiento (los manuales nunca se borran solos).
  - `d1/`: **28 días como mucho, nunca 30 o más**. La poda borra los nocturnos a los 30 días; con
    un bloqueo más largo, R2 no la dejaría borrarlos y quedarían para siempre (la corrida igual
    sale bien, pero el log avisaría de la poda todas las noches).
  - Con un bloqueo, lo bloqueado no se puede borrar ni pisar hasta que vence, y el bucket no se
    puede vaciar ni borrar mientras tenga algo bloqueado.

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

En PowerShell, `npm run … -- <args>` pierde el `--` y npm se queda con `--local`: corré el script
directo, `node scripts/d1-restore.js 2026-10-01 --local`. El script llama a wrangler con node, sin
shell, así que en Windows el SQL de las consultas no se parte en los espacios.

**c) Restaurar de verdad un backup viejo → en una base nueva:**

```sh
npx wrangler d1 create kinkyvibe-restaurada
npm run db:restore -- 2026-03-01 --remote --to kinkyvibe-restaurada
```

Después, según el caso: copiar a mano solo las filas que hagan falta (consultando las dos bases),
o pasar el sitio a la base restaurada cambiando el `database_id` de `DB` en `wrangler.toml` por el
de `kinkyvibe-restaurada` (copiado de `npx wrangler d1 list --json`, **nunca a mano**) en un PR.

Detalles del formato: cada tabla se lee de a 500 filas por cursor (por `rowid` o, en las
`WITHOUT ROWID`, por su clave primaria), no por `OFFSET`, así que una escritura durante el
volcado no repite ni saltea filas. `PRAGMA defer_foreign_keys` al principio, las tablas, las filas (enteros
grandes, decimales, textos y BLOBs exactos), después índices, vistas y triggers. Las tablas
virtuales FTS se recrean (con contenido externo, con `'rebuild'`). Los contadores AUTOINCREMENT
siguen desde el id más alto restaurado (D1 no deja escribir `sqlite_sequence`). D1 acepta como
mucho 100.000 bytes por sentencia, y un texto de más de ~45 KB ya los pasaría (el cuerpo de un
objeto viaja dos veces, en `data` y en `search_text`, y una tilde son dos bytes): un INSERT que
pasaría 90.000 bytes sale con sus textos más largos vacíos y después un
`UPDATE … SET col = col || '<trozo>'` por cada trozo de 60.000 bytes como mucho (la fila se ubica
por su `rowid`, o por su clave en una tabla `WITHOUT ROWID`). La sentencia más larga queda anotada
(`maxStatementBytes` en los metadatos del archivo y en las cantidades del final) y
`scripts/d1-restore.js` se niega a restaurar, con un mensaje claro, si pasa de 100.000.

## Después de migrar (PR de limpieza)

- Hecho: borrar `workers/cron/` y actualizar `README.md`, `docs/demo.md` y las guías que
  mencionaban el Worker aparte o Pages.
- Hecho: `CLAUDE.md` ya describe el Worker, y `src/lib/server/deployBranch.js` y
  `scripts/demo/guard.js` ya no leen `CF_PAGES_BRANCH` (solo `WORKERS_CI_BRANCH`).
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
