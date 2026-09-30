# 0004. Modelo de contenido (propuesta 6)

- Fecha: 2026-09-30
- Estado: Aceptada

## Contexto

Hoy el contenido vive en archivos `.md` en el repo y se edita desde el panel con commits. La
propuesta 6 lo pasa a la base de datos, con historial, sobre un modelo de objetos (tipos, campos y
relaciones) que después sirve para todo lo demás.

## Decisión

- **Núcleo en código, extras desde el panel**:
  - Eventos, lugares, perfiles, tipos de entrada, precios y órdenes se definen en código (pantallas
    propias, pruebas, tablas con tipos).
  - Desde el panel, les admins pueden **agregar** campos extra opcionales a esos tipos y crear
    tipos nuevos simples (texto, número, fecha, lista, link; sin plata ni lógica).
  - Resguardos obligatorios:
    - una sola vía de escritura, `saveObject()`, que valida;
    - las claves de campo no cambian: renombrar cambia solo la etiqueta, quitar es ocultar, y
      cambiar la clase de un campo es una conversión guiada con vista previa;
    - un solo helper de visibilidad para toda lectura pública, con pruebas que siembran objetos
      privados de cada tipo;
    - columnas e índices de verdad para todo lo que se filtra u ordena;
    - concurrencia optimista con número de versión;
    - chequeo de integridad cada noche;
    - los backups manejan el índice FTS (borrar, exportar, recrear).
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

- Todo editable desde el panel: entradas y plata sobre datos genéricos, algo que WordPress y
  WooCommerce tuvieron que deshacer.
- Todo en código, sin campos ni tipos desde el panel.
- Empezar la migración por amigues.
- Slugs fijos una vez que hay ventas.
- HTML libre para todes, o nada de HTML.
- Historial con vencimiento; links de vista previa que vencen.
- Seguir guardando una copia del contenido en git.

## Consecuencias

- Toda URL vieja tiene que seguir funcionando (redirecciones).
- Guardar contenido escribe siempre una versión nueva; nunca pisa.
- Un componente interactivo nuevo necesita un PR; no se carga desde el panel.
