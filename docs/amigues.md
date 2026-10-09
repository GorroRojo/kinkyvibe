# Amigues y lugares (perfiles públicos)

Noche 3, bloque A (decisiones de gorrite del 1/10 y B3). El interruptor `perfiles_publicos`
**quedó prendido para siempre** ([interruptores.md](interruptores.md)): con base, todo esto
anda; la variable `PERFILES_PUBLICOS_ENABLED` ya no hace nada.

## Qué hace

- Las fichas de amigues (`src/lib/posts/amigues/*.md`) pasan a ser **perfiles** (`perfil` en
  [objetos.md](objetos.md)) de tipo **persona**, **proyecto** o **lugar**, con **las mismas
  direcciones** (`/amigues/Gorro_Rojo` sigue andando). **Solo la base** («solo base», paso 2): el
  sitio y el panel ya no leen ni escriben los `.md`, que quedan en el repo como respaldo (0004).
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
  origen y estado, CSV, «Para aprobar» y los pedidos "Es mi perfil". El editor edita el perfil en
  la base (publica al guardar, con aviso de conflicto), con su imagen elegida en el selector de la
  biblioteca (R2, edge `avatar`, [imagenes.md](imagenes.md)); también **Perfiles → Importar y
  clasificar** y **Eventos → Lugares**. La dirección vieja `/edit/amigues/<ficha>` lleva al editor.

## Solo la base (fichas sin importar)

Una ficha `.md` que la base todavía no tiene **no existe**: no está en `/amigues`, su página da 404
y el panel no la edita (avisa que hay que importarla). La importación (Perfiles → Importar y
clasificar) la pasa a la base con la misma dirección; la prueba `src/lib/server/contenido/fichas.test.js`
verifica que todas las fichas del repo se importan sin errores. Sin base no hay perfiles. Lo que
el sitio leía de los `.md` ahora sale de los perfiles (`src/lib/server/amigues/asPost.js`): las
listas (`sitePosts`), les autores de un evento o material y los pronombres de las @menciones.
«Descargar todo» los vuelve a dar como `.md` ([contenido.md](contenido.md)). Pasos para el cambio:
[contenido.md](contenido.md), «Amigues y la wiki».

## Borrar un perfil desde el panel

El editor de un perfil tiene «Borrar…», que lleva a la página de
confirmación de siempre (`/admin/borrar/amigues/<dirección>`: lo que depende del perfil y, si hay
algo, escribir la dirección para confirmar).

- **Todo perfil vive solo en la base** (los creados en el panel, los lugares, los de las cuentas y
  también las fichas importadas de un `.md`): se borra en la base, al toque y sin GitHub. Es el borrado suave del objeto
  (`deleted_at` con `saveObject()`, con su revisión en `object_revisions`); «Deshacer» y
  «Recuperar» (Actividad) lo vuelven atrás. Las relaciones (el edge `lugar` de los eventos,
  personas con rol, integrantes, quién lo gestiona) **quedan guardadas**: quienes las leen ya se
  saltean los perfiles borrados (`visibleWhere`, `getEdges`, `eventVenue`), así que dejan de
  aparecer y vuelven al deshacer. Un evento cuyo lugar se borró muestra su «Dónde» en texto libre,
  si tiene (también en los mails de las entradas): la página de borrar lo avisa.
- **Ficha del perfil en Comunidad › Cuentas** (`/admin/comunidad/cuentas/perfiles/<id>`):
  «Borrar el perfil» usa el mismo borrado (`deleteDbProfile`, con su fila `objeto:perfil:<id>` en
  `panel_deletions`), así que muestra «Deshacer» enseguida (`?/deshacer`,
  `undoDbProfileDeletionById`) y queda en «Recuperar» de Actividad (gorrite, 4/10).
- Antes, una ficha importada que tenía `.md` se borraba con un commit en GitHub: ya no («solo
  base»). Su `.md` queda en el repo como respaldo; volver a importarlo no la revive.

Código: `deleteDbProfile` y `deleteBackend` en `src/lib/server/admin/deletions.js`; pruebas en
`deletions-db.test.js` y `src/routes/(authed)/admin/borrar/borrar.test.js`.

## Una base nueva (orden recomendado)

1. Aplicar las migraciones `0017_amigues_lugares.sql` y `0024_perfil_fuente_proyecto.sql`
   (gorrite, como siempre: ver [datos.md](datos.md)).
