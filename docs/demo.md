# Modo demo (deploys de preview)

Sirve para probar el panel de admin en un deploy de preview de Cloudflare Workers (cualquier
rama que no sea `main`) con datos inventados, sin GitHub OAuth (que solo funciona en kinkyvibe.ar) y
sin tocar el repo.

## Lo que nunca se tiene que romper

- **Nada del modo demo llega a producción**: todo va dentro de `if (PREVIEW_BUILD)` o detrás de
  `isPreviewDeploy()`, y la identidad demo solo es admin en un preview.
- **Un preview nunca commitea al repo ni escribe en la base de producción.** Usa su propia base
  (`kinkyvibe-preview`, ver [datos.md](datos.md)). Los datos de prueba jamás se cargan en
  `kinkyvibe`.
- **Un preview no le manda mails a gente real**: solo a `EMAIL_ALLOWLIST` (ver [mails.md](mails.md)).
- Todo lo nuevo que lea o escriba contenido pasa por `getRepoClient()`, así funciona igual en la
  demo.

## Qué hace

- **Entrar**: en un preview, `/login` (y el encabezado del sitio, si no hay sesión) muestra
  «🧪 Entrar como admin de prueba». Hace `POST /login/demo`, que pone la cookie httpOnly `kvDemo`;
  `hooks.server.js` arma una sesión falsa (login `demo`, nombre «Admin de prueba», id `-1`, que no
  es un id de GitHub). «Cerrar sesión» borra la cookie.
- **Entrar como persona de prueba** (cuentas del público, [cuentas.md](cuentas.md)): con el
  interruptor `cuentas` prendido, el encabezado, `/login` e `/ingresar` llevan a `/ingresar/demo`,
  que deja elegir una cuenta inventada y entrar con un clic, sin código por mail:
  «Persona con entradas» (una entrada aprobada y dos etiquetas y un perfil seguidos), «Persona que
  gestiona un perfil» (dueñe de «Persona de Prueba») y «Cuenta recién creada» (nada). Las crea
  `scripts/demo/n3-cuentas.sql` (después de `n3-personas.sql`; también prende `cuentas`).
  Mismas reglas que el admin de prueba: la página y su action dan 404 si no es
  `isPreviewDeploy()`. Además, solo entra a esas cuentas: la persona se elige por una clave (nunca
  por un id o un mail que mande el navegador) y la cuenta tiene que estar en la base con el id y
  el mail `@example.invalid` de `src/lib/server/demo/personas.js` y la marca
  `preferences.datos_de_prueba` que pone el seed. La sesión es la normal de las cuentas
  (`startSession`, método `code`); «Cerrar sesión» en Mi rincón la cierra.
- **Permisos**: `isAdmin` (`src/lib/server/auth.js`) acepta esa identidad **solo si
  `isPreviewDeploy()`**. Además, el bloque de `hooks.server.js` y el cliente demo están dentro de
  `if (PREVIEW_BUILD)`, una constante que se resuelve al compilar desde `WORKERS_CI_BRANCH`: en el
  build de producción (y en local) esas ramas se eliminan y nada importa el módulo demo.
- **Contenido**: en un preview, `getRepoClient()` (`src/lib/server/eventos/index.js`) devuelve el
  cliente demo (`src/lib/server/demo/client.js`) en vez de GitHub, **sea quien sea que esté
  logueade**: desde un preview nunca se commitea al repo. Los «commits» (crear, editar o duplicar
  eventos, editar posts, y lo que se agregue usando `getRepoClient()`) se guardan en la tabla
  `demo_files` de la base del preview.
- **Lecturas**: primero `demo_files`; si el archivo no está ahí, el archivo tal como está en el
  deploy (los `.md` de `src/lib/posts` se empaquetan como texto en el Worker del preview, con
  `import.meta.glob`, ver `src/lib/server/demo/bundle.js`). La lista de eventos del panel y los
  datos de los selectores de etiquetas/organizadores también suman lo de `demo_files`.
  La configuración de entradas (`src/lib/server/tickets/events.js`: venta, puerta, panel de
  entradas) también: un evento creado, editado o borrado en la demo vende (o deja de vender)
  según `demo_files`. Las páginas públicas siguen leyendo el contenido del deploy.
