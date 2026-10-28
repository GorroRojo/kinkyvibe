# La biblioteca en R2: imágenes, documentos y video

Las imágenes, los documentos (PDF, ODT, ODS, ODP) y los videos (MP4, WebM) del sitio ya no se suben
al repo (ni con commit ni esperando un deploy): van a un bucket de **R2** y se ven al momento.
Cada imagen es un **objeto `imagen`** en la base y cada uso es un **edge** hacia ella (nunca un id
adentro del JSON; ver [objetos.md](objetos.md)). Cada documento o video es un **objeto `archivo`**
(ver «Documentos y video» más abajo).

## Cómo funciona

| Qué                      | Dónde                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| Bucket                   | binding `MEDIA`: `kinkyvibe-media` (producción), `kinkyvibe-media-preview` (previews), en `wrangler.toml` |
| Tipo `imagen`            | `src/lib/server/objects/types/imagen.js`                                                                  |
| Tipo `archivo`           | `src/lib/server/objects/types/archivo.js` (documentos y video)                                            |
| Guardar, buscar, usos    | `src/lib/server/media/library.js`                                                                         |
| Tipo real y medidas      | `src/lib/server/media/sniff.js` (por los bytes, nunca por el nombre)                                      |
| Quién puede              | `src/lib/server/media/access.js`                                                                          |
| Subir y buscar (JSON)    | `src/routes/imagenes/+server.js`, `src/routes/imagenes/[id]/+server.js`                                   |
| Servir                   | `src/routes/media/[...key]/+server.js` → `/media/img/…`, `/media/file/…`; rangos en `media/range.js`      |
| Selector de los editores | `src/lib/components/admin/ImagePicker.svelte`                                                             |
| Enlazar un archivo       | `src/lib/components/admin/LibraryLinkPicker.svelte`, `src/lib/utils/libraryFiles.js` (editor de material) |
| Achicar en el navegador  | `src/lib/utils/imageResize.js`                                                                            |
| Copias chicas (tarjetas) | `src/lib/utils/mediaCopies.js`; la pasada por las viejas: `scripts/copias-chicas.js` + `media/copias.js`  |
| Copia nocturna y bloqueo | `src/lib/server/backup/media.js` (binding `MEDIA_COPIA`, solo producción); ver «Copia de la biblioteca»   |
| Imágenes viejas del repo | `src/lib/utils/legacyMedia.js` (mapa fijo a su copia en la biblioteca)                                    |
| PDF y video del material | En la biblioteca (`archivo`); ya no hay copia en el repo (ver abajo)                                      |

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

## Copias chicas para las tarjetas

Las tarjetas (13rem × 15em, unos 208 × 240 px), las filas de las listas (~128 px) y el encabezado
de un perfil mostraban el original (hasta 2000 px y 1,7 MB). Ahora cada imagen tiene, **al lado de
su original en R2**, dos copias WEBP (calidad 80) con el lado más corto de **360** y **720** px
(misma proporción; nunca se agranda): `img/<sha-256 del original>-360.webp` y `-720.webp`. Sin el
cupo de transformaciones de Cloudflare (decidido por gorrite: nada de `/cdn-cgi/image` para esto).

- **Cuándo se hacen**: al subir, en el navegador, del mismo dibujo que la de 2000 px
  (`prepareImage` en `imageResize.js`; viajan como `copy360` y `copy720`). El servidor
  (`storeImage`) las guarda solo si el original llegó a R2 recién en esa subida, si son WEBP y si
  miden lo que tienen que medir (`validCopy`, ±1 px); si no, las ignora sin frenar la subida. Nunca
  pisa nada que ya esté en R2. Un GIF no tiene copias (puede ser animado).
- **Por qué el lado más corto**: la tarjeta recorta al centro (`object-fit: cover`) en un recuadro
  fijo, así que lo que importa es el lado corto, sea la imagen vertical o apaisada. 360 alcanza
  para 1× (y 1,5×), 720 para 2× y 3×.
