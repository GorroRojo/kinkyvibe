# Contenido: eventos, material, amigues y wiki

## Qué hace

**Los eventos del calendario y el material viven solo en la base** («Contenido solo en la base»,
decisión de gorrite; ver «En la base» abajo): el sitio los lee de ahí y el panel los guarda ahí, se
ven enseguida y tienen historial. Sus `.md` siguen en el repo solo como respaldo (0004: se borran
un mes después, con un tag de git): **el sitio no los lee** y editarlos no cambia nada. Los
perfiles de amigues y los términos de la wiki siguen siendo archivos `.md` en el repo: al guardarlos,
el panel abre un PR en GitHub ([publicar-contenido.md](publicar-contenido.md)).

## Lo que nunca se tiene que romper

- **Los `.md` no se reformatean.** Los de amigues y la wiki los edita gente no desarrolladora desde
  el panel (y algunos tienen CRLF): están en `.prettierignore`. Cambiá solo lo que tengas que
  cambiar.
- **Eventos y material: solo la base.** Nunca un commit de un `.md` de evento o material desde el
  panel (`withContentDb`, `src/lib/server/contenido/repo.js`); sin base, guardar da error.
- **Toda URL publicada sigue andando.** Si cambia un slug o una ruta, hace falta redirección.
- **Guardar no pisa lo de otra persona.** El panel manda el sha del texto que abrió (en la base,
  el del texto que arma la base); si cambió en el medio, avisa (`FileChangedError`) en vez de pisar. Los borradores locales del editor
  también se marcan como viejos si el archivo cambió (`src/lib/admin/draft.js`).
- **Desde un preview nunca se commitea al repo**: los cambios van a la base del preview
  (ver [demo.md](demo.md)). En `npm run dev:admin`, a una carpeta temporal.
- **El chequeo del contenido no puede sumar problemas nuevos** (`src/tests/content.test.js`, ver
  [pruebas-y-ci.md](pruebas-y-ci.md)).
- Los eventos de prueba `prueba-entradas-*` son ocultos y solo venden en `vite dev`.

## Dónde está

| Qué                                                                    | Dónde                                                                                                                   |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Publicaciones                                                          | `src/lib/posts/<categoría>/<slug>.md` (`calendario`, `material`, `amigues`, `wiki`)                                     |
| Imágenes de cada publicación                                           | `src/lib/posts/<categoría>/media/<slug>/`                                                                               |
| Plantilla de evento                                                    | `src/lib/posts/calendario/_event_template.md`                                                                           |
| Árbol de etiquetas                                                     | `src/lib/utils/hardcodedTags.js` (se edita desde Panel → Etiquetas)                                                     |
| Páginas públicas                                                       | `src/routes/(content)/` (`calendario`, `material`, `amigues`, `wiki`…)                                                  |
| Editor de eventos (nuevo, editar, duplicar, agenda, importar planilla) | `src/routes/(authed)/admin/eventos/`, `src/lib/server/eventos/`, `src/lib/utils/eventDraft.js`                          |
| Editores de material y amigues                                         | `src/routes/(authed)/admin/{material,amigues}/`, `src/lib/server/admin/contentRoutes.js`, `posts.js`                    |
| Editor genérico de cualquier post                                      | `src/routes/(authed)/edit/[category]/[postID]/`                                                                         |
| Commits a GitHub                                                       | `src/lib/server/eventos/github.js`; `getRepoClient()` en `eventos/index.js` elige GitHub, el mock de dev o la capa demo |
| Cómo escribir un post a mano                                           | [`README.md`](../README.md) de la raíz                                                                                  |

## Cómo probar

```sh
npm run dev:admin     # admin falso (.env.admin); los "commits" van a una carpeta temporal, no a GitHub
npx vitest run src/lib/server/eventos src/lib/server/admin src/tests/content.test.js
npx playwright test -c playwright.tickets.config.js tests/tickets/editor.spec.js
```

`dev:admin` entra como GorroRojo por defecto (`ADMIN_DEV_MOCK_LOGIN` para otro) y escribe en
`ADMIN_DEV_MOCK_DIR` (por defecto la carpeta temporal del sistema, `kinkyvibe-admin-mock`). En un
preview de PR, entrá como admin de prueba ([demo.md](demo.md)).

## Tareas comunes

**Cargar un evento.** Panel → Eventos → Cargar evento (o "Duplicar" uno anterior). Para muchos,
Importar planilla (botón en Agenda). La Agenda permite editar los próximos como en una planilla.
Al importar, una fila sin horario que repite un evento (otra fila del mismo evento en lo pegado, o
el evento que se duplica) toma el mismo inicio y fin, en su día; «a definir» queda como aviso. Un
«Valor» que es un solo precio General sin cupo («$8.000», «General $8.000») se carga como la
entrada General a ese precio y sin cupo; cualquier otro valor (gorra, varios precios, cupo) se
revisa a mano en Entradas (`parseGeneralPrice`, `generalTickets` e `inheritedTimes` en
`src/lib/utils/sheetImport.js`).

