# Modo demo (deploys de preview)

Sirve para probar el panel de admin en un deploy de preview de Cloudflare Pages (cualquier rama
que no sea `main`) con datos inventados, sin GitHub OAuth (que solo funciona en kinkyvibe.ar) y
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
  `if (PREVIEW_BUILD)`, una constante que se resuelve al compilar desde `CF_PAGES_BRANCH`: en el
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

## Lo que no hace

- No sube imágenes de verdad: el panel sigue mostrando las del deploy.
- No hay GitHub de verdad: los links «ver el commit» llevan a `/api/preview-status`.
- En producción no hace nada: no hay botón, la cookie se ignora y el código no está en el bundle.

## Cómo probar

- Abrí el preview del PR (Cloudflare publica el link en el PR; el chequeo «Cloudflare Pages» →
  Details lleva al deploy en el panel de Cloudflare), entrá a `/login` y tocá «🧪 Entrar como
  admin de prueba».
- `GET /api/preview-status` dice si el entorno está bien armado (base, allowlist de mails) y qué se
  guardó en `demo_files`.
- Para probar como alguien del público: cargá `n3-personas.sql` y `n3-cuentas.sql` en la base del
  preview y tocá «🧪 Entrar como persona de prueba».
- Pruebas: `npx vitest run src/lib/server/demo src/lib/server/tickets/events.demo.test.js` y, para
  la persona de prueba, `npx vitest run "src/routes/(content)/ingresar/demo"`.

## Lo que viene

Decisión 0009: datos de prueba con fechas relativas y un botón «Recargar datos de prueba» en el
panel (solo en previews). Todavía no están en `main`. Hoy un preview se detecta con `CF_PAGES_BRANCH`
(Cloudflare Pages); con la migración a Workers eso puede cambiar: ver
[workers-migracion.md](workers-migracion.md).