- **Cómo las usan las páginas**: `Card.svelte` lleva `srcset="…-360.webp 1x, …-720.webp 2x"`
  (`cardSrcset`); `PostListItem.svelte` y `amigues/ProfileHeader.svelte`, solo la de 360 px
  (`smallSrcset`: alcanza para pantallas de hasta ~2,5× en ~128–160 px, y con una sola densidad la
  imagen mide lo mismo, así la fila, que se acomoda a la imagen, queda igual). El afiche de la
  página de un evento (cuadrado, `object-fit: cover`, su LCP) lleva `srcset` con anchos
  (`posterSrcset`: `-360.webp 360w`, `-720.webp 720w` y el original con su lado corto si la portada
  tiene medidas; se anota el lado corto porque el cuadrado recorta al centro) y un `sizes` sacado
  de su CSS (`(min-width: 900px) 24rem, calc(100vw - 1.75rem)`). El `src` sigue siendo el original
  y el CSS no cambia. Solo para direcciones de la biblioteca del mismo sitio
  (`/media/img/…`); una imagen de otro sitio, un GIF o la dirección entera al sitio público (las
  de local y los previews) quedan solo con `src`.
- **Si una copia no existe** (una imagen de antes de la pasada, o una que el navegador no pudo
  achicar), `/media/img/<hash>-360.webp` responde **302 al original** con
  `Cache-Control: public, max-age=3600`: se ve igual que antes y, apenas existe la copia, se usa
  (como mucho una hora después). Una copia que existe se sirve como el original: caché para
  siempre, `ETag`, `nosniff` y el `sandbox`. Una imagen borrada: 404 también para sus copias.
- **Cuánto ahorra**: ver «Velocidad» en [seo.md](seo.md).

### La pasada por las imágenes que ya estaban (una vez, la corre gorrite)

`scripts/copias-chicas.js` hace las copias que faltan de todo lo que hay en el bucket (con sharp,
en Node; la misma versión que ya instalaba wrangler por miniflare, ahora declarada).

- **Solo suma**: lista las claves `img/…`, calcula las copias que faltan (`missingCopies`, que
  nunca devuelve una clave que ya está) y escribe **solo** `img/<hash>-360.webp` e
  `img/<hash>-720.webp` nuevas (WEBP, `Cache-Control` para siempre). Antes de cada escritura vuelve
  a mirar que no esté. No borra ni pisa nada, no toca la base. Idempotente: la segunda vez dice
  «0 copias que faltan».
- **Sin `--yes` no escribe**: lista cada copia que escribiría y de qué original.

```sh
node scripts/copias-chicas.js --target=production         # vista previa: qué escribiría
node scripts/copias-chicas.js --target=production --yes   # escribe; pide escribir «produccion»
```

`--target=local` (el R2 de `.wrangler/state`) y `--target=preview` (necesita `wrangler login`)
sirven para probarlo antes. Si una imagen falla, lo dice y sigue con las demás; correrlo de nuevo
hace solo lo que faltó.

**Para volver atrás**: las páginas vuelven al original con revertir el PR (las copias en R2 quedan
sin usar, no molestan). Si hiciera falta borrarlas, son exactamente las claves que terminan en
`-360.webp` o `-720.webp` dentro de `img/` (los originales nunca tienen guion); borrarlas solo hace
que `/media` redirija al original.

## Documentos y video

gorrite decidió (5/10) que los PDF, el video y el ODT del material vayan a la biblioteca. Ya
están ahí, y los textos que los enlazan, reescritos («Los PDF y el video del material», abajo).

| Tipo                         | Se detecta por los bytes                                            | Se sirve                           |
| ---------------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| PDF (`application/pdf`)      | empieza con `%PDF-`                                                 | `inline` (se abre en el navegador) |
| MP4 (`video/mp4`)            | caja `ftyp` con marca de video (`isom`, `mp41`, `mp42`, `avc1`…)    | `inline`, con rangos (206)         |
| WebM (`video/webm`)          | cabecera EBML con DocType `webm`                                    | `inline`, con rangos (206)         |
| ODT, ODS, ODP (OpenDocument) | zip cuya primera entrada es `mimetype`, sin comprimir, con ese tipo | `attachment` (se descarga)         |

- **Se rechaza** todo lo demás: HTML, SVG, scripts, texto, un zip que no es OpenDocument (un
  `.docx`, un `.zip` cualquiera), un `mimetype` comprimido o de otro tipo, un `ftyp` de imagen.
  Las imágenes siguen siendo solo JPG, PNG, WEBP, GIF y AVIF.