**Borradores (planificar el mes).** En la Agenda, tocar un día vacío (o «Evento») ofrece duplicar un
evento que ya existe o empezar de cero con el título, y crea un **borrador** en ese día sin salir de
la agenda. Un borrador es un evento con `force_unlisted: true`, `status: anunciado` y la marca
`borrador: true` (la misma que pone Importar planilla; ver `src/lib/server/eventos/drafts.js`).
Solo los eventos con la marca aparecen en el filtro «A confirmar», muestran «falta N» (lo que les
falta para la página pública, `src/lib/utils/eventMissing.js`) y ofrecen **Confirmar** (en la
agenda y en la ficha), que los publica (saca `force_unlisted` y la marca, sin cambiar el `status`)
y queda en Actividad. Un evento no listado a propósito, sin la marca, nunca se publica desde ahí.
Los borradores importados antes de esta marca no la tienen: se confirman desde el editor.

**Cambiar etiquetas.** Panel → Etiquetas: se guarda en la base al momento; renombrar sin alias
también cambia los eventos y el material (en la base) y las fichas de amigues y la wiki (con un
PR) ([etiquetas.md](etiquetas.md)).

**Ocultar sin borrar.** «No listado» en el editor (`force_unlisted`); se ven en Panel → No
listadas.

**Arreglar un evento o material.** Desde el panel (se guarda en la base). Editar su `.md` en el
repo no cambia el sitio: solo si después se vuelve a importar (Contenido → En la base) y el objeto
no se editó en el panel.

**Arreglar una ficha de amigues o de la wiki a mano.** Editá solo las líneas necesarias, corré
`npx vitest run src/tests/content.test.js` y, si arreglaste un problema conocido,
`UPDATE_CONTENT_ALLOWLIST=1 npx vitest run src/tests/content.test.js`.

## En la base (solo la base)

**Eventos** y **material** (`material`, mismo camino; ver `src/lib/server/contenido/categories.js`).
La wiki no: sus textos pasan a ser el cuerpo de las etiquetas ([etiquetas.md](etiquetas.md)). El
interruptor `contenido_db` **quedó prendido para siempre** y salió de Interruptores (paso 2 de
«Contenido solo en la base»).

- **Leer** (`src/lib/server/contenido/posts.js`): las listas, la página de cada evento y material,
  el `.ics`, las etiquetas y series, la búsqueda, `/api/posts`, el RSS, el sitemap, la venta de
  entradas y la puerta (`tickets/events.js`), el panel (lista, ficha, agenda, No listadas,
  Lugares) y los crons leen **solo la base** (convertida al mismo `ProcessedPost` que daba un
  `.md`). Una dirección que la base no tiene es 404, aunque haya un `.md` en el repo;
  `fetchMarkdownPosts` ya no carga los `.md` de eventos ni de material. Sin base no hay eventos.
- **Guardar** (`src/lib/server/contenido/repo.js`, `withContentDb`): todo lo que el panel escribe
  pasa por el cliente del repo (`getRepoClient()`), y todo `.md` de evento o material va a la base
  (editor, cargar y duplicar, agenda y borradores, importar la planilla, borrar y deshacer, las
  etiquetas). Las imágenes siguen yendo al repo (primero; si eso falla, la base no se toca). Cada
  guardado es una versión nueva con historial (`object_revisions`, `source = 'panel'`).
- **Quién guarda** es siempre el **login de GitHub** de le admin (`saved_by`/`updated_by`):
  hooks.server.js corre el pedido de cada admin con `resolveAsPanelAuthor` (`contenido/author.js`).
  Ahí también se decide `body_html`: si el texto no cambió queda como estaba; si cambió, `'libre'`
  si guarda une superadmin y la lista corta si no.
- **El texto se ve igual que antes** (decisión 0004: superadmins pueden usar HTML libre). Cada
  texto guarda cómo se muestra (`data.body_html`):
  - libre y **sin cambios respecto de su `.md`**: la página usa el componente que mdsvex compiló de
    ese `.md` (exactamente lo de siempre). La base decide qué existe y qué dice; el `.md` compilado
    es solo cómo se dibuja un texto que no cambió;
  - libre y editado: `freeHtml.js` lo arma con el mismo camino que mdsvex (`render.test.js`);
  - lista corta: `amigues/sanitize.js`, como los perfiles.
