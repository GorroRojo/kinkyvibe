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

| Qué                                     | Dónde                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| El componente (canónica, `og:*`, etc.)  | `src/lib/components/SeoHead.svelte`                                                      |
| Qué etiquetas, descripción de un evento | `src/lib/utils/seo.js` (`seoTags`, `eventDescription`, `previewImage`)                   |
| Medidas y texto alternativo de portada  | `cover` de `siteContent` (`src/lib/server/contenido/posts.js`)                           |
| Perfiles                                | `src/lib/components/amigues/ProfileHead.svelte` (usa `SeoHead`)                          |
| Imagen por defecto (fuente y script)    | `scripts/og-default/card.html`, `scripts/og-default/render.js` → `static/og-default.png` |
| Pruebas                                 | `src/lib/utils/seo.test.js`, `src/routes/(content)/link-previews.test.js`                |

## Qué pone cada página

Todas: `description`, `og:site_name` (Kinky Vibe), `og:locale` (`es_AR`), `og:type`, `og:url` y
`<link rel="canonical">` (la dirección sin `?…`), `og:title`, `og:description`, `og:image` (con
`og:image:width`/`height`/`alt` cuando se saben), `twitter:card` (`summary_large_image`),
`twitter:site`, `twitter:title`, `twitter:description`, `twitter:image` y `twitter:image:alt`.

| Página                                          | `og:type` | Descripción                                             | Imagen                   |
| ----------------------------------------------- | --------- | ------------------------------------------------------- | ------------------------ |
| Inicio                                          | `website` | la del sitio                                            | la tarjeta por defecto   |
| Calendario, Material, Amigues, Kinkipedia, Todo | `website` | una frase fija por sección                              | la tarjeta por defecto   |
| Evento (`/calendario/<evento>`)                 | `event`   | «Viernes 2 de octubre de 2026, 15:00 · Lugar · resumen» | la portada (*)           |
| Material (`/material/<post>`)                   | `article` | el resumen                                              | la portada (*)           |
| Entrada de la Kinkipedia                        | `article` | el resumen                                              | la tarjeta por defecto   |
| Etiqueta o serie sin entrada                    | `website` | «Material, amigues y eventos de «X» en Kinky Vibe.»     | la tarjeta por defecto   |
| Perfil (`/amigues/<perfil>`)                    | `profile` | la bio (sin bio, «X en Amigues de Kinky Vibe.»)         | la imagen del perfil (*) |

- La fecha del evento va a la argentina con `argDateTimeLong` (`dates.js`), como «Cuándo y dónde».
  Un evento cancelado empieza con «Cancelado ·». La descripción se corta en 200 caracteres.
- La portada de la biblioteca trae sus medidas y su texto alternativo; una imagen vieja del repo,
  no (sin `og:image:width`, y el título como texto alternativo).
- Sin imagen, la tarjeta por defecto (abajo).
- (*) En producción, una portada pesada va achicada por Cloudflare (abajo).

## La imagen por defecto

`static/og-default.png`: 1200 × 630, unos 75 KB, con el logo, «Kinky Vibe», una frase de la
descripción del inicio y `kinkyvibe.ar`, en los colores (`--1`, `--2`, `--3`, `--1-tint`) y la
tipografía (Lato) del sitio. Fondo plano, sin degradés: así el PNG pesa poco. Se arma desde
`scripts/og-default/card.html` con Playwright:

```sh
node scripts/og-default/render.js   # escribe static/og-default.png y dice cuánto pesa
# si los navegadores de Playwright están en otra carpeta:
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/og-default/render.js
```

Que quede por debajo de unos 200 KB. Si cambia el tamaño, cambiá también `DEFAULT_IMAGE` en
`src/lib/utils/seo.js`. Como la dirección no cambia, las apps que ya guardaron la vieja la
siguen mostrando un tiempo.

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
- La tarjeta por defecto y las imágenes viejas del repo (`/_app/immutable/…`) van tal cual.

## Cómo probar

```sh
npx vitest run src/lib/utils/seo.test.js "src/routes/(content)/link-previews.test.js"
curl -s https://kinkyvibe.ar/calendario/<evento> | grep -o '<meta [^>]*og:[^>]*>'
```

Para ver la tarjeta de verdad: pegá el link en un chat de Telegram (lo vuelve a leer al momento) o
en el depurador de Facebook (sirve también para WhatsApp, que guarda la tarjeta un tiempo).
