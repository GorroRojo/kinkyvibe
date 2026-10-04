# Objetos: "todo es un objeto"

## Qué es

A largo plazo, todo lo que muestra el sitio (eventos, lugares, perfiles, material, series…) va a
ser un **objeto** guardado en la base D1, conectado con otros por **relaciones** (edges): un
evento está en un lugar, una edición pertenece a una serie, una persona organiza un evento. Es
la idea de un grafo, como Obsidian o Anytype.

La decisión de gorrite (30/9) es **núcleo en código, extras desde el panel**:

- Los **tipos núcleo** (evento, lugar, perfil, tipos de entrada, órdenes…) se definen en código,
  con sus campos, sus reglas y sus pantallas propias.
- Desde el panel, más adelante, solo se **agregan** campos extra a esos tipos y tipos simples
  (texto, número, fecha, lista, link). Nada de dinero ni lógica desde el panel.

**Hoy existe solo la base** (migración `0012_objetos.sql` y `src/lib/server/objects/`), con dos
tipos de ejemplo, `evento` y `lugar`, y el primer tipo en uso: `perfil` (perfiles de las
cuentas, ver abajo y [cuentas.md](cuentas.md)). Los eventos siguen siendo archivos `.md`
([contenido.md](contenido.md)); ninguna página pública usa objetos todavía.

## Lo que nunca se tiene que romper

1. **Un solo camino de escritura: `saveObject()`** (`src/lib/server/objects/save.js`). Nadie más
   hace `INSERT`, `UPDATE` o `DELETE` sobre `objects`, `edges` u `object_types`. El test
   `writePath.test.js` recorre el código y falla si aparece otro. Si necesitás escribir algo
   nuevo (historial, auditoría, tablas de apoyo), va dentro de la misma tanda de `saveObject()`:
   la opción `also(self)` recibe cómo encontrar el objeto (`id` al editar; `type` y `slug` al
   crear, porque el id todavía no existe) y devuelve sentencias sobre tablas de apoyo (nunca
   sobre `objects`, `edges` u `object_types`). Si una falla, no se guarda nada.
   `created_by` no cambia al editar; la única excepción es la opción `createdBy`, que usa el
   borrado de una cuenta para dejar sus perfiles con un autore neutro (`cuenta:borrada`).
2. **Un solo lugar decide quién ve qué:** `src/lib/server/objects/visibility.js`. Toda lectura
   (página, listado, búsqueda, sitemap, RSS, imágenes para compartir, JSON…) usa `canSee()` o
   `visibleWhere()`, que salen de la misma tabla. Las reglas:
   - **visible por defecto** (`public`), **oculto a pedido** (`hidden`: lo ven les admins y quien
     lo creó, `created_by`; nadie más, aunque tenga cuenta). En los perfiles
     (`NO_CREATOR_ACCESS`), haberlo creado no da acceso: quién lo gestiona cambia, y eso lo decide
     `profile_managers` ([cuentas.md](cuentas.md));
   - `members`: solo personas con cuenta (y admins);
   - borrado: nadie (tampoco quien lo creó), salvo admins que lo buscan para deshacer;
   - si algo no se puede ver, se responde como si no existiera (nunca "prohibido");
   - ante la duda (rol o visibilidad desconocidos), no se muestra;
   - una relación solo se muestra si se pueden ver **los dos** extremos (`getEdges`);
   - `visibleWhere()` devuelve `{ sql, params }`: el id de quien mira va como parámetro (`?` sin
     número), nunca pegado en el SQL;
   - `created_by` y `updated_by` solo los ven les admins: `getObject`, `searchObjects` y
     `getEdges` los devuelven vacíos a cualquier otre (`forViewer()` en `read.js`), para que
     nada vincule dos objetos por quién los creó (por ejemplo, dos perfiles de una misma cuenta).
     La regla "quien lo creó ve su oculto" se aplica antes, con la fila completa.
3. **Nunca se pisa un cambio en silencio.** Cada objeto tiene `version`. Para editar hay que
   mandar la versión que se abrió; si alguien guardó en el medio, `saveObject()` tira
   `VersionConflictError` (409: "Alguien más guardó cambios mientras editabas…") y no guarda
   nada. Además, un trigger de la base exige que cada `UPDATE` suba `version` en exactamente 1:
   aunque dos guardados se crucen, el segundo aborta su tanda entera.
4. **Las relaciones son edges con foreign keys, nunca ids dentro del JSON.** `edges.from_id` y
   `edges.to_id` apuntan a `objects(id)` con `ON DELETE CASCADE`. D1 aplica las foreign keys
   siempre (`PRAGMA foreign_keys = OFF` no tiene efecto); para cargar en cualquier orden dentro
   de una tanda se usa `PRAGMA defer_foreign_keys = on`, que igual controla todo al final.
