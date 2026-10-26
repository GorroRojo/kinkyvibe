# Compartir un link: la vista previa

Cuando alguien pega un link del sitio en WhatsApp, Telegram, Instagram o X, la app arma una tarjeta
con un título, una descripción y una imagen. Esa tarjeta sale de las etiquetas Open Graph
(`og:*`) y de Twitter (`twitter:*`) del `<head>` de cada página. Esta guía dice qué pone cada tipo
de página y dónde se arma. (La **imagen para compartir** que se descarga desde
`/calendario/<evento>/compartir` es otra cosa: se dibuja en el navegador; ver
`src/lib/utils/shareImage.js`.)

## Lo que nunca se tiene que romper

- **Una sola vez cada etiqueta.** Si `og:url` o `og:image` aparecen dos veces, cada app toma la que
  quiere. Por eso ningún layout pone etiquetas `og:*`: las pone solo `SeoHead` en cada página.
- **Direcciones enteras** (`https://…`), nunca relativas: `og:image` relativa no se ve en ninguna
  app. Se arman con el origen del pedido (`$page.url.origin`), así un preview muestra sus propias
  imágenes.
- **Nada que la página no muestre a alguien sin cuenta.** La app que arma la tarjeta entra sin
  sesión: un evento oculto, un perfil sin aprobar o algo «solo con cuenta» le da 404 y no hay
  tarjeta. El lugar de un evento va según su nivel de privacidad (lo mismo que el carrusel y la
  imagen para compartir, `placeShort` + `venuePlaceMeta`): nunca una dirección escondida.
- **No listado no es oculto**: un evento, material o perfil no listado (o un borrador) se puede
  compartir por link y tiene su tarjeta, pero lleva `robots: noindex` para que los buscadores no lo
  guarden.

## Dónde está

| Qué                                     | Dónde                                                                                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El componente (canónica, `og:*`, etc.)  | `src/lib/components/SeoHead.svelte`                                                                                                                             |
| Listas con filtros                      | `src/lib/components/ListSeoHead.svelte`                                                                                                                         |
| Qué etiquetas, descripciones, filtros   | `src/lib/utils/seo.js` (`seoTags`, `eventDescription`, `materialDescription`, `upcomingDescription`, `listPreview`, …)                                          |
| Los textos editables y sus originales   | `src/lib/utils/previewTexts.js` (`PREVIEW_TEXT_FIELDS`, `validatePreviewTexts`, `SITE_TAGLINE`)                                                                 |
| Dónde se guardan, portadas, hash        | `src/lib/server/linkPreview.js` (fila `link_preview_texts` de `ticket_settings`)                                                                                |
| Lo que llega a las páginas              | `src/routes/(content)/+layout.server.js` → `linkPreview` en los datos (`linkPreviewOf` de `seo.js`)                                                             |
| Página del panel                        | `src/routes/(authed)/admin/ajustes/vistas-previas/` (Ajustes › Comunicación › Vistas previas al compartir)                                                      |
| Las tarjetas (qué dice cada una)        | `src/lib/utils/ogCards.js` (`OG_CARDS`, `ogCardText`, `ogCardAlt`)                                                                                              |
| El dibujo del collage                   | `src/lib/utils/ogCollage.js` (`collageTree`)                                                                                                                    |
| La imagen (`/og/<tarjeta>/<hash>.jpg`)  | `src/routes/og/[card]/[file]/+server.js`, `src/lib/server/ogImage.js`                                                                                           |
| El dibujante (satori + resvg + jpeg-js) | `worker/og-render.js`, `worker/og.js` (el WebAssembly como módulos), `worker/index.js` (lo pasa en `platform.env.OG_RENDER`)                                    |
| Tarjetas de respaldo (sin portadas)     | `scripts/og-default/render.js` → `static/og-*.jpg`                                                                                                              |
| Medidas y texto alternativo de portada  | `cover` de `siteContent` (`src/lib/server/contenido/posts.js`)                                                                                                  |
| Perfiles                                | `src/lib/components/amigues/ProfileHead.svelte` (usa `SeoHead`)                                                                                                 |
| Pruebas                                 | `seo.test.js`, `previewTexts.test.js`, `link-previews.test.js`, `src/routes/og/og.test.js`, `ogRender.test.js`, `linkPreview.test.js`, `vistas-previas.test.js` |

