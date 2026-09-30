# 0004. Modelo de contenido (propuesta 6)

- Fecha: 2026-09-30
- Estado: Aceptada

## Contexto

Hoy el contenido vive en archivos `.md` en el repo y se edita desde el panel con commits. La
propuesta 6 lo pasa a la base de datos, con historial, sobre un modelo de objetos (tipos, campos y
relaciones) que después sirve para todo lo demás.

## Decisión

- Git **no** guarda una copia del contenido: lo resguardan los backups a R2 (0009) y un botón
  "Descargar todo".
- Orden de migración: **eventos primero** (no amigues).
- Imágenes en un R2 propio (`media.kinkyvibe.ar`), convertidas a webp en el navegador.
- El slug se puede cambiar **siempre**, incluso con ventas, con redirección 301 pública.
- HTML: una **lista corta** permitida para todes; superadmins pueden usar HTML libre, con un aviso
  visual cuando se salen de la lista corta.
- Interactivos: se hacen en código, como componente registrado.
- Historial: **todo, para siempre**.
- Publicación programada: sí.
- Link de vista previa de borradores: sí, **sin vencimiento**.
- Los `.md` se borran del repo **un mes después** de migrar, dejando un tag de git.
- `/cdh` queda como código.
- Borrar eventos, material y amigues desde el panel, con confirmación y deshacer.

## Descartado

- Empezar la migración por amigues.
- Slugs fijos una vez que hay ventas.
- HTML libre para todes, o nada de HTML.
- Historial con vencimiento; links de vista previa que vencen.
- Seguir guardando una copia del contenido en git.

## Consecuencias

- Toda URL vieja tiene que seguir funcionando (redirecciones).
- Guardar contenido escribe siempre una versión nueva; nunca pisa.
- Un componente interactivo nuevo necesita un PR; no se carga desde el panel.
