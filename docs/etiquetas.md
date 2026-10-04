# Etiquetas

## Qué es

Las etiquetas ordenan todo el sitio: los eventos, el material, les amigues y la Kinkipedia (la
wiki) las nombran en su `tags:`. Viven en la base (objetos `etiqueta`) y se editan desde
`/admin/etiquetas`, que guarda en la base al momento. El archivo `src/lib/utils/hardcodedTags.js`
queda solo como respaldo de lectura (sin base, o con la base sin etiquetas) y ya no se edita desde
el panel. El paso 3 del plan ([decisión 0026](decisiones/0026-orden-1-10.md),
«Etiquetas a objetos») las pasa a la base, como objetos ([objetos.md](objetos.md)).

El diseño es de gorrite:

- una etiqueta es un objeto de tipo `etiqueta`, con relaciones `hijo_de` (varias madres: es un
  grafo, no un árbol), `relacionada_con` y `alias_de`;
- el texto de la wiki es el cuerpo de la etiqueta: cada etiqueta es un nodo central (wiki,
  eventos, material y amigues);
- las series son etiquetas hijas de «evento recurrente», con imagen ([0005](decisiones/0005-series-lugares-roles-campos.md)).

La referencia del modelo es TagStudio ([0011](decisiones/0011-etiquetas.md)).

## Cómo va

Se hace en PRs chicos, uno arriba del otro:

1. **El tipo `etiqueta`** (este documento, migración `0029_etiquetas.sql`). Nada lo usa todavía.
2. Importar el archivo y los textos de la wiki a la base (panel y `npm run tags:import`).
3. Leer las etiquetas de la base detrás del interruptor `etiquetas_db`, y editarlas en el panel
   guardando en la base.
4. Arreglos de series (editar, imagen, páginas y listado en la Kinkipedia).
5. Todo lee de la misma fuente, y renombrar en la base elige entre reescribir las publicaciones o
   dejar un alias.

## Lo que nunca se tiene que romper

1. **Los posts nombran las etiquetas por su `key`**, el texto exacto de hoy («Rancheadita Kinky»,
   con mayúsculas, tildes y espacios). Cambiar un `key` es renombrar la etiqueta: es una operación
   aparte (`/admin/etiquetas` › Renombrar, o el nombre de la etiqueta en Eventos → Series ›
   Editar), ver «Renombrar» abajo.
2. **Un `key` por etiqueta viva.** Lo garantiza el índice único `objects_etiqueta_key`
   (migración 0029). Distingue mayúsculas: «Dominatrix» y «dominatrix» son dos etiquetas (hoy la
   primera es alias de la segunda).
3. **Las direcciones públicas no cambian.** `/wiki/<etiqueta>` sigue usando la forma de
   `tagSlug()` (espacios → guiones) y `resolveTagSlug()` (`src/lib/utils/tagSlug.js`). El `slug`
   del objeto es solo interno.
4. Se escribe solo con `saveObject()`, como todo objeto.

## El tipo `etiqueta`

Archivo: `src/lib/server/objects/types/etiqueta.js`.

| Campo          | Clase      | Qué es hoy en `hardcodedTags.js` / la wiki                                        |
| -------------- | ---------- | --------------------------------------------------------------------------------- |
| (`title`)      | —          | `visible_name`, o el `id` si no tiene                                             |
| `key`          | `text`     | `id`: el nombre en los posts. Obligatorio, una línea, sin corchetes               |
| `icon`         | `text`     | `icon` (un emoji)                                                                 |
| `color`        | `text`     | `color`: `darkblue`, `#ff4444` o `var(--3-dark)` (nada más, va dentro de `style`) |
| `description`  | `longtext` | `description`, con `[[enlaces]]` a otras etiquetas                                |
| `image`        | `text`     | `image` (series): un archivo de `src/lib/assets` o la imagen de un evento         |
| `body`         | `longtext` | el cuerpo del `.md` de la wiki (markdown, con `[[enlaces]]`)                      |
| `wiki_title`   | `text`     | `title` del `.md` de la wiki                                                      |
| `wiki_summary` | `longtext` | `summary` del `.md` de la wiki                                                    |
| `wiki_authors` | `list`     | `authors` del `.md` de la wiki                                                    |