- **Solo les admins** suben documentos y video. Una cuenta del público (Mi rincón) sigue subiendo
  solo imágenes: un PDF o un video le da 415 («Acá podés subir solo imágenes…»).
- **Peso máximo: 25 MB** por documento o video (las imágenes, 10 MB). El archivo llega entero al
  Worker, que lo lee para su hash y su tipo: tiene que entrar holgado en los 128 MB de memoria
  del Worker y en el límite de un pedido de Cloudflare (100 MB en los planes Free y Pro; más
  grande, Cloudflare corta con un error sin explicación). Los archivos del material miden hasta
  11,5 MB. Lo que pasa del máximo se rechaza con un mensaje claro: en el navegador antes de
  subir, en `/imagenes` mirando `Content-Length` antes de leer el cuerpo (413) y en `storeFile`.
- **Objeto `archivo`** (tipo hermano de `imagen`): `title` (el nombre, **obligatorio**; es lo que
  se ve en el enlace), `key` (`file/<sha-256>.<ext>`), `mime`, `size`, `original_name` y, cuando se
  pase del repo, `source_path`. Sin texto alternativo (no es una imagen) y sin edges propios: un
  texto lo enlaza por su dirección (`/media/file/<hash>.pdf`), como un texto que muestra una imagen.
- **Edge `adjunto`** (material → `archivo`, solo eso): además del enlace, el material tiene un edge
  `adjunto` hacia cada archivo que enlaza (en `body` o en `link`), uno por archivo, en el orden del
  texto. **Sigue al texto**: `saveObject()` lo recalcula en cada guardado (cualquier camino: el
  panel, la importación, deshacer una versión…) y suma los que faltan y saca los que sobran
  (`deriveEdges` de `src/lib/server/objects/types/material.js`, `fileKeysInText`/`liveFileIds` de
  `types/archivo.js`). Nadie lo manda a mano (es un error). Un enlace a un hash que no es de
  ningún archivo vivo no es edge. Nada de ids en el JSON: la dirección sigue siendo lo que el texto
  guarda.
- **Servir** (`/media/file/…`): el tipo correcto, `X-Content-Type-Options: nosniff`, caché para
  siempre y `ETag` como las imágenes; `Content-Disposition` con un nombre seguro (ASCII en
  `filename`, el nombre con tildes en `filename*`). Todas las respuestas de `/media` dicen
  `Accept-Ranges: bytes` y atienden **un rango** (`Range: bytes=…`): 206 con `Content-Range`,
  416 si el rango está fuera del archivo; varios rangos o uno raro se ignoran (200 con todo). Un
  archivo borrado da 404, como una imagen.
- **Buscar con filtro por tipo**: `GET /imagenes?q=…&tipo=todo|imagen|documento|video` (solo
  admins; cada cosa con `kind`, `typeLabel` y dónde se usa). Sin `tipo`, `/imagenes` sigue
  trayendo solo imágenes (es lo que usa el selector de imágenes).
- **Enlazar en el material**: en el editor de material, debajo del texto, «📎 Enlazar un archivo de
  la biblioteca»: subir un documento o video (con su nombre) o buscarlo (filtro Todo / Imágenes /
  Documentos / Videos; los documentos y videos con un ícono y su nombre, las imágenes con su
  miniatura) y «Enlazar» suma `[Nombre](/media/file/<hash>.pdf)` al final del texto. El material
  viejo, que enlazaba sus PDF con un `<script>` que importaba el archivo del repo, ya usa este
  enlace (ver «Los PDF y el video del material»). Al guardar, el material queda con su edge
  `adjunto` hacia el archivo (ver arriba).
- **Borrar**: les admins, con el mismo borrado suave (`DELETE /imagenes/<id>`); el archivo queda en
  R2. «Dónde se usa» (`imageUsage`) cuenta el edge `adjunto` de cada material vivo y, como con las
  imágenes, también un texto que nombra el archivo sin edge (de otro tipo, o un material guardado
  antes del edge); cada objeto, una vez. Los edges `adjunto` hacia un archivo borrado quedan (como
  todo edge al borrar suave, para poder deshacer) y el próximo guardado de ese material los saca
  (como una etiqueta borrada: solo hay edge hacia lo vivo); el enlace del texto queda y da 404.

## El selector (ImagePicker)