2. En el panel del entorno (primero preview): **Perfiles → Importar y clasificar →
   Importar las fichas**. Se puede repetir: es idempotente.
3. Revisar la clasificación ("a confirmar"): confirmar o cambiar cada una (también hay CSV).
4. Cargar los lugares en **Eventos → Lugares** y vincular los eventos (ahí o en el «📍 Lugar» del
   formulario de cada evento).

Importar en local: `npm run amigues:import` (o `-- --dry` para ver qué haría). Demo con datos
inventados: `node scripts/demo/n3-amigues.js` y después `npm run dev:admin`.

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
(`data.privacy` del edge `lugar` del evento), y el del evento manda. Quien no quiera la
dirección pública elige otro nivel; el valor por defecto se decide en un solo lugar,
`DEFAULT_VENUE_PRIVACY` en `src/lib/utils/venues.js`:

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
dirección). La migración 0027 agregó `address` al CHECK de la tabla vieja `event_venues`; en el
edge, el nivel se valida en código (`isVenuePrivacy`).

En `name`, `area` y `hidden` aparece "Te mandamos la dirección con tu entrada" si el evento vende
entradas en el sitio; si no (no hay entrada que la lleve), no aparece ningún aviso (decisión de
gorrite, 9/10). En todos los
niveles **quien compró recibe el lugar completo** (nombre y dirección) en el mail de confirmación,
en los recordatorios y en la página de su entrada (con la compra aprobada).

La página del lugar muestra su ubicación según su nivel por defecto (el mapa, solo con
"Nombre + dirección").

**El mapa** (`VenueMap.svelte`): baldosas de OpenStreetMap como imágenes comunes con
`loading="lazy"` (sin librerías, scripts ni iframes de afuera, así que no hace falta tocar la CSP),
alto fijo (no corre nada al cargar) y ancho que se adapta al celular con el punto en el centro.
Abajo, «Abrir en OpenStreetMap» y el crédito «© colaboradores de OpenStreetMap» (el botón de
indicaciones «Cómo llegar» se sacó por pedido de gorrite, 4/10; la sección escrita «Cómo llegar»
del lugar y «Ver en Google Maps» siguen). Sale solo en "Nombre + dirección"
y "Sólo dirección": en los demás niveles el servidor no manda `lat`/`lng` (`venueView`; lo prueban
`venues.test.js` y `VenueLocation.test.js`). En la página del evento va chico en «Cuándo y dónde», arriba de «Ver en
Google Maps» (y no en un evento cancelado), con «Cómo llegar» y «Accesibilidad» en su propia
tarjeta más abajo (`src/lib/components/evento/`). Un evento con solo el «Dónde» en texto libre
no tiene mapa: no se geocodifica ni se inventa una ubicación.

**Sin filtraciones**: el sitemap, el RSS, el `.ics`, `/api/posts` y las imágenes para compartir
llevan de los perfiles solo lo que muestra `/amigues` a cualquiera (aprobados, no ocultos, con la
lista blanca de `publicProfile`; nunca la dirección de un lugar). La prueba
`src/routes/(content)/amigues/amigues-routes.test.js` planta un lugar oculto y revisa todas esas
salidas (también el buscador) y los datos de las páginas. Si el `.md` de un evento tiene
`location` escrita, es pública (el repo es público): Eventos → Lugares avisa para sacarla.

**El buscador** sigue la regla de gorrite: si quien busca ya tiene una forma de llegar a algo
navegando, lo puede encontrar buscando; nunca más. El índice es uno solo para todes (se recuerda
en el servidor), así que es lo que alcanza une visitante sin cuenta. Con base, lleva los lugares **listados** (están en `/amigues`) y los **no listados a los que lleva
el link de un evento visible** (listado y publicado, con el nivel «Nombre + dirección» o «Sólo
Nombre», y el lugar visible y aprobado: lo mismo que decide el link en la página del evento,
`linkedVenues` en `src/lib/server/amigues/venues.js`). De cada lugar, lo que muestra su página:
nombre, descripción, etiquetas y, si su nivel por defecto los muestra (`venuePageLevel` en
`src/lib/utils/venues.js`), barrio y ciudad. **Nunca la calle y número**, «cómo llegar» ni
«accesibilidad», ni en qué eventos está. Código: `src/lib/server/search/siteIndex.js`.