## Qué pone cada página

Todas: `description`, `og:site_name` (Kinky Vibe), `og:locale` (`es_AR`), `og:type`, `og:url` y
`<link rel="canonical">` (la dirección sin `?…`), `og:title`, `og:description`, `og:image` (con
`og:image:width`/`height`/`alt` cuando se saben), `twitter:card` (`summary_large_image`),
`twitter:site`, `twitter:title`, `twitter:description`, `twitter:image` y `twitter:image:alt`.

| Página                                            | `og:type` | Título                       | Descripción                                                               | Imagen                                            |
| ------------------------------------------------- | --------- | ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| Inicio                                            | `website` | `home.title` (Kinky Vibe)    | `home.description` (la frase oficial, `SITE_TAGLINE`)                     | tarjeta por defecto                               |
| Calendario (`/calendario`)                        | `website` | `heading` de `LIST_SECTIONS` | «Próximos: A (3/10), B (5/10) y C (12/10).» + la de la sección            | tarjeta «Calendario»                              |
| Material (`/material`)                            | `website` | `heading` de `LIST_SECTIONS` | la de la sección                                                          | tarjeta «Material»                                |
| Amigues (`/amigues`)                              | `website` | `heading` de `LIST_SECTIONS` | la de la sección                                                          | tarjeta «Amigues»                                 |
| Kinkipedia (`/wiki`)                              | `website` | `wiki.title`                 | `wiki.description`                                                        | tarjeta «Kinkipedia»                              |
| Todo (`/todo`)                                    | `website` | `heading` de `LIST_SECTIONS` | la de la sección                                                          | tarjeta por defecto                               |
| Evento (`/calendario/<evento>`)                   | `event`   | el título                    | «Viernes 2 de octubre de 2026, 15:00 · Lugar · resumen»                   | la portada (*) o la tarjeta por defecto           |
| Material (`/material/<post>`)                     | `article` | el título                    | «Guía descargable · resumen» (formato y «descargable», por sus etiquetas) | la portada (*) o la tarjeta por defecto           |
| Entrada de la Kinkipedia (`/wiki/<entrada>`)      | `article` | el título                    | el resumen                                                                | tarjeta «Kinkipedia»                              |
| Etiqueta o serie sin entrada (`/wiki/<etiqueta>`) | `website` | el nombre                    | «Material, amigues y eventos de «X» en Kinky Vibe.»                       | tarjeta «Kinkipedia»                              |
| Serie con ediciones, sin entrada                  | `website` | el nombre                    | «Ediciones de «X» en Kinky Vibe: N fechas, la próxima el …»               | tarjeta «Kinkipedia»                              |
| Perfil (`/amigues/<perfil>`)                      | `profile` | el nombre                    | la bio (sin bio, «X en Amigues de Kinky Vibe.»)                           | la imagen del perfil (*) o la tarjeta por defecto |

- Las secciones dicen qué son, no solo cómo se llaman: el título (`heading`) y la descripción de
  cada una son textos editables (abajo), con originales sacados del texto de presentación de cada
  página («Amigues · Emprendimientos y profesionales de la comunidad»). En el calendario, los
  próximos eventos van adelante («Próximos:», `calendario.upcomingPrefix`), así entran aunque la
  app corte la descripción.
- La fecha del evento va a la argentina con `argDateTimeLong` (`dates.js`), como «Cuándo y dónde».
  Un evento cancelado empieza con «Cancelado ·». La descripción se corta en 200 caracteres.
- El material no tiene subtipos propios: qué es sale de sus etiquetas de «formato de material»
  (guía, artículo, libro, fanzine, checklist, video) y de «descargable» (`MATERIAL_FORMATS`).
- La portada de la biblioteca trae sus medidas y su texto alternativo; una imagen vieja del repo,
  no (sin `og:image:width`, y el título como texto alternativo).