| Relación          | Hacia    | Qué es hoy                                                                     |
| ----------------- | -------- | ------------------------------------------------------------------------------ |
| `hijo_de`         | etiqueta | estar en los `children` de otra; `data.orden` es su lugar en esa lista         |
| `relacionada_con` | etiqueta | `related` declarado en esta etiqueta (al leer, se muestra en los dos sentidos) |
| `alias_de` (1)    | etiqueta | `aliasOf`, o estar en el `aka` de otra                                         |

Un **alias** es una etiqueta con solo `key` y un edge `alias_de`. Que no tenga más datos lo
controla quien guarda (el importador y el editor), no el tipo.

Visibilidad: como todo objeto, `public` por defecto. Una etiqueta `hidden` no se ve en el sitio.

`tag_sources` (migración 0029) es la tabla de apoyo del importador (paso 2): de qué entrada del
archivo salió cada etiqueta, con qué hash y en qué versión, para no pisar lo editado en el panel.

## Importar (paso 2)

`src/lib/server/etiquetas/importer.js` pasa el archivo (`hardcodedTags.js`) y los textos de la
wiki (`src/lib/posts/wiki/*.md`, el cuerpo de la etiqueta de su `wiki:`) a objetos. Mismo patrón
que amigues:

- **Idempotente**, por `tag_sources.source_key`: sin cambios no hace nada; si la etiqueta se
  editó en el panel (otra `version`), no la pisa; si se borró, no la revive; si ya había una
  etiqueta viva con ese nombre creada en el panel, la deja y la usa para las relaciones.
- Lee el archivo como `tagsFactory` (`model.js`, `tagsToRecords`): las hijas no declaradas existen
  igual y `aka`/`aliasOf` son alias. `model.test.js` verifica, sobre el archivo real, que
  importar y volver a leer (`recordsToRawTags`) da el mismo árbol. Diferencias a propósito:
  - una relacionada con una etiqueta que no existe («cosquillas») no se importa (hoy es texto sin
    página); se avisa;
  - la etiqueta sin nombre del archivo (`{ id: '' }`) y los alias de etiquetas que no existen
    («Dominatrix») no se importan;
  - las relacionadas se ven en los dos sentidos también con las hijas no declaradas («sumise»);
  - ícono, color e imagen sin espacios en las puntas.
- En dos pasos: primero crea las que faltan (solo con su nombre), después datos y relaciones.
- **Por tandas** (`budget`): el panel hace 120 escrituras por pedido y vuelve a pedir solo hasta
  terminar; una etiqueta cuya madre todavía no se creó espera a la tanda siguiente.

Cómo correrlo:

- **Panel**: Etiquetas → «Importar a la base» (`/admin/etiquetas/importar`). Anda con el
  interruptor apagado; muestra antes qué va a pasar con cada etiqueta. Queda en Actividad.
- **Local**: `npm run tags:import` (o `-- --dry` para ver sin escribir), contra la base de
  `npm run dev`.

La lectura (`read.js`, `loadTagRecords`) devuelve las etiquetas que ve quien mira (por defecto el
público) con sus relaciones, ambas puntas con `visibleWhere()`.

## Leer y editar desde la base (paso 3)

El interruptor «Etiquetas desde la base» (`etiquetas_db`) **quedó prendido para siempre** y salió
de Interruptores («Contenido solo en la base», paso 2): ya no hay commits al archivo de etiquetas.
Una base nueva (un preview o la local) necesita importar primero (paso 2; en la compu,
`npm run tags:import`): hasta entonces el sitio lee el archivo y el editor avisa que hay que
importar.

