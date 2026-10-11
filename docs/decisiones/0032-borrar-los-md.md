# 0032. Los `.md` se borran ya, no un mes después

- Fecha: 2026-10-11
- Estado: Aceptada. Reemplaza la regla de [0004](0004-modelo-de-contenido.md) «los `.md` se borran
  del repo un mes después de migrar, dejando un tag de git». Saca la fila del importador de
  [0030](0030-para-revisar-y-recuperar.md).

## Contexto

Desde «Contenido solo en la base» (4–5/10) el sitio lee y guarda los eventos, el material, los
perfiles de amigues y la wiki solo en la base. Los `.md` de `src/lib/posts/` seguían en el repo
como respaldo, pero el código todavía los usaba en varios lugares (cómo se dibujaba un texto sin
editar, las imágenes viejas, las plantillas, la base local y la de las pruebas E2E) y el panel
todavía podía escribir en GitHub (imágenes, la capa demo de los previews). Mantener dos fuentes
era más riesgo que ayuda.

## Decisión

Decidido por gorrite el 10–11/10:

- **Se borran los `.md` ahora**, en un solo PR, sin esperar el mes de 0004. Antes, el último
  commit de `main` con los `.md` queda marcado con el tag de git `posts-md-final` (un tag no
  reescribe historia).
- Antes de borrar, un **chequeo de solo lectura** en la base de producción: cada `.md` tiene su
  objeto (resultado en el PR).
- **«Descargar todo» se queda** (la copia legible en `.md`, desde la base).
- **Se saca mdsvex** y su dependencia. Los ejemplos de las pruebas se leen como texto (`?raw`).
  rehype-slug, rehype-toc y `customRehype` se quedan: los usa `freeHtml.js`.
- **`src/lib/assets` se borra** solo después de verificar que cada imagen tiene su copia en la
  biblioteca de producción. Lo que en la base todavía nombra una imagen vieja se resuelve con un
  mapa fijo a su copia (`src/lib/utils/legacyMedia.js`), sin reescribir datos de producción.
- **Se va lo que escribía en el repo**: el cliente de GitHub del panel, el mock de `dev:admin`, la
  capa demo de archivos de los previews (`demo_files`) y `seed.js --write-events`.
- **Se borra `hardcodedTags.js`**: el árbol de etiquetas vive solo en la base (sin base, vacío).
- **Se va la revisión de fichas para importar** de Perfiles (la clasificación «a confirmar» queda).
- **Se van los importadores desde el repo** (Contenido → En la base, Perfiles y Etiquetas), y con
  ellos la fila del importador en «Para revisar» de [0030](0030-para-revisar-y-recuperar.md).
- **Se borran** `_glossary.md` y `_template.md`; las plantillas que se usan pasan a
  `src/lib/admin/plantillas/` (evento, material y perfil).
- **`HumanBody.svelte` se queda.** El interactivo `DondeGolpearUnCuerpo.svelte` (con `svgData.js`)
  vive en `src/lib/components/interactivos/`.
- **Los PDF, el video y el documento del material no se borran**: todavía no están en R2, y
  subirlos es una escritura en producción que necesita el OK de gorrite. Quedan en
  `src/lib/archivos/` con la misma dirección pública; `scripts/subir-archivos.js` (sin correr) los
  sube y reescribe los textos que los usan. Lo mismo valdría para una imagen sin copia en la
  biblioteca (no hubo ninguna).
- La base local, la de las pruebas E2E y los perfiles de los previews se llenan con una **semilla
  fija de contenido público** (`src/lib/server/semilla/`), en vez de importar los `.md`.

## Descartado

- Esperar el mes de 0004: el código seguía dependiendo de los `.md` y de GitHub.
- Subir los PDF a R2 en el mismo PR: es una escritura en producción sin OK.
- Reescribir en producción los textos y los campos que nombran imágenes viejas: el mapa de
  `legacyMedia.js` da el mismo resultado sin escribir nada.
- Una copia del backup de producción como base local: tiene datos de personas (no va al repo).

## Consecuencias

- Toda URL pública sigue igual: `content_sources` y `profile_sources` (la dirección vieja) no se
  tocan; los PDF y el video conservan su dirección.
- Unos pocos textos viejos se ven un poco distinto sin el componente compilado por mdsvex (cursivas
  con `*` pegado, listas «sueltas», comillas); se arreglan desde el editor. La lista está en el PR.
- Pendiente de gorrite (ver el PR): crear y subir el tag `posts-md-final`, y correr
  `scripts/subir-archivos.js` en producción para después borrar `src/lib/archivos/`.
