# Imágenes: la biblioteca en R2

Las imágenes del sitio ya no se suben al repo (ni con commit ni esperando un deploy): van a un
bucket de **R2** y se ven al momento. Cada imagen es un **objeto `imagen`** en la base y cada uso es
un **edge** hacia ella (nunca un id adentro del JSON; ver [objetos.md](objetos.md)).

## Cómo funciona

| Qué                      | Dónde                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| Bucket                   | binding `MEDIA`: `kinkyvibe-media` (producción), `kinkyvibe-media-preview` (previews), en `wrangler.toml` |
| Tipo `imagen`            | `src/lib/server/objects/types/imagen.js`                                                                  |
| Guardar, buscar, usos    | `src/lib/server/media/library.js`                                                                         |
| Tipo real y medidas      | `src/lib/server/media/sniff.js` (por los bytes, nunca por el nombre)                                      |
| Quién puede              | `src/lib/server/media/access.js`                                                                          |
| Subir y buscar (JSON)    | `src/routes/imagenes/+server.js`, `src/routes/imagenes/[id]/+server.js`                                   |
| Servir                   | `src/routes/media/[...key]/+server.js` → `/media/img/<sha-256>.<ext>`                                     |
| Selector de los editores | `src/lib/components/admin/ImagePicker.svelte`                                                             |
| Achicar en el navegador  | `src/lib/utils/imageResize.js`                                                                            |
| Importar las del repo    | `scripts/import-images.js` + `src/lib/server/media/import.js`                                             |

- **Clave por contenido**: `img/<sha-256>.<ext>`. El mismo archivo subido dos veces es la misma
  imagen (el `slug` del objeto es el hash). Como un archivo nunca cambia, `/media/…` responde con
  `Cache-Control: public, max-age=31536000, immutable`, `ETag` y el tipo correcto.
- **Objeto `imagen`**: `title` (nombre para buscarla), `key`, `mime`, `size`, `width`, `height`,
  `alt` (texto alternativo), `original_name` y, si vino del repo, `source_path`. Quién la subió y
  cuándo: `created_by`/`created_at` (solo les admins lo ven).
- **Usos (edges)**: evento → imagen `portada`, material → imagen `portada`, etiqueta de una serie →
  imagen `imagen`, perfil → imagen `avatar`. Uno por objeto (`max: 1`).
- **Todo lo que se sube queda en la biblioteca.** Ya no existe la pregunta «¿para todas las
  ediciones o solo esta?»: para que todas las ediciones usen la misma imagen, se elige la misma
  imagen en cada una (pestaña «De este evento» → las de la serie).

## El selector (ImagePicker)

Lo usan el editor de eventos (Editar y Cargar/Duplicar), el de material, Eventos → Series, la
imagen del perfil en Mi rincón y el editor de perfiles del panel (Comunidad → Perfiles). No hay página de biblioteca en el panel. Pestañas:

- **Subir**: se elige un archivo (JPG, PNG, WEBP, GIF o AVIF, hasta 10 MB), se escribe **qué se
  ve** (texto alternativo, obligatorio) y se sube. Antes de subir, el navegador la achica (lado más
  largo 2000 px) y la pasa a WEBP; si no puede (o un GIF, que puede ser animado), sube el original.
- **Buscar**: por nombre o texto alternativo (búsqueda de la base, sin tildes).
- **De este evento** (o «De este material/serie/perfil»): las imágenes que ya usa ese objeto; en un
  evento, también las de su serie (la etiqueta y las otras ediciones).

Lo elegido viaja en un campo oculto `imageId` (`''` = no se tocó, `none` = se sacó, o el id) y el
servidor crea el edge **en el mismo guardado** del objeto (eventos y material: `commitFiles` con
`edges`; perfiles: `updateProfile` con `avatar`; series: después de guardar la etiqueta, con
`linkImage`). Al elegir o sacar una imagen se saca también el campo viejo (`featured` / `image`).

## Quién puede

- **Admins**: subir, buscar en toda la biblioteca, elegir cualquiera y sacar imágenes.
- **Cuentas que gestionan un perfil** (Mi rincón): subir y buscar **solo entre las que subieron**;
  en su perfil solo pueden poner una imagen que subieron o la que el perfil ya tenía. **Borran una
  imagen que subieron, solo si nada la usa** (decisión de gorrite; ver «Borrar»).
- Nadie más: `/imagenes` responde 404 (como si no existiera).

## Borrar

«Sacar de la biblioteca» (admins, en Buscar) es el **borrado suave** del objeto `imagen`:
deja de aparecer en el selector, las páginas dejan de mostrarla y `/media/…` da 404. **El archivo
queda en R2** (es barato y permite deshacer: subir el mismo archivo la vuelve a la vida, con sus
edges). Ojo: los navegadores que ya la tenían en caché la pueden seguir mostrando un tiempo.

**Las cuentas** (Mi rincón, «Borrar imágenes sin usar…» en Buscar) borran igual (el mismo borrado
suave), pero solo una imagen **que subieron y que nada usa** (`deleteOwnImage` en
`src/lib/server/media/library.js`, `DELETE /imagenes/<id>`):

- «Usar» es cualquier edge hacia la imagen desde un objeto vivo (portada, imagen, avatar…) o un
  objeto vivo que nombra su archivo en sus datos (por ejemplo, `/media/img/<hash>.webp` en un
  texto) (`imageUsage`). Lo que la cuenta no puede ver se cuenta igual, como «otra publicación».
- Si se usa: 409 con dónde («No la podés borrar: se usa en perfil «…». Primero sacala de ahí.»),
  y el selector ya no muestra «Borrar» para esa imagen sino dónde se usa.
