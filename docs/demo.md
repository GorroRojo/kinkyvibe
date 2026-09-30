# Modo demo (deploys de preview)

Sirve para probar el panel de admin en un deploy de preview de Cloudflare Pages (cualquier rama
que no sea `main`) con datos inventados, sin GitHub OAuth (que solo funciona en kinkyvibe.ar) y
sin tocar el repo.

## Qué hace

- **Entrar**: en un preview, `/login` (y el encabezado del sitio, si no hay sesión) muestra
  «🧪 Entrar como admin de prueba». Hace `POST /login/demo`, que pone la cookie httpOnly `kvDemo`;
  `hooks.server.js` arma una sesión falsa (login `demo`, nombre «Admin de prueba», id `-1`, que no
  es un id de GitHub). «Cerrar sesión» borra la cookie.
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