**«Dónde» sin lugar** (sitios de una sola vez que no son un Lugar: una plaza, un bar): el editor de
eventos tiene «Dónde» (el `location` en texto libre de siempre) y un **link al mapa** opcional
(`location_map`, solo https de OpenStreetMap o Google Maps; lo valida el guardado). La página del
evento los muestra («Ver en el mapa»; con nombre `location_name` y dirección, «Nombre ·
Dirección», o lo que haya de los dos) y el `.ics` lleva el texto en `LOCATION` y el link en la
descripción. «Online» solo si el evento es online (`modalidad: online`, un «Dónde» que dice
«Online»/«Virtual», o la etiqueta Online sin nombre ni dirección: `isOnlinePlace`); sin nada cargado no dice
nada (antes decía «Online»). Los datos estructurados de schema.org siguen lo mismo
(`eventPlaceSchema`). Si el evento tiene lugar en «Sucede en», **manda el lugar** y no se usa ni el texto
ni el link del `.md`. Todo en `src/lib/utils/eventPlace.js` (`eventPlace`, `eventPlaceSchema`, `checkMapLink`).

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
escribe el edge `lugar` del evento con `setEventVenue`/`removeEventVenue` (y el registro), se guarde
el texto del evento en GitHub o en la base: **el `.md` no cambia por el lugar** (salvo la fecha de
«Actualizado», que se pone como en cualquier guardado: cambiar solo el lugar en Editar también la
actualiza, decisión de gorrite). Al crear, el lugar se vincula recién cuando el evento se creó (si
crear falla, no se
vincula nada); al duplicar, arranca con el lugar del original. La ficha del evento muestra el lugar
y su nivel con «Cambiar». Código: `src/lib/server/amigues/eventFormVenue.js` y
`src/lib/utils/venueChoice.js`.

**Mapa**: baldosas de OpenStreetMap como imágenes comunes (sin librerías ni scripts de afuera; el
sitio no tiene CSP de imágenes en las páginas públicas, así que no hizo falta tocar
`securityHeaders.js`) y el link "Ver en OpenStreetMap".

**«Buscar en el mapa»** (pedido de gorrite): en el editor de un lugar del panel (Perfiles →
lugar) y en el de Mi rincón (el lugar que gestiona una cuenta, `/mi-rincon/perfiles/[slug]`), al
lado de la dirección, un botón que busca la dirección, el barrio y la ciudad (con
«Argentina» al final) en **Nominatim**, el buscador de OpenStreetMap, y muestra hasta 5
resultados con una vista previa del mapa (las mismas baldosas que `VenueMap`, sin librerías). El
punto se ajusta con un clic en la vista previa o con las flechas, y **«Usar esta ubicación»**
completa la latitud y la longitud; **no se guarda nada hasta guardar el formulario**. Sin
resultados: «No encontramos esa dirección. Probá agregando la ciudad o el barrio.». Con el botón
al lado, la explicación de la latitud y la longitud dice que se completan solas (y que se pueden
corregir a mano); donde no hay botón, sigue explicando cómo copiarlas de openstreetmap.org.

- **La dirección sale del sitio solo cuando alguien aprieta el botón** (une admin o quien gestiona
  el lugar): se manda a Nominatim (OpenStreetMap) desde el servidor, nunca desde el navegador,
  nunca sola, nunca para visitantes y nunca para el «Dónde» en texto libre de un evento. La
  privacidad del lugar no cambia: las coordenadas se siguen mostrando solo en los niveles que
  muestran la dirección.
- Endpoints (por POST para que la dirección no quede en URLs; las mismas respuestas y los mismos
  mensajes):
  - `POST /admin/geocodificar`: solo admins.
  - `POST /mi-rincon/geocodificar`: una cuenta con sesión que **gestiona al menos un lugar** (con
    el permiso de perfiles), así no sirve de buscador gratis para cualquier cuenta. Sin sesión,
    401; sin lugar, 403 («Buscar en el mapa es para quienes gestionan un lugar.»). Además, **10
    búsquedas cada 10 minutos por cuenta** (`rate_limits`, bucket `nominatim:a:<hash del id>`; se
    cuentan también las que salen de la memoria, no las que llegan sin dirección), así una cuenta
    no se queda con el pedido por segundo del sitio: «Hiciste muchas búsquedas seguidas. Esperá
    unos minutos y probá de nuevo, o cargá los números a mano.» (429).
