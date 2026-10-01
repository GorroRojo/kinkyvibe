# Etiquetas

## Qué es

Las etiquetas ordenan todo el sitio: los eventos, el material, les amigues y la Kinkipedia (la
wiki) las nombran en su `tags:`. Hoy viven en un archivo, `src/lib/utils/hardcodedTags.js`, que se
edita desde `/admin/etiquetas` con un commit. El paso 3 del plan ([decisión 0026](decisiones/0026-orden-1-10.md),
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

## Lo que nunca se tiene que romper

1. **Los posts nombran las etiquetas por su `key`**, el texto exacto de hoy («Rancheadita Kinky»,
   con mayúsculas, tildes y espacios). Cambiar un `key` es renombrar la etiqueta en todos los
   posts: eso sigue siendo una operación aparte (hoy, `/admin/etiquetas` › Renombrar).
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
| `image`        | `text`     | `image` (series): un archivo de `src/lib/assets`, como `serie-miniatura.webp`     |
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

Interruptor **«Etiquetas desde la base»** (`etiquetas_db`, variable `ETIQUETAS_DB_ENABLED`),
apagado por defecto. Antes de prenderlo: importar (paso 2).

- **De dónde sale el árbol**: `src/lib/server/etiquetas/source.js` (`siteTagSource`,
  `siteTagManager`). Apagado, o prendido pero con la base sin etiquetas o sin poder leerla: el
  archivo, como siempre. Lo leído se recuerda 30 s por isolate; el editor lo olvida al guardar.
- **Qué lo usa ya**:
  - el layout raíz manda el árbol de la base (`data.siteTags`, solo prendido) y
    `src/lib/utils/siteTags.js` lo pone en los stores `tagManager` y `wikiTagManager`: los chips,
    filtros, colores, la Kinkipedia (`/wiki`, con su buscador) y todo lo que lee esos stores;
  - `/wiki/<etiqueta>` (hijas y la etiqueta sin entrada propia).
- **Qué sigue leyendo el archivo** (pasos siguientes): lo prerenderizado en el build (RSS,
  `/api/posts`, el índice del buscador, el sitemap), la limpieza de etiquetas de cada post
  (`canonicalTags`/`processPost`), las series (paso 4) y el editor de eventos. Los textos de la
  Kinkipedia (`/wiki/<entrada>`) siguen saliendo de sus `.md`.
- **Editor** (`/admin/etiquetas`): con el interruptor prendido y etiquetas en la base, la misma
  página guarda en la base al momento, sin commits (`src/lib/server/etiquetas/editor.js`). Usa
  las mismas operaciones que el editor del archivo (`applyTagOps`), así que valida igual; después
  compara objeto por objeto y escribe solo lo que cambió. Diferencias:
  - renombrar siempre deja el nombre viejo como alias (las publicaciones no se tocan, se
    resuelven por el alias); la etiqueta renombrada sigue siendo el mismo objeto;
  - el texto de la wiki y los demás datos que el archivo no tiene se conservan; si una etiqueta
    con texto pasa a ser alias (fusionar), la vista previa avisa;
  - sacar un alias lo borra (suave, recuperable desde el historial del objeto);
  - no es una sola tanda: si alguien cambió una etiqueta mientras tanto, se frena ahí y avisa
    («recargá»); lo anterior queda guardado.
- Lo editado en el panel cambia la `version` del objeto: reimportar ya no lo pisa.

## Cómo probar

```sh
npx vitest run src/lib/server/objects/types src/lib/server/etiquetas
npm run db:migrate:local && npm run tags:import -- --dry
```

La migración no se aplica a mano en preview ni en producción desde un PR
([0028](decisiones/0028-migraciones-antes-del-merge.md)).
