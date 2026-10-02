# Contenido: eventos, material, amigues y wiki

## Qué hace

Todo lo que se publica en el sitio (eventos del calendario, material, perfiles de amigues y
términos de la wiki) es, **por ahora**, un archivo de texto `.md` en el repo. Les admins lo editan
desde el panel sin ver código: al guardar, el panel abre un PR en GitHub a nombre de le admin,
GitHub lo mergea solo cuando pasan las pruebas y Cloudflare vuelve a publicar el sitio (tarda unos
minutos en verse; ver [publicar-contenido.md](publicar-contenido.md)). El plan decidido
(0004) es pasar todo esto a la base de datos, empezando por los eventos.

## Lo que nunca se tiene que romper

- **Los `.md` no se reformatean.** Los edita gente no desarrolladora desde el panel (y algunos
  tienen CRLF): están en `.prettierignore`. Cambiá solo lo que tengas que cambiar.
- **Toda URL publicada sigue andando.** Si cambia un slug o una ruta, hace falta redirección.
- **Guardar no pisa lo de otra persona.** El panel manda el sha del archivo que abrió; si cambió
  en el medio, avisa (`FileChangedError`) en vez de pisar. Los borradores locales del editor
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

**Cambiar etiquetas.** Panel → Etiquetas: renombrar, mover o fusionar hace **un solo PR** que
toca `hardcodedTags.js` y todos los posts afectados. Los renombres de etiquetas son cambios
transversales: si lo hacés en código, va en su propio PR y se mergea primero.

**Ocultar sin borrar.** `force_unlisted` en el frontmatter; se ven en Panel → No listadas.

**Arreglar un post a mano.** Editá solo las líneas necesarias, corré
`npx vitest run src/tests/content.test.js` y, si arreglaste un problema conocido,
`UPDATE_CONTENT_ALLOWLIST=1 npx vitest run src/tests/content.test.js`.

## En la base (paso 5 de 0026, detrás de `contenido_db`)

**Eventos** y **material** (`material`, mismo camino; ver `src/lib/server/contenido/categories.js`).
La wiki no: sus textos pasan a ser el cuerpo de las etiquetas ([etiquetas.md](etiquetas.md)). Todo
detrás del interruptor **`contenido_db`, apagado** (Ajustes → Interruptores, o
`CONTENIDO_DB_ENABLED=1|0`).

- El material que usa un **componente interactivo** de Svelte (hoy `juego-de-peleas` y
  `donde-y-como-golpear-un-cuerpo`) no se importa y sigue saliendo de su `.md` (0004: los
  interactivos son componentes registrados en código, un paso aparte). Los PDF y documentos que el
  material enlaza desde su `<script>` se resuelven con la misma URL que les da el build.
- **Descargar todo** (botón en Contenido → En la base, `descargar.tar`): los eventos y el material
  de la base como `.md` en un `.tar` (los ocultos con `force_unpublished: true`; no los borrados).

- **Importar** (Contenido → **En la base**, `/admin/contenido/base`): pasa los `.md` de calendario
  de este deploy a objetos `evento` en la base de ese entorno. Idempotente (`content_sources`
  guarda el SHA-256 de cada `.md`): lo que no cambió no se toca, lo editado o borrado en el panel
  tampoco (lo informa, con los campos distintos). Va de a 40 por pedido (D1 tiene un máximo de
  consultas por pedido) y la página sigue sola. CSV con lo que pasa con cada archivo. Se puede
  correr con el interruptor apagado.
- **Paridad**: la página cuenta cuántos coinciden con su `.md` y lista lo que no (campos distintos,
  avisos, errores). Las pruebas `src/lib/server/contenido/eventos.test.js` (todos los eventos
  reales, ida y vuelta) y `parity.test.js` (eventos inventados en un D1: listas, página, `.ics`,
  búsqueda, visibilidad) verifican que las páginas reciben lo mismo.
- **Leer** (`src/lib/server/contenido/posts.js`): con el interruptor prendido, las listas, la página
  de cada evento, el `.ics`, las etiquetas y series, la búsqueda, `/api/posts`, el RSS y el sitemap
  leen los eventos de la base (convertidos al mismo `ProcessedPost` que da un `.md`). **La base
  decide** cada dirección que tiene (oculto o borrado → 404 aunque el `.md` siga); lo que no está
  en la base sigue saliendo de su `.md`.
- **El texto se ve igual que hoy** (decisión 0004: superadmins pueden usar HTML libre). Cada texto
  guarda cómo se muestra (`data.body_html`), decidido al guardar según quién lo escribió:
  `'libre'` para lo importado del repo y lo que guarda une superadmin; si no, la lista corta.
  - Libre y sin cambios respecto de su `.md`: la página usa el componente que mdsvex compiló de
    ese `.md` (exactamente lo de siempre: estilos, `<iframe>`, `<video>`, componentes).
  - Libre y editado: `freeHtml.js` lo arma con el mismo camino que mdsvex (HTML libre, comillas
    tipográficas, anclas, menciones, wiki, índice; sus `<style>` se aplican solo dentro del texto
    con `@scope`). Con los textos reales da el mismo HTML que mdsvex en 535 de 571 (el resto son
    casos borde del parser de markdown; `render.test.js` no deja que empeore).
  - Lista corta: `amigues/sanitize.js`, como los perfiles.
- **Historial**: cada guardado (también importar) copia el objeto a `object_revisions` en la misma
  tanda de `saveObject()` (`src/lib/server/contenido/revisions.js`).