- Política de uso de Nominatim: User-Agent `kinkyvibe/1.0 (+https://kinkyvibe.ar; …)` sin mails,
  **un pedido por segundo para todo el sitio** (`rate_limits`, bucket `nominatim`, compartido por
  los dos endpoints; sin base no se pide nada) y las búsquedas repetidas salen de una memoria de
  24 h del Worker.
- Código: `src/lib/server/geocode/nominatim.js` (la búsqueda), `src/lib/server/geocode/web.js`
  (cuerpo, respuestas, mensajes y límite por cuenta), `src/routes/(authed)/admin/geocodificar/`,
  `src/routes/(content)/mi-rincon/geocodificar/` y
  `src/lib/components/amigues/VenueGeocoder.svelte` (recibe el endpoint y las clases de cada
  página; `osmMovePoint` en `src/lib/utils/venues.js` mueve el punto).

**"Ver en Google Maps"** (pedido de gorrite): un link común (sin mapa embebido) en la página del
evento y en la del lugar, solo en "Nombre + dirección" y "Sólo dirección". Busca el punto si el
lugar lo tiene y, si no, la dirección; en "Sólo dirección" la búsqueda nunca lleva el nombre
(`googleMapsLink` en `src/lib/utils/venues.js`).

## Importar de eventos

**Eventos → Lugares → «Importar de eventos»** (`/admin/eventos/lugares/importar`, solo admins)
arma lugares con el «Dónde» que ya tienen los eventos (`location_name`, `location`,
`location_map`). Lee todos los eventos con los mismos lectores que el sitio (`sitePosts`: la
base). Reglas puras en `src/lib/utils/venueImport.js`;
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
  lleva su propio nivel en `data.privacy` de su edge `lugar`. Con nombre, el «Dónde» va entero a la
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
  `?tipo=lugar`); el sitemap y `/api/posts` salen de los `.md`, así que tampoco. El buscador sí
  puede llevarlo, pero solo si un evento visible lo linkea (ver «El buscador» arriba). Es
  aparte de la privacidad de la dirección: su evento muestra exactamente lo que su nivel deja ver
  (con el link a la página del lugar, que anda) y la página del lugar lista sus eventos. Lo prueban
  `src/lib/server/amigues/venueImport.test.js` y `src/routes/(content)/amigues/amigues-routes.test.js`.
  Se cambia después en el editor del perfil («No listar en /amigues»).
- **Nada se guarda hasta «Crear lugares»** (con confirmación). Los lugares nacen visibles y
  aprobados (como los que crea une admin), listados o no según lo elegido; se guardan con
  `saveObject()` y, en la misma tanda, su aprobación; después se vincula cada evento (un guardado
  del evento con su edge `lugar`, `linkEventVenueIfFree`). Vincular no toca el `.md` ni los datos
  del evento, solo un evento que está en la base se puede vincular, y nunca pisa el lugar de un
  evento que ya tiene uno. Va de a tandas y se puede
  repetir; cada lugar creado o vínculo queda en Actividad. Hay CSV de los candidatos.

## Vincular lugares

**Eventos → Lugares → «Vincular lugares»** (`/admin/eventos/lugares/vincular`, solo admins; botón
en el encabezado de Lugares). Muchos eventos tienen el lugar solo como texto («Dónde»:
`location_name` / `location`) y no tienen edge `lugar`, así que su página no puede mostrar el mapa.
Pedido de gorrite: una herramienta que sugiera, para cada «Dónde» escrito, el perfil de lugar que
probablemente es, para confirmar de a muchos. A diferencia de «Importar de eventos» (que crea
lugares), esta vincula con los **lugares que ya existen**. Reglas puras en
`src/lib/utils/venueMatch.js`; lecturas y escrituras en `src/lib/server/amigues/venueLinking.js`.

- **Grupos**: los eventos sin lugar (un vínculo a un lugar borrado no cuenta) y con «Dónde»,
  juntados con las mismas reglas que «Importar de eventos» (`planVenueImport`: mismo nombre, misma
  calle y número o mismo link al mapa). Cada grupo muestra cómo lo escribieron, cuántos eventos y
  desde cuándo hasta cuándo. Se saltean los online y los que no tienen «Dónde».
