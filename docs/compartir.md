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

| Qué                                    | Dónde                                                                                                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El componente (canónica, `og:*`, etc.) | `src/lib/components/SeoHead.svelte`                                                                                                                                                    |
| Listas con filtros                     | `src/lib/components/ListSeoHead.svelte`                                                                                                                                                |
| Qué etiquetas, descripciones, filtros  | `src/lib/utils/seo.js` (`seoTags`, `eventDescription`, `materialDescription`, `upcomingDescription`, `LIST_SECTIONS`, `listFilters`, `listPreview`, `filteredListUrl`, `previewImage`) |
| Frase y tarjetas de `static/`          | `src/lib/utils/ogCards.js` (`SITE_TAGLINE`, `OG_CARDS`)                                                                                                                                |
| Medidas y texto alternativo de portada | `cover` de `siteContent` (`src/lib/server/contenido/posts.js`)                                                                                                                         |
| Perfiles                               | `src/lib/components/amigues/ProfileHead.svelte` (usa `SeoHead`)                                                                                                                        |
| Tarjetas (fuente y script)             | `scripts/og-default/card.html`, `scripts/og-default/render.js` → `static/og-*.png`                                                                                                     |
| Pruebas                                | `src/lib/utils/seo.test.js`, `src/routes/(content)/link-previews.test.js`                                                                                                              |

## Qué pone cada página

Todas: `description`, `og:site_name` (Kinky Vibe), `og:locale` (`es_AR`), `og:type`, `og:url` y
`<link rel="canonical">` (la dirección sin `?…`), `og:title`, `og:description`, `og:image` (con
`og:image:width`/`height`/`alt` cuando se saben), `twitter:card` (`summary_large_image`),
`twitter:site`, `twitter:title`, `twitter:description`, `twitter:image` y `twitter:image:alt`.

| Página                                            | `og:type` | Título                       | Descripción                                                               | Imagen                                            |
| ------------------------------------------------- | --------- | ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| Inicio                                            | `website` | Kinky Vibe                   | la frase oficial (`SITE_TAGLINE`)                                         | tarjeta por defecto                               |
| Calendario (`/calendario`)                        | `website` | `heading` de `LIST_SECTIONS` | «Próximos: A (3/10), B (5/10) y C (12/10).» + la de la sección            | tarjeta «Calendario»                              |
| Material (`/material`)                            | `website` | `heading` de `LIST_SECTIONS` | la de la sección                                                          | tarjeta «Material»                                |
| Amigues (`/amigues`)                              | `website` | `heading` de `LIST_SECTIONS` | la de la sección                                                          | tarjeta «Amigues»                                 |
| Kinkipedia (`/wiki`)                              | `website` | `KINKIPEDIA_PREVIEW`         | `KINKIPEDIA_PREVIEW`                                                      | tarjeta «Kinkipedia»                              |
| Todo (`/todo`)                                    | `website` | `heading` de `LIST_SECTIONS` | la de la sección                                                          | tarjeta por defecto                               |
| Evento (`/calendario/<evento>`)                   | `event`   | el título                    | «Viernes 2 de octubre de 2026, 15:00 · Lugar · resumen»                   | la portada (*) o la tarjeta por defecto           |
| Material (`/material/<post>`)                     | `article` | el título                    | «Guía descargable · resumen» (formato y «descargable», por sus etiquetas) | la portada (*) o la tarjeta por defecto           |
| Entrada de la Kinkipedia (`/wiki/<entrada>`)      | `article` | el título                    | el resumen                                                                | tarjeta «Kinkipedia»                              |
| Etiqueta o serie sin entrada (`/wiki/<etiqueta>`) | `website` | el nombre                    | «Material, amigues y eventos de «X» en Kinky Vibe.»                       | tarjeta «Kinkipedia»                              |
| Perfil (`/amigues/<perfil>`)                      | `profile` | el nombre                    | la bio (sin bio, «X en Amigues de Kinky Vibe.»)                           | la imagen del perfil (*) o la tarjeta por defecto |

- Las secciones dicen qué son, no solo cómo se llaman: el título y la descripción de cada una
  están en `LIST_SECTIONS` (y `KINKIPEDIA_PREVIEW`) de `seo.js`, sacados del texto de
  presentación de cada página («Amigues · Emprendimientos y profesionales de la comunidad»). En el
  calendario, los próximos eventos van adelante, así entran aunque la app corte la descripción.
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

## Las tarjetas (por defecto y por sección)

`static/og-default.png` y una por sección (`og-calendario.png`, `og-material.png`,
`og-amigues.png`, `og-kinkipedia.png`): 1200 × 630, entre 70 y 80 KB, con el logo, el nombre de la
sección (la por defecto no lleva: el logo ya dice Kinky Vibe), la frase del sitio y
`kinkyvibe.ar`, en los colores (`--1`, `--2`, `--3`, `--1-tint`) y la tipografía (Lato) del sitio.
Fondo plano, sin degradés: así el PNG pesa poco.

La frase es `SITE_TAGLINE` en `src/lib/utils/ogCards.js` (la oficial de gorrite: «Educación
crítica, cultura transformativa, y comunidad disidente.»). Se achica sola si es larga; con una o
dos líneas queda grande. Para cambiarla, o sumar una sección (`OG_CARDS`):

```sh
node scripts/og-default/render.js   # dibuja todas en static/ y dice cuánto pesa cada una
# si los navegadores de Playwright están en otra carpeta:
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/og-default/render.js
```

El script falla si alguna pasa de 150 KB. Commiteá los PNG. Como las direcciones no cambian, las
apps que ya guardaron una vieja la siguen mostrando un tiempo.

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

## Cómo probar

```sh
npx vitest run src/lib/utils/seo.test.js "src/routes/(content)/link-previews.test.js"
curl -s https://kinkyvibe.ar/calendario/<evento> | grep -o '<meta [^>]*og:[^>]*>'
```

Para ver la tarjeta de verdad: pegá el link en un chat de Telegram (lo vuelve a leer al momento) o
en el depurador de Facebook (sirve también para WhatsApp, que guarda la tarjeta un tiempo).
