# SEO, datos estructurados y estándares web

Qué le cuenta el sitio a buscadores, asistentes y lectores de feeds, además de lo que ve la gente:
datos estructurados (JSON-LD), microformats, `rel="me"`, feeds, `security.txt`, tarjetas de
contacto, `robots.txt` y el sitemap. Al final, la auditoría de octubre de 2026 con los números.

La vista previa al compartir (Open Graph, Twitter, títulos y descripciones, canónicas) es de otra
guía: `compartir.md` (llega con el PR #257).

## Lo que nunca se rompe

- **Solo lo que la página ya muestra.** Ningún dato estructurado, microformat ni vCard agrega
  algo que la página no le muestre a cualquiera: el lugar llega filtrado por su nivel de
  privacidad ([amigues.md](amigues.md)) y del perfil sale solo el contacto público (decisión
  0023). Un lugar oculto no tiene dirección en ningún lado.
- **Nada de reglas para bots de IA en `robots.txt`**: gorrite las maneja en Cloudflare.
- `security.txt` y los datos estructurados usan el contacto general de la organización (`ORG_CONTACT_EMAIL`, `src/lib/utils/organization.js`), nunca uno
  personal.

## Dónde está

| Qué                                    | Dónde                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| JSON-LD (todos los tipos)              | `src/lib/utils/jsonLd.js`; cada página lo pone con `<LDTag>`                    |
| Redes oficiales (`sameAs`, `rel="me"`) | `OFFICIAL_PROFILES` en `jsonLd.js` y el pie (`Footer.svelte`)                   |
| vCard de perfiles                      | `src/lib/utils/vcard.js`, `/amigues/<perfil>/contacto.vcf`                      |
| `security.txt`                         | `src/lib/utils/securityTxt.js`, `/.well-known/security.txt`                     |
| `robots.txt`                           | `static/robots.txt` (lo cuida `src/lib/utils/robots.test.js`)                   |
| Feeds Atom y JSON Feed                 | `src/lib/utils/feeds.js` (el texto), `src/lib/server/feeds.js` (las respuestas) |
| Sitemap                                | `src/routes/(content)/sitemap.xml/` (sin las publicaciones con `redirect`)      |
| La dirección del sitio                 | `SITE_URL` y `siteOriginFrom` en `src/lib/utils/site.js` (un solo lugar)        |
| Un evento en una línea                 | `eventLead` en `src/lib/utils/eventText.js` (vista previa y feeds)              |
| «Próximo» (empieza después de ahora)   | `startsAfter` en `src/lib/utils/dates.js`                                       |

### JSON-LD por página

| Página             | Tipo                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Inicio             | `Organization` (logo, contacto público, redes)                                           |
| Evento             | `Event`: estado, modo (presencial u online), lugar según privacidad, `offers`, organizer |
| Material           | `Article`; `DigitalDocument` si es descargable; `CreativeWork` si es interactivo         |
| `/wiki`            | `DefinedTermSet` (la Kinkipedia)                                                         |
| Entrada de la wiki | `DefinedTerm` con `inDefinedTermSet` (también una etiqueta sin entrada con descripción)  |
| Perfil             | `ProfilePage` con `Person` (persona), `Organization` (proyecto) o `Place` (lugar)        |

`offers` de un evento: con venta en el sitio, el precio «desde» en ARS, la disponibilidad
(`InStock`, `SoldOut`, `PreOrder` con `validFrom`) y el link a `/entradas`; sin venta, el link de
inscripción (precio 0 si tiene la etiqueta `gratis`). Cancelado o pasado: sin oferta.

### Fechas legibles por máquina

Las fechas de publicación se guardan como `2024-12-06Z-03:00`, que **no es ISO 8601** (mezcla `Z`
y un desfase, y no todos los motores de JS la leen). Nunca se imprimen tal cual en un atributo: los helpers
de `src/lib/utils/dates.js` las convierten.

| Dónde                                                       | Helper        | Ejemplo                     |
| ----------------------------------------------------------- | ------------- | --------------------------- |
| `article:published_time` / `article:modified_time` (OG)     | `isoDateTime` | `2024-12-06T00:00:00-03:00` |
| JSON-LD (`datePublished`, `dateModified`, `startDate`...)   | `isoDate`     | `2024-12-06T00:00:00-03:00` |
| `<time datetime>` de una fecha de publicación (solo el día) | `isoDay`      | `2024-12-06`                |
| `<time datetime>` de un evento (ya viene con hora y zona)   | tal cual      | `2026-10-02T22:00-03:00`    |
| Sitemap y feeds (`lastmod`, `published`, `updated`)         | `Date`        | `2024-12-06T03:00:00.000Z`  |

Para leer una fecha del sitio igual en cualquier motor de JS: `parseSiteDate`. Lee cada forma
guardada campo por campo, sin pasar por `Date.parse` (V8 entiende `2024-12-06Z-03:00`, Safari no):
`2024-12-06Z-03:00`, `2024-12-06`, `2026-10-02T22:00-03:00` (con o sin segundos, con espacio en vez
de `T`, hora de un dígito, `Z` o `-0300`). Sin desfase, es hora de Argentina. Todos los formateadores
de `dates.js` (`toArgentina`, `argDate*`, `eventEnd`) leen con él; en el resto del código, una fecha
guardada (`start`, `end`, `published_date`, `updated_date`, `opening_date`) se lee con
`parseSiteDate`, nunca con `new Date(texto)`.

### Feeds

| Feed                       | Atom                         | JSON Feed                    |
| -------------------------- | ---------------------------- | ---------------------------- |
| Eventos                    | `/calendario/feed.atom`      | `/calendario/feed.json`      |
| Material                   | `/material/feed.atom`        | `/material/feed.json`        |
| Una etiqueta (y sus hijas) | `/wiki/<etiqueta>/feed.atom` | `/wiki/<etiqueta>/feed.json` |

Las 50 publicaciones más nuevas (por fecha de publicación), sin las que redirigen a otro sitio.
Del evento va la fecha en el resumen (y «Cancelado» si lo está), **nunca el lugar**: así no hay
que repetir las reglas de privacidad. Cada página los anuncia con `<link rel="alternate">`
(`FeedLinks.svelte`); el feed de una etiqueta sin eventos ni material da 404. El RSS de siempre
(`/rss`, en `app.html`) y los calendarios `.ics` siguen igual.

### Microformats

`h-event` en eventos, `h-entry` en material y wiki, `h-card` en el encabezado de cada perfil (con
`u-url`, `p-note`, `u-email`, `p-tel` en elementos `<data hidden>`), `h-card` de Kinky Vibe en el
inicio y en las tarjetas de las listas.

La `h-card` del inicio es la que lee Bridgy Fed (el puente a Mastodon y Bluesky) para el perfil
de kinkyvibe.ar: su foto (`u-photo`) es `/android-chrome-512x512.png`, una dirección que no
cambia con cada deploy (antes era el logo del build, con un hash que cambiaba y daba 404).
Después de cambiarla, alguien con acceso tiene que tocar «Update profile» en fed.brid.gy.

### Manifest y perfiles

- `static/site.webmanifest`: nombre «Kinky Vibe», descripción (`SITE_TAGLINE`), `lang` `es-AR`,
  `id` `/` y `theme_color` igual al `theme-color` de las páginas, en hex (lo cuida
  `webmanifest.test.js`).
- Un perfil es `og:type` `profile`: sin etiquetas `article:*`. En el material,
  `article:modified_time` va solo si tiene fecha de actualización.
- La foto del encabezado de un perfil dice «Foto de perfil de X» (los nombres de archivo son
  hashes: el texto alternativo es lo único que lee Google Imágenes).

## Velocidad (PageSpeed, 12/10/2026)

La línea de base, medida por gorrite con [PageSpeed Insights](https://pagespeed.web.dev/) en el
inicio (una sola corrida de Lighthouse; varía ±5–10 puntos: para comparar, tres corridas y la
mediana). No hay datos de personas reales (el sitio tiene poco tráfico para el informe de Chrome).

| Inicio     | Puntaje | FCP   | LCP   | TBT    | CLS   | Peso     |
| ---------- | ------- | ----- | ----- | ------ | ----- | -------- |
| Celu       | 81      | 2,0 s | 4,1 s | 80 ms  | 0,002 | 3907 KiB |
| Computador | 88      | 0,4 s | 1,4 s | 170 ms | 0,001 | —        |

- **El LCP es la imagen de la primera tarjeta de eventos**, y arrancaba a bajarse ~2 s tarde
  porque todas las tarjetas tenían `loading="lazy"` (el navegador espera al layout). Ahora la
  primera fila del inicio carga sus primeras 4 imágenes enseguida y la primera con
  `fetchpriority="high"` (`eager` en `CardRow.svelte` y `Card.svelte`); las demás siguen `lazy`.
- **Las imágenes de las tarjetas eran de tamaño completo** (hasta 2000 px; una de 1,6 MB) para
  tarjetas de 420 × 420: ~3,1 MB de los 3,9 MB. Ahora (`tarjetas-imagen-chica`) cada imagen tiene
  dos copias WEBP chicas (lado corto de 360 y 720 px) hechas **al subirla** (en el navegador, como
  la de 2000 px) y una pasada única por las que ya están (`scripts/copias-chicas.js`, la corre
  gorrite); las tarjetas, las listas y el encabezado de un perfil las piden con `srcset`
  ([imagenes.md](imagenes.md), «Copias chicas para las tarjetas»). No usa el cupo de
  transformaciones de Cloudflare (5000 por mes; ver «Imágenes y WhatsApp» en
  [compartir.md](compartir.md)). Cuentas con las imágenes reales (25/10, todas las imágenes de
  tarjetas y listas de la página, como si se vieran todas; copias hechas con el mismo script):
  inicio 6159 KiB → 688 KiB (1×) / 1166 KiB (2× y 3×); `/calendario` 4019 KiB → 194 / 379 KiB; la
  imagen de la primera tarjeta, 128 KiB → 21 / 57 KiB. Hasta que corra la pasada, las imágenes
  viejas se ven igual (la copia que falta redirige al original).
- **En `/calendario`** la imagen de la primera tarjeta también es el LCP: sus dos primeras tarjetas
  cargan enseguida (`eager={2}`) y la prioridad va a la primera tarjeta **con** imagen (en todas
  las filas con `eager`, también la del inicio).
- **En la página de un evento** el LCP es el afiche: lleva `fetchpriority="high"` y, si es una
  portada de la biblioteca, su `width`/`height` (de `data.cover`, sin otra consulta; el tamaño en
  pantalla lo sigue mandando el CSS). **En la página de un perfil**, la primera imagen de su texto
  (la primera que queda con `src`) no es `lazy` y lleva `fetchpriority="high"`; las demás siguen
  `lazy` (`rehypeProfileLinks` con `firstImageEager`, src/lib/server/amigues/sanitize.js). En los
  textos de eventos, material y wiki todas siguen `lazy` (en un evento manda el afiche). Medido en
  local (25/10, Lighthouse celu, 15 corridas alternadas): el pedido de la imagen arranca antes
  (afiche ~243 → ~97 ms; imagen del perfil ~383 → ~78 ms), pero el LCP simulado no cambió
  (evento ~6,3 s, perfil ~4,6 s, dentro del ruido): lo domina la descarga de la imagen.
- El tiempo del servidor no apareció como problema (TTFB 10 ms en esa corrida).
- Los errores de consola que marca son del script de Cloudflare Web Analytics, no del sitio.
- Para ver que sigue andando: `curl -s https://kinkyvibe.ar/ | grep -o '<img[^>]*card-img[^>]*>' | head -5`
  muestra las primeras con `loading="eager"` y la primera con `fetchpriority="high"`.

## Cómo probarlo

- `npx vitest run src/lib/utils/jsonLd.test.js src/lib/utils/vcard.test.js src/lib/utils/securityTxt.test.js src/lib/utils/robots.test.js src/lib/utils/feeds.test.js src/lib/server/feeds.test.js`
- Feeds: <https://validator.w3.org/feed/> (Atom) y <https://validator.jsonfeed.org/> con la URL
  del preview.
- A mano, en el preview de la rama: abrir un evento, un material, una entrada de la wiki y un
  perfil, copiar la URL en <https://validator.schema.org/> y revisar que no haya errores. Para un
  lugar con la dirección oculta, el `Place` no tiene que tener `address` ni `geo`.
- Microformats: <https://pin13.net/mf2/?url=…> con la URL del preview.

## Auditoría (11/10/2026)

Páginas de producción bajadas una vez (GET, sin tocar nada). Tamaño del HTML y, entre paréntesis,
comprimido con gzip (lo que viaja es parecido: Cloudflare manda brotli, `/calendario` = 47 KB).

| Página        | HTML antes   | HTML después | Datos antes | Datos después |
| ------------- | ------------ | ------------ | ----------- | ------------- |
| `/calendario` | 310,0 (44,1) | 70,1 (17,9)  | 225,6       | 34,4          |

- **`/calendario`, los pasados de a un mes.** Viajan los próximos enteros y, de los pasados, solo
  los del mes que se abre (con los campos de la grilla, sin el lugar). Al ir a otro mes, la página
  pide sus pasados a `/api/calendario/pasados?mes=yyyy-MM` (5 minutos de caché, como
  `/api/posts`) y aparecen en la grilla al llegar. «Mostrar eventos pasados» también va de a un
  mes: trae enteros solo los pasados del mes que se ve (`/api/calendario/pasados?mes=yyyy-MM&enteros=1`,
  con el lugar vinculado como `/api/posts`) y, al cambiar de mes, los de ese mes; antes bajaba
  `/api/posts` entero. Abajo de la lista, «Mostrar el mes anterior» sigue con el mes de antes (la
  dirección de siempre, `?viewdate=yyyy-MM`, como las flechas) hasta el del evento más viejo
  (`firstMonth` de la carga). Solo aparece con los pasados a la vista, así que el HTML del servidor
  (lo que leen los buscadores) no cambia. Código: `src/lib/server/eventos/pasados.js`.

- **`/todo`, `/material` y `/amigues`, de a 24 tarjetas.** Mostraban todas juntas (85, 55 y 30
  en la base local, con unas 620, 435 y 220 etiquetas) y la página tardaba en responder al
  cargar. Ahora, como el inicio (`limit` de `PostList`), 24 y «Ver más (N)», también con
  etiquetas elegidas (también desde `?tags=`; cambiar las etiquetas vuelve a las primeras 24);
  con texto en la búsqueda se ve todo lo que encontró. En `/amigues` los perfiles fijados siguen
  primero. HTML en la base local: `/todo` 376,7 → 201,1 KB (53,2 → 39,8 gz), `/material` 278,9 →
  185,9 KB (40,8 → 34,5), `/amigues` 170,8 → 156,0 KB (29,6 → 28,6).
  Los datos de la página no cambian (siguen viajando todas, para buscar sin pedir nada).

### Para hacer después (ahorro estimado, sin comprimir)

- `siteTags` y la wiki del layout raíz como un JSON aparte: **no ahorra en la primera visita** si
  se hace con un `fetch` en un `load`, porque SvelteKit mete en el HTML lo que se pidió durante el
  render del servidor, y las etiquetas hacen falta para armar la página (colores, madres). Al
  navegar dentro del sitio el layout raíz no se vuelve a pedir, así que tampoco ahorra ahí. Solo
  serviría con las etiquetas en un archivo estático que el navegador guarde (por ejemplo, armado
  al guardar etiquetas en el panel) y la página esperándolo antes de hidratar. Mucho riesgo para
  −30 KB; queda en espera.
- Hasta 5 etiquetas por tarjeta: −20 a −35 KB en `/material` y la wiki. **Cambia lo que se ve**:
  lo decide gorrite. Opciones: (a) 5 y un «+N» que no hace nada (la tarjeta entera ya es un link);
  (b) 5 y «+N» que despliega el resto en la tarjeta; (c) solo en las listas largas (`/material`,
  `/wiki/<etiqueta>`), no en el inicio; (d) dejarlo así.
- `/wiki/<término>`: las publicaciones relacionadas de a 20: −25 KB de datos y hasta −120 KB de
  tarjetas en las etiquetas con muchas. **Cambia lo que se ve**: lo decide gorrite. Opciones:
  (a) `limit={20}` en la lista con «Ver más», como el inicio (ahorra tarjetas, no datos);
  (b) además, el servidor manda 20 y «Ver más» pide las siguientes (ahorra las dos cosas, pero los
  filtros por etiqueta tendrían que pedir al servidor); (c) dejarlo así.
- El panel de etiquetas armado recién al abrirlo en celu (en compu sigue visible): −20 a −41 KB.
- Íconos de las tarjetas con un sprite SVG (`<use href>`) o una máscara CSS: −15 a −45 KB en las
  listas (comprimido casi no cambia: gzip ya comprime lo repetido; ganaría un DOM más chico).
  Se probó en #334 y gorrite decidió no hacerlo por ahora.

### Lo demás

- **Títulos repetidos**: los eventos que se repiten tenían el mismo título en cada edición
  («Jamarada Kinky · Kinky Vibe») y muchas veces la misma descripción. Ahora el `<title>` de un
  evento que es parte de una serie suma el mes y el año de esa edición («Jamarada Kinky · octubre
  2026 · Kinky Vibe»; `eventPageTitle` en `eventPage.js`), salvo que el título ya diga el mes. El
  `h1` y la vista previa al compartir quedan con el título solo. Los perfiles no dicen «· Kinky
  Vibe» («Mem | él»).
- **Descripciones**: faltaban en `/calendario`, `/material`, `/amigues` y `/wiki`, y las
  canónicas solo estaban en el inicio y en los perfiles (relativas). Las arregla el PR de vista
  previa al compartir (#257).
- **Encabezados**: un solo `h1` por página, bien. En las listas se saltaba de `h1` a `h3` (las
  tarjetas son `h3` sin `h2` en el medio): `PostList` lleva un `h2` solo para lectores de
  pantalla (`heading`) en el inicio, `/calendario`, `/material`, `/amigues` y `/todo`. En los
  perfiles y el material, «Contacto», «Integrantes», «Eventos en…» y «Más cosas de…» son `h2`
  con la clase `like-h3` (style.scss): se ven igual que antes, sin saltar de `h1` a `h3`.
- **Textos alternativos**: todas las imágenes tienen `alt`. Las de las tarjetas van vacías (son
  decorativas: el título está al lado); el afiche del evento dice «Afiche de …». Bien.
- **Sitemap**: 614 direcciones; 36 eran publicaciones con `redirect` (contestan 307 a un
  formulario o a la tienda) y ya no están. Las etiquetas sin entrada de la wiki no están (bien:
  son listas).
- **`robots.txt`**: tenía reglas para `/_template`, `/_tags` y `/_glossary`, que ya no existen;
  ahora tiene la línea del sitemap.
- **Respuestas (AEO)**: las 12 entradas de la wiki arrancan con una definición de una oración
  («Una conjunción de bondage y disciplina…»), que ahora también va como `DefinedTerm`. Las
  etiquetas con descripción pero sin entrada también: su descripción, en texto, va como
  `DefinedTerm` (`tagTermSchema` en `jsonLd.js`).
- **`security.txt`**: el contacto es un mail. GitHub tiene apagado el aviso privado de
  vulnerabilidades del repo; si se prende, se puede sumar como otro `Contact`.