- **Sugerencias** (hasta 3 por grupo, con el puntaje y por qué), comparando con cada lugar:

  | Señal                                                                         | Puntaje  |
  | ----------------------------------------------------------------------------- | -------- |
  | mismo nombre (el del lugar, su dirección en el sitio o la de su ficha .md)    | 100      |
  | misma calle y número                                                          | 95       |
  | mismo punto del mapa (el link del evento a menos de 150 m del lugar)          | 90       |
  | mismo número y calle parecida                                                 | 80       |
  | nombre parecido (similitud de letras) o un nombre contiene al otro            | hasta 85 |
  | dirección parecida (sin número que coincida)                                  | hasta 70 |
  | mismo nombre pero otra dirección (¿se mudó? ¿otro lugar con el mismo nombre?) | 70       |

  Manda la señal más fuerte y cada señal fuerte de más suma 5 (hasta 100). Se sugieren las de 45
  o más. Para comparar: sin mayúsculas, tildes ni puntuación; en la dirección, sin «Av.»,
  «Avenida», «Calle», «Pasaje»…, con «Gral.», «Pte.», «Dr.»… enteros, sin el punto de los miles
  («1.234») ni el «N°», y sin lo que viene después del número (piso, depto). La primera sugerencia
  viene **elegida**, y **marcada** para «Vincular todas las marcadas» solo si tiene 85 o más y le
  gana por 10 o más a la segunda.

- **Otras opciones** por grupo: «Buscar otro lugar» (por nombre, calle o barrio, entre todos los
  lugares), «Crear lugar nuevo» (abre Perfiles → nuevo con el nombre y la dirección ya escritos:
  `?tipo=lugar&nombre=…&direccion=…`; después de crearlo, el grupo lo sugiere con «mismo nombre») y
  «Dejar como texto».
- **Qué se ve**: con el lugar elegido, la página dice qué eventos se van a ver distinto y por qué
  (`eventFit`, la misma lista blanca que la página del evento).
- **Privacidad** (decidido por Claude, a confirmar): cada evento queda con el nivel del lugar,
  salvo que el evento mostraba menos (por ejemplo, solo el nombre): entonces lleva ese nivel como
  propio en el edge (`linkPrivacy`). Nunca muestra del lugar más de lo que el lugar deja ver por
  defecto, aunque el evento mostrara más en su texto.
- **«Vincular»** (un grupo) y **«Vincular todas las marcadas»** (con confirmación) escriben el edge
  `lugar` de cada evento con `linkFreeEventVenue` (saveObject() sobre el evento: versión nueva,
  revisión con `source = 'lugar'`, `content_sources` al día), como el formulario del evento. Cada
  evento se revisa otra vez al guardar: uno que consiguió lugar en el medio (o quedó como texto) se
  saltea; repetir es seguro. El «Dónde» escrito **no se toca** (se vuelve a ver si se saca el
  lugar). Va de a tandas (el máximo de consultas de D1 por pedido); la página repite con lo que
  falta y muestra lo vinculado, lo salteado y los errores de cada grupo. Cada grupo vinculado queda
  en Actividad (`venue.bulk_link`, con los eventos y su nivel).
- **«Dejar como texto»**: los eventos del grupo no se sugieren más. Es una fila por evento en
  `event_venue_dismissals` (migración 0046; no en el JSON del evento, que le subiría la versión),
  con la clave de su «Dónde» de ese momento (`placeKeyOf`): si alguien cambia el «Dónde», se
  vuelve a sugerir. Abajo, «Quedaron como texto» los lista con «Volver a sugerir» (borra las
  filas). Los dos quedan en Actividad (`venue.link_dismiss`, `venue.link_undismiss`).

## «Sucede en» es un edge

"Sucede en" es un **edge `lugar`** del evento (evento → perfil de tipo lugar), escrito solo con
`saveObject()` sobre el evento (regla 4 de [objetos.md](objetos.md); decisión de gorrite,
«Contenido solo en la base», paso 3). El nivel propio del evento va en `edges.data`
(`{ "privacy": "name" }`); sin nivel propio, el edge no tiene `data` y vale el del lugar.

- **El evento tiene que estar en la base** (importado desde Contenido → En la base, o creado con
  `contenido_db`). Si no, vincular contesta «Ese evento todavía no está en la base: importalo…»
  (`NOT_IN_DB`) y el formulario guarda el texto igual, con ese aviso.
- Para afuera todo sigue siendo **por la dirección del evento**: la de su página, la del `.md`
  importado (`content_sources.legacy_slug`) o la del objeto (la misma regla que `postID` en
  `contenido/posts.js`). Las lecturas de `src/lib/server/amigues/venues.js` (`eventVenue`,
  `feedVenues`, `linkedVenues`, `listedVenueEvents`, `listEventVenues`) leen los edges con esa
  dirección; son lecturas internas (deciden qué mostrar) y nunca mandan el lugar entero a una
  página: lo que se ve sale de `venueView` según el nivel, como antes.