- **De dónde sale el árbol**: `src/lib/server/etiquetas/source.js` (`siteTagSource`,
  `siteTagManager`): la base. Sin base, con la base sin etiquetas o sin poder leerla: el archivo,
  solo como respaldo. Lo leído se recuerda 30 s por isolate (si al volver a leer no cambió
  nada, es la misma lista: no se rearma nada); el editor lo olvida al guardar.
- **Todo usa esa fuente, sin excepciones** (paso 5). Una sola puerta: `src/lib/utils/siteTags.js`
  (`currentSiteTags()`, `currentSiteTagList()`).
  - En el servidor, `hooks.server.js` pone el árbol de cada pedido al empezar (`applySiteTags`):
    también los stores `tagManager` y `wikiTagManager` del SSR. Todos los pedidos de un isolate
    ven la misma lista (la de los 30 s).
  - En el navegador, el layout raíz manda la lista de la base (`data.siteTags`, solo prendido) y
    `useSiteTags` la pone en los stores y en `siteTags.js`.
  - Lo leen de ahí: la limpieza de etiquetas de cada post (`canonicalTags`/`processPost`,
    `fetchPost`), los listados de posts (`fetchMarkdownPosts`: la lista se procesa una vez con el
    archivo y, con la base, se vuelven a limpiar las etiquetas, una vez por árbol), los
    editores del panel (`adminTags.js`: el editor de eventos, «¿Es parte de una serie?» al
    duplicar, que con la base crea la serie en la base), las series (páginas, avisos, link de
    baja, `/ics/etiqueta/…`), el ingreso (la serie del evento), KinkyVibe en las entradas
    (`isKinkyVibeEvent`) y Estadísticas (`seriesTagIndex`).
  - **Lo que se prerenderizaba**: la base no se puede leer en el build. `/api/posts`,
    `/api/search-index.json` y `/calendario.ics` usan las etiquetas, así que ya no se
    prerenderizan: se arman en el servidor (lo pesado, una vez por árbol e isolate) con
    `Cache-Control: public, max-age=300, s-maxage=300` (`src/lib/server/etiquetas/cache.js`).
    El RSS y el sitemap siguen prerenderizados porque no muestran etiquetas (una prueba lo
    verifica: salen iguales con cualquier árbol).
  - `sigue-el-interruptor.test.js` prueba cada lugar con una «base» inventada.
- Los textos de la Kinkipedia (`/wiki/<entrada>`) siguen saliendo de sus `.md`.
- **Editor** (`/admin/etiquetas`): guarda en la base al momento (sin etiquetas en la base, la
  página pide importarlas: `NEEDS_IMPORT`) (`src/lib/server/etiquetas/editor.js`). Usa las mismas
  operaciones que el editor del archivo (`applyTagOps`), así que valida igual; después compara
  objeto por objeto y escribe solo lo que cambió. Diferencias:
  - renombrar: ver abajo; la etiqueta renombrada sigue siendo el mismo objeto;
  - el texto de la wiki y los demás datos que el archivo no tiene se conservan; si una etiqueta
    con texto pasa a ser alias (fusionar), la vista previa avisa;
  - sacar un alias lo borra (suave, recuperable desde el historial del objeto);
  - no es una sola tanda: si alguien cambió una etiqueta mientras tanto, se frena ahí y avisa
    («recargá»); lo anterior queda guardado.
- Lo editado en el panel cambia la `version` del objeto: reimportar ya no lo pisa.

### Renombrar (con la base)

Decisión de gorrite: quien renombra elige (`RenameChoice.svelte`, el mismo en Etiquetas y en
Eventos → Series › Editar):

- **Por defecto: renombrar en todas las publicaciones, sin alias.** Un commit reescribe las
  publicaciones que usan el nombre viejo (el mismo camino que el editor del archivo:
  `replaceTagInPost` y `commitTagEdit`) y después se renombra en la base; el nombre viejo deja de
  existir. Si el commit falla, la base no se toca. Hace falta poder hacer commits (entrar con
  GitHub). Hasta que termina de publicarse el sitio (unos minutos), las publicaciones todavía
  dicen el nombre viejo y se ven como una etiqueta suelta.