- **Aviso**: en `/admin` y `/edit` se ve «Modo demo: los cambios se guardan solo en la base de
  prueba».

## La tabla `demo_files`

No es una migración numerada (producción no la tiene): se crea sola la primera vez que se usa
(`CREATE TABLE IF NOT EXISTS`, ver `src/lib/server/demo/overlay.js`). Una fila por archivo
(última versión): `path`, `content`, `encoding` (`utf-8`; `binary` para imágenes subidas, sin
guardar el contenido; `ref` para copias de un archivo del deploy), `deleted`, `author`,
`message`, `updated_at`.

`GET /api/preview-status` (solo en previews) muestra cuántas filas hay en las tablas principales
y los últimos cambios guardados en modo demo. Para empezar de cero:
`DELETE FROM demo_files;` en la base del preview.

## Datos de prueba: «Recargar datos de prueba»

En un preview, para admins, el aviso del modo demo en `/admin` tiene **«Recargar datos de
prueba»** (con confirmación en la página; `src/lib/components/admin/DemoReload.svelte`). Hace
`POST /api/preview-seed` (404 fuera de un preview, 403 sin admin), que en un solo batch de D1:

1. **Borra** los datos de prueba anteriores, y nada más: los eventos `demo-*` y lo que cuelga de
   ellos (órdenes, entradas, recordatorios, links de transmisión, avisos por mail, códigos del
   evento, sus archivos en `demo_files`, entradas del registro de actividad sobre esos eventos u
   órdenes), las filas que puso el seed (`seed-demo`) y la «última visita» del admin de prueba.
   Los ajustes o códigos que alguien guardó a mano no se pisan.
2. **Carga** todo de nuevo relativo a este momento (`src/lib/server/demo/seed.js`): un evento hoy
   a la noche (Noche Látex) con la puerta andando, eventos que vienen, eventos pasados con
   ingresos para las estadísticas, transferencias que vencen en unas horas, pagos para revisar,
   actividad reciente y «desde tu última visita». Los eventos van a `demo_files` (con el slug de
   la fecha que les toca); los `demo-*.md` del deploy de otras fechas se tapan. Es determinístico
   salvo por el corrimiento de fechas (mismas personas, montos y órdenes).
3. **Prende los interruptores** de `N3_FLAGS` (`cuentas`, `propinas`, `perfiles_publicos`,
   `personas_eventos`, `series`, `borrar_desde_panel`, `etiquetas_db`, `contenido_db`,
   `lo_que_sigo`) en la base del preview; los valores por defecto del código no cambian. Se pueden
   apagar a mano hasta la próxima recarga.
4. Carga lo de la Noche 3 en adelante: perfiles inventados con saveObject()
   (`src/lib/server/demo/seedProfiles.js`: un lugar por nivel de privacidad, un grupo con su
   integrante, una ficha con un pedido «Es mi perfil» pendiente y un perfil de una cuenta
   esperando aprobación), preventas, gorra, propinas, personas con rol, preguntas de inscripción
   y suscripciones a series. Además importa las fichas de amigues del deploy (lo mismo que
   Contenido → Amigues → Importar).
5. **«Sucede en»**: desde la migración 0035 es el edge `lugar` del evento, así que cada lugar de
   prueba se vincula a la próxima fecha de su serie **solo si ese evento está en la base**
   (importado desde Contenido → En la base); si no, se saltea (la respuesta dice cuántos vinculó
   en `venuesLinked`). Nunca pisa el lugar que un evento ya tenga.

Cada parte se saltea si la base no tiene su migración. Todo es inventado (emails
`@example.invalid`, DNIs 99.xxx.xxx). `node scripts/demo/seed.js` genera el mismo SQL a un
archivo (`--all` suma las tablas del panel, `--chunks=dir` lo parte para la API de D1), para
aplicarlo a mano **solo** a la base de un preview o a la local.

Además, en un preview la página de error muestra el mensaje del error (`handleError` en
`src/hooks.server.js`), para diagnosticar sin los logs de Cloudflare. En producción
`handleError` no existe y SvelteKit usa el suyo, como siempre.

