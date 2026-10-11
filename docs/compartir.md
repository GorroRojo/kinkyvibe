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

| Qué                                     | Dónde                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------- |
| El componente (canónica, `og:*`, etc.)  | `src/lib/components/SeoHead.svelte`                                       |
| Qué etiquetas, descripción de un evento | `src/lib/utils/seo.js` (`seoTags`, `eventDescription`, `previewImage`)    |
| Medidas y texto alternativo de portada  | `cover` de `siteContent` (`src/lib/server/contenido/posts.js`)            |
| Perfiles                                | `src/lib/components/amigues/ProfileHead.svelte` (usa `SeoHead`)           |
| Pruebas                                 | `src/lib/utils/seo.test.js`, `src/routes/(content)/link-previews.test.js` |

## Qué pone cada página

Todas: `description`, `og:site_name` (Kinky Vibe), `og:locale` (`es_AR`), `og:type`, `og:url` y
`<link rel="canonical">` (la dirección sin `?…`), `og:title`, `og:description`, `og:image` (con
`og:image:width`/`height`/`alt` cuando se saben), `twitter:card` (`summary_large_image`),
`twitter:site`, `twitter:title`, `twitter:description`, `twitter:image` y `twitter:image:alt`.

| Página                                          | `og:type` | Descripción                                             | Imagen               |
| ----------------------------------------------- | --------- | ------------------------------------------------------- | -------------------- |
| Inicio                                          | `website` | la del sitio                                            | el logo              |
| Calendario, Material, Amigues, Kinkipedia, Todo | `website` | una frase fija por sección                              | el logo              |
| Evento (`/calendario/<evento>`)                 | `event`   | «Viernes 2 de octubre de 2026, 15:00 · Lugar · resumen» | la portada           |
| Material (`/material/<post>`)                   | `article` | el resumen                                              | la portada           |
| Entrada de la Kinkipedia                        | `article` | el resumen                                              | el logo              |
| Etiqueta o serie sin entrada                    | `website` | «Material, amigues y eventos de «X» en Kinky Vibe.»     | el logo              |
| Perfil (`/amigues/<perfil>`)                    | `profile` | la bio (sin bio, «X en Amigues de Kinky Vibe.»)         | la imagen del perfil |

- La fecha del evento va a la argentina con `argDateTimeLong` (`dates.js`), como «Cuándo y dónde».
  Un evento cancelado empieza con «Cancelado ·». La descripción se corta en 200 caracteres.
- La portada de la biblioteca trae sus medidas y su texto alternativo; una imagen vieja del repo,
  no (sin `og:image:width`, y el título como texto alternativo).
- Sin imagen, el logo: `static/android-chrome-512x512.png` (512 × 512, unos 100 KB).

## Imágenes y WhatsApp

WhatsApp muestra la imagen solo si pesa menos de unos 300 KB. Las portadas se achican al subirlas
(lado más largo 2000 px, WEBP; ver [imagenes.md](imagenes.md)) y casi todas pesan menos (la
mediana, unos 70 KB), pero algunas pasan. Hoy no hay una versión achicada para la tarjeta. La zona
de kinkyvibe.ar tiene las transformaciones de imágenes de Cloudflare (`/cdn-cgi/image/…`), que
podrían dar una JPEG de 1200 px; no se usan todavía (no andan en los previews de `workers.dev` y
cada transformación cuenta en el plan de Cloudflare).

## Cómo probar

```sh
npx vitest run src/lib/utils/seo.test.js "src/routes/(content)/link-previews.test.js"
curl -s https://kinkyvibe.ar/calendario/<evento> | grep -o '<meta [^>]*og:[^>]*>'
```

Para ver la tarjeta de verdad: pegá el link en un chat de Telegram (lo vuelve a leer al momento) o
en el depurador de Facebook (sirve también para WhatsApp, que guarda la tarjeta un tiempo).
