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

## Lo que viene (decisión 0004)

- El contenido pasa a D1 como **objetos** (tipos, campos y relaciones), con historial completo,
  una sola vía de escritura (`saveObject()`), visibilidad centralizada y backups a R2.
- **Eventos primero.** Imágenes en un R2 propio. Slugs cambiables con redirección 301.
- Los `.md` se borran del repo un mes después de migrar, dejando un tag de git.
- Mientras tanto, todo lo nuevo que lea o escriba contenido pasa por `getRepoClient()` para que
  funcione igual en GitHub, en `dev:admin` y en los previews.
