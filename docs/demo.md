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

## Noche 3 (rama `claude/n3-demo`, no se mergea)

La rama junta main con los PR de la Noche 3 (#131 agenda, #133 propinas, #134 preventas, #137
amigues y lugares, #135 pendientes, #139 personas, #141 series, #142 panel). «Recargar datos de
prueba» además:

- **Prende los interruptores** `cuentas`, `propinas`, `perfiles_publicos`, `personas_eventos`,
  `series` y `borrar_desde_panel` (filas de `feature_flags` en la base del preview; los valores
  por defecto del código no cambian). Se pueden apagar a mano hasta la próxima recarga.
- **Importa las fichas de amigues** del deploy (lo mismo que Contenido → Amigues → Importar) y
  crea perfiles inventados con saveObject() (`src/lib/server/demo/seedProfiles.js`): un lugar
  por nivel de privacidad (vinculados a la Noche Látex de hoy, el próximo munch, el próximo
  taller y la fiesta con preventas), un grupo con su integrante, una ficha con un pedido «Es mi
  perfil» pendiente y un perfil de una cuenta esperando aprobación.
- Carga **preventas** («Fiesta con preventas (demo)»: Preventa 1 llena, Preventa 2 vigente,
  Última tanda encadenada, entradas en la puerta), **gorra con mínimo** (las charlas),
  **propinas** inventadas, **personas con rol** (Noche Látex y talleres, con el rol propio «Cuida
  la puerta»), **preguntas de inscripción** con respuestas (próximo taller) y **suscripciones a
  series** (Picantearla, Cine para Sucixs).

Cada parte se saltea si la base no tiene su migración (0016 a 0021). Los .md de los eventos de
prueba se regeneraron para el 1/10 (`node scripts/demo/seed.js --today=2026-10-01
--write-events`), con `personas:` y las preventas, para que las páginas públicas los muestren.

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