- (*) En producción, una portada pesada va achicada por Cloudflare (abajo).

## Listas filtradas

gorrite comparte links como `/amigues?tags=terapia`. Las listas (Calendario, Material, Amigues y
Todo; la Kinkipedia no filtra por la dirección) leen sus filtros (`?tags=a,b`, `?q=texto` y, en
Amigues, `?tipo=persona|proyecto|lugar`) y la vista previa los nombra:

- título: «Amigues · terapia», «Amigues · Personas · terapia, clases», «Material · «sogas»»;
- descripción: una frase con el filtro y después la de la sección: «Amigues con la etiqueta
  terapia. Profesionales, proyectos y lugares…», «Eventos con las etiquetas A y B. Talleres…»,
  «Lugares que mencionan «sogas». Profesionales…» (sin los próximos eventos: no están filtrados);
- cada etiqueta con su nombre visible y los alias resueltos (el árbol de la base); una que no
  existe va tal cual; como mucho 5. Todo va escapado (Svelte escapa los atributos).
- **`og:url` guarda los filtros**, normalizados (cada etiqueta por su id, sin alias ni repetidas;
  la búsqueda en una línea) y ordenados por nombre (`filteredListUrl`): Facebook y WhatsApp toman
  `og:url` como la dirección de la tarjeta, y si fuera la lista sin filtros mostrarían esa. Lo que
  no es un filtro (`utm_*`, `viewdate` del calendario) no va.
- **La canónica, no**: para los buscadores la lista filtrada es la misma página que la lista (si no,
  serían miles de páginas casi iguales).
- Estas páginas no se prerenderizan (se arman en cada pedido, ver `+page.server.js`), así que el
  servidor ve los filtros y no hace falta nada más. Los `load` no leen `url` (para no volver a
  correr con cada filtro); la vista previa lo lee en el componente.

## Los textos: se editan en el panel

Todos los textos de la vista previa se cambian en **Ajustes › Comunicación › Vistas previas al
compartir** (`/admin/ajustes/vistas-previas`, solo admins). Cada campo trae su texto original y,
si se cambió, «Volver al original». A la derecha, cómo se vería el link en WhatsApp (con el texto
que se está escribiendo y la imagen de ahora). Cada guardado queda en Actividad (qué claves
cambiaron, no los textos).

| Claves                                                                          | Qué es                                                                                 |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `home.title`, `home.description`                                                | título y descripción del inicio (la descripción: `SITE_TAGLINE`)                       |
| `home.cardText`                                                                 | la frase grande de la tarjeta por defecto (también `SITE_TAGLINE`)                     |
| `<lista>.heading`, `.description`, `.title`, `.items`                           | Calendario, Material, Amigues y Todo: título, descripción, nombre corto y lo que lista |
| `calendario.upcomingPrefix`                                                     | «Próximos:»                                                                            |
| `calendario.cardName`, `material.cardName`, `amigues.cardName`, `wiki.cardName` | el nombre que va escrito en cada imagen                                                |
| `wiki.title`, `wiki.description`                                                | la Kinkipedia                                                                          |
| `filtros.oneTag`, `filtros.manyTags`, `filtros.text`                            | «con la etiqueta {x}», «con las etiquetas {x}», «que mencionan «{x}»»                  |
| `materialTipo.downloadSuffix`, `materialTipo.downloadOnly`                      | « descargable», «Descargable»                                                          |

- Los originales (los que aprobó gorrite el 11/10) están en `src/lib/utils/previewTexts.js`; una
  prueba compara cada uno, letra por letra.
- **Se guardan solo los cambiados**, como JSON en una fila (`link_preview_texts`) de
  `ticket_settings`, la tabla clave → valor de los ajustes del panel. Sin tabla nueva ni
  migración. Un campo vacío o igual al original vuelve al original; todo igual borra la fila.
- **Validación**: una línea, largo máximo por campo, sin `<` ni `>`. Las frases de los filtros
  tienen que llevar `{x}` (una vez, sin otras llaves); los demás textos no llevan llaves. Un dato
  guardado que no pasa la validación se ignora (vale el original): una página nunca se rompe por un
  texto.
