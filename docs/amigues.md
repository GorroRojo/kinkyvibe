# Amigues y lugares (perfiles públicos)

Noche 3, bloque A (decisiones de gorrite del 1/10 y B3). Todo detrás del interruptor
**`perfiles_publicos`, apagado** (Ajustes → Interruptores, o `PERFILES_PUBLICOS_ENABLED=1|0`).

## Qué hace

- Las fichas de amigues (`src/lib/posts/amigues/*.md`) pasan a ser **perfiles** (`perfil` en
  [objetos.md](objetos.md)) de tipo **persona**, **proyecto** o **lugar**, con **las mismas
  direcciones** (`/amigues/Gorro_Rojo` sigue andando). Los `.md` quedan en el repo hasta que
  gorrite confirme que todo coincide.
- `/amigues` es la página pública de perfiles: lista (con filtro `?tipo=`) y página de cada uno.
- **"Es mi perfil"**: una cuenta con el permiso "puede tener perfiles" pide hacerse cargo; une
  admin lo aprueba (la cuenta pasa a ser dueñe) o lo rechaza.
- **Aprobación**: un perfil nuevo creado por una cuenta aparece en `/amigues` recién cuando une
  admin lo aprueba. Hasta entonces lo ven solo quienes lo gestionan y les admins.
- **Lugares desde las cuentas** (decisión de gorrite,
  [0022](decisiones/0022-lugares-desde-cuentas.md)): una cuenta con el permiso de perfiles crea un
  lugar en Mi rincón → Perfiles y completa su dirección. No aparece en el sitio (ni en `/amigues`,
  ni en su página, ni en los eventos) hasta que une admin lo aprueba en **Eventos → Lugares →
  "Para aprobar"** (lista con CSV; aprobar o rechazar, que lo borra). Los que crea une admin y los
  importados nacen aprobados. Código: `src/lib/server/amigues/pendingVenues.js`.
- **Lugares**: dirección, barrio, ciudad, ubicación (lat/lng), accesibilidad, cómo llegar, mapa de
  OpenStreetMap y sus eventos. **Privacidad de la dirección** por lugar con cambio por evento.
- Panel: **Perfiles** (`/admin/comunidad/perfiles`) es la única lista de perfiles (decisión de gorrite del
  1/10; "Amigues" queda solo como nombre del directorio público `/amigues`): filtros por tipo,
  origen y estado, CSV, «Para aprobar», los pedidos "Es mi perfil" y, con el interruptor apagado,
  la pestaña «Fichas .md». El editor edita el perfil en la base (publica al guardar, con aviso de
  conflicto); también **Perfiles → Importar y clasificar** y **Eventos → Lugares**.

## Con el interruptor apagado

Todo como antes: `/amigues`, las fichas, los eventos, los mails y las entradas leen los `.md`. El
panel deja igual importar, revisar la clasificación y cargar lugares, para preparar todo antes de
prenderlo. Las fichas importadas se siguen editando en su `.md` (lo que muestra el sitio).

## Prenderlo (orden recomendado)

1. Aplicar las migraciones `0017_amigues_lugares.sql` y `0024_perfil_fuente_proyecto.sql`
   (gorrite, como siempre: ver [datos.md](datos.md)).
2. En el panel del entorno (primero preview): **Perfiles → Importar y clasificar →
   Importar las fichas**. Se puede repetir: es idempotente.
3. Revisar la clasificación ("a confirmar"): confirmar o cambiar cada una (también hay CSV).
4. Cargar los lugares en **Eventos → Lugares** y vincular los eventos (ahí o en el «📍 Lugar» del
   formulario de cada evento).
5. Prender `perfiles_publicos`.

Importar en local: `npm run amigues:import` (o `-- --dry` para ver qué haría). Demo con datos
inventados: `node scripts/demo/n3-amigues.js` y después
`PERFILES_PUBLICOS_ENABLED=1 CUENTAS_ENABLED=1 npm run dev:admin`.

## Lo que nunca se tiene que romper

- **Un solo camino de escritura**: los perfiles se escriben con `saveObject()`. Las tablas de
  apoyo de la migración 0017 van en la misma tanda (`also`) o desde el panel.
- **La importación no pisa nada**: si un perfil se editó en el panel (su `version` ya no es la de
  la importación) o se borró, volver a importar no lo toca (lo informa).
- **Ocultar o borrar en la base gana sobre el `.md`**: si hay un perfil con esa dirección y quien
  mira no lo puede ver, 404, aunque el `.md` siga en el repo.
