> Ahora mismo este readme sirve como guía para editar la página para quienes tienen permiso de commit, no pretende ser un README.md tradicional.

## Páginas

El contenido de las páginas está en los siguientes archivos

| URL           | Archivo                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `/`           | [`/src/routes/+page.svelte`](/src/routes/+page.svelte)                                               |
| `/nosotres`   | [`/src/routes/(content)/nosotres/+page.svelte`](<`/src/routes/(content)/nosotres/+page.svelte`>)     |
| `/material`   | [`/src/routes/(content)/material/+page.svelte`](<`/src/routes/(content)/material/+page.svelte`>)     |
| `/amigues`    | [`/src/routes/(content)/amigues/+page.svelte`](<`/src/routes/(content)/amigues/+page.svelte`>)       |
| `/calendario` | [`/src/routes/(content)/calendario/+page.svelte`](<`/src/routes/(content)/calendario/+page.svelte`>) |
| `/servicios`  | [`/src/routes/(content)/servicios/+page.svelte`](<`/src/routes/(content)/servicios/+page.svelte`>)   |

En los archivos `.md` está en Markdown, mezclado con Svelte _(que se ve como HTML)_ . En los `.svelte` es Svelte simplemente.

## Publicaciones

Después, las publicaciones (eventos, articulos, links, etc...) están en [/src/lib/posts](/src/lib/posts). Cada publicación consiste de un archivo `url-de-publicacion.md` que comienza con un bloque de propiedades delimitado por tres guiones `---` y luego tiene el contenido en sí de la publicación que va a estar visible.

Si la publicación tiene imágenes u otros archivos, estos están _(usando el ejemplo)_ en `/src/lib/posts/media/url-de-publicación/1.png`. Cada archivo debe tener como título un número comenzando por cero y nada más, sólo seguido por el formato del archivo. El nombre de la carpeta debe ser exactamente igual al nombre del archivo de la publicación. Tal que en este ejemplo, la publicación sería `/src/lib/posts/url-de-publicación.md`.

## Contenido

El contenido puede ser estilizado:

| formato                             | resultado                 |
| ----------------------------------- | ------------------------- |
| `*kinkyvibe*`                       | _kinkyvibe_               |
| `**kinkyvibe**`                     | **kinkyvibe**             |
| `***kinkyvibe***`                   | **_kinkyvibe_**           |
| \`kinkyvibe\`                       | `kinkyvibe`               |
| `[kinkyvibe](https://kinkyvibe.ar)` | [kinkyvibe](kinkyvibe.ar) |
| `~~kinkyvibe~~`                     | ~~kinkyvibe~~             |
| `kinky<sub>vibe</sub>`              | kinky<sub>vibe</sub>      |
| `kinky<sup>vibe</sup>`              | kinky<sup>vibe</sup>      |

Comenzando una linea con un `> ` se hace un bloque de cita

> Que se ve algo masomenos así. Wow.

Y las imágenes son iguales que los links pero con un `!` al principio: `![texto alternativo](https://imgur.com/mi-imagen.png)`. Sin embargo, para imagenes y otros archivos que carguemos nosotres mismes es ligeramente distinto. Ver [#imágenes](#imágenes).

Después, poniendo `#` al principio de una linea se pone como encabezado. Agregando más `#` se hace cada vez "mas chico" el título. Por ejemplo aquí viene un `## Propiedades`

## Propiedades

```md
---
propiedad: valor
lista:
  - un elemento de la lista
  - otro elemento
---

( Contenido visible de la página )
```

Las propiedades que indiquen un momento en el tiempo se hacen con el siguiente formato (año)`-`(mes)`-`(día)`T`(hora)`:`(minuto)`-03:00`

## Imágenes

Las imágenes y otros archivos deben cargarse en la subcarpeta `/media/` y luego en otra subcarpeta que tenga el nombre de la publicación, o sea el mismo nombre que el `.md` pero sin la extensión.

Luego, dentro de esa carpeta, se meten cuantos archivos se quiera, cada uno con un número como nombre, y nada más (sin contar la terminación de formato tipo `.png`).

De modo que quedaría:

- posts/
  - como-hacer-un-pete.md
  - media/
    - como-hacer-un-pete/
      - 1.png
      - 2.png
      - 3.jpeg
      - 4.pdf

Y así, luego en el cuerpo del documento se hace referencia a estos archivos por su número, así como en la propiedad `featured`.

Después dentro del contenido de la página, para insertar las imágenes, debemos hacer un par de cosas.

1. Entre el bloque de propiedades y el contenido, metemos un bloque de `script`

```svelte
<script>
	/* acá vamos a importar las imágenes */
</script>
```

2. Dentro del bloque _(donde acá arriba está el comentario)_, por cada archivo que hayamos subido que querramos usar, teniendo a mano el nombre del archivo _(por ejemplo, `1.png`)_ y un pseudónimo que le querramos dar _(por ejemplo, `pag1`)_, metemos la siguiente linea.

```svelte
import pag1 from '$lib/posts/media/como-hacer-un-pete/1.png'
```

De esta forma, después podremos hacer referencia a pag1 a la hora de meter una imagen, parecido a como metemos las imagenes externas _(`![alt](url)`)_ pero con unas llaves de más y con el pseudónimo que le pusimos a la imagen _(`![alt]({pseudonimo})`)_.

Siguiendo el ejemplo, puedo poner varias imágenes si las cargo y escribo esto.

```svelte
<script>
	import pag1 from '$lib/posts/media/como-hacer-un-pete/1.png';
	import pag2 from '$lib/posts/media/como-hacer-un-pete/2.png';
</script>

Bienvenides a la peteguía. Aquí está la guía en imágenes. ![diagrama de las partes de genitales]({pag1})
![diagrama de las partes de otros genitales]({pag2})
```

## Poner cosas en columnas

Rodeando dos bloques (por ejemplo, imágenes) con un divisor de clase `col-2` podemos ponerlos en dos columnas iguales

```html
<div class="col-2">
	<img src="{pag1}" />
	<img src="{pag2}" />
</div>
```

`col-3` es para 3, y `col-4` es para 4

si se quiere unir varias cosas como un solo bloque, simplemente se las rodea con un `<div>...</div>` sin ninguna clase

## Etiquetas

una pequeño contenido por etiqueta? tipo BDSM lleva a todos los posts que dicen bdsm + una pequeña explicación, o un post principal por etiqueta

hace falta un archivo:

- [x] titulando y estableciendo grupos de etiquetas
- [x] fusionando etiquetas como alias de una sola
- [x] marcando etiquetas que no deben estar visibles
- [ ] estableciendo un post como post principal para cada etiqueta?
- [ ] estableciendo iconos por etiqueta? superduper opcional
- [x] color de etiquetas?

Los colores, alias, y grupos están en [\_tags.md](/src/lib/posts/_tags.md?plain=1), las descripciones en [\_glossary.md](/src/lib/posts/_glossary.md?plain=1) y los posts para cada tag en [`/src/lib/wiki/`](/src/lib/wiki/)

## Propiedades de los posts

- - title\*
  - description\*
  - tags\*
  - category\*
  - featured (imagen para mostrar en tarjetas, vistas previas del link, etc; si no hay, generar uno de alguna forma?)
  - published_date
  - updated_date
  - author (quién escribió artículo, quién organiza un evento, quién es miembro de un proyecto)
  - type (por ahora sólo material: descargable, link, contenido)
  - force_unlisted
  - force_unpublished
- Material
  - link (\* para descargable y link, en contenido lleva al contenido original es es una trad, adapta, repost, etc)
  - cuando es de tipo "link"
    - access_date\* (la última que vez que se chequeó el link)
    - original_published_date
- Calendario
  - etiquetas particulares de eventos:
    - feria, charla, debate?, picnic?, social?, juegos?, taller
  - status\* (abierto | anunciado | agotadas| terminado?pasado? no, se hace solo con la fecha eso.)
  - start\*
  - end / duration \*
  - location (si no hay, es online)
  - link
- Amigues
  - tags particulares de amigues:
    - emprendimiento, proyecto, profesional de la salud
  - pronoun\* (https://pronombr.es)
  - link\*
  - logo || photo (si no, se usa featured)
  - email
  - location (si hay, es venue)
  - tel
  - job_title
  - job_role (explicando brevemente job_title)
  - gender_identity
  - bday
  - affiliation h-card
  - ?education h-event,h-card
  - ?experience h-event,h-card
  - ?skill

más info y ejemplos completos copiables para cada categoría en [\_template.md](/src/lib/posts/_template.md)

### layouts [wip]

- blank (contenido)
- [ ] standard [default material contenido]
  - [x] título
  - [x] summary
  - [ ] featured
  - [x] contenido
  - [x] og link
  - [x] og access date
  - [x] og publish
  - [x] publish date
  - [x] authors
  - [x] tags
- [ ] [default material link/descargable]
- [x] [default calendario] (poster, titulo, summary, fecha, hora, lugar, CTA)
  - [x] poster
  - [x] título
  - [x] summary
  - [x] fecha
  - [x] hora
  - [x] lugar
  - [x] CTA
  - [x] add to calendar
- [default amigues] (foto, titulo, jobtitle, summary, link (+ map))
  - [x] foto
  - [ ] título
  - [ ] jobtitle
  - [x] summary
  - [x] link
  - [ ] map
  - [ ] pronouns
  - [ ] mail
  - [ ] phone
  - [ ] bday

### pendientes: indieweb & standards

#### rel

- [x] author
- [ ] enclosure (para descargables)
- [ ] rel=license
- [ ] rel=nofollow para desincentivar a buscadores seguir ese link
- [x] rel=tag
- [x] rel=home

#### emoji post type (de baja esto?)

estandar de emoji por tipo de post

- material
  - descargable
    - 📑 collection (of posts...medio al pedo, un link a un tag y listo)
    - 🎴 comics
  - contenido
    - 📄 article
    - 🎥 video
    - 📷 photo
    - 🎤 audio
    - ⭐️ review
    - 📔 note
  - link
    - 🔖 bookmark
    - ♺ repost
- calendario
  - 📅 event
  - ♫ jam
  - 📽️ presentation
  - 🎙 performance
- amigues
  - 📍 venue

#### microformats2

- material
  - h-entry
    - h-cite
    - u-bookmark-of
    - u-repost-of
- calendario
  - h-event
- amigues
  - h-card
  - h-resume

##### h-feed

- p-name
- p-author (h-card)
- u-url
- u-photo
- ?p-summary
- [x] multiple nested h-entry

##### h-adr

- p-street-address
- p-extended-address
- p-location
- p-region
- p-postal-code
- p-country-name
- no tiene p-name, "it's likely a vanue, you should use h-card instead"

##### h-entry

- [x] p-name
- [x] p-summary
- e-content
- [x] dt-published
- dt-updated
- [x] p-author (o h-card)
- p-category??
- [x] u-url
- u-uid??
- p-location (o h-card, h-adr, h-geo)
- u-syndication??
- u-in-reply-to (o h-cite)
- p-rsvp: yes | no | maybe | interested
- u-like-of (o h-cite)
- u-repost-of (o h-cite)
  proposed
- u-repost??
- u-bookmark-of (o h-cite)
- u-featured (imagen principal)

##### h-event

- [x] p-name
- p-summary
- [x] dt-start
- [x] dt-end
- dt-duration
- p-description (o e-content)
- [x] u-url
- ~~category~~
- [x] (MASOMENOS) p-location (puede ser h-card, h-adr, h-geo)
- p-organizer (puede ser h-card)
  foto del lugar y punto en mapa

##### h-cite

- dt-accessed
- [x] u-url = u-uid
- p-publication
- p-name
- [x] dt-published
- p-author (o h-card)
- p-content

##### h-resume

- [x] p-name
- [x] p-summary (qualifications and objectives)
- [x] p-contact h-card
- p-education h-event, p-education h-card (education time, school)
- p-experience h-event, p-experience h-card
- p-skill
- p-affiliation h-card

##### h-card

- [x] p-name
- p-honorific-prefix
- p-sort-string
- p-honorifix-suffic
- p-nickname
- u-email
- u-logo
- [x] u-photo
- [x] u-url u-uid
- p-adr (o h-adr)
- p-geo / u-geo (o h-geo)
- p-tel
- p-note?
- p-org (o h-card)
- p-job-title
- p-role (descripcion del job-title)
- p-gender-identity
- u-pronoun (see http://pronoun.is)
- p-category?

- dt-anniversary
- dt-bday

## Tests

Hay tres tipos de tests. Todos corren solos en GitHub Actions ([`.github/workflows/ci.yml`](/.github/workflows/ci.yml)) en cada pull request y en cada push a `main`.

| Comando                   | Qué hace                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run test:unit`       | Tests unitarios (vitest): etiquetas, orden de etiquetas, wikilinks/menciones y **contenido de los posts** |
| `npm run test:unit:watch` | Lo mismo, re-ejecutando al guardar                                                                        |
| `npm run test:e2e`        | Tests de humo (Playwright): compila la página, la levanta con `vite preview` y la recorre en Chromium     |
| `npm test`                | Los dos anteriores                                                                                        |

Antes de correr los tests de Playwright por primera vez: `npx playwright install --with-deps chromium`.

Variables opcionales para `npm run test:e2e`: `PORT` (puerto del preview, por defecto `4173`), `PW_NO_BUILD=1` (no recompilar, usa el build existente) y `PW_CHROMIUM_PATH` (usar un Chromium ya instalado).

### Chequeo del contenido

[`src/tests/content.test.js`](/src/tests/content.test.js) revisa todas las publicaciones de `src/lib/posts` (menos las que empiezan con `_`): que las propiedades se puedan leer, que tengan `title`, `category` y `layout`, que la categoría coincida con la carpeta, que los eventos tengan `start` con zona horaria (ej. `2026-09-11T19:30-03:00`) y que `end` sea posterior, que `status` sea `anunciado`, `abierto`, `agotadas` o `cancelado`, que las imágenes de `featured`/`photo`/`logo` existan y que les autores tengan perfil en `amigues`.

Los problemas que ya existían están anotados en [`src/tests/content-known-issues.json`](/src/tests/content-known-issues.json): el test sólo falla si aparece un problema **nuevo**. Si arreglaste algo de esa lista (o querés aceptar el estado actual), regenerala con:

```sh
UPDATE_CONTENT_ALLOWLIST=1 npx vitest run src/tests/content.test.js
```

## Base de datos

El sitio puede usar una base de datos [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) vinculada como `DB`. La usa la venta de entradas (ver [Venta de entradas](#venta-de-entradas)): hay dos migraciones, `0001_rate_limits.sql` y `0002_tickets.sql`.

La base es **opcional**: si no está disponible (durante el build, o si todavía no se vinculó en Cloudflare) el sitio anda igual, y cada función que la use tiene que ocultarse o degradar sin romper la página.

### Cómo está armado

| Qué                                                   | Dónde                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| Configuración del binding `DB`                        | [`wrangler.toml`](/wrangler.toml)                                    |
| Migraciones SQL (el esquema)                          | [`/migrations`](/migrations)                                         |
| Acceso a datos (solo servidor): `getDB`, `logDBError` | [`/src/lib/server/db/index.js`](/src/lib/server/db/index.js)         |
| Rate limiting guardado en D1 (tabla `rate_limits`)    | [`/src/lib/server/db/rateLimit.js`](/src/lib/server/db/rateLimit.js) |
| Helpers para tests (`createTestDB`, `resetDB`)        | [`/src/lib/server/db/testing.js`](/src/lib/server/db/testing.js)     |

En local nunca se toca Cloudflare: `npm run dev` simula D1 con miniflare (la opción `platformProxy` del adapter en `svelte.config.js`) y guarda los datos en `.wrangler/state/` (ignorado por git). Para empezar de cero alcanza con borrar esa carpeta.

### Correr en local

```sh
npm install
npm run dev              # antes aplica solo las migraciones pendientes a la base local
```

Otros comandos útiles:

```sh
npm run db:migrate:local                                   # aplicar migraciones a mano
npx wrangler d1 execute kinkyvibe --local --command "SELECT name FROM sqlite_master"
npm run build && npm run preview:worker                    # build de producción en el runtime de Workers (puerto 8880)
```

### Escribir una migración

Nunca se edita una migración que ya se aplicó en producción: siempre se agrega una nueva.

```sh
npm run db:migrations:new -- nombre_descriptivo   # crea migrations/000N_nombre_descriptivo.sql
# escribir el SQL en ese archivo
npm run db:migrate:local
npm run test:unit                                 # los tests aplican todas las migraciones solos
```

En el código, usar siempre consultas preparadas (`db.prepare('... WHERE x = ?1').bind(valor)`), nunca armar SQL concatenando texto, y obtener la base con `getDB(platform)` de `$lib/server/db`, que devuelve `null` si no hay base (y en ese caso la función tiene que degradar sin romper la página). Para loguear errores de la base sin tirar excepción está `logDBError(contexto, error)`, que además avisa si faltan migraciones.

### Tests con base de datos

Los tests usan un D1 real (el mismo motor `workerd`/miniflare que usa wrangler) creado en memoria con `createTestDB()` de [`/src/lib/server/db/testing.js`](/src/lib/server/db/testing.js), que lee `wrangler.toml` y aplica todas las migraciones. No necesitan internet ni tocan los datos de `.wrangler/state` que usa `npm run dev`. Ver [`/src/lib/server/db/db.test.js`](/src/lib/server/db/db.test.js) como ejemplo.

### Activarla en producción (una sola vez)

Hace falta estar logueade en la cuenta de Cloudflare del proyecto (`npx wrangler login`).

1. La base ya existe: es `kinkyvibe` en la cuenta de Cloudflare del proyecto, y su `database_id` ya está en [`wrangler.toml`](/wrangler.toml) (no es un secreto). Si alguna vez hay que recrearla: `npx wrangler d1 create kinkyvibe` y reemplazar el id.
2. En el panel de Cloudflare: **Workers & Pages → (proyecto del sitio) → Settings → Bindings → Add → D1 database**, nombre de variable `DB`, base `kinkyvibe`. Hacerlo para **Production** y también para **Preview** si se quiere en los deploys de prueba (idealmente con otra base para preview).
3. Volver a deployar (un push a la rama principal alcanza).

### Migraciones en producción

Las migraciones se aplican a la base remota a mano, con:

```sh
npm run db:migrate:remote
```

Hay que correrlo **antes** de deployar el código que necesita las tablas nuevas (wrangler solo aplica las que falten, así que se puede correr cuantas veces se quiera).

`wrangler.toml` no tiene `pages_build_output_dir` a propósito: así Cloudflare Pages lo ignora al deployar y los bindings y variables siguen configurándose desde el panel (paso 3). Solo lo usan los comandos locales y `wrangler d1`.

## Venta de entradas

Los eventos pueden vender entradas desde el sitio (pago con Mercado Pago o transferencia, QR por email, control de ingreso en `/admin/entradas`) agregando `tickets:` a su frontmatter. Usa la base de datos de arriba (tablas de `migrations/0002_tickets.sql`). Configuración, variables de entorno (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `RESEND_API_KEY`, `CRON_SECRET`…), cómo probarlo en local con los mocks (`npm run dev:tickets`) y lo que falta antes de vender de verdad: [`docs/tickets.md`](/docs/tickets.md). Los recordatorios por mail los dispara el Worker de [`workers/cron/`](/workers/cron/README.md).