Es para elegir **una imagen** (portada, imagen de la serie, imagen del perfil), así que muestra
solo imágenes; los documentos y los videos se enlazan con «Enlazar un archivo» (arriba). Lo usan
el editor de eventos (Editar y Cargar/Duplicar), el de material, Eventos → Series, la
imagen del perfil en Mi rincón y el editor de perfiles del panel (Comunidad → Perfiles). Para
recorrer toda la biblioteca está Contenido → Biblioteca (abajo). Pestañas:

- **Subir**: se elige un archivo (JPG, PNG, WEBP, GIF o AVIF, hasta 10 MB), se escribe **qué se
  ve** (texto alternativo, obligatorio) y se sube. Antes de subir, el navegador la achica (lado más
  largo 2000 px) y la pasa a WEBP, y hace sus dos copias chicas para las tarjetas (arriba); si no
  puede (o un GIF, que puede ser animado), sube el original.
- **Buscar**: por nombre o texto alternativo (búsqueda de la base, sin tildes).
- **De este evento** (o «De este material/serie/perfil»): las imágenes que ya usa ese objeto; en un
  evento, también las de su serie (la etiqueta y las otras ediciones).

Lo elegido viaja en un campo oculto `imageId` (`''` = no se tocó, `none` = se sacó, o el id) y el
servidor crea el edge **en el mismo guardado** del objeto (eventos y material: `commitFiles` con
`edges`; perfiles: `updateProfile` con `avatar`; series: después de guardar la etiqueta, con
`linkImage`). Al elegir o sacar una imagen se saca también el campo viejo (`featured` / `image`).
La portada que el selector muestra de entrada en esos editores (y la del original en «Cargar
evento» desde otro) sale de un solo helper, `libraryCoverOf` (`src/lib/server/contenido/posts.js`):
la dirección, su edge `portada` como la ve el panel, o null si no hay o no se pudo leer.

## Contenido → Biblioteca (la página del panel)

`/admin/contenido/biblioteca` (solo admins): todo lo de la biblioteca, imágenes, documentos y
videos, en tarjetas de a 48 (`LIBRARY_PAGE`) con «Cargar más» (`/imagenes?tipo=…&desde=<n>`).

- **Buscar** por nombre o texto alternativo, con filtro **Todo / Imágenes / Documentos / Videos**
  (la misma búsqueda que los selectores: `browseLibrary` en `src/lib/server/media/library.js`; los
  documentos y los videos se separan por el mime en la consulta, así la paginación no saltea nada).
- Cada cosa muestra su miniatura (imágenes) o el ícono de su tipo, el nombre, el texto alternativo
  (o el nombre del archivo original), el tipo y el peso, **dónde se usa** (con enlace a la ficha del
  evento, al editor del material, a la ficha del perfil o a Series; `libraryUses`) y «Abrir».
- **Subir** imágenes y archivos con el mismo `POST /imagenes` y los mismos límites (imágenes 10 MB,
  achicadas en el navegador; documentos y videos 25 MB).
- **Sacar** pide confirmación en la página (dice dónde se usa) y usa `DELETE /imagenes/<id>` (el
  borrado suave de abajo). El aviso trae **Deshacer** (la acción `recuperar` de la página).
- **Recuperar en Actividad**: todo lo que una persona admin saca de la biblioteca (desde esta
  página o desde el selector de imágenes) queda en «Borrados que podés recuperar» (Ajustes ›
  Actividad), como las publicaciones y los perfiles: `deleteLibraryItem` en
  `src/lib/server/admin/deletions.js` escribe la fila de `panel_deletions` en la misma tanda que el
  borrado y lo anota en Actividad (`library.delete`). «Recuperar» y «Deshacer» van por el mismo
  camino (`restoreLibraryItem`, con la fila cerrada en la misma tanda; `library.restore`). Sin
  migración: la columna `kind` solo admite `calendario`, `material` y `amigues`, así que estas
  filas van con `material` y las distingue el `path` (`objeto:imagen:<id>` u
  `objeto:archivo:<id>`); el `slug` es el hash del archivo. Si alguien volvió a subir el mismo
  archivo antes de recuperarlo, «Recuperar» avisa que ya estaba y cierra el borrado. Lo que borra
  una cuenta del público (lo suyo, sin usar) no va a esta lista.

### Decisiones de la página (confirmadas por gorrite, 5/10)