- **Lista blanca**: las páginas reciben `publicProfile()` (src/lib/server/amigues/profiles.js),
  nunca el objeto. **El contacto se muestra** (decisión de gorrite,
  [0023](decisiones/0023-contacto-publico.md)): los links, el mail y el teléfono de la ficha
  (públicos a propósito, están en el repo) salen en "Contacto" de la página del perfil o del lugar
  (`contactItems()` en `src/lib/utils/perfiles.js`: solo links web, `mailto:` y `tel:`). El
  cumpleaños y la identidad de género se importan pero no se muestran, como antes.
- **Quienes gestionan no se muestran nunca**; integrantes de un proyecto, solo con `show_members`,
  solo aceptades, aprobades y visibles para quien mira.
- **"Es mi perfil" no revela nada**: la misma respuesta haya o no otros pedidos o dueñes; cada
  cuenta ve solo su pedido. Límites: 5 por día por cuenta y 10 por conexión.
- **El HTML del texto se limpia en el servidor** con `rehype-sanitize` (el esquema de GitHub,
  ajustado en `src/lib/server/amigues/sanitize.js`, el único lugar que lo decide): lista corta de
  etiquetas; sin scripts, estilos, `on…`, `javascript:` ni `data:`; `id`/`name` con prefijo.
- **La dirección de un lugar nunca sale de su nivel** (abajo).

## Privacidad de los lugares

Cada lugar tiene un nivel por defecto (`venue_privacy`; sin elegir: **la dirección completa**,
decisión de gorrite; también
vale para los lugares ya guardados sin nivel) y cada evento lo puede cambiar
(`event_venues.privacy`), y el del evento manda. Quien no quiera la dirección pública elige otro
nivel; el valor por defecto se decide en un solo lugar, `DEFAULT_VENUE_PRIVACY` en
`src/lib/utils/venues.js`:

| Nivel     | En el panel                       | En la página del evento                          | ¿El lugar lista el evento? |
| --------- | --------------------------------- | ------------------------------------------------ | -------------------------- |
| `public`  | "Nombre + dirección"              | nombre (link), dirección, mapa, etc.             | sí                         |
| `name`    | "Sólo Nombre"                     | solo el nombre (link al lugar)                   | sí                         |
| `address` | "Sólo dirección"                  | dirección, barrio, ciudad y mapa (sin el nombre) | no                         |
| `area`    | "Sólo dirección parcial (Barrio)" | solo barrio y ciudad (sin nombre)                | no                         |
| `hidden`  | "Nada"                            | "Lugar a confirmar"                              | no                         |

Los textos del panel salen de un solo mapa, `VENUE_PRIVACY_LABELS` en `src/lib/utils/venues.js`
(los eligió gorrite); en un evento, la opción de heredar dice "Igual que el Lugar (<nivel>)".

