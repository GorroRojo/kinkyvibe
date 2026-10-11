# Contenido: eventos, material, amigues y wiki

## Qué hace

**Todo el contenido vive solo en la base** («Contenido solo en la base», decisión de gorrite; ver
«En la base» abajo): los eventos del calendario, el material, los perfiles de amigues y las páginas
de la wiki. El sitio los lee de ahí y el panel los guarda ahí, se ven enseguida y tienen historial.
Sus `.md` siguen en el repo solo como respaldo (0004: se borran un mes después, con un tag de git):
**el sitio no los lee** y editarlos no cambia nada (solo si después se vuelven a importar y el
objeto no se editó en el panel). Ningún guardado de contenido del panel pasa por GitHub; solo las
imágenes viejas del repo siguen ahí hasta pasarlas a R2 ([imagenes.md](imagenes.md)).

## Lo que nunca se tiene que romper

- **Los `.md` no se reformatean.** Quedan como respaldo (y algunos tienen CRLF): están en
  `.prettierignore`. Cambiá solo lo que tengas que cambiar.
- **Solo la base.** Nunca un commit de un `.md` de evento, material, amigues o la wiki desde el
  panel (`withContentDb`, `src/lib/server/contenido/repo.js`; amigues y la wiki con
  `src/lib/server/contenido/fichas.js`); sin base, guardar da error.
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
| Plantillas de evento y de material                                     | `src/lib/admin/plantillas/` (`evento.md`, `material.md`)                                                                |
| Árbol de etiquetas                                                     | `src/lib/utils/hardcodedTags.js` (se edita desde Panel → Etiquetas)                                                     |
| Páginas públicas                                                       | `src/routes/(content)/` (`calendario`, `material`, `amigues`, `wiki`…)                                                  |
| Editor de eventos (nuevo, editar, duplicar, agenda, importar planilla) | `src/routes/(authed)/admin/eventos/`, `src/lib/server/eventos/`, `src/lib/utils/eventDraft.js`                          |
| Editor de material                                                     | `src/routes/(authed)/admin/contenido/material/`, `src/lib/server/admin/contentRoutes.js`, `posts.js`                    |
| Editor de perfiles (amigues)                                           | `src/routes/(authed)/admin/comunidad/perfiles/`, `src/lib/server/admin/amiguesRoutes.js` ([amigues.md](amigues.md))     |
| Editor de la wiki                                                      | `src/routes/(authed)/admin/etiquetas/wiki/[term]/`, `src/lib/server/etiquetas/wikiEditor.js`                            |
| Editor genérico (material; amigues y wiki llevan a sus editores)       | `src/routes/(authed)/edit/[category]/[postID]/`                                                                         |
| Cliente del repo (solo imágenes llegan a GitHub)                       | `src/lib/server/eventos/github.js`; `getRepoClient()` en `eventos/index.js` elige GitHub, el mock de dev o la capa demo |
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

Importar planilla guarda **solo en la base** (`src/lib/server/eventos/importarBase.js`): cada fila
es un objeto `evento` nuevo con `saveObject()` (versión 1, historial `panel`, los perfiles de
`personas` como edges `persona` y el mismo edge `lugar` que el original si la planilla no dice otro
lugar). Sin base no importa (la página avisa). El
evento a duplicar se busca mientras se escribe (título, fecha como «vie 2 oct», serie o etiqueta;
lo más reciente primero, `src/lib/utils/sourcePicker.js`). Cada fila tiene sus **Entradas** (el
mismo editor que Cargar evento): arrancan como las del evento duplicado, con su meta de venta y el
precio General de la planilla, y «Usar estas entradas en todas las filas» las copia a toda la tanda.
Un mail suelto en el link de inscripción pasa a `mailto:`; también valen `tel:` y páginas del sitio
(`/…`). Si el original tiene imagen de la biblioteca (edge `portada`), el borrador usa la misma imagen
(otro edge `portada` al mismo objeto `imagen`), como al duplicar desde el editor; si solo tiene la
imagen vieja del repo (un número), no se copia y queda el aviso para subirla desde el editor.
Hasta 200 filas por vez. No van en un solo pedido (D1 tiene un tope de consultas por pedido): la
página primero **revisa** todas de a 40 (`dryRun`, no guarda nada) y, si ninguna tiene problemas,
las **guarda** de a 40 («Guardando 80 de 200…»). Si un guardado falla a mitad de camino, lo
anterior queda guardado y se dice qué fila falló y cuántas quedaron sin guardar. Todas las tandas
llevan el mismo `importAt` (el `now` de cada guardado): si se corta la conexión, «Seguir
guardando» reintenta la tanda y el servidor reconoce los eventos que ya creó esa importación
(misma dirección, misma persona, mismo `created_at`), así que no se duplican.

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
también cambia los eventos, el material, los perfiles de amigues y la wiki, todo en la base y sin
GitHub ([etiquetas.md](etiquetas.md)).

**Ocultar sin borrar.** «No listado» en el editor (`force_unlisted`); se ven en Panel → No
listadas.