1. Va en **Contenido › Biblioteca** (`/admin/contenido/biblioteca`).
2. De a **48**, con «Cargar más».
3. Se puede **sacar algo que se usa**: la confirmación avisa dónde se usa. El botón dice «Sacar».
4. Deshacer: el aviso con **«Deshacer»** y, después, **Actividad › Recuperar**.
5. **Busca mientras escribís**, y la búsqueda queda en la dirección (`?q=&tipo=`) para compartirla.

## Quién puede

- **Admins**: subir (imágenes, documentos y video), buscar en toda la biblioteca, elegir
  cualquiera y sacar imágenes y archivos.
- **Cuentas que gestionan un perfil** (Mi rincón): subir y buscar **solo entre las que subieron**;
  en su perfil solo pueden poner una imagen que subieron o la que el perfil ya tenía. **Borran una
  imagen que subieron, solo si nada la usa** (decisión de gorrite; ver «Borrar»).
- Nadie más: `/imagenes` responde 404 (como si no existiera).

## Borrar

«Sacar de la biblioteca» (admins, en Buscar) es el **borrado suave** del objeto `imagen`:
deja de aparecer en el selector, las páginas dejan de mostrarla y `/media/…` da 404. **El archivo
queda en R2** (es barato y permite deshacer: subir el mismo archivo la vuelve a la vida, con sus
edges). Ojo: los navegadores que ya la tenían en caché la pueden seguir mostrando un tiempo.
Para borrar los bytes de verdad (el pedido de una persona), ver «Si una persona pide que saquemos su
foto», abajo: hay que borrarlos también de la copia nocturna.

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

## Las imágenes viejas del repo

Las imágenes que estaban en el repo (las carpetas `media/` de cada publicación y
`src/lib/assets`) se importaron a la biblioteca de producción (con `scripts/import-images.js`,
4–5/10) y se borraron del repo ([0032](decisiones/0032-borrar-los-md.md)), después de verificar
que cada una tenía su objeto `imagen` vivo y que su dirección respondía.

Lo que en la base todavía nombra una imagen con la forma vieja (un `featured` numérico o con nombre
de archivo, la foto o el logo de una ficha sin edge `avatar`, la `image` de una serie sin edge, un
texto que importa `./media/<carpeta>/1.webp`) se resuelve con un mapa fijo a su copia:
`src/lib/utils/legacyMedia.js` (`legacyMedia.json`, generado una vez con el SHA-256 de cada
archivo). **Si un objeto tiene edge, manda el edge** (`withCover` en
`src/lib/server/contenido/posts.js`, `seriesHeader` en `src/lib/server/series`, `toPublic` en
`src/lib/server/amigues/pages.js`, `listEvents` en `src/lib/server/eventos`). En producción la
dirección es `/media/img/…`; en local, en las pruebas y en los previews, la del sitio público.

### Los PDF y el video del material

Los 13 PDF, el video y el documento del material **están en la biblioteca** (R2, objetos `archivo`
con su `source_path`). Los subió una vez un script (corrido en preview y producción el 12/10) que
además reescribió el texto de cada material que los importaba a `/media/file/<hash>.<ext>` (con su
revisión, fuente `migracion`), y el edge `adjunto` salió solo. Después se chequeó que los SHA-256
de los archivos del repo coincidían con los 15 `archivo` de producción, que `/media/file/…` los
servía y que ningún texto ni la semilla seguían nombrando `$lib/archivos`, así que un PR borró
`src/lib/archivos/`, su glob en `render.js` y el script (que ya no tenía nada que hacer). Un texto
viejo que todavía importara `./media/<carpeta>/1.pdf` ya no se resuelve: solo las imágenes tienen
mapa fijo.

## Copia de la biblioteca y bloqueo contra borrados

El borrado del panel es suave (el archivo queda en R2), pero un borrado en R2 mismo (por error, un
script, un token con permiso de escritura, una regla de ciclo de vida mal puesta) no tiene vuelta
atrás: R2 no guarda versiones y el backup de la base trae las filas, no los bytes. Contra eso hay
dos cosas (decisión de gorrite, 26/10):

