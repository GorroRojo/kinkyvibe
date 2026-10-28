# Contenido: eventos, material, amigues y wiki

## Qué hace

**Todo el contenido vive solo en la base**: los eventos del calendario, el material, los perfiles
de amigues y las páginas de la wiki (el texto de la wiki de cada etiqueta). El sitio los lee de ahí
y el panel los guarda ahí, se ven enseguida y tienen historial. **Ya no hay `.md` en el repo**
(decisión [0032](decisiones/0032-borrar-los-md.md)): el último commit de `main` que los tenía
queda marcado con el tag de git `posts-md-final`. Ningún guardado del panel pasa por GitHub.

## Lo que nunca se tiene que romper

- **Solo la base.** Todo lo que el panel guarda va a la base (`withContentDb`,
  `src/lib/server/contenido/repo.js`; amigues y la wiki con `src/lib/server/contenido/fichas.js`);
  sin base, guardar da error. El panel nunca escribe en el repo (`src/lib/server/contenido/cliente.js`
  es un repo vacío).
- **Toda URL publicada sigue andando.** Si cambia un slug o una ruta, hace falta redirección. La
  dirección pública de lo que vino de un `.md` es su nombre de archivo (`content_sources` y
  `profile_sources`, `legacy_slug`): esas tablas no se tocan.
- **Las imágenes viejas siguen viéndose**: lo que en la base todavía nombra una imagen de una
  carpeta `media/` o de `src/lib/assets` se resuelve con su copia en la biblioteca
  (`src/lib/utils/legacyMedia.js`, [imagenes.md](imagenes.md)).
