# Plan

El plan de kinkyvibe en un solo archivo: todo lo que está en curso, lo que sigue, lo que espera a
gorrite, lo de algún día y lo descartado. Reemplaza a la vieja hoja de ruta, al issue #70 y a los
artifacts de plan. Si algo no está acá, no está en el plan.

## Reglas

- **Cada ítem es una línea** con este formato (lo controla `scripts/plan-lint.js` en la CI):

  ``- `id-corto` · fase N · estado · área · qué es (depende de: otro-id) · links``
  - `id-corto`: estable, en minúsculas con guiones; no se renombra (los PRs lo citan).
  - `fase N`: el paso del orden aprobado (0–8, ver abajo). Va en la sección de su fase.
  - `estado`: `hecho`, `en curso`, `sigue`, `espera gorrite`, `algún día` o `descartado`.
  - `depende de: a, b` (opcional): ids que tienen que existir y no estar en una fase posterior.
  - `nav: <id>` (opcional): la sección «Próximamente» de `src/lib/admin/nav.js` que representa
    este ítem; su `phase` tiene que ser la misma fase.

- **El PR que hace o cambia algo actualiza su línea en el mismo PR** (estado, links). Lo nuevo
  que queda pendiente se suma como línea nueva.
- **Todo PR lleva en su descripción una línea** `Plan: <id>[, <id>]` o `Plan: ninguno`. La CI
  falla si falta o si un id no existe en este archivo.
- **Antes de mergear un PR que toca este archivo**, se relee su diff contra el `main` actual y se
  deja en el PR el comentario `Plan revisado contra main <sha>` (el SHA actual de `main`).
  `scripts/hooks/check-merge.js` bloquea el merge si falta.
- Los conflictos en este archivo se resuelven a mano: es a propósito un solo archivo.
- **Nada privado** (repo público): ni datos de personas, ni plata ni estrategia, ni detalles de
  seguridad. Un ítem privado lleva su id y «ver Mesa»; el detalle vive en la Mesa de trabajo con
  el mismo id.

## Fases

El orden de [0001](decisiones/0001-ritmo-y-orden.md) («Bases para crecer»), ajustado por
[0026](decisiones/0026-orden-1-10.md). Los arreglos y pedidos chicos van en la fase del tema que
tocan; lo que no es de ningún bloque grande (arreglos, pruebas, CI) va en la fase 0.

| Fase | Qué                                                                    |
| ---- | ---------------------------------------------------------------------- |
| 0    | Arreglos, pedidos chicos, entradas y panel del día a día, pruebas y CI |
| 1    | Workers, backups, registro de decisiones, limpiezas e infraestructura  |
| 2    | Cuentas, perfiles y el modelo de objetos (contenido en la base)        |
| 3    | Series, lugares, roles, preventas, campos personalizados, formularios  |
| 4    | Guardados, colecciones y amistades                                     |
| 5    | Bandeja, mails masivos, CRM y canales (Telegram, conector de Claude)   |
| 6    | Lo social (algún día)                                                  |
| 7    | Videos                                                                 |
| 8    | Tienda                                                                 |

Cuál es el próximo bloque grande: `espera gorrite` (ítem `fases-siguiente`).

## Fase 0

## Fase 1

## Fase 2

## Fase 3

## Fase 4

## Fase 5

## Fase 6

## Fase 7

## Fase 8

## Descartado