5. **Borrar es suave** (`deleted_at`, se deshace). Los edges quedan, para poder deshacer. La
   purga definitiva (que se lleva los edges) todavía no existe.
6. **Los ids no se reusan** (`AUTOINCREMENT`): un edge, una revisión o una redirección vieja nunca
   puede terminar apuntando a otro objeto.
7. **La migración es solo para agregar**, como todas ([datos.md](datos.md)). Los cambios de
   campos siguen reglas propias (ver abajo).

## El modelo

| Tabla            | Qué guarda                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `object_types`   | los tipos que existen: `core` (del código; `saveObject()` los da de alta solo) o `panel` (más adelante)                                                  |
| `objects`        | un objeto: `type`, `slug` (único por tipo), `title`, `data` (JSON con los campos), `visibility`, `version`, quién y cuándo lo creó y editó, `deleted_at` |
| `edges`          | una relación: `from_id` → `to_id`, con `kind` (`lugar`, `serie`…), `position` (orden) y `data` opcional (por ejemplo, el rol)                            |
| `integrity_runs` | resultado de cada chequeo nocturno (ver abajo), para "Para revisar"                                                                                      |
| `objects_fts`    | índice de búsqueda (FTS5, sin tildes) sobre `title` y `search_text`; lo mantienen triggers                                                               |

- `data` es un JSON validado en código por el tipo. Las claves que el tipo no conoce se rechazan
  (así un campo que se deja de usar aparece en el chequeo nocturno en vez de quedar escondido).
- `search_text` lo arma el tipo al guardar (`searchText`), para buscar por más que el título.
- Si un campo de `data` se usa para filtrar u ordenar mucho, se "promueve" a columna con una
  migración (columna generada + índice), nunca a mano. SQLite tiene un límite de columnas por
  tabla: no se promueve todo.

## Dónde está el código

| Qué                                         | Dónde                                                                                               |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Esquema                                     | `migrations/0012_objetos.sql`                                                                       |
| Guardar (crear, editar, borrar, relaciones) | `src/lib/server/objects/save.js` → `saveObject()`                                                   |
| Leer y buscar                               | `src/lib/server/objects/read.js` → `getObject()`, `searchObjects()`                                 |
| Relaciones                                  | `src/lib/server/objects/edges.js` → `getEdges()`                                                    |
| Visibilidad                                 | `src/lib/server/objects/visibility.js`                                                              |
| Tipos núcleo y su registro                  | `src/lib/server/objects/types/` (`evento.js`, `lugar.js`, `perfil.js`, `etiqueta.js`, `index.js`)   |
| Clases de campo (texto, fecha, link…)       | `src/lib/server/objects/fields.js`                                                                  |
| Chequeo de integridad                       | `src/lib/server/objects/integrity.js`; fila del Inicio: `integrityReviewRow()` en `admin/inicio.js` |
| Errores (`code`, `status`, mensaje)         | `src/lib/server/objects/errors.js`                                                                  |

Todo usa imports relativos (sin `$lib`): el cron nocturno lo importa sin pasar por Vite.

## Chequeo nocturno

Todas las noches, **después del backup** (`src/lib/server/scheduled.js`),
`checkObjectsIntegrity()` revisa y **no arregla nada**. `findIntegrityProblems()` es una función
pura (recibe filas, devuelve problemas) y se prueba sin base. Encuentra:

| Código                 | Qué significa                                                                    |
| ---------------------- | -------------------------------------------------------------------------------- |
| `unknown_type`         | un objeto de un tipo que no está en el código ni es del panel                    |
| `type_not_registered`  | un objeto de un tipo que no está en `object_types`                               |
| `type_origin_mismatch` | un tipo núcleo que ya no está en el código, o uno del panel con nombre de núcleo |
| `invalid_data`         | datos que el código de hoy ya no acepta (JSON roto, campo que ya no existe…)     |
| `invalid_visibility`   | una visibilidad desconocida                                                      |
| `dangling_edge`        | una relación con un extremo que no existe                                        |
| `invalid_edge`         | una relación que el tipo no tiene, o hacia un tipo que no corresponde            |
| `too_many_edges`       | más relaciones de las permitidas (por ejemplo, dos lugares)                      |
| `orphan`               | un objeto vivo sin una relación obligatoria                                      |
| `fts_out_of_sync`      | el índice de búsqueda no coincide con los objetos                                |