- **Copia nocturna** a un segundo bucket, `kinkyvibe-media-copia` (binding `MEDIA_COPIA`, solo en
  producción). La hace el cron de las 03:00 de Argentina, después del backup de la base
  (`runMediaCopy` en `src/lib/server/scheduled.js`, `copyMedia` en
  `src/lib/server/backup/media.js`):
  - Copia `img/` y `file/` (originales, copias chicas y documentos). `og/` no: son las vistas
    previas, que se vuelven a dibujar solas.
  - **Solo suma**: copia lo que falta en la copia o lo que cambió (otro tamaño u otro etag; en la
    copia guarda el etag del original, `kv-etag-origen`). **Nunca borra nada de la copia**: lo
    que se borra del original sigue en la copia. Esa es la idea.
  - **Trabajo acotado por noche**: como mucho 200 objetos, 200 MB y 40 páginas de listado
    (`DEFAULT_LIMITS`). Si no llega, anota por dónde iba (`_estado/copia-medios.json`, en la copia)
    y sigue la noche siguiente; cuando termina una vuelta entera, la próxima empieza de nuevo. Los
    dos buckets se recorren a la par, de a 1000 claves, así que la memoria no crece con la
    biblioteca. Hoy (unos 900 objetos, ~0,15 GB) la primera noche copia 200 y en unas cinco
    noches está todo; después, cada noche copia solo lo nuevo.
  - **Nunca hace fallar la corrida** (el backup ya se hizo). En el log (Observability → Logs) queda
    una línea que empieza con `copia de medios:` y dice cuántos copió, cuántos revisó y cuántos
    fallaron, y al final «vuelta completa» o «sigue mañana después de …». Un objeto que no se pudo
    copiar sale en el log y se reintenta en la vuelta siguiente.
  - Sin el binding (Previews, local sin el bucket) no hace nada. Los Previews no corren crons.
  - Protege de un borrado en el bucket de la biblioteca; **no** de perder la cuenta de Cloudflare
    (los dos buckets están en la misma cuenta).
- **Bucket lock de 30 días** en `img/` y `file/` de los dos buckets (lo pone gorrite en el panel,
  abajo). Cada objeto queda protegido **sus primeros 30 días desde que se escribió**: en ese tiempo
  R2 no deja borrarlo ni pisarlo. Pasados los 30 días se puede borrar (así se puede cumplir un
  pedido de borrar una foto). El código nunca pisa ni borra nada de `img/` ni de `file/` (claves por
  contenido, `put` solo si no existe), así que el bloqueo no rompe ninguna subida. Lo viejo lo
  protege la copia, que no borra nunca.

### Tu lista (gorrite, en el panel de Cloudflare)

1. **Crear el bucket de la copia, antes de mergear el PR que la agrega** (si no existe, la
   publicación falla): R2 object storage → **Create bucket** → nombre `kinkyvibe-media-copia`,
   ubicación automática, clase Standard → **Create bucket**. No hace falta acceso público ni
   dominio: nadie lo sirve.
2. **Mirar que no haya reglas que borren solas**: R2 object storage → `kinkyvibe-media` →
   **Settings** → **Object lifecycle rules**: ninguna regla tiene que borrar `img/` ni `file/` (la
   de subidas a medias, si algún día se pone, está bien).
3. **Bloqueo en la biblioteca**: R2 object storage → `kinkyvibe-media` → **Settings** → tarjeta
   **Bucket lock rules** → **Add rule**:
   - Rule name `img-30-dias`, prefix `img/`, retención **30 days** → **Save changes**.
   - De nuevo **Add rule**: `file-30-dias`, prefix `file/`, **30 days** → **Save changes**.
   - **Nunca una regla sin prefijo** (todo el bucket): bloquearía `og/`, que se reescribe.
4. **Bloqueo en la copia** (recomendado, igual que el de arriba): `kinkyvibe-media-copia` →
   **Settings** → **Bucket lock rules** → las mismas dos reglas (`img/` y `file/`, 30 días).
   **Nunca sin prefijo**: la copia anota por dónde va en `_estado/copia-medios.json` y lo pisa cada
   noche. Con el bloqueo, lo que se copió no se puede borrar ni pisar por 30 días, aunque alguien
   tenga un token; lo que tiene más de 30 días lo protege solo que nada lo borra. Un bloqueo
   **indefinido** en la copia protegería todo para siempre, pero entonces un pedido de borrar una
   foto obliga a sacar la regla entera, borrar y volver a ponerla: por eso 30 días.