- **El subtítulo de cada imagen** es lo que va después de « · » en el título de la sección
  (`calendario.heading`, …, `wiki.title`). Así el título del link y la imagen dicen lo mismo.
- Las páginas los leen una vez cada 30 segundos por isolate (`linkPreviewState`, como los
  interruptores): el layout de las páginas públicas los manda en `linkPreview`.

## Las imágenes: collage con las portadas de los próximos eventos

Diseño «Collage» (gorrite, 11/10): a la derecha, un mosaico inclinado de portadas de eventos; un
degradé violeta las tapa a la izquierda, y ahí van el logo, el nombre de la sección (o la frase del
sitio, en la por defecto), el subtítulo y `kinkyvibe.ar`. Hay cinco: la por defecto (inicio, Todo
y páginas sin imagen propia), Calendario, Material, Amigues y Kinkipedia.

- **Portadas**: las de la biblioteca de los eventos listados y no cancelados, primero los
  próximos (del más cercano) y después los más recientes, hasta 16 (`collageCovers`). Si hay
  menos, se repiten; cada tarjeta empieza por otra. Nada de `src/lib/assets`.
- **Dirección**: `/og/<tarjeta>/<hash>.jpg`. El hash (16 caracteres del SHA-256) es de lo que va
  en la imagen: el nombre, el subtítulo, las portadas y la versión del dibujo
  (`COLLAGE_VERSION`). Si cambia un texto de la imagen o una portada, cambia la dirección y las
  apps piden la nueva. Un hash viejo redirige (302) al de ahora, salvo que esa misma dirección
  siga en la caché de Cloudflare: lo primero que mira la ruta es la caché, con la dirección pedida,
  y si está la manda sin leer la base (es la imagen de ese hash, la que se compartió con esa
  dirección).
- **Se dibuja una vez**: la respuesta lleva `Cache-Control: public, max-age=31536000, immutable`,
  se guarda en R2 (`og/<tarjeta>-<hash>.jpg` en el bucket `MEDIA`, fuera de `img/` y `file/`, así
  que `/media/…` no la sirve) y en la caché de Cloudflare. Si una portada no se pudo leer, la
  imagen sale igual pero con caché corta y sin guardarse.
- **Cómo se dibuja** (en el Worker, al primer pedido): el árbol de `ogCollage.js` → SVG con
  **satori** → píxeles con **resvg** (WebAssembly) → **JPEG** calidad 82 con jpeg-js. Las
  miniaturas de las portadas (250 × 250) las hace el **binding de imágenes** de Cloudflare
  (`IMAGES`): casi todas son WEBP y resvg no lee WEBP. Fuentes: Lilita One y Lato Bold en WOFF
  (`static/fonts/share/`; satori no lee WOFF2). Medido en local: unos 0,3 s de satori y 0,4 s de
  resvg con 16 portadas; en Workers Paid el límite es 30 s de CPU por pedido.
- **JPEG y no PNG**: el collage de fotos en PNG pesa cerca de 1 MB, y WhatsApp no muestra
  imágenes de más de unos 300 KB. En JPEG queda entre 100 y 200 KB.
- **WebAssembly en Workers**: no se puede compilar desde bytes; tiene que ser un módulo que sube
  wrangler. Vite (que arma el Worker de SvelteKit) no lo puede importar, así que el dibujante vive
  en `worker/og.js` y `worker/index.js` se lo pasa a SvelteKit en `platform.env.OG_RENDER`, solo
  en los pedidos a `/og/…`. Suma unos 3,4 MB al Worker (sin comprimir; 1,2 MB comprimido; el
  límite es 64 MB). `worker/index.js` lo importa recién al dibujar la primera tarjeta (import
  dinámico, en el mismo archivo): antes se inicializaba al arrancar cada isolate, unos 15 ms de CPU
  medidos en local con `wrangler check startup` (el límite es 1 s).
- **Cupo del binding de imágenes**: cada miniatura distinta cuenta una vez por mes dentro de las
  5000 transformaciones gratis (las mismas que las portadas achicadas, abajo). Son 16 por cambio
  de portadas, como mucho.