## Cómo se bloquea en producción

Todo el modo demo depende de la rama que se compila (`__DEPLOY_BRANCH__`, de `WORKERS_CI_BRANCH`
o `CF_PAGES_BRANCH`; `src/lib/server/deployBranch.js`). No hay variable de entorno que lo prenda:
en el build de producción (rama `main`), en local y en los tests, `PREVIEW_BUILD` es `false`, el
seed y el botón quedan fuera del bundle y `/api/preview-seed` da 404 aunque se carguen variables
en el panel. Lo verifica CI:

- `src/lib/server/demo/demoGuard.test.js` (corre en `npx vitest run`): el endpoint da 404 fuera
  de un preview para cualquier admin y con cualquier variable; el seed solo se importa dentro de
  `if (PREVIEW_BUILD && isPreviewDeploy())` y el botón dentro de `if (PREVIEW)`; todo mail y URL
  que inventa el seed (y lo de `scripts/demo/`) es de un dominio reservado (`example.invalid`,
  `example.com`…); `wrangler.toml` no tiene variables de producción que finjan la rama o prendan
  algo «demo»/«preview», y los previews nunca usan la base `kinkyvibe`.
- `node scripts/demo/guard.js bundle .wrangler/dry-run/index.js` (job `e2e`): el Worker
  empaquetado sin rama de deploy (como producción) no trae el seed ni el botón.
- `node scripts/demo/guard.js posts` (job `unit`, en los PR contra `main` y en `main`): no hay
  eventos de prueba (`.md` con la marca del seed) entre los posts.

## La demo (rama `demo`)

`demo-kinkyvibe.<subdominio>.workers.dev` es el preview de Workers Builds de la rama `demo`:
mismo Worker, misma base de prueba (`kinkyvibe-preview`) que los demás previews. Todo el código de
arriba ya está en `main`, así que la rama `demo` solo agrega:

- los PR abiertos que se quieren mostrar, mergeados encima de `main`;
- los `.md` de los eventos de prueba (`src/lib/posts/calendario/demo-*.md`), para que las páginas
  públicas (que leen el contenido del deploy) los muestren. Nunca van a `main` (lo frena CI).

Para ponerla al día (sin reescribir la historia de `demo`):

```sh
git fetch origin
git switch demo && git merge --ff-only origin/demo
git merge origin/main
git merge origin/claude/<pr-a-mostrar>   # los que hagan falta
node scripts/demo/seed.js --today=AAAA-MM-DD --write-events
git add -A src/lib/posts/calendario
git commit -m "demo: eventos de prueba al AAAA-MM-DD"
git push origin demo
```

`--write-events` borra los `demo-*.md` que tengan la marca del seed y escribe los de esa fecha.
Después del deploy, entrá como admin de prueba y tocá «Recargar datos de prueba» (en cualquier
otro preview anda igual, sin los `.md`: solo que las páginas públicas no muestran los eventos).
Nunca se aplica nada de esto a la base `kinkyvibe`.

## Lo que no hace

- No sube imágenes de verdad: el panel sigue mostrando las del deploy.
- No hay GitHub de verdad: los links «ver el commit» llevan a `/api/preview-status`.
- En producción no hace nada: no hay botón, la cookie se ignora y el código no está en el bundle.

## Cómo probar

- Abrí el preview del PR (Cloudflare publica el link en el PR; el chequeo «Workers Builds:
  kinkyvibe» → Details lleva al build en el panel de Cloudflare), entrá a `/login` y tocá «🧪 Entrar como
  admin de prueba».
- `GET /api/preview-status` dice si el entorno está bien armado (base, allowlist de mails) y qué se
  guardó en `demo_files`.
- Para probar como alguien del público: cargá `n3-personas.sql` y `n3-cuentas.sql` en la base del
  preview y tocá «🧪 Entrar como persona de prueba».
- Pruebas: `npx vitest run src/lib/server/demo src/routes/api/preview-seed
src/lib/server/tickets/events.demo.test.js` y, para la persona de prueba,
  `npx vitest run "src/routes/(content)/ingresar/demo"`.
