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

### JSON-LD por página

| Página             | Tipo                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Inicio             | `Organization` (logo, contacto público, redes)                                           |
| Evento             | `Event`: estado, modo (presencial u online), lugar según privacidad, `offers`, organizer |
| Material           | `Article`; `DigitalDocument` si es descargable; `CreativeWork` si es interactivo         |
| `/wiki`            | `DefinedTermSet` (la Kinkipedia)                                                         |
| Entrada de la wiki | `DefinedTerm` con `inDefinedTermSet`                                                     |
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

Para leer una fecha del sitio igual en cualquier motor de JS: `parseSiteDate`.

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
  `/api/posts`) y aparecen en la grilla al llegar. «Mostrar eventos pasados» sigue igual (trae
  `/api/posts` entero). Código: `src/lib/server/eventos/pasados.js`.

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

- **Títulos repetidos**: los eventos que se repiten tienen el mismo título en cada edición
  («Jamarada Kinky · Kinky Vibe», «Taller de Humillación · Kinky Vibe») y muchas veces la misma
  descripción. Convendría sumar el mes al título. Los perfiles no dicen «· Kinky Vibe»
  («Mem | él»).
- **Descripciones**: faltaban en `/calendario`, `/material`, `/amigues` y `/wiki`, y las
  canónicas solo estaban en el inicio y en los perfiles (relativas). Las arregla el PR de vista
  previa al compartir (#257).
- **Encabezados**: un solo `h1` por página, bien. En las listas se salta de `h1` a `h3` (las
  tarjetas son `h3` sin `h2` en el medio).
- **Textos alternativos**: todas las imágenes tienen `alt`. Las de las tarjetas van vacías (son
  decorativas: el título está al lado); el afiche del evento dice «Afiche de …». Bien.
- **Sitemap**: 614 direcciones; 36 eran publicaciones con `redirect` (contestan 307 a un
  formulario o a la tienda) y ya no están. Las etiquetas sin entrada de la wiki no están (bien:
  son listas).
- **`robots.txt`**: tenía reglas para `/_template`, `/_tags` y `/_glossary`, que ya no existen;
  ahora tiene la línea del sitemap.
- **Respuestas (AEO)**: las 12 entradas de la wiki arrancan con una definición de una oración
  («Una conjunción de bondage y disciplina…»), que ahora también va como `DefinedTerm`. Faltaría
  lo mismo para las etiquetas con descripción pero sin entrada.
- **`security.txt`**: el contacto es un mail. GitHub tiene apagado el aviso privado de
  vulnerabilidades del repo; si se prende, se puede sumar como otro `Contact`.