**Arreglar un evento, un material, un perfil o una página de la wiki.** Desde el panel (se guarda en
la base): los perfiles en Comunidad → Perfiles, la wiki en Etiquetas → cada etiqueta → «Entrada de
la Kinkipedia» (`/admin/etiquetas/wiki/<dirección>`). Editar su `.md` en el repo no cambia el sitio:
solo si después se vuelve a importar (Contenido → En la base; Perfiles → Importar y clasificar;
Etiquetas → Importar a la base) y el objeto no se editó en el panel. Si tocás un `.md` del repo,
editá solo las líneas necesarias y corré `npx vitest run src/tests/content.test.js`.

## En la base (solo la base)

**Eventos** y **material** (`material`, mismo camino; ver `src/lib/server/contenido/categories.js`).
Los **perfiles de amigues** (objetos `perfil`, [amigues.md](amigues.md)) y la **wiki** (sus textos
son el cuerpo de las etiquetas, [etiquetas.md](etiquetas.md)) también viven solo en la base desde
el paso 2 de «solo base» (abajo, «Amigues y la wiki»). El interruptor `contenido_db` **quedó
prendido para siempre** y salió de Interruptores (paso 2 de «Contenido solo en la base»).

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
  `src/lib/components/interactivos/index.js` (qué componente muestra cada una; los componentes
  viven en esa misma carpeta). Solo las
  registradas se muestran (también dentro de otro elemento, con `ContentParts.svelte`); cualquier
  otra `<kv-…>` se ve escapada, como texto. La importación pasa la forma del `.md` (componente
  importado en el `<script>`) a la etiqueta, y «Descargar todo» la vuelve a armar. Un interactivo
  nuevo necesita un PR. Hoy hay uno: `donde-y-como-golpear-un-cuerpo` (el de `juego-de-peleas`
  está comentado en su `.md` y no se muestra).
- **Descargar todo** (botón en Contenido → En la base, `descargar.tar`,
  `src/lib/server/contenido/download.js`): los eventos, el material, los perfiles de amigues
  (`amigues/<dirección>.md`) y las páginas de la wiki (`wiki/<dirección>.md`) de la base como `.md`
  en un `.tar`, con la misma metadata y el mismo texto que los `.md` del repo (`download.test.js`,
  `fichas.test.js` con todas las fichas y páginas reales); los ocultos con `force_unpublished: true`;
  no los borrados. Los perfiles llevan además su tipo (`kind:`) y, si tienen, lo que las fichas del
  repo no tienen (más links, datos de un lugar): importar el `.md` descargado deja el mismo perfil.
- **Importar** (Contenido → **En la base**, `/admin/contenido/base`): pasa los `.md` de este
  deploy a la base de ese entorno. Idempotente (`content_sources` guarda el SHA-256 de cada `.md`):
  lo que no cambió no se toca, lo editado o borrado en el panel tampoco (lo informa). Sirve para
  una base nueva (un preview) y para traer un `.md` nuevo que llegue por un PR. Un `.md` que no se
  puede importar (frontmatter roto, un componente no registrado, un fin antes del inicio) **no se
  muestra**: hay que corregirlo e importar de nuevo. Su lista «Para revisar» es además una fila de
  «Para revisar» del panel: la página guarda cuántos hay cada vez que se abre (`review_snapshots`,
  ver [panel.md](panel.md)).
- **Base local**: `npm run dev` (y `dev:admin`, `dev:tickets`) importa los `.md` a la base local
  antes de arrancar (`scripts/import-content.js`, sin frenar el arranque si falla): eventos,
  material, fichas de amigues y, si la base no tiene etiquetas, las etiquetas con los textos de la
  wiki; a mano, `npm run content:import`. Las pruebas E2E hacen lo mismo antes de `vite preview`.
- **Personas**: `authors:` y `personas:` de un `.md` se guardan como **una sola lista**,
  `[{ profile?, name?, role }]` (`src/lib/utils/personasList.js`; ver
  [personas-eventos.md](personas-eventos.md)). En los eventos y el material, cada perfil es un
  edge `persona` y el resto va en `data.personas` ([objetos.md](objetos.md)).
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

- Las imágenes viejas siguen en el repo (`media/<slug>/`) hasta importarlas a R2
  ([imagenes.md](imagenes.md)); las nuevas ya van a la biblioteca (R2) desde cada editor, también
  la de un perfil.
- Los `.md` de eventos, material, amigues y la wiki siguen en el repo como respaldo hasta que se
  borren (0004).

### Amigues y la wiki (paso 2 de «solo base»)

- **Perfiles**: `/amigues`, la página de cada perfil, `sitePosts` (las listas, `/todo`, el sitemap,
  «Más cosas de…», `/api/posts`), les autores de un evento o material y los pronombres de las
  @menciones leen **solo la base** (`src/lib/server/amigues/asPost.js`, `pages.js`). Una ficha `.md`
  que la base no tiene no existe (404) hasta que se importa. El panel edita y borra solo en la base
  (sin el editor del `.md`); la imagen se elige en el selector de la biblioteca (R2, edge `avatar`).