- **Interactivos** (decisión 0004: «se hacen en código, como componente registrado»): en la base,
  el texto nombra un interactivo con una etiqueta propia, sola, sin atributos:
  `<kv-donde-golpear-un-cuerpo></kv-donde-golpear-un-cuerpo>`. El registro está en
  `src/lib/utils/interactivos.js` (etiquetas y su forma en los `.md`) y
  `src/lib/components/interactivos/index.js` (qué componente muestra cada una). Solo las
  registradas se muestran (también dentro de otro elemento, con `ContentParts.svelte`); cualquier
  otra `<kv-…>` se ve escapada, como texto. La importación pasa la forma del `.md` (componente
  importado en el `<script>`) a la etiqueta, y «Descargar todo» la vuelve a armar. Un interactivo
  nuevo necesita un PR. Hoy hay uno: `donde-y-como-golpear-un-cuerpo` (el de `juego-de-peleas`
  está comentado en su `.md` y no se muestra).
- **Descargar todo** (botón en Contenido → En la base, `descargar.tar`,
  `src/lib/server/contenido/download.js`): los eventos y el material de la base como `.md` en un
  `.tar`, con la misma metadata y el mismo texto que los `.md` del repo (`download.test.js`); los
  ocultos con `force_unpublished: true`; no los borrados.
- **Importar** (Contenido → **En la base**, `/admin/contenido/base`): pasa los `.md` de este
  deploy a la base de ese entorno. Idempotente (`content_sources` guarda el SHA-256 de cada `.md`):
  lo que no cambió no se toca, lo editado o borrado en el panel tampoco (lo informa). Sirve para
  una base nueva (un preview) y para traer un `.md` nuevo que llegue por un PR. Un `.md` que no se
  puede importar (frontmatter roto, un componente no registrado, un fin antes del inicio) **no se
  muestra**: hay que corregirlo e importar de nuevo.
- **Base local**: `npm run dev` (y `dev:admin`, `dev:tickets`) importa los `.md` a la base local
  antes de arrancar (`scripts/import-content.js`, sin frenar el arranque si falla); a mano,
  `npm run content:import`. Las pruebas E2E hacen lo mismo antes de `vite preview`.
- **Personas**: `authors:` y `personas:` de un `.md` se guardan como **una sola lista**,
  `data.personas: [{ profile?, name?, role }]` (`src/lib/utils/personasList.js`; ver
  [personas-eventos.md](personas-eventos.md)).
- El panel y las listas públicas recuerdan por isolate lo que leyeron de la base mientras no cambie
  (cuántos hay, su último `updated_at`, el último guardado de `object_revisions` y las
  importaciones) y, las listas públicas, mientras no cambie el árbol de etiquetas. Las listas
  públicas leen la metadata **sin el cuerpo** (`json_remove`); el cuerpo lo pide aparte solo la
  búsqueda (`siteBodies`).

| Qué                                | Dónde                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| Mapa `.md` ↔ evento (ida y vuelta) | `src/lib/server/contenido/eventos.js` (material: `material.js`)                            |
| Importación                        | `src/lib/server/contenido/importer.js` (+ `bundle.js`; local: `scripts/import-content.js`) |
| Qué cuenta como «igual»            | `src/lib/server/contenido/parity.js`                                                       |
| Lectura para las páginas           | `src/lib/server/contenido/posts.js`                                                        |
| Guardar desde el panel             | `src/lib/server/contenido/repo.js`                                                         |
| Texto del cuerpo                   | `src/lib/server/contenido/render.js` (`freeHtml.js`, `interactive.js`)                     |
| Interactivos                       | `src/lib/utils/interactivos.js`, `src/lib/components/interactivos/`                        |
| Descargar todo                     | `src/lib/server/contenido/download.js`                                                     |
| Pruebas con eventos inventados     | `src/lib/server/contenido/testing.js` (`seedPosts`)                                        |
| Esquema                            | `migrations/0031_contenido_eventos.sql`                                                    |

Lo que todavía no cambia (pasos siguientes):

- Las imágenes siguen en el repo (`media/<slug>/`); R2 es un paso aparte. Una imagen nueva va en
  un PR y se ve cuando se publica (unos minutos); el texto del evento se ve enseguida.
- Los `.md` de eventos y material siguen en el repo como respaldo hasta que se borren (0004).

## Lo que viene (decisión 0004)

- El contenido pasa a D1 como **objetos** (tipos, campos y relaciones), con historial completo,
  una sola vía de escritura (`saveObject()`), visibilidad centralizada y backups a R2.
- **Eventos primero.** Imágenes en un R2 propio. Slugs cambiables con redirección 301.
- Los `.md` se borran del repo un mes después de migrar, dejando un tag de git.
- Todo lo nuevo que escriba contenido pasa por `getRepoClient()` para que funcione igual en
  producción, en `dev:admin` y en los previews (los eventos y el material, a la base de cada uno).
