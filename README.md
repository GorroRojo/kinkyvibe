## Páginas
El contenido de las páginas está en los siguientes archivos

| URL         | Archivo                                   |
| ----------- | ----------------------------------------- |
|`/`          |[`/src/routes/+page.svelte`](/src/routes/+page.svelte)                  |
|`/nosotres`  |[`/src/routes/(content)/nosotres/+page.md`](`/src/routes/(content)/nosotres/+page.md`)  |
|`/material`  |[`/src/routes/(content)/material/+page.md`](`/src/routes/(content)/material/+page.md`)  |
|`/amigues`   |[`/src/routes/(content)/amigues/+page.md`](`/src/routes/(content)/amigues/+page.md`)   |
|`/calendario`|[`/src/routes/(content)/calendario/+page.md`](`/src/routes/(content)/calendario/+page.md`)|
|`/servicios` |[`/src/routes/(content)/servicios/+page.md`](`/src/routes/(content)/servicios/+page.md`) |

En los archivos `.md` está en Markdown, mezclado con Svelte _(que se ve como HTML)_ . En los `.svelte` es Svelte simplemente.

## Publicaciones
Después, las publicaciones (eventos, articulos, links, etc...) están en [/src/lib/posts](/src/lib/posts). Cada publicación consiste de un archivo `url-de-publicacion.md` que comienza con un bloque de propiedades delimitado por tres guiones `---` y luego tiene el contenido en sí de la publicación que va a estar visible.

Si la publicación tiene imágenes u otros archivos, estos están _(usando el ejemplo)_ en `/src/lib/posts/media/url-de-publicación/1.png`. Cada archivo debe tener como título un número comenzando por cero y nada más, sólo seguido por el formato del archivo. El nombre de la carpeta debe ser exactamente igual al nombre del archivo de la publicación. Tal que en este ejemplo, la publicación sería `/src/lib/posts/url-de-publicación.md`.

## Contenido
El contenido puede ser estilizado:

| formato | resultado |
| - | - |
| `*kinkyvibe*` | *kinkyvibe* |
| `**kinkyvibe**` | **kinkyvibe** |
| `***kinkyvibe***` | ***kinkyvibe*** |
| \`kinkyvibe\` | `kinkyvibe` |
| `[kinkyvibe](https://kinkyvibe.ar)` | [kinkyvibe](kinkyvibe.ar) |
| `~~kinkyvibe~~` | ~~kinkyvibe~~ |
| `kinky<sub>vibe</sub>` | kinky<sub>vibe</sub> |
| `kinky<sup>vibe</sup>` | kinky<sup>vibe</sup> |

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

### title
Automáticamente se inserta arriba de todo, no hace falta repetirlo como un encabezado.

### date
Debería partirse entre creation_date, modify_date, y publish_date.
¿Quizás todo archivo que no tenga publish_date aparece oculto?

### category
Por ahora, `material`, `calendario`, o `amigues`. A revisar.

### type
Confuso, pero en principio algo como 

- `pdf`
- `img`
  para contenido que existe en formato imágen, es decir que el material en sí es una o varias imágenes
- `text`?
- `event`? charla? charla debate?

Lo que queda por definir es qué cosas son un type, qué cosas una categoría, y qué cosas se filtran por etiquetas simplemente.

### tags
En algún lado deberían figurar todas.

### authors
En algún lado deberían figurar todos. *Es una lista, no un valor único.*

### unlisted
Si se agrega esta propiedad con el valor `true`, la publicación no aparece en ninguna lista. Sólo es accesible mediante la url directa.

### thumbnail_url
El nro correspondiente al archivo subido en `/media/` que se quiere usar como thumbnail de la publicación.

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

Y así, luego en el cuerpo del documento se hace referencia a estos archivos por su número, así como en la propiedad `thumbnail_url`.

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
    import pag1 from '$lib
```