- **Wiki**: `/wiki/<término>`, el glosario (`/wiki` y el layout), el buscador y el sitemap leen el
  texto de la wiki de cada etiqueta (`src/lib/server/wiki/site.js`, con el árbol de etiquetas: sin
  consultas de más). **Ya no se prerenderiza**: se arma en cada pedido (ahora sus visitas se cuentan
  en Analíticas). Se edita en Etiquetas → «Entrada de la Kinkipedia» (`wikiEditor.js`): en la base,
  con historial, Actividad y control de versión.
- **Lo que todavía trabaja con el texto de un `.md`** (renombrar una etiqueta en todas las
  publicaciones, la dirección vieja `/edit/wiki/…`) lee y guarda en la base:
  `src/lib/server/contenido/fichas.js` arma el `.md` de un perfil o de una página de la wiki desde la
  base y lo vuelve a leer al guardar (con el mismo aviso si alguien guardó en el medio). No crea
  perfiles nuevos (se crean en el panel) ni cambia la etiqueta de una página.
- **Etiquetas → Renombrar** ya no hace commits: `dbRepoAccess` en `src/lib/server/etiquetas/panel.js`
  (el mismo cliente solo-base que Eventos → Series).

#### Pasos para el cambio (antes del deploy, gorrite)

Sin migración nueva. En cada entorno (primero el preview, después producción), **con el deploy
anterior** (que todavía muestra las fichas `.md`), o enseguida después del nuevo:

1. **Perfiles → Importar y clasificar → «Importar las fichas»** (`/admin/comunidad/perfiles/importar`).
   Idempotente; tiene que terminar sin errores (la prueba `fichas.test.js` verifica que todas las
   fichas del repo se importan). Revisar el tipo de las que quedaron «a confirmar».
2. **Etiquetas → «Importar a la base»** (`/admin/etiquetas/importar`): trae los textos de la wiki (y
   las etiquetas de `tags:` de una página, `wiki_tags`, nuevas en este paso). Si las etiquetas ya
   estaban importadas, repetirlo actualiza las que no se editaron en el panel.
3. Revisar en el preview: `/amigues` (la cantidad de perfiles), `/amigues/<ficha>`, `/wiki`,
   `/wiki/BDSM` y Contenido → En la base → «Descargar todo» (`amigues/` y `wiki/` adentro).
4. Opcional: `npm run images:import` para pasar las imágenes del repo a R2 ([imagenes.md](imagenes.md)).

Si el deploy nuevo sale antes de importar, `/amigues` queda vacío y `/wiki/<término>` muestra solo
la etiqueta hasta correr los pasos 1 y 2 (no se pierde nada: los `.md` siguen en el repo).

#### Decisiones de la wiki (confirmadas por gorrite, 5/10)

Propuestas por Claude; **confirmado por gorrite (5/10)**: las seis, tal como están.

1. **La wiki usa el tipo `etiqueta` que ya existía** (su texto de la wiki es el cuerpo de la
   etiqueta, tu diseño en [etiquetas.md](etiquetas.md)); no hay un tipo nuevo. La dirección de una
   página es la de su etiqueta (`tagSlug(key)`, igual a los nombres de los `.md`); un alias lleva a
   la página de la etiqueta. Dos campos nuevos (opcionales, sin migración): `wiki_tags` y
   `wiki_body_html` (sin valor = lo importado, HTML libre).
2. **Editor de la wiki con campos** (título, resumen, autores, etiquetas, texto), no el texto crudo
   del `.md`; «Sacar la entrada» saca el texto y deja la etiqueta.
3. **Las listas del sitio** (`sitePosts`: `/todo`, el sitemap, `/api/posts`, «Más cosas de…») llevan
   los perfiles que lista `/amigues` (aprobados, no ocultos, con la misma lista blanca): también los
   lugares listados y los perfiles de cuentas aprobados, no solo las fichas de antes.
4. **«Descargar todo»** suma a cada perfil su tipo (`kind:`) y lo que las fichas del repo no tienen
   (más links, datos de un lugar, `show_members`); la importación los vuelve a leer.
5. **Elegir o sacar una imagen de la biblioteca** en un perfil saca las imágenes viejas de la ficha
   (`featured`, `logo`, `photo`), como `featured` en los eventos.
6. Sin base: `/amigues` vacío y sin páginas de la wiki (como los eventos); una ficha sin importar
   da 404.

## Lo que viene (decisión 0004)

- El contenido pasa a D1 como **objetos** (tipos, campos y relaciones), con historial completo,
  una sola vía de escritura (`saveObject()`), visibilidad centralizada y backups a R2.
- **Eventos primero.** Imágenes en un R2 propio. Slugs cambiables con redirección 301.
- Los `.md` se borran del repo un mes después de migrar, dejando un tag de git.
- Todo lo nuevo que escriba contenido pasa por `getRepoClient()` para que funcione igual en
  producción, en `dev:admin` y en los previews (todo el contenido, a la base de cada uno).