5. **Comprobar**, la mañana siguiente al merge: en Workers → `kinkyvibe` → Observability → Logs,
   buscar `copia de medios`; y en R2, `kinkyvibe-media-copia` tiene objetos en `img/` y `file/`.
   En unas noches, la línea dice `vuelta completa` y la cantidad de objetos de `img/` y `file/` de
   los dos buckets coincide.

Con un bloqueo puesto, un bucket no se puede vaciar ni borrar hasta sacar las reglas
(R2 → bucket → Settings → Bucket lock rules → `...` → **Delete**).

### Si una persona pide que saquemos su foto

1. **En el momento: sacarla del sitio.** Contenido → Biblioteca → buscarla → **Sacar** (el borrado
   suave): deja de aparecer en las páginas y `/media/…` da 404, también para sus copias chicas.
   Sacarla también de donde se use (portada, perfil) si hace falta otra imagen. Los navegadores que
   ya la tenían la pueden mostrar un rato más (caché).
2. **Anotar la clave** (antes de sacarla, «Abrir» muestra `/media/img/<hash>.<ext>`): la clave en
   R2 es `img/<hash>.<ext>`, y sus copias chicas, `img/<hash>-360.webp` e `img/<hash>-720.webp`
   (un GIF no tiene). Un documento: `file/<hash>.<ext>`.
3. **Borrar los bytes de los dos buckets**, con la cuenta de Cloudflare (una persona con acceso),
   cuando el bloqueo lo deje: **30 días después de que se subió al original, y 30 días después de
   que se copió a la copia** (la copia la hace la noche siguiente a la subida, así que en la
   práctica, 31 días después de subida). Antes, R2 responde que el objeto está bloqueado: esperar
   y volver a intentar. Desde la compu, en la carpeta del repo:

   ```sh
   npx wrangler r2 object delete kinkyvibe-media/img/<hash>.<ext> --remote
   npx wrangler r2 object delete kinkyvibe-media/img/<hash>-360.webp --remote
   npx wrangler r2 object delete kinkyvibe-media/img/<hash>-720.webp --remote
   npx wrangler r2 object delete kinkyvibe-media-copia/img/<hash>.<ext> --remote
   npx wrangler r2 object delete kinkyvibe-media-copia/img/<hash>-360.webp --remote
   npx wrangler r2 object delete kinkyvibe-media-copia/img/<hash>-720.webp --remote
   ```

   (O en el panel: R2 → bucket → **Objects** → buscar `img/<hash>` → seleccionar → **Delete**.)
   **Borrar siempre de los dos**: la copia nunca borra sola lo que se borró del original. Si se
   borra solo de la copia, la noche siguiente la vuelve a copiar del original.

4. Las vistas previas ya dibujadas que la usaban (`og/…`) dejan de usarse solas (la dirección
   depende del contenido) y se pueden borrar sin problema: no están bloqueadas.
5. Los backups de la base guardan la fila de la imagen (nombre, texto alternativo), no los bytes.

## Configuración en Cloudflare (gorrite)

- Los buckets ya existen. Con Workers Builds, las bindings salen de `wrangler.toml` (`MEDIA` en
  producción y en `[previews]`). Si el sitio todavía se sirve desde **Pages**, hay que agregar la
  binding R2 `MEDIA` → `kinkyvibe-media` en el panel de Pages (producción) y `MEDIA` →
  `kinkyvibe-media-preview` (previews), porque Pages ignora `wrangler.toml`.
- No hace falta migración: el tipo `imagen` se da de alta solo (`saveObject`) y la búsqueda usa el
  índice de objetos que ya existe.

## Cómo probar

```sh
npx vitest run src/lib/server/media src/routes/imagenes src/lib/utils/imageResize.test.js src/lib/utils/libraryFiles.test.js src/lib/utils/mediaCopies.test.js src/lib/components/CardRow.test.js src/lib/components/PostListItem.test.js
npm run dev:admin   # el bucket MEDIA local lo simula miniflare (.wrangler/state)
```

## Decisiones (confirmadas por gorrite, 5/10)

Propuestas por Claude; **confirmado por gorrite (5/10)** todo lo de esta lista, salvo lo que se
aclara en cada punto.

- **Sin migración**: el `slug` de cada `imagen` es el SHA-256 del archivo (único por tipo) y la
  búsqueda usa `objects_fts`. Si hace falta filtrar mucho por tipo o tamaño, se promueve a columna.