- Cada cambio es una **versión nueva del evento** con su revisión (`object_revisions`, `source =
'lugar'`). Si el evento se importó de un `.md` y nadie lo había editado, sigue contando como no
  editado (`content_sources.imported_version` sube con él), así volver a importar su `.md` lo
  sigue actualizando. El guardado del texto (panel o importación) no toca el edge `lugar`.
- Un evento con lugar **y** la etiqueta «Online» no está claro (¿presencial u online?): el panel lo
  avisa (editor, ficha y una fila de «Para revisar» en el Inicio) sin cambiar nada. Ver
  [panel.md](panel.md), «Aviso «Online con lugar»».
- `eventVenuesStamp` (lo usa el índice de la búsqueda para saber si cambió algo) suma la versión de
  los eventos con lugar: cualquier cambio del vínculo la mueve.
- **La tabla `event_venues` queda en la base pero nadie la usa** (las migraciones solo agregan).
  La migración `0035_relaciones_edges.sql` pasó a edges las filas de los eventos que ya estaban en
  la base; las de eventos que todavía eran solo `.md` se pasan cuando se importan
  (`legacyVenueEdge` en `contenido/importer.js`, la única lectura que queda). Una migración futura
  la puede borrar cuando todos los eventos estén en la base.
- Antes (0017 → 0035) era esa tabla, por la dirección del evento, mientras los eventos eran `.md`.

## Tablas (migraciones 0017, 0024, 0025 y 0046)

| Tabla                    | Qué guarda                                                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile_sources`        | de qué `.md` vino cada perfil (dirección vieja, SHA-256, versión importada) y la clasificación (propuesta: persona, proyecto o lugar; por qué; confirmada). 0024 rehízo la tabla para que la propuesta diga `proyecto` y no `grupo` |
| `profile_approvals`      | perfiles aprobados para `/amigues`                                                                                                                                                                                                  |
| `profile_claims`         | pedidos "Es mi perfil" (pendiente, aprobado, rechazado)                                                                                                                                                                             |
| `profile_rejections`     | lugares de cuentas rechazados (0025): quién, cuándo y el motivo que ve quien lo cargó; «Volver a mandar» o aprobarlo borra la fila                                                                                                  |
| `event_venue_dismissals` | «Dejar como texto» de Vincular lugares (0046): un evento por fila, con la clave de su «Dónde» de entonces; si el «Dónde» cambia, se vuelve a sugerir                                                                                |
| `event_venues`           | "sucede en" de antes (0017, 0027); desde 0035 es el edge `lugar` del evento y la tabla ya no se usa                                                                                                                                 |

## Dónde está el código

- `src/lib/server/amigues/`: `importer.js` y `classify.js` (importación y clasificación),
  `profiles.js` (quién ve qué), `pages.js` (lo que arman las páginas), `venues.js` (lugares y
  privacidad), `claims.js`, `approvals.js`, `editor.js` (editor del panel), `venueImport.js` (Importar de eventos), `venueLinking.js` (Vincular lugares), `render.js` y
  `sanitize.js` (texto en HTML), `review.js` (importar desde el panel y CSV).
- Reglas puras de privacidad y mapa: `src/lib/utils/venues.js`; de Vincular lugares (sugerencias):
  `src/lib/utils/venueMatch.js`.
- Páginas: `src/routes/(content)/amigues/`; panel: `src/routes/(authed)/admin/comunidad/perfiles/`,
  `admin/eventos/lugares/`, `admin/comunidad/cuentas/perfiles/[id]/` (ficha de un perfil). Componentes: `src/lib/components/amigues/`
  y `src/lib/components/admin/amigues/`.
- Script: `scripts/import-amigues.js`; demo: `scripts/demo/n3-amigues.js`.

## Probarlo

`npx vitest run src/lib/server/amigues src/lib/server/geocode src/lib/utils/venues.test.js src/lib/utils/venueMatch.test.js "src/routes/(content)/amigues" "src/routes/(authed)/admin/eventos/lugares" "src/routes/(authed)/admin/comunidad/perfiles" "src/routes/(authed)/admin/geocodificar" "src/routes/(content)/mi-rincon/geocodificar" "src/routes/(content)/mi-rincon/perfiles/geocoder-render.test.js"`