- **Personas**: `authors:` y `personas:` de un `.md` se guardan como **una sola lista**,
  `data.personas: [{ profile?, name?, role }]` (quienes organizan o escriben incluides), y vuelven
  a `authors` y `personas` en la metadata y en el `.md` que arma la base
  (`src/lib/utils/personasList.js`; ver [personas-eventos.md](personas-eventos.md)). Lo importado
  antes con `data.authors` y `extra.personas` se sigue leyendo igual, volver a importarlo no lo
  cuenta como cambio y guardarlo lo pasa a la lista única.

| Qué                                | Dónde                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| Mapa `.md` ↔ evento (ida y vuelta) | `src/lib/server/contenido/eventos.js`                                        |
| Importación                        | `src/lib/server/contenido/importer.js` (+ `bundle.js`: los `.md` del deploy) |
| Qué cuenta como «igual»            | `src/lib/server/contenido/parity.js`                                         |
| Lectura para las páginas           | `src/lib/server/contenido/posts.js`                                          |
| Texto del cuerpo                   | `src/lib/server/contenido/render.js` (y `freeHtml.js` para el HTML libre)    |
| Esquema                            | `migrations/0031_contenido_eventos.sql`                                      |

- **Editar** (`src/lib/server/contenido/repo.js`): con el interruptor prendido, todo lo que el
  panel guarda pasa por `withContentDb`, que envuelve el cliente del repo (`getRepoClient()`) como
  el modo demo. El `.md` de un evento que está en la base, o de uno nuevo, se lee y se guarda en la
  base: el editor, cargar y duplicar, la agenda, importar la planilla, borrar (borrado suave) y
  deshacer, las etiquetas y las imágenes compartidas siguen trabajando sobre el texto del `.md`
  (lo arma `markdown.js` desde el objeto). Cada guardado es una versión nueva con historial
  (`object_revisions`, `source = 'panel'`); el «sha» que manda el editor es el del texto que abrió,
  así que si alguien guardó en el medio avisa como con GitHub (`FileChangedError`). Lo que no es
  de la base (imágenes, el archivo de etiquetas, material, los `.md` que la base no tiene) sigue
  yendo al repo, primero (si eso falla, la base no se toca). Se ve enseguida, sin PR ni deploy.
- **Quién guarda** es siempre el **login de GitHub** de le admin (`saved_by`/`updated_by`), en
  todos los guardados del panel: hooks.server.js corre el pedido de cada admin con
  `resolveAsPanelAuthor` (`contenido/author.js`) y `withContentDb` lo toma de ahí; el nombre que
  muestra cada pantalla (`pr.who`) es solo para el PR. Ahí también se decide `body_html`: si el
  texto no cambió queda como estaba (la agenda, las etiquetas o borrar no lo tocan); si cambió,
  `'libre'` si guarda une superadmin (hoy, todes les admins) y la lista corta si no.
- Con el interruptor prendido, también leen la base: la venta de entradas y la puerta
  (`tickets/events.js`: configuración, título, fecha), la lista de eventos del panel, su ficha, No
  listadas y su contador, Eventos → Lugares y el cron de «avisame si se repite».
- El panel recuerda por isolate los eventos y el material que leyó de la base
  (`allDbPostObjects`, como las listas públicas en `posts.js`): cada pedido pregunta solo si cambió
  algo (cuántos hay y su último `updated_at`, el último guardado de `object_revisions` y las
  importaciones) y vuelve a leerlos si cambió. Todo lo que escribe pasa por `saveObject()`, que
  cambia eso; un `UPDATE objects` a mano que no toque `updated_at` no se ve hasta el próximo
  guardado. Un evento por su dirección es una sola consulta, por los índices únicos.

Lo que todavía no cambia (pasos siguientes):

- Las imágenes siguen en el repo (`media/<slug>/`); R2 es un paso aparte. Una imagen nueva va en
  un PR y se ve cuando se publica (unos minutos); el texto del evento se ve enseguida.
- Apagar el interruptor vuelve a los `.md`: lo editado en la base no está en los `.md` (se puede
  bajar con «Descargar todo» y volver a subir a mano).
- `/calendario.ics`, `/rss`, `/sitemap.xml`, `/api/posts` y `/api/search-index.json` dejaron de
  prerenderizarse (con el interruptor apagado dan lo mismo que antes, pero los arma el Worker).

### Prenderlo

1. Aplicar `migrations/0031_contenido_eventos.sql` (gorrite, como siempre; [datos.md](datos.md)).
2. En el panel del entorno (primero preview): Contenido → En la base → Importar.
3. Revisar «Para revisar»: errores (por ejemplo, un fin semanas antes del inicio) se corrigen en el
   `.md` y se vuelve a importar.
4. Prender `contenido_db`. Para volver atrás, apagarlo (o `CONTENIDO_DB_ENABLED=0`).

## Lo que viene (decisión 0004)

- El contenido pasa a D1 como **objetos** (tipos, campos y relaciones), con historial completo,
  una sola vía de escritura (`saveObject()`), visibilidad centralizada y backups a R2.
- **Eventos primero.** Imágenes en un R2 propio. Slugs cambiables con redirección 301.
- Los `.md` se borran del repo un mes después de migrar, dejando un tag de git.
- Mientras tanto, todo lo nuevo que lea o escriba contenido pasa por `getRepoClient()` para que
  funcione igual en GitHub, en `dev:admin` y en los previews.
