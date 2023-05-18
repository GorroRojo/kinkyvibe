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

Después, las publicaciones (eventos, articulos, links, etc...) están en [/src/lib/posts](/src/lib/posts). Cada publicación consiste de un archivo `url-de-publicacion.md` que comienza con un bloque de propiedades delimitado por tres guiones `---` y luego tiene el contenido en sí de la publicación que va a estar visible.

El contenido de la publicación puede ser estilizado:

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

```md
---
propiedad: valor
lista:
    - un elemento de la lista
    - otro elemento
---
( Contenido visible de la página )
```

## Propiedades
### title
Automáticamente se pone inserta de todo.
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
Si se agrega esta propiedad con el valor `true`, la publicación no aparece en ninguna lista. Sólo es accesible mediante la url.
### thumbnail_url
## Imágenes y otras consideraciones

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

El nombre del archivo `.md` es el que determina cómo va a ser el URL. En caso de cambiarlo, cualquier link a esa página va a dejar de funcionar. Por eso el título es una propiedad separada, y sin relación automática al nombre del archivo.