- **Texto alternativo obligatorio** al subir (no solo un aviso). Las importadas del repo llevaron
  «Imagen de «<título>»» (o nada si nada las usa). Una lista para revisar esos textos: por ahora
  no (gorrite).
- **Cuentas del público**: solo suben y buscan entre lo suyo, y en su perfil solo ponen una imagen
  que subieron (o la que ya tenía). Borran lo suyo sin usar (decidido por gorrite, ver «Borrar»).
- **Borrar lo propio: qué cuenta como «usar»** (**DECIDIDO POR CLAUDE, A CONFIRMAR**, no está en lo
  que confirmó gorrite): solo edges y menciones desde objetos **vivos** (un
  objeto borrado que la tenía no la frena; si se restaura, queda sin esa imagen hasta que se
  suba de nuevo). Sin sesión o sin perfiles, 404 como el resto de `/imagenes` (no 401/403).
- **/media sirve solo imágenes vivas** (una consulta a D1 por pedido, con caché inmutable en el
  navegador). Una imagen borrada da 404 aunque el archivo siga en R2.
- **Al elegir o sacar una imagen se borra el campo viejo** (`featured` del evento/material,
  `image` de la serie): el edge pasa a ser lo único.
- **Duplicar un evento**: si el original tiene imagen de la biblioteca, la copia usa la misma
  (edge). Si solo tiene la vieja numerada del repo, la copia apunta a su copia
  en la biblioteca (edge `portada`, por `legacyMedia.js`).
- **El mismo archivo subido de nuevo** devuelve la imagen que ya existía (con su nombre de antes);
  si no tenía texto alternativo, toma el nuevo.
- **Las fichas de amigues** (ya en la base) eligen su imagen en el selector, como los demás
  editores; al elegir o sacar una se sacan `featured`, `logo` y `photo` de la ficha vieja.
- **Importación**: crea imágenes para todo lo que hay en las carpetas (también lo que nada usa) y
  edges solo para eventos, material y series; las fichas de amigues no reciben `avatar`.

## Documentos y video: decisiones (confirmadas por gorrite, 5/10)

Propuestas por Claude; **confirmado por gorrite (5/10)** todo lo de esta lista, con los cambios que
se aclaran en los puntos 2 y 8.

1. **Tipo hermano `archivo`** en vez de generalizar `imagen`: así ningún uso de imagen (portada,
   avatar, imagen de serie) puede apuntar a un PDF o a un video, porque los edges dicen hacia qué
   tipo van; `imagen` sigue pidiendo texto alternativo y `archivo` pide nombre. Nada de lo que ya
   existía para las imágenes cambia de forma.
2. **Enlace por dirección Y edge `adjunto`** (gorrite): el texto enlaza el archivo por su dirección
   (`/media/file/<hash>.<ext>`), como hoy un texto muestra una imagen, y además el material tiene
   un edge `adjunto` hacia cada archivo que enlaza. El edge **sigue al texto**: cada guardado lo
   recalcula (ver «Edge `adjunto`» arriba). «Dónde se usa» lo encuentra por el edge (y por el hash
   en los textos sin edge, como con las imágenes).
3. **25 MB** por documento o video (ver arriba). Para algo más grande: achicarlo o subirlo a otro
   lado y poner el link.
4. **PDF y video sin `sandbox`** en la `Content-Security-Policy` (el visor de PDF del navegador no
   abre en un documento con sandbox); las imágenes y los ODT/ODS/ODP la siguen teniendo. Solo
   les admins suben PDF.
5. **Video `inline`** (se ve en el navegador) como los PDF; los OpenDocument se descargan.
6. **El nombre escrito va tal cual** (sin cortar lo que parece una extensión); sin nombre escrito,
   el del archivo sin la extensión. El mismo archivo subido otra vez es el mismo objeto (con su
   nombre de antes).
7. **WebM** se acepta (era trivial); ODS y ODP también, aunque hoy solo hay un ODT.
8. **La página de la biblioteca va en un PR aparte** (gorrite): Contenido → Biblioteca (arriba). El título de esta página pasó de «Imágenes» a «La biblioteca»; las rutas
   (`/imagenes`, `/media`) y los tipos de la base no cambian (un renombre así va en un PR aparte).