- La imagen de otra persona, una ya borrada, sin sesión o sin perfiles: 404 (como si no
  existiera). Desde otro sitio (Origin): 403.
- Les admins siguen pudiendo sacar cualquiera, aunque se use.

## Las imágenes viejas del repo (respaldo)

Hasta que se corra la importación, los eventos, el material, las series y las fichas siguen
mostrando sus imágenes del repo (`featured` numérico o archivo de `src/lib/assets`, `image` de las
series): **si un objeto no tiene edge, se usa el campo viejo**. Con edge, manda el edge
(`withCover` en `src/lib/server/contenido/posts.js`, `seriesHeader` en `src/lib/server/series`,
`toPublic` en `src/lib/server/amigues/pages.js`, `listEvents` en `src/lib/server/eventos`).

Las fichas de amigues ya viven solo en la base («solo base»): su imagen se elige en el selector
(edge `avatar`, en el mismo guardado del editor de perfiles, `saveProfileFromPanel`); elegir o sacar
una saca también las imágenes viejas de la ficha (`featured`, `logo`, `photo`). Sin edge, se sigue
mostrando la imagen vieja del repo.

### Importación (una vez)

`scripts/import-images.js` sube cada imagen de `src/lib/posts/*/media/**` y `src/lib/assets` a R2,
crea su objeto `imagen` (con texto alternativo «Imagen de «<título>»» si algo la usa) y el edge de
cada evento, material o serie cuyo campo viejo apunta a ese archivo. Idempotente: correrla de nuevo
no duplica nada; lo que ya tiene edge no se toca. Primero siempre con `--dry`:

```sh
npm run images:import -- --dry                    # local: qué haría
npm run images:import                             # local (.wrangler/state, como npm run dev)
npm run images:import -- --target=preview --dry   # preview: qué haría (necesita wrangler login)
npm run images:import -- --target=preview --yes   # preview: base y bucket de PRUEBA
npm run images:import -- --target=production --dry  # producción: qué haría
npm run images:import -- --target=production --yes  # producción: pide escribir «produccion»
```

`--target=preview` arma una configuración temporal con las bindings de `[previews]` de
`wrangler.toml` (los ids se leen del archivo) como remotas; `--target=production`, lo mismo con
las bindings de arriba (base `kinkyvibe`, bucket `kinkyvibe-media`). Producción la corre gorrite
desde su compu (lo eligió el 4/10, en vez de un botón en el panel): sin `--yes` no escribe nada y,
con `--yes`, antes de escribir pide tipear «produccion».

Después de importar y revisar, las imágenes del repo se pueden borrar en un PR aparte (las páginas
ya no las usan si todos los objetos tienen su edge; el chequeo `missing` del script lista los
campos que apuntan a archivos que no están).

## Configuración en Cloudflare (gorrite)

- Los buckets ya existen. Con Workers Builds, las bindings salen de `wrangler.toml` (`MEDIA` en
  producción y en `[previews]`). Si el sitio todavía se sirve desde **Pages**, hay que agregar la
  binding R2 `MEDIA` → `kinkyvibe-media` en el panel de Pages (producción) y `MEDIA` →
  `kinkyvibe-media-preview` (previews), porque Pages ignora `wrangler.toml`.
- No hace falta migración: el tipo `imagen` se da de alta solo (`saveObject`) y la búsqueda usa el
  índice de objetos que ya existe.

## Cómo probar

```sh
npx vitest run src/lib/server/media src/routes/imagenes src/lib/utils/imageResize.test.js
npm run dev:admin   # el bucket MEDIA local lo simula miniflare (.wrangler/state)
```

## DECIDIDO POR CLAUDE, A CONFIRMAR

- **Sin migración**: el `slug` de cada `imagen` es el SHA-256 del archivo (único por tipo) y la
  búsqueda usa `objects_fts`. Si hace falta filtrar mucho por tipo o tamaño, se promueve a columna.
- **Texto alternativo obligatorio** al subir (no solo un aviso). Las importadas del repo llevan
  «Imagen de «<título>»» (o nada si nada las usa): conviene revisarlas.
- **Cuentas del público**: solo suben y buscan entre lo suyo, y en su perfil solo ponen una imagen
  que subieron (o la que ya tenía). Borran lo suyo sin usar (decidido por gorrite, ver «Borrar»).
- **Borrar lo propio: qué cuenta como «usar»**: solo edges y menciones desde objetos **vivos** (un
  objeto borrado que la tenía no la frena; si se restaura, queda sin esa imagen hasta que se
  suba de nuevo). Sin sesión o sin perfiles, 404 como el resto de `/imagenes` (no 401/403).
- **/media sirve solo imágenes vivas** (una consulta a D1 por pedido, con caché inmutable en el
  navegador). Una imagen borrada da 404 aunque el archivo siga en R2.
- **Al elegir o sacar una imagen se borra el campo viejo** (`featured` del evento/material,
  `image` de la serie): el edge pasa a ser lo único.
- **Duplicar un evento**: si el original tiene imagen de la biblioteca, la copia usa la misma
  (edge). Si solo tiene la vieja numerada del repo, se sigue copiando como antes (commit al repo)
  hasta que se importe.
- **El mismo archivo subido de nuevo** devuelve la imagen que ya existía (con su nombre de antes);
  si no tenía texto alternativo, toma el nuevo.
- **Las fichas de amigues** (ya en la base) eligen su imagen en el selector, como los demás
  editores; al elegir o sacar una se sacan `featured`, `logo` y `photo` de la ficha vieja.
- **Importación**: crea imágenes para todo lo que hay en las carpetas (también lo que nada usa) y
  edges solo para eventos, material y series; las fichas de amigues no reciben `avatar`.