**Sólo dirección** (`address`, gorrite en #153) es para un lugar cuyo nombre delataría a alguien
(una casa particular): la página del evento y el `.ics` muestran la dirección y el mapa (decisión
de gorrite), pero no el nombre, el link, "cómo llegar" ni "accesibilidad" (textos libres que
pueden nombrarlo). Por lo mismo la página del lugar, que siempre muestra el nombre, no lista esos
eventos, y si el nivel por defecto del lugar es este, su página se ve como "Sólo Nombre" (sin la
dirección). La migración 0027 agrega `address` al CHECK de `event_venues.privacy`.

En `name`, `area` y `hidden` aparece "Te mandamos la dirección con tu entrada". En todos los
niveles **quien compró recibe el lugar completo** (nombre y dirección) en el mail de confirmación,
en los recordatorios y en la página de su entrada (con la compra aprobada).

La página del lugar muestra su ubicación según su nivel por defecto (el mapa, solo con
"Nombre + dirección").

**Sin filtraciones**: el sitemap, el RSS, el `.ics`, `/api/posts`, el índice del buscador y las
imágenes para compartir se arman al compilar desde los `.md`, así que no pueden contener nada de
la base. La prueba `src/routes/(content)/amigues/amigues-routes.test.js` planta un lugar oculto y
revisa todas esas salidas y los datos de las páginas. Si el `.md` de un evento tiene `location`
escrita, es pública (el repo es público): Eventos → Lugares avisa para sacarla.

**«Dónde» sin lugar** (sitios de una sola vez que no son un Lugar: una plaza, un bar): el editor de
eventos tiene «Dónde» (el `location` en texto libre de siempre) y un **link al mapa** opcional
(`location_map`, solo https de OpenStreetMap o Google Maps; lo valida el guardado). La página del
evento los muestra («Ver en el mapa») y el `.ics` lleva el texto en `LOCATION` y el link en la
descripción. Si el evento tiene lugar en «Sucede en», **manda el lugar** y no se usa ni el texto
ni el link del `.md`. Todo en `src/lib/utils/eventPlace.js` (`eventPlace`, `checkMapLink`).

**Elegir el lugar desde el evento** (pedido de gorrite): el formulario de eventos (crear, duplicar y
editar) tiene la sección **«📍 Lugar»** (`PlaceSection.svelte` en
`src/lib/components/admin/event-form/`): un buscador de lugares (también los ocultos, no listados y
sin aprobar, marcados; con su dirección, barrio y ciudad, porque es el panel), el nivel para este
evento («Igual que el Lugar (…)» o los otros), **«Editar»** el lugar elegido (nombre, dirección,
barrio y ciudad, sin salir del formulario; se guarda en el perfil como desde su editor, con
`profile.update` en el registro) y **«+ Crear lugar»** (nombre y dirección; nace **no listado** en
Amigues salvo que se elija «Público», como al importar lugares desde los eventos: `venueListing`).
No listado no es oculto: el evento lo muestra según su nivel. Con un lugar, el «Dónde» en texto
libre queda plegado («Usar texto libre en vez de un lugar»), como en las páginas públicas. Guardar
escribe `event_venues` con `setEventVenue`/`removeEventVenue` (y el registro), se guarde el evento
en GitHub o en la base: **el `.md` no cambia por el lugar** (salvo la fecha de «Actualizado», que se
pone como en cualquier guardado: cambiar solo el lugar en Editar también la actualiza, decisión de
gorrite). Al crear, el lugar se vincula recién cuando el evento se creó (si crear falla, no se
vincula nada); al duplicar, arranca con el lugar del original. La ficha del evento muestra el lugar
y su nivel con «Cambiar». Código: `src/lib/server/amigues/eventFormVenue.js` y
`src/lib/utils/venueChoice.js`.

**Mapa**: baldosas de OpenStreetMap como imágenes comunes (sin librerías ni scripts de afuera; el
sitio no tiene CSP de imágenes en las páginas públicas, así que no hizo falta tocar
`securityHeaders.js`) y el link "Ver en OpenStreetMap".

**"Ver en Google Maps"** (pedido de gorrite): un link común (sin mapa embebido) en la página del
evento y en la del lugar, solo en "Nombre + dirección" y "Sólo dirección". Busca el punto si el
lugar lo tiene y, si no, la dirección; en "Sólo dirección" la búsqueda nunca lleva el nombre
(`googleMapsLink` en `src/lib/utils/venues.js`).

## Importar de eventos

**Eventos → Lugares → «Importar de eventos»** (`/admin/eventos/lugares/importar`, solo admins)
arma lugares con el «Dónde» que ya tienen los eventos (`location_name`, `location`,
`location_map`). Lee todos los eventos con los mismos lectores que el sitio (`sitePosts`: los
`.md`, o la base con `contenido_db` prendido). Reglas puras en `src/lib/utils/venueImport.js`;
lecturas y escrituras en `src/lib/server/amigues/venueImport.js`.

- **Mismo lugar**: el mismo nombre, la misma calle y número o el mismo link al mapa, sin importar
  mayúsculas, tildes, espacios, puntuación, «Av.» ni «CABA» / «Ciudad Autónoma de Buenos Aires».
  Un barrio solo («Almagro, CABA») no es una dirección: junta solo eventos sin nombre. Dos grupos
  con el mismo nombre y direcciones distintas quedan aparte (se avisa: ¿se mudó?).
- Se saltean los eventos online, los que no tienen «Dónde» y los que ya tienen lugar. Si el lugar
  ya existe (mismo nombre o misma calle y número), se ofrece vincular sus eventos.
- **Privacidad** (gorrite: «si está en los eventos, es público»): cada evento queda con el nivel
  que muestra lo mismo que ya mostraba:

  | El evento muestra                         | Nivel                             |
  | ----------------------------------------- | --------------------------------- |
  | nombre y dirección (o barrio, o mapa)     | "Nombre + dirección"              |
  | solo el nombre                            | "Sólo Nombre"                     |
  | solo una dirección con número (o un mapa) | "Sólo dirección"                  |
  | solo un barrio o ciudad (sin número)      | "Sólo dirección parcial (Barrio)" |

  El lugar toma el más abierto de los eventos que se vinculan, y cada evento que muestra menos
  lleva su propio nivel en `event_venues.privacy`. Con nombre, el «Dónde» va entero a la
  dirección del lugar; sin nombre ni número, al barrio.

- **Nada cambia en el sitio**: un evento se propone marcado solo si con el lugar se ve lo mismo
  (`eventFit`, con la misma lista blanca que la página). Si no (otro nombre, otra forma de escribir
  la dirección), queda sin marcar y la vista previa dice qué cambiaría. La prueba
  `src/lib/server/amigues/venueImport.test.js` compara la página, las listas y el `.ics` de cada
  evento antes y después de vincularlo.
- **Listados o no en `/amigues`** (decidido por gorrite: **no listados por defecto**): la vista
  previa tiene «Cómo se crean: No listados (no aparecen en Amigues) · Públicos» y cada lugar nuevo
  lo puede cambiar («Como todos», «No listado», «Público»). No listado es `data.unlisted` del
  perfil, como cualquier perfil no listado: no sale en las listas de `/amigues` (ni en
  `?tipo=lugar`); el sitemap y `/api/posts` salen de los `.md`, así que tampoco, y el buscador
  nunca lleva lugares (con el interruptor prendido indexa los perfiles de persona y proyecto que
  lista `/amigues`, ver `src/lib/server/search/siteIndex.js`). Es
  aparte de la privacidad de la dirección: su evento muestra exactamente lo que su nivel deja ver
  (con el link a la página del lugar, que anda) y la página del lugar lista sus eventos. Lo prueban
  `src/lib/server/amigues/venueImport.test.js` y `src/routes/(content)/amigues/amigues-routes.test.js`.
  Se cambia después en el editor del perfil («No listar en /amigues»).
- **Nada se guarda hasta «Crear lugares»** (con confirmación). Los lugares nacen visibles y
  aprobados (como los que crea une admin), listados o no según lo elegido; se guardan con
  `saveObject()` y, en la misma tanda, su aprobación y los vínculos. Vincular no toca el `.md` ni el objeto del evento (es una fila de
  `event_venues`), y nunca pisa el lugar de un evento que ya tiene uno. Va de a tandas y se puede
  repetir; cada lugar creado o vínculo queda en Actividad. Hay CSV de los candidatos.

## Del vínculo provisorio al edge

Mientras los eventos sigan siendo `.md`, "sucede en" es una fila de **`event_venues`**
(`event_slug` → `venue_id`, con `privacy`; confirmado por gorrite, porque los eventos pasan a la
base pronto). Se eligió una tabla y no `lugar:` en el frontmatter
porque: la dirección y la privacidad quedan fuera del repo público; el cambio se ve al toque (sin
PR ni deploy); `venue_id` tiene foreign key al objeto; y las salidas compiladas no pueden filtrar
nada. Contra: si se cambia la dirección (slug) de un evento, hay que volver a vincularlo.

Cuando los eventos pasen a la base: por cada fila, `saveObject()` del evento con
`edges: { lugar: [{ to: venue_id, data: privacy ? { privacy } : null }] }` (el tipo `evento` ya
tiene el edge `lugar` hacia… `lugar`: hay que cambiar su destino a `perfil`), y después se borra
la tabla en una migración nueva. Las lecturas de `src/lib/server/amigues/venues.js` pasan a
`getEdges`.

## Tablas (migraciones 0017, 0024 y 0025)

| Tabla                | Qué guarda                                                                                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile_sources`    | de qué `.md` vino cada perfil (dirección vieja, SHA-256, versión importada) y la clasificación (propuesta: persona, proyecto o lugar; por qué; confirmada). 0024 rehízo la tabla para que la propuesta diga `proyecto` y no `grupo` |
| `profile_approvals`  | perfiles aprobados para `/amigues`                                                                                                                                                                                                  |
| `profile_claims`     | pedidos "Es mi perfil" (pendiente, aprobado, rechazado)                                                                                                                                                                             |
| `profile_rejections` | lugares de cuentas rechazados (0025): quién, cuándo y el motivo que ve quien lo cargó; «Volver a mandar» o aprobarlo borra la fila                                                                                                  |
| `event_venues`       | "sucede en" provisorio, con la privacidad del evento                                                                                                                                                                                |

## Dónde está el código

- `src/lib/server/amigues/`: `importer.js` y `classify.js` (importación y clasificación),
  `profiles.js` (quién ve qué), `pages.js` (lo que arman las páginas), `venues.js` (lugares y
  privacidad), `claims.js`, `approvals.js`, `editor.js` (editor del panel), `render.js` y
  `sanitize.js` (texto en HTML), `review.js` (importar desde el panel y CSV).
- Reglas puras de privacidad y mapa: `src/lib/utils/venues.js`.
- Páginas: `src/routes/(content)/amigues/`; panel: `src/routes/(authed)/admin/comunidad/perfiles/`,
  `admin/eventos/lugares/`, `admin/comunidad/cuentas/perfiles/[id]/` (ficha de un perfil). Componentes: `src/lib/components/amigues/`
  y `src/lib/components/admin/amigues/`.
- Script: `scripts/import-amigues.js`; demo: `scripts/demo/n3-amigues.js`.

## Probarlo

`npx vitest run src/lib/server/amigues src/lib/utils/venues.test.js "src/routes/(content)/amigues" "src/routes/(authed)/admin/comunidad/perfiles"`
