# Contenido desde el panel: cómo se publica

Todo lo que el panel guarda va **a la base** y se ve enseguida: eventos, material, perfiles de
amigues, páginas de la wiki y etiquetas. No hay PRs, ramas `contenido/*` ni deploys de por medio.

- **Un solo camino**: el cliente de contenido (`getRepoClient()` en `src/lib/server/eventos/index.js`)
  es `withContentDb` (`src/lib/server/contenido/repo.js`) sobre un repo vacío
  (`src/lib/server/contenido/cliente.js`). Habla en rutas de los viejos `.md`
  (`src/lib/posts/<tipo>/<dirección>.md`) y las lleva a objetos de la base con `saveObject()`.
  Es igual en producción, en los previews (la base del preview) y en `npm run dev:admin` (la base
  local). Ver [contenido.md](contenido.md).
- **Historial**: cada guardado es una versión nueva (`object_revisions`), con quién guardó (el
  login de GitHub de le admin).
- **Guardar dos veces seguidas** o desde dos pestañas: el panel manda el sha del texto que abrió;
  si alguien guardó en el medio, avisa (`FileChangedError`) y no pisa nada.
- **Lo que ve quien edita**: «Guardado. Se ve enseguida en el sitio.» (`PublishStatus.svelte`).
- **Lo que no es una publicación** (una imagen, un archivo) no se guarda por acá: va a la
  biblioteca (R2, [imagenes.md](imagenes.md)). Intentarlo da `NotInRepoError`.

## Antes (hasta la decisión 0032)

Hasta octubre de 2026 el contenido eran archivos `.md` en `src/lib/posts/` y el panel publicaba
con un PR por cambio (rama `contenido/*`, auto-merge cuando pasaban las pruebas). Con «Contenido
solo en la base» los textos pasaron a la base y, con la decisión
[0032](decisiones/0032-borrar-los-md.md), los `.md`, sus carpetas de medios y el cliente de GitHub
se borraron del repo. El último commit de `main` con los `.md` está marcado con el tag
`posts-md-final`.

El login pedía el scope `public_repo` de GitHub para esos commits. Ya no pide ninguno: el token
solo sirve para leer el id de la cuenta (`GET /user`).