**El chequeo nunca hace fallar el cron** (el backup queda como bueno igual). Guarda cada corrida
en `integrity_runs` (las últimas 30; de cada una, el total y los primeros 50 problemas: código,
ids, tipo y slug, sin datos de personas) y escribe en el log los códigos y los ids. Si la última
corrida encontró algo, el Inicio del panel muestra en **Para revisar** una sola fila, "Chequeo
nocturno: N problemas en los datos", que se despliega con cada código y slug. Si el chequeo mismo
falla, queda en el log y el cron sigue. Si la base todavía no tiene la migración 0012, no hace nada
(y el Inicio no muestra nada). Hoy carga todos los objetos en memoria: alcanza para miles; si
pasan de ~20.000, hay que pasar los chequeos de relaciones a SQL.

Arreglo del índice de búsqueda: `INSERT INTO objects_fts (objects_fts) VALUES ('rebuild');`
(primero en la local o en preview).

## Backups

`objects_fts` es una tabla virtual (FTS5) con contenido externo. El backup
(`src/lib/server/backup/dump.js`) **no copia sus tablas sombra** (`objects_fts_data`, `_idx`,
`_docsize`, `_config`): crea la tabla vacía, carga `objects` y al final corre `'rebuild'`, después
de los triggers (que así no se disparan al restaurar). `wrangler d1 export` no sirve acá porque no
soporta tablas virtuales. El test `src/lib/server/objects/backup.test.js` hace la ida y vuelta
completa con el esquema real.

## Cómo probar

```sh
npx vitest run src/lib/server/objects src/lib/server/backup src/lib/server/scheduled.test.js
npm run db:migrate:local   # aplica 0012 en tu compu
npx wrangler d1 execute kinkyvibe --local --command "SELECT id, type, slug, version FROM objects"
```

La migración **no se aplica a mano** en preview ni en producción desde un PR: eso lo hace gorrite
cuando corresponde ([datos.md](datos.md)).

## Tipos núcleo

### `perfil`

Una persona o un proyecto con cuenta (decisión A2). Archivo: `src/lib/server/objects/types/perfil.js`.
Reglas de quién lo gestiona y lo edita: `src/lib/server/cuentas/perfiles.js` y
[cuentas.md](cuentas.md) («Perfiles»).

| Campo          | Clase      | Notas                                                                                             |
| -------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| (`title`)      | —          | el nombre; no hay "nombre para mostrar" aparte (E1)                                               |
| `kind`         | `option`   | `persona` o `proyecto`, obligatorio; no cambia después de crear (lo controla `perfiles.js`)       |
| `bio`          | `longtext` | presentación, hasta 1000 caracteres                                                               |
| `pronouns`     | `text`     | hasta 40 caracteres                                                                               |
| `links`        | `list`     | hasta 8; solo `https://` o `http://`, sin usuario ni contraseña, hasta 300 caracteres cada uno    |
| `avatar`       | `text`     | sin uso: la imagen del perfil es el edge `avatar` hacia una `imagen` ([imagenes.md](imagenes.md)) |
| `show_members` | `boolean`  | solo proyectos: mostrar integrantes (solo los perfiles que quien mira puede ver)                  |

- `proyecto` antes se llamaba `grupo` (migración `0023_perfil_proyecto.sql`). El valor viejo se
  sigue aceptando: se lee como `proyecto` (`normalizeProfileKind`/`profileKindOf`) y el
  `normalize` del tipo lo corrige antes de validar, así una fila vieja se guarda ya como `proyecto`.
- Relación saliente `es_integrante_de` → `perfil`: de una persona a un proyecto, sin `data`. La
  suma quien gestiona el proyecto y la saca la persona (o el proyecto). Que el origen sea persona
  y el destino proyecto lo controla `perfiles.js` (el registro solo sabe de tipos, no de `kind`).
- Quién gestiona cada perfil NO está en el objeto: va en la tabla de apoyo `profile_managers`
  (migración `0014_perfiles.sql`), porque las cuentas no son objetos. Esa tabla nunca se muestra
  fuera de Mi rincón de quienes gestionan.
- Las lecturas de gestión de `perfiles.js` (mis perfiles, un perfil que gestiono) leen `objects`
  unidas a `profile_managers` sin `visibleWhere()`: la condición de acceso es esa unión (quien
  gestiona un proyecto oculto lo tiene que poder editar). Todo lo que ve el público u otra cuenta
  pasa por `getObject`/`getEdges`.
- Lugares (B3) y fichas de amigues importadas: `kind` también puede ser `lugar`, y el tipo suma
  los campos de las fichas (`body`, `pronouns_url`, `link_text`, contacto, `tags`, `authors`,
  imágenes y fechas de la ficha vieja, `unlisted`) y los de lugar (`address`, `area`, `city`,
  `lat`, `lng`, `accessibility`, `how_to_get_there`, `venue_privacy`; solo para lugares). Ver
  [amigues.md](amigues.md).

