> El contenido del sitio (eventos, material, perfiles de amigues, la wiki y las etiquetas) se edita desde el panel (`/admin`) y vive en la base de datos: ver [`docs/contenido.md`](/docs/contenido.md).
>
> La documentación para desarrollar (entorno, arquitectura, tests, base de datos, entradas, panel, mails) está en [`docs/`](/docs/README.md). Para empezar: [`docs/incorporacion.md`](/docs/incorporacion.md).

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

Son componentes Svelte.

## Publicaciones

Las publicaciones (eventos, material, perfiles de amigues y las páginas de la wiki) y el árbol de etiquetas viven en la base de datos y se editan desde el panel. Ya no hay archivos `.md` en el repo: el último commit que los tenía está marcado con el tag de git `posts-md-final` (ver [`docs/decisiones/0032-borrar-los-md.md`](/docs/decisiones/0032-borrar-los-md.md)). Para guardar una copia legible de todo: Contenido → En la base → «Descargar todo».

## Cómo dar formato a un texto

El texto de una publicación (en el editor del panel) se escribe en Markdown y puede llevar algo de HTML. Puede ser estilizado:

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

Y las imágenes son iguales que los links pero con un `!` al principio: `![texto alternativo](https://imgur.com/mi-imagen.png)`. Las imágenes propias se suben a la biblioteca del sitio (Contenido → Biblioteca, o el selector de imágenes de cada editor) y se usan con su dirección (`/media/img/…`).

Después, poniendo `#` al principio de una linea se pone como encabezado. Agregando más `#` se hace cada vez "mas chico" el título.

## Poner cosas en columnas

Rodeando dos bloques (por ejemplo, imágenes) con un divisor de clase `col-2` podemos ponerlos en dos columnas iguales

```html
<div class="col-2">
	<img src="/media/img/una-imagen.webp" alt="…" />
	<img src="/media/img/otra-imagen.webp" alt="…" />
</div>
```

`col-3` es para 3, y `col-4` es para 4

si se quiere unir varias cosas como un solo bloque, simplemente se las rodea con un `<div>...</div>` sin ninguna clase

## Tests, base de datos y venta de entradas

Cómo funcionan los tests y la CI: [`docs/pruebas-y-ci.md`](/docs/pruebas-y-ci.md). La base de datos D1 y sus migraciones: [`docs/datos.md`](/docs/datos.md). La venta de entradas: [`docs/entradas.md`](/docs/entradas.md) (guía corta) y [`docs/tickets.md`](/docs/tickets.md) (referencia completa). Los recordatorios por mail los dispara el cron del propio Worker ([`src/lib/server/scheduled.js`](/src/lib/server/scheduled.js), horarios en `wrangler.toml`).
