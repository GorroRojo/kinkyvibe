> Ahora mismo este readme sirve como guía para editar la página para quienes tienen permiso de commit, no pretende ser un README.md tradicional.

## Páginas

El contenido de las páginas está en los siguientes archivos

| URL           | Archivo                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------- |
| `/`           | [`/src/routes/+page.svelte`](/src/routes/+page.svelte)                                       |
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

- [X] titulando y estableciendo grupos de etiquetas
- [X] fusionando etiquetas como alias de una sola
- [X] marcando etiquetas que no deben estar visibles
- [ ] estableciendo un post como post principal para cada etiqueta?
- [ ] estableciendo iconos por etiqueta? superduper opcional
- [X] color de etiquetas?

Los colores, alias, y grupos están en [_tags.md](/src/lib/posts/_tags.md?plain=1), las descripciones en [_glossary.md](/src/lib/posts/_glossary.md?plain=1) y los posts para cada tag en [`/src/lib/wiki/`](/src/lib/wiki/)

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
  - status\* (abierto | anunciado | lleno| terminado?pasado? no, se hace solo con la fecha eso.)
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

más info y ejemplos completos copiables para cada categoría en [_template.md](/src/lib/posts/_template.md)

### layouts [wip]

- blank (contenido)
- [ ] standard [default material contenido] 
  - [X] título
  - [X] summary
  - [ ] featured
  - [X] contenido
  - [X] og link
  - [X] og access date
  - [X] og publish
  - [X] publish date
  - [X] authors
  - [X] tags 
- [ ] [default material link/descargable]
- [X] [default calendario] (poster, titulo, summary, fecha, hora, lugar, CTA)
  - [X] poster
  - [X] título
  - [X] summary
  - [X] fecha
  - [X] hora
  - [X] lugar
  - [X] CTA
  - [X] add to calendar
- [default amigues] (foto, titulo, jobtitle, summary, link (+ map))
  - [X] foto
  - [ ] título
  - [ ] jobtitle
  - [X] summary
  - [X] link
  - [ ] map
  - [ ] pronouns
  - [ ] mail
  - [ ] phone
  - [ ] bday

### pendientes: indieweb & standards

#### rel

- [X] author
- [ ] enclosure (para descargables)
- [ ] rel=license
- [ ] rel=nofollow para desincentivar a buscadores seguir ese link
- [X] rel=tag
- [X] rel=home

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
- [X] multiple nested h-entry

##### h-adr

- p-street-address
- p-extended-address
- p-location
- p-region
- p-postal-code
- p-country-name
- no tiene p-name, "it's likely a vanue, you should use h-card instead"

##### h-entry

- [X] p-name
- [X] p-summary
- e-content
- [X] dt-published
- dt-updated
- [X] p-author (o h-card)
- p-category??
- [X] u-url
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

- [X] p-name
- p-summary
- [X] dt-start
- [X] dt-end
- dt-duration
- p-description (o e-content)
- [X] u-url
- ~~category~~
- [X] (MASOMENOS) p-location (puede ser h-card, h-adr, h-geo)
- p-organizer (puede ser h-card)
  foto del lugar y punto en mapa

##### h-cite

- dt-accessed
- [X] u-url = u-uid
- p-publication
- p-name
- [X] dt-published
- p-author (o h-card)
- p-content

##### h-resume

- [X] p-name
- [X] p-summary (qualifications and objectives)
- [X] p-contact h-card
- p-education h-event, p-education h-card (education time, school)
- p-experience h-event, p-experience h-card
- p-skill
- p-affiliation h-card

##### h-card

- [X] p-name
- p-honorific-prefix
- p-sort-string
- p-honorifix-suffic
- p-nickname
- u-email
- u-logo
- [X] u-photo
- [X] u-url u-uid
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