- **Los PDF, el video y el documento del material** están en la biblioteca (objetos `archivo`,
  `/media/file/…`) y sus textos ya los enlazan así; el repo no guarda copia
  ([imagenes.md](imagenes.md#los-pdf-y-el-video-del-material)).
- **Guardar no pisa lo de otra persona.** El panel manda el sha del texto que abrió (el del texto
  que arma la base); si cambió en el medio, avisa (`FileChangedError`) en vez de pisar. Los
  borradores locales del editor también se marcan como viejos si el texto cambió
  (`src/lib/admin/draft.js`).
- Los eventos de prueba `prueba-entradas-*` son ocultos y solo venden en `vite dev`.
- **«Hoy» es el de Argentina.** En `/calendario`, el día marcado como hoy, los días pasados de la
  grilla y el mes con el que abre salen de la hora de Argentina (`calendarDayFlags`,
  `defaultCalendarMonth` en `src/lib/utils/allPosts.js`, con `argDate`), nunca de la del servidor
  (UTC) ni la del navegador de quien mira. Lo mismo el botón «Hoy» de la vista calendario de la
  agenda del panel (`todayInArgentina`).
- **La página de un evento no espera de a una consulta.** La base está lejos (en el este de
  EE. UU.): cada consulta que espera a la anterior es una ida y vuelta más. La venta, las partes
  del taller, el lugar y el interruptor de la lista de espera salen a la par de la lectura del
  evento (no dependen de él) y solo se muestran si quien mira puede ver el evento (si no, 404).
  `evento-consultas.test.js` (al lado de la ruta) fija cuántas consultas y cuántas tandas en fila
  hace (`countingDB`, con `waves`).
- **La página de un material tampoco.** La lista de publicaciones sale a la par del material; con
  el material ya leído (y visto: si no, 404 o la redirección, como siempre), "Más cosas de…" con
  sus lugares, su venta, los pronombres y las personas (con los roles a la par de los perfiles)
  salen a la par. `material-consultas.test.js` (al lado de la ruta) fija cuántas consultas y
  tandas en fila hace, en frío y en caliente. Un material que redirige (`redirect` con `link`, por
  ejemplo a la tienda) redirige apenas leído el objeto (`followRedirect` de `siteContent`), sin
  leer sus relaciones, su portada ni sus autores ni armar el texto (de 7 consultas en 3 tandas a
  2); uno oculto (solo admins) sigue el camino de siempre.
- **`/calendario` trae los pasados de a un mes**: los próximos enteros y, de los pasados, los del
  mes que abre; los de otro mes los pide al ir a ese mes (`/api/calendario/pasados?mes=yyyy-MM`,
  `src/lib/server/eventos/pasados.js`; detalles en [seo.md](seo.md)).

## Dónde está

| Qué                                                                    | Dónde                                                                                                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Publicaciones                                                          | En la base (objetos `evento`, `material`, `perfil`, `etiqueta`; [objetos.md](objetos.md))                                                       |
| Imágenes                                                               | La biblioteca (R2, [imagenes.md](imagenes.md)); las viejas, por `src/lib/utils/legacyMedia.js`                                                  |
| PDF, video y documento viejos del material                             | La biblioteca (objetos `archivo`, `/media/file/…`)                                                                                              |
| Plantillas de evento, material y perfil                                | `src/lib/admin/plantillas/` (`evento.md`, `material.md`, `perfil.md`)                                                                           |
| Árbol de etiquetas                                                     | En la base (Panel → Etiquetas, [etiquetas.md](etiquetas.md))                                                                                    |
| Semilla de las bases locales (dev, E2E)                                | `src/lib/server/semilla/` (`npm run db:semilla`)                                                                                                |
| Páginas públicas                                                       | `src/routes/(content)/` (`calendario`, `material`, `amigues`, `wiki`…)                                                                          |
| Listas públicas y sus filtros (buscador, barra de chips, árbol)        | `src/lib/components/PostList.svelte` con `TagSearch`, `FilterBar`, `TagBar` y `TagTree` ([estilo.md](estilo.md#barra-de-filtros-de-las-listas)) |
| Editor de eventos (nuevo, editar, duplicar, agenda, importar planilla) | `src/routes/(authed)/admin/eventos/`, `src/lib/server/eventos/`, `src/lib/utils/eventDraft.js`                                                  |
| Editor de material                                                     | `src/routes/(authed)/admin/contenido/material/`, `src/lib/server/admin/contentRoutes.js`, `posts.js`                                            |
| Editor de perfiles (amigues)                                           | `src/routes/(authed)/admin/comunidad/perfiles/`, `src/lib/server/admin/amiguesRoutes.js` ([amigues.md](amigues.md))                             |
| Editor de la wiki                                                      | `src/routes/(authed)/admin/etiquetas/wiki/[term]/`, `src/lib/server/etiquetas/wikiEditor.js`                                                    |
| Editor genérico (material; amigues y wiki llevan a sus editores)       | `src/routes/(authed)/edit/[category]/[postID]/`                                                                                                 |
| Cliente de contenido del panel                                         | `getRepoClient()` en `src/lib/server/eventos/index.js`: `withContentDb` sobre `contenido/cliente.js`                                            |

## Cómo probar

```sh
npm run dev:admin     # admin falso (.env.admin); guarda en la base local (con la semilla)
npx vitest run src/lib/server/eventos src/lib/server/admin src/lib/server/contenido
npx playwright test -c playwright.tickets.config.js tests/tickets/editor.spec.js
```

`dev:admin` entra como GorroRojo por defecto (`ADMIN_DEV_MOCK_LOGIN` para otro). En un preview de
PR, entrá como admin de prueba ([demo.md](demo.md)).

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
imagen vieja (un número), no se copia y queda el aviso para elegir una desde el editor.
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

**Importar un paquete de borradores de material.** Un paquete es una carpeta (fuera del repo:
nunca se sube) con `manifest.json` (`{ version, generado, articulos: [...] }`; cada artículo con
`slug`, `title`, `summary`, `tags`, `authors`, `body`, `portada: { archivo, alt }`, `notas`,
`importar` y, opcional, `fecha` AAAA-MM-DD), las portadas y las notas. Las rutas pueden venir con
`\` (Windows) o `/`. `scripts/importar-material.js` carga cada artículo con `importar: true` como
material **no listado** por el mismo camino que el panel al crear uno
(`src/lib/server/contenido/importarMaterial.js`: `mdToMaterial`, `validateData`,
`dehydrateContent`, `saveObject()` con historial `import` y quien guarda
`script:importar-material`):

```sh
node scripts/importar-material.js --paquete=<carpeta> --dry                       # local: qué haría
node scripts/importar-material.js --paquete=<carpeta>                             # local
node scripts/importar-material.js --paquete=<carpeta> --target=production --dry   # producción: qué haría
node scripts/importar-material.js --paquete=<carpeta> --target=production --yes   # pide escribir «produccion»
```

- El texto va tal cual (como el panel, sin líneas vacías al principio ni espacios al final; si eso
  cambia algo, lo avisa). `body_html: 'corta'` (la lista corta de HTML; decisión 0004).
- Fecha (`--fecha`): `original` (por defecto) toma `fecha` del manifiesto o, si no está, la línea
  `**Fuente:** <url> (AAAA-MM-DD, …)` de las notas (o los ítems de `## Fuentes`; con varias, la más
  vieja); si no hay, la de hoy y lo avisa. `hoy`: la de hoy.
- Autores: se buscan entre los perfiles vivos (no lugares) por dirección o nombre, sin tildes ni
  mayúsculas; el que aparece va como edge `persona` con el rol Autore; el que no (o con más de un
  perfil posible) queda como nombre y se avisa.
- Etiquetas: por su `key` (también sin tildes ni mayúsculas); las que no existen se avisan y quedan
  como texto, nunca se crean (se crean en Panel → Etiquetas y el próximo guardado las une).
- Solo la portada va a la biblioteca (`storeImage`, con su `alt`; JPG, PNG, WebP, GIF o AVIF) y
  se une con el edge `portada`. Las demás imágenes del paquete no se suben.
- Idempotente: una dirección que ya existe (también borrada) no se toca. Al final dice qué creó,
  qué salteó y qué tuvo problemas (sale con error si hubo problemas).

**Arreglar un evento, un material, un perfil o una página de la wiki.** Desde el panel (se guarda en
la base): los perfiles en Comunidad → Perfiles, la wiki en Etiquetas → cada etiqueta → «Entrada de
la Kinkipedia» (`/admin/etiquetas/wiki/<dirección>`). No hay otra forma: no quedan archivos.

**Tiempo de lectura** (idea de JorgeT10, PR #46). La página de un material y la de la wiki
(Kinkipedia) muestran «X min de lectura» junto a la fecha (material) o debajo del título (wiki).
Sale del texto guardado en la base (`data.body`, no del `.md` ni de lo armado):
`src/lib/utils/readingTime.js` lo pasa a texto plano con `stripMarkdown` (el del buscador), sin
bloques de código, y cuenta ~200 palabras por minuto, para arriba. Con menos de 100 palabras no se
muestra (un material que es solo un link, una entrada corta). Se calcula en cada pedido, al lado del
armado del texto (cuesta mucho menos que eso): sin columna ni migración. Los eventos no lo muestran
(casi todos se leen en menos de 2 minutos y lo que importa ahí es cuándo, dónde y las entradas). Lo
dibuja `src/lib/components/ReadingTime.svelte`: un reloj de Lucide (`Clock`, como en «Cuándo y
dónde») y el texto, que es un botón; al pasar el mouse, con el foco del teclado o al tocarlo (en el
celu no hay mouse) muestra la explicación de cómo se calcula (`READING_TIME_HINT`: «Calculado a unas
200 palabras por minuto, sin contar imágenes ni código»), unida al botón con `aria-describedby`.

**Velocidad de cada persona** (pedido de gorrite, en #274). En la explicación, «¿Leés más rápido o
más lento? Ajustalo» abre las opciones: «Más despacio» (150), «Predeterminado» (200), «Más rápido» (280) u
«Otro» (de 80 a 600). La elección vale para todo «X min de lectura» del sitio y la explicación pasa
a decir «Calculado a tu velocidad (N palabras por minuto), sin contar imágenes ni código». Además de
`readingMinutes`, el servidor manda `readingWords` (las palabras que cuentan; 0 si el texto es
corto) y el navegador recalcula con `minutesAtSpeed`. Para que nada se mueva, el servidor dibuja
siempre los minutos de siempre y el navegador los cambia después de hidratar solo si la persona
eligió otra velocidad. Dónde se guarda (navegador y cuenta) y quién gana al entrar:
[cuentas.md](cuentas.md), «Velocidad de lectura». También se elige en Mi rincón.

**Barra de progreso de lectura** (idea de #19, decisión 0044; pedido de gorrite, 12/10). En los
textos largos de Material y de la Kinkipedia, una línea fina (3px) arriba de todo se llena mientras
se lee: empieza cuando el borde de arriba de la ventana llega al título y se llena cuando el de
abajo llega al final del texto (no cuenta la propina, «Más cosas de…» ni la lista de abajo).
«Largo» sale del tiempo de lectura: 3 minutos o más a la velocidad de siempre
(`MIN_MINUTES_FOR_PROGRESS` y `showsReadingProgress` en `src/lib/utils/readingTime.js`, unas 600
palabras), no a la elegida, así está o no está igual para todes y el servidor ya la dibuja. La
dibuja `src/lib/components/ReadingProgress.svelte`: fija y con `transform`, sin correr nada; en
violeta (`--2`), para no confundirse con la barra de carga rosa, que queda por encima; decorativa
(`aria-hidden`); con «reducir movimiento», sigue al scroll sin el suavizado cortito.

## En la base (solo la base)

**Eventos** y **material** (`material`, mismo camino; ver `src/lib/server/contenido/categories.js`).
Los **perfiles de amigues** (objetos `perfil`, [amigues.md](amigues.md)) y la **wiki** (sus textos
son el cuerpo de las etiquetas, [etiquetas.md](etiquetas.md)) también.

- **Leer** (`src/lib/server/contenido/posts.js`): las listas, la página de cada evento y material,
  el `.ics`, las etiquetas y series, la búsqueda, `/api/posts`, el RSS, el sitemap, la venta de
  entradas y la puerta (`tickets/events.js`), el panel (lista, ficha, agenda, No listadas,
  Lugares) y los crons leen **solo la base** (convertida al mismo `ProcessedPost` que daba un
  `.md`). Una dirección que la base no tiene es 404. Sin base no hay eventos.
- **La página de un evento o un material** (`siteContent`): la dirección, el objeto y si es una
  parte oculta, en una consulta (lo mismo que `resolveContentSlug` + `getObject` + esa regla);
  después, a la par, sus relaciones y su portada; y al final, a la par, los vínculos públicos de
  la metadata y les autores con perfil, todes en una consulta (`findPublicProfiles` en
  `src/lib/server/amigues/profiles.js`, lo mismo que `findPublicProfile` dirección por dirección).
  La base está lejos: cada consulta que espera a otra es una ida y vuelta.
  `siteContent-consultas.test.js` fija cuántas consultas y tandas en fila hace.
- **Guardar** (`src/lib/server/contenido/repo.js`, `withContentDb`): todo lo que el panel escribe
  pasa por el cliente de contenido (`getRepoClient()`), que habla en rutas de los viejos `.md`
  (`src/lib/posts/<categoría>/<dirección>.md`) y las lleva a la base (editor, cargar y duplicar,
  agenda y borradores, importar la planilla, borrar y deshacer, las etiquetas). Lo que no es una
  publicación de la base no se puede guardar (`NotInRepoError`). Cada guardado es una versión nueva
  con historial (`object_revisions`, `source = 'panel'`).
- **Quién guarda** es siempre el **login de GitHub** de le admin (`saved_by`/`updated_by`):
  hooks.server.js corre el pedido de cada admin con `resolveAsPanelAuthor` (`contenido/author.js`).
  Ahí también se decide `body_html`: si el texto no cambió queda como estaba; si cambió, `'libre'`
  si guarda une superadmin y la lista corta si no.
- **Cómo se ve el texto** (decisión 0004: superadmins pueden usar HTML libre). Cada texto guarda
  cómo se muestra (`data.body_html`):
  - libre (lo que vino de los `.md` y lo que guarda une superadmin): `freeHtml.js` lo arma con el
    mismo camino que usaba mdsvex (rehype-slug, rehype-toc: el índice solo con 2 títulos o más, `customRehype`, comillas tipográficas,
    menciones y wiki). Lee el markdown como el parser de mdsvex donde CommonMark lo lee distinto
    (énfasis con `*` pegado o con espacios, una etiqueta HTML que corta el párrafo, listas) y no
    toca el HTML escrito a mano (como mdsvex: sin comillas tipográficas, menciones ni anclas
    adentro). Hasta la decisión 0032, un texto sin cambios respecto de su `.md` se dibujaba con el
    componente que mdsvex compilaba de ese `.md`; comparados uno por uno, los 571 eventos y
    materiales y las 12 páginas de la wiki dan el mismo HTML, salvo el embed de Instagram de
    `carrera-de-reyes-2025-04`, que ya no carga el script de Instagram (queda la tarjeta con el
    link). `freeHtml.test.js` tiene un caso inventado por cada diferencia que hubo. Dos arreglos
    de los textos viejos van en el CSS del contenido (`style.scss`, `.content`), no en los
    datos: el `<object type="application/pdf" width="50rem">` toma el ancho del texto (el
    atributo solo acepta píxeles) y las notas `<small class="footnote">` van una por línea
    (`src/tests/textos-viejos.test.js`);
  - lista corta: `amigues/sanitize.js`, como los perfiles (imágenes solo de la biblioteca propia,
    `/media/…`; ver [amigues.md](amigues.md)). Es también lo que se usa sin valor guardado: el
    HTML libre tiene que estar escrito (`body_html: 'libre'`; en la wiki, `wiki_body_html`).
- **Imágenes que un texto importa** (`import foto from './media/<carpeta>/1.webp'`): su copia en
  la biblioteca (`legacyMedia.js`, `contentMediaURL` en `render.js`). Los PDF, el video y el
  documento viejos ya no se importan: los textos los enlazan por su dirección de la biblioteca
  (`/media/file/…`).
- **Interactivos** (decisión 0004: «se hacen en código, como componente registrado»): en la base,
  el texto nombra un interactivo con una etiqueta propia, sola, sin atributos:
  `<kv-donde-golpear-un-cuerpo></kv-donde-golpear-un-cuerpo>`. El registro está en
  `src/lib/utils/interactivos.js` (etiquetas y su forma en los `.md` de «Descargar todo») y
  `src/lib/components/interactivos/index.js` (qué componente muestra cada una; los componentes
  viven en esa misma carpeta). Solo las registradas se muestran (también dentro de otro elemento,
  con `ContentParts.svelte`, que arma ese elemento con los atributos que ya dejó la limpieza del
  texto, leídos uno por uno); cualquier otra `<kv-…>` se ve escapada, como texto. Un interactivo
  nuevo necesita un PR. Hoy hay uno: `donde-y-como-golpear-un-cuerpo`. Los datos grandes de un
  interactivo (los trazos de su SVG) no van en el componente: el servidor se los pasa como props
  en su parte (`INTERACTIVE_PROPS` en `src/lib/server/contenido/interactive.js`, los datos en
  `src/lib/server/contenido/interactivos/`), así viajan solo en la página que lo usa y no en el
  JavaScript de todas las páginas con texto.
- **Descargar todo** (botón en Contenido → En la base, `descargar.tar`,
  `src/lib/server/contenido/download.js`): los eventos, el material, los perfiles de amigues
  (`amigues/<dirección>.md`) y las páginas de la wiki (`wiki/<dirección>.md`) de la base como `.md`
  en un `.tar`, con la misma metadata y el mismo texto (`download.test.js`, `fichas.test.js`); los
  ocultos con `force_unpublished: true`; no los borrados. Es una copia legible: para restaurar
  están los backups de la base ([datos.md](datos.md)); ya no hay importación desde el panel.
- **Base local, E2E y previews**: `npm run dev` (y `dev:admin`, `dev:tickets`) carga antes de
  arrancar la **semilla de contenido** (`scripts/semilla.js`, sin frenar el arranque si falla): una
  copia fija de contenido público de cuando se borraron los `.md` (las etiquetas y la wiki, los
  perfiles, el material y todos los eventos que se podían leer: las pruebas usan el conjunto entero),
  en `src/lib/server/semilla/*.json`. Idempotente; a mano, `npm run db:semilla`. Las pruebas E2E
  la cargan antes de `vite preview` y «Recargar datos de prueba» del preview carga sus perfiles.
  La semilla se carga con los mismos importadores de antes (`contenido/importer.js`,
  `amigues/importer.js`, `etiquetas/importer.js`), que ya no leen archivos.
- **Personas**: `authors:` y `personas:` se guardan como **una sola lista**,
  `[{ profile?, name?, role }]` (`src/lib/utils/personasList.js`; ver
  [personas-eventos.md](personas-eventos.md)). En los eventos y el material, cada perfil es un
  edge `persona` y el resto va en `data.personas` ([objetos.md](objetos.md)).
- El panel y las listas públicas recuerdan por isolate lo que leyeron de la base mientras no cambie
  (cuántos hay, su último `updated_at`, el último guardado de `object_revisions`) y, las listas
  públicas, mientras no cambie el árbol de etiquetas. Esa «marca» de «¿cambió algo?» se consulta
  **una sola vez por pedido de lectura** (`GET`/`HEAD`): la lista, los no listados, los pronombres
  y el índice de la búsqueda de un mismo pedido comparten la respuesta, también entre el layout y
  la página (`src/lib/server/db/perRequest.js`; la clave es el `Request` del pedido, porque cada
  `load` recibe su propia copia del evento). En un `POST` solo se comparte la consulta en camino, así un
  guardado del pedido se ve al toque; fuera de un pedido (scripts, crons, pruebas), una por
  llamada. **Entre pedidos se comparte solo lo ya leído, nunca una consulta en camino**
  (`readAndKeep` en `perRequest.js`; lo usan las listas, el panel, los interruptores, las tarjetas
  de entradas, la vista previa de links, el índice de la búsqueda y el bot): en Workers, si el
  pedido que empezó una consulta termina o se corta, la consulta puede no terminar nunca, y los
  pedidos que la esperaban se colgaban minutos (gorrite, 12/10: GET /admin y GET / con ~40 ms de
  CPU). El pedido que necesita un valor nuevo espera su propia consulta. Las listas públicas leen la metadata **sin el
  cuerpo** (`json_remove`); el cuerpo lo pide aparte solo la búsqueda (`siteBodies`).
- Si el isolate no tiene las listas públicas armadas, las busca en la **caché de Cloudflare** del
  centro de datos (`caches.default`, `edgeState` en `src/lib/server/contenido/posts.js`) antes de
  armarlas de la base: la clave es la marca de arriba, más una huella del árbol de etiquetas y la
  versión del build, así que un guardado del panel no necesita purgar nada (la clave cambia sola) y
  lo viejo vence en un día. Se guardan solo las listas armadas (los eventos y el material listados y
  no listados, sus direcciones y los perfiles); los cuerpos de la búsqueda y los pronombres se
  derivan después, como siempre. Cada vez que se arman de la base queda una línea en los registros
  del Worker (`contenido: listas armadas (marca …) en N ms`). Sin `caches` (vitest, el build,
  `vite dev`), como antes.

| Qué                                     | Dónde                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Mapa `.md` ↔ evento (ida y vuelta)      | `src/lib/server/contenido/eventos.js` (material: `material.js`)        |
| Cargar texto `.md` en la base (semilla) | `src/lib/server/contenido/importer.js`, `src/lib/server/semilla/`      |
| Qué cuenta como «igual»                 | `src/lib/server/contenido/parity.js`                                   |
| Lectura para las páginas                | `src/lib/server/contenido/posts.js`                                    |
| Guardar desde el panel                  | `src/lib/server/contenido/repo.js`, `cliente.js`                       |
| Texto del cuerpo                        | `src/lib/server/contenido/render.js` (`freeHtml.js`, `interactive.js`) |
| Imágenes viejas                         | `src/lib/utils/legacyMedia.js` (+ `legacyMedia.json`)                  |
| Interactivos                            | `src/lib/utils/interactivos.js`, `src/lib/components/interactivos/`    |
| Descargar todo                          | `src/lib/server/contenido/download.js`                                 |
| Pruebas con eventos inventados          | `src/lib/server/contenido/testing.js` (`seedPosts`, `fixtureFiles`)    |
| Esquema                                 | `migrations/0031_contenido_eventos.sql`                                |

### Amigues y la wiki (paso 2 de «solo base»)

- **Perfiles**: `/amigues`, la página de cada perfil, `sitePosts` (las listas, `/todo`, el sitemap,
  «Más cosas de…», `/api/posts`), les autores de un evento o material y los pronombres de las
  @menciones leen **solo la base** (`src/lib/server/amigues/asPost.js`, `pages.js`). El panel edita
  y borra solo en la base; la imagen se elige en el selector de la biblioteca (R2, edge `avatar`).
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

#### Decisiones de la wiki (confirmadas por gorrite, 5/10)

Propuestas por Claude; **confirmado por gorrite (5/10)**: las seis, tal como están.

1. **La wiki usa el tipo `etiqueta` que ya existía** (su texto de la wiki es el cuerpo de la
   etiqueta, tu diseño en [etiquetas.md](etiquetas.md)); no hay un tipo nuevo. La dirección de una
   página es la de su etiqueta (`tagSlug(key)`, igual a los nombres de los `.md`); un alias lleva a
   la página de la etiqueta. Dos campos nuevos (opcionales, sin migración): `wiki_tags` y
   `wiki_body_html` (sin valor = la lista corta; lo importado guarda `libre`, y la migración 0059
   lo escribió en las páginas que ya estaban, que antes eran «sin valor = HTML libre»).
2. **Editor de la wiki con campos** (título, resumen, autores, etiquetas, texto), no el texto crudo
   del `.md`; «Sacar la entrada» saca el texto y deja la etiqueta.
3. **Las listas del sitio** (`sitePosts`: `/todo`, el sitemap, `/api/posts`, «Más cosas de…») llevan
   los perfiles que lista `/amigues` (aprobados, no ocultos, con la misma lista blanca): también los
   lugares listados y los perfiles de cuentas aprobados, no solo las fichas de antes.
4. **«Descargar todo»** suma a cada perfil su tipo (`kind:`) y lo que las fichas del repo no tienen
   (más links, datos de un lugar, `show_members`).
5. **Elegir o sacar una imagen de la biblioteca** en un perfil saca las imágenes viejas de la ficha
   (`featured`, `logo`, `photo`), como `featured` en los eventos.
6. Sin base: `/amigues` vacío y sin páginas de la wiki (como los eventos).

## Lo que falta

- Que el panel guarde objetos directamente en vez de hablar en «rutas de `.md`» (el refactor
  profundo del plan de limpieza: `getRepoClient`, `withContentDb`, `commitFiles`).