### `evento`

Los eventos de calendario (paso 5 de 0026), con los mismos nombres de campo que el frontmatter de
los `.md` (`summary`, `status`, `start`, `end`, `link`, `tags`, `authors`, `featured`,
`location`…; `force_unlisted` → `unlisted`, `force_unpublished` → visibilidad `hidden`). Lo que el
tipo todavía no conoce va tal cual en `extra` (clase `json`, solo para tipos núcleo). Columnas
generadas e índices (migración `0031`): `start_at`, `end_at` (ms), `event_status`, `unlisted`. La
importación, la lectura (solo la base) y el historial (`object_revisions`):
[contenido.md](contenido.md) («En la base»).

### `imagen`

Una imagen de la biblioteca (archivo en R2, binding `MEDIA`). Cada uso es un edge HACIA ella:
evento → `portada`, material → `portada`, etiqueta (serie) → `imagen`, perfil → `avatar` (uno por
objeto). Archivo: `src/lib/server/objects/types/imagen.js`; todo el detalle en
[imagenes.md](imagenes.md).

### `etiqueta`

Las etiquetas del sitio (paso 3 de 0026), con su texto de la wiki como cuerpo y relaciones
`hijo_de`, `relacionada_con` y `alias_de`. Archivo: `src/lib/server/objects/types/etiqueta.js`;
todo el detalle (campos, el índice único de `key`, la tabla `tag_sources`) en
[etiquetas.md](etiquetas.md).

## Tareas comunes

### Agregar un tipo núcleo

1. Creá `src/lib/server/objects/types/<tipo>.js` copiando `lugar.js`. La clave (`type`) va en
   minúsculas, sin espacios ni tildes, y **no se cambia nunca**; el nombre para mostrar (`label`)
   sí.
2. Declará los campos (`fields`) con las clases de `fields.js`, las relaciones salientes (`edges`:
   hacia qué tipos, `max`, `required`), reglas entre campos (`check`) si hacen falta y
   `searchText`. Si un valor de opción cambia de nombre, `normalize` traduce el viejo antes de
   validar (como `grupo` → `proyecto` en `perfil.js`), además de la migración de los datos.
3. Sumalo a `createRegistry([...])` en `types/index.js`. El registro verifica al importarse que
   las relaciones apunten a tipos que existen.
4. Pruebas en `types/types.test.js`: datos válidos, inválidos y las reglas propias.
5. No hace falta migración: `saveObject()` da de alta el tipo en `object_types` la primera vez.
   Sí hace falta migración si el tipo necesita tablas de apoyo (por ejemplo, órdenes) o columnas
   promovidas.
6. Si el tipo tiene datos que no pueden ser públicos, pensá su visibilidad por defecto con
   gorrite **antes** de mostrarlo en ningún lado.

### Cambiar los campos de un tipo núcleo

- **Renombrar** un campo: cambiá su `label`, no su clave.
- **Sacar** un campo: los objetos viejos lo siguen teniendo y el chequeo nocturno los marca
  (`invalid_data`). Primero una migración de datos que lo quite (o lo pase a otro campo), después
  el código.
- **Cambiar la clase** de un campo (texto → fecha): campo nuevo + conversión con vista previa;
  nunca reinterpretar el viejo.
- **Agregar** un campo opcional: directo. Uno obligatorio: primero opcional, completar los
  objetos existentes, después obligatorio.

### Leer objetos en una página (cuando llegue)

Siempre con un `viewer` (`ANON`, `{ role: 'member', id }` o `{ role: 'admin', id }`) y siempre
con `getObject`, `searchObjects`, `getEdges` o `visibleWhere(viewer, alias)` en tu `WHERE` (con sus `params`). Nunca
`SELECT … FROM objects` sin la condición de visibilidad.

## Pendiente (fase 2, en sus propios pasos)

- Historial de revisiones (decisión P6.8: todo, para siempre) y registro en `admin_audit`, dentro
  de la tanda de `saveObject()`.
- Redirecciones 301 al cambiar un slug (P6.4).
- Purga definitiva de lo borrado.
- Campos extra y tipos simples desde el panel (`object_types.origin = 'panel'`).
- Una prueba E2E que plante objetos privados de cada tipo y verifique que no aparecen en
  listados, búsqueda, sitemap, RSS, imágenes para compartir ni JSON.
- Migrar los eventos desde los `.md` (P6.2: eventos primero).
