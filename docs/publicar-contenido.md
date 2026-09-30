# Contenido desde el panel: cómo se publica

Todo lo que el panel escribe en el repo (eventos nuevos, importados o editados, la agenda,
material, amigues, wiki desde `/edit/...`, imágenes, ocultar/volver a listar, el editor de
etiquetas) pasa por **un solo camino**: `commitFiles` en `src/lib/server/eventos/github.js`.

`main` está protegida (el check `ci-ok` es obligatorio para todes), así que el panel **no
commitea a `main`**. Cada guardado:

1. crea una rama `contenido/<tipo>-<slug>-<aaaammdd-hhmmss>` (hora de Argentina) desde la punta
   de `main`, p. ej. `contenido/calendario-fiesta-2026-10-20260930-120405`;
2. hace **un commit** con todos los archivos del cambio (el `.md` y sus imágenes juntos, como
   antes), con la persona logueada como autora (su token de GitHub);
3. abre un PR a `main` titulado «Contenido: <acción> <título>» con los archivos, quién lo hizo y
   que se hizo desde el panel;
4. activa el **auto-merge** (merge commit) con el mismo token: GitHub lo mergea solo cuando
   pasan las pruebas, y el deploy de `main` publica el cambio.

Eso pasa aunque la protección esté apagada un rato: el camino es siempre el mismo. Si en ese
momento `main` no exige ningún check, GitHub no deja activar el auto-merge («clean status»,
no hay nada que esperar) y el panel mergea el PR en el momento.

## Lo que ve quien edita

- «Guardado. Se publica en unos minutos, cuando pasen las pruebas (PR #N)», con link al PR. El
  aviso consulta `GET /admin/contenido/estado?pr=N` cada 20 segundos y cambia a «Publicado»
  o a «**No se publicó: falló una prueba del contenido** (PR #N)» (o «choca con otro cambio»).
- Si no se pudo activar el auto-merge (la opción «Allow auto-merge» está apagada en el repo, o
  el token no tiene permiso) el PR queda abierto y el aviso lo dice: alguien con acceso tiene
  que mergearlo a mano.
- En el Inicio del panel, «Para revisar» lista los PRs de contenido abiertos (ramas
  `contenido/*`): primero los que fallaron o tienen conflicto, al final los que se están
  publicando. Se consulta por GraphQL con el token de la persona, con un minuto de cache.

## Guardar dos veces seguidas

Mientras el PR de una publicación sigue abierto, el panel **lee esa publicación desde la rama
del PR** (lo último guardado, no lo que hay en `main`), y el siguiente guardado de la misma
publicación **se suma como otro commit a ese PR** en lugar de abrir otro. Así no hay dos PRs
peleándose por el mismo archivo, y el chequeo de «alguien lo cambió mientras tanto» se hace
contra la rama del PR. Si el PR se mergeó justo antes, el commit va a un PR nuevo.

Los cambios que tocan muchas publicaciones (etiquetas, importar la planilla, reemplazar una
imagen compartida) abren siempre su propio PR. Si alguna de las publicaciones que tocan tiene
un PR sin publicar, el panel no guarda y pide esperar a que se publique (`PendingChangeError`),
para no generar conflictos.

La publicación de un archivo se reconoce por su ruta: `src/lib/posts/<tipo>/<slug>.md` y todo
lo que está en `src/lib/posts/<tipo>/media/<slug>/`.

## Modos sin GitHub

- `npm run dev:admin` (mock, `src/lib/server/eventos/mock.js`) y los previews (modo demo,
  `src/lib/server/demo/`) no cambian: no hay PR, los «commits» van a una carpeta temporal o a
  `demo_files` en D1, y la interfaz muestra el link al «commit» como antes.

## Configuración del repo (una vez)

- **Settings → General → Pull Requests → «Allow auto-merge»**: prendido. Sin esto los PRs
  quedan abiertos esperando un merge a mano.
- Recomendado: «Automatically delete head branches», para que las ramas `contenido/*` se borren
  al mergearse.
- Branch protection de `main`: `ci-ok` obligatorio. El auto-merge espera a ese check.
- El login pide el scope `public_repo`, que alcanza para ramas, PRs y auto-merge.