- **Respaldo**: sin base, en `vite dev` (no hay dibujante) o si el dibujo falla, la dirección
  redirige (302, caché corta) a `static/og-<tarjeta>.jpg`: el mismo dibujo, sin portadas y con
  los textos originales. Se generan con `node scripts/og-default/render.js` (falla si alguna pasa
  de 150 KB) y se commitean.
- **Previews**: tienen su propio binding `IMAGES` (`[previews.images]` en `wrangler.toml`). Los
  eventos de demo usan portadas del sitio público (`https://kinkyvibe.ar/media/img/…`), que la
  imagen baja de ahí.

## Imágenes y WhatsApp

WhatsApp muestra la imagen solo si pesa menos de unos 300 KB. Las portadas se achican al subirlas
(lado más largo 2000 px, WEBP; ver [imagenes.md](imagenes.md)) y casi todas pesan menos (la
mediana, unos 70 KB), pero algunas pasan (7 de 201 en octubre de 2026, hasta 1,7 MB).

Por eso, **solo en producción**, `og:image` de una portada de la biblioteca de más de 200 KB (o de
peso desconocido, como la imagen de un perfil) va por las transformaciones de imágenes de
Cloudflare: `https://kinkyvibe.ar/cdn-cgi/image/width=800,format=jpeg,quality=80,onerror=redirect/media/img/<hash>.<ext>`
(`resizedImageUrl` en `seo.js`).

- **Por qué por el sitio y no con una variable**: se decide mirando la dirección entera de la
  imagen. Solo si es `https://kinkyvibe.ar/media/img/…` (la zona que tiene las transformaciones)
  se achica. Un preview (`*.workers.dev`) o el desarrollo local arman la imagen con su propio
  origen y nunca la piden. No hay nada que configurar ni que olvidarse de prender.
- **Por qué 800 px y no 1200**: las portadas miden entre 1000 y 1280 px de ancho, así que con 1200
  casi no se achican, y en JPEG pesan más que el WEBP (se probó: 6 de las 7 seguían arriba de
  300 KB). Con 800 px, todas quedan debajo (entre 100 y 294 KB) y se ve el afiche entero, sin
  recortar.
- **Medidas**: `fit` por defecto (`scale-down`) no agranda y mantiene la proporción. Las medidas
  se calculan igual (`resizedSize`); si el alto no da exacto, no se ponen.
- **`onerror=redirect`**: si Cloudflare no puede transformarla (por ejemplo, pasado el cupo), la
  app recibe la original.
- **Cupo**: el plan Free da 5000 transformaciones únicas por mes; cada portada cuenta una vez por
  mes. Con unas 200 portadas (y solo las pesadas se transforman) queda lejos. Pasado el cupo, las
  nuevas dan error 9422 (sin cobrar) y `onerror=redirect` manda a la original.
  Fuente: <https://developers.cloudflare.com/images/pricing/>.
- Las tarjetas y las imágenes viejas del repo (`/_app/immutable/…`) van tal cual.
- **Miniaturas del panel**: el recuadro «Hoy» del Inicio y las listas de Eventos y Contenido
  (Material y No listadas) usan la misma transformación, pero cuadrada y chica (`thumbnailUrl` y
  `THUMB_RESIZE` en `seo.js`: 128 × 128, `fit=cover`, `format=auto`), solo si la página se sirve
  desde `kinkyvibe.ar`. Suma al cupo una por portada que se ve en esas listas, una vez por mes:
  como mucho las ~200 portadas de arriba, lejos del cupo.

## Cómo probar

```sh
npx vitest run src/lib/utils/seo.test.js "src/routes/(content)/link-previews.test.js"
curl -s https://kinkyvibe.ar/calendario/<evento> | grep -o '<meta [^>]*og:[^>]*>'
```

Para ver la tarjeta de verdad: pegá el link en un chat de Telegram (lo vuelve a leer al momento) o
en el depurador de Facebook (sirve también para WhatsApp, que guarda la tarjeta un tiempo).