- **Dejar el nombre viejo como alias**: no se toca ninguna publicación; se resuelven por el alias.
- Antes de confirmar se ve cuántas publicaciones cambian (y cómo): la vista previa de Etiquetas,
  o un paso de confirmación en Series.
- La parte de las publicaciones es una sola función, `planTagRenameInPosts`
  (`src/lib/server/etiquetas/rename.js`), y se guarda con el cliente del repo: los eventos y el
  material van a la base (se ve enseguida); las fichas de amigues y la wiki, con un commit.
- **En Eventos → Series, solo la base**: renombrar una serie reescribe solo sus eventos y el
  material (`dbPostsOnlyClient` en `src/lib/server/contenido/repo.js`), sin leer ni escribir
  GitHub. Si alguna ficha de amigues o página de la wiki usara la etiqueta de una serie (hoy
  ninguna), queda con el nombre viejo: para eso, Etiquetas › Renombrar o «dejar el alias».
- El archivo (`hardcodedTags.js`) no se toca nunca desde el panel: es solo el respaldo.

## Series (paso 4)

Las series son etiquetas hijas de «evento recurrente». El interruptor `series` quedó prendido
para siempre y salió de Interruptores («Contenido solo en la base», paso 2).

- **Eventos → Series** (`/admin/eventos/series`): «Crear serie» y, en cada serie, **«Editar»**:
  nombre de la etiqueta (renombrar, con la misma elección y el mismo valor por defecto que en
  Etiquetas, y un paso para confirmar después de ver cuántas publicaciones cambian), nombre
  visible, ícono, imagen (de `src/lib/assets`) y descripción (`seriesEditOps`,
  `src/lib/utils/seriesAdmin.js`). Se guarda como en Etiquetas: en la base al momento
  (`src/lib/server/etiquetas/panel.js`). Los campos son un
  componente (`SeriesFields.svelte`) que usan crear y editar.
- **Imagen de la serie** (`image` de la etiqueta): un archivo de `src/lib/assets`
  (`picantearla-miniatura.webp`) o, sin copiarla, la imagen de un evento:
  `calendario:<evento>/<archivo>` (`calendario:colectiver-2026-08/1.webp`, el archivo de
  `src/lib/posts/calendario/media/colectiver-2026-08/`). Lo resuelven `eventImageRef`
  (`src/lib/utils/series.js`) y `seriesImageURL`; lo validan el editor (`isTagImage`) y el tipo
  (`IMAGE_KEY`), así que el importador lo copia a la base igual. El selector de Editar solo ofrece
  archivos de `src/lib/assets`; la imagen de un evento se conserva si no se cambia.
- **Página de la serie**: `/wiki/<serie>`, con su imagen, descripción, próximas y pasadas
  ediciones (`SeriesTagBlock.svelte`, como antes).
- **Kinkipedia** (`/wiki`): la sección «Series», con una tarjeta por serie que tiene ediciones
  (imagen, descripción, cuántas ediciones y la próxima) que lleva a su página
  (`seriesSummaries`, `SeriesGrid.svelte`). Se esconde mientras se busca.
- Todo lo de series lee el árbol en uso (la base), también «¿Es parte de una serie?» al
  duplicar un evento, el ingreso y el link de baja de los avisos (paso 5). Los crons de avisos
  (series y «Lo que sigo») leen las etiquetas de la base ellos mismos (`siteTagManager`), sin
  depender del árbol que dejó el último pedido en el isolate.

## Cómo probar

```sh
npx vitest run src/lib/server/objects/types src/lib/server/etiquetas src/routes/\(authed\)/admin/eventos/series
npm run db:migrate:local && npm run tags:import -- --dry
```

La migración no se aplica a mano en preview ni en producción desde un PR
([0028](decisiones/0028-migraciones-antes-del-merge.md)).
