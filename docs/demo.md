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

## Datos de prueba (rama `claude/night-demo-data`, no se mergea)

En `/admin`, el aviso del modo demo tiene **«Recargar datos de prueba»** (con confirmación en
la página). Hace `POST /api/preview-seed` (404 fuera de un preview, 403 sin admin), que en un
solo batch de D1:

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
   salvo por el corrimiento de fechas (mismas personas, montos y órdenes); los ids y tokens de
   las entradas los genera la base.

Las tablas de migraciones del panel que la base no tenga se saltean. Todo es inventado (emails
`@example.invalid`, DNIs 99.xxx.xxx). `node scripts/demo/seed.js` genera el mismo SQL a un
archivo, para aplicarlo a mano.

## Lo que no hace

- No sube imágenes de verdad: el panel sigue mostrando las del deploy.
- No hay GitHub de verdad: los links «ver el commit» llevan a `/api/preview-status`.
- En producción no hace nada: no hay botón, la cookie se ignora y el código no está en el bundle.
