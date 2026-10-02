# Interruptores

## Qué son

Todo lo nuevo sale **apagado** y se prende desde el panel cuando está listo (decisión
[0001](decisiones/0001-ritmo-y-orden.md)). Cada interruptor prende una parte del sitio; apagado,
el sitio se ve y anda como antes de esa parte.

- **Dónde**: Ajustes → Sistema → Interruptores (`/admin/ajustes/interruptores`). Cada cambio queda
  en Actividad.
- **Tarda hasta 30 segundos** en verse en todo el sitio: cada isolate recuerda el valor un rato
  (`FLAG_CACHE_MS`).
- **Cada entorno tiene los suyos**: se guardan en la tabla `feature_flags` de cada base. Prender
  algo en un preview (base `kinkyvibe-preview`, compartida por todos los previews) no lo prende en
  producción, y al revés. Sin fila en la tabla, apagado.
- **Variable de entorno**: cada interruptor tiene una que manda sobre el panel. `1` lo fuerza
  prendido (tests E2E, `vite dev`), `0` lo fuerza apagado aunque el panel diga otra cosa (sirve para
  **cortarlo de golpe** desde el panel de Cloudflare si algo sale mal). Vacía o ausente: manda el
  panel. La página de Interruptores muestra cuando una variable lo está forzando.
- **En el menú**: las secciones de un interruptor apagado se ven solo para les superadmins, con la
  etiqueta "prueba" ([panel.md](panel.md), «Ciclo de vida de una sección»).

La lista y los textos salen de `src/lib/server/flags.js` (`FLAGS`). Para agregar uno: sumalo ahí,
con su `envVar` y un atajo (`algoEnabled(platform)`), y documentalo en esta guía.

## Los interruptores

| Interruptor (clave)                          | Variable                     | Qué prende                                                                                                                                                                      | Antes de prenderlo                                                                                      | Guía                                       |
| -------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Cuentas del público (`cuentas`)              | `CUENTAS_ENABLED`            | "Ingresar" y "Mi rincón": cuentas con código por mail o contraseña, y las compras de cada mail. Apagado, esas páginas dan 404 y no hay link                                     | migración `0013_cuentas.sql` y `RESEND_API_KEY` en el entorno                                           | [cuentas.md](cuentas.md)                   |
| Series de eventos (`series`)                 | `SERIES_ENABLED`             | "Edición N de la serie" en los eventos, páginas de serie, "Avisame si se repite", calendarios `.ics` y Eventos → Series en el panel                                             | —                                                                                                       | [etiquetas.md](etiquetas.md), «Series»     |
| Borrar desde el panel (`borrar_desde_panel`) | `BORRAR_DESDE_PANEL_ENABLED` | botón "Borrar" en eventos, material y amigues, con "Deshacer" y "Recuperar" desde Actividad (los eventos con entradas vendidas no se borran)                                    | —                                                                                                       | `src/lib/server/admin/deletions.js`        |
| Perfiles públicos (`perfiles_publicos`)      | `PERFILES_PUBLICOS_ENABLED`  | `/amigues` lee los perfiles de la base (personas, proyectos, lugares), "Es mi perfil", mapas y la privacidad de las direcciones de los lugares. Apagado, todo sale de los `.md` | migraciones 0017 y 0024; Perfiles → Importar y clasificar; revisar la clasificación; cargar los lugares | [amigues.md](amigues.md), «Prenderlo»      |
| Personas en eventos (`personas_eventos`)     | `PERSONAS_EVENTOS_ENABLED`   | roles (Organiza, Facilita, Enseña…) entre eventos o material y perfiles, y preguntas extra al comprar o inscribirse (Eventos → Roles y preguntas, pestaña Preguntas)            | migraciones 0018 y 0026                                                                                 | [personas-eventos.md](personas-eventos.md) |
| Propinas (`propinas`)                        | `PROPINAS_ENABLED`           | el bloque de propina con Mercado Pago al pie de las publicaciones de KinkyVibe y "Dejá una propina" en el pie de página, en lugar del cafecito; `/propinas`                     | migraciones 0019 y 0022; revisar Ajustes → Plata → Propinas                                             | [propinas.md](propinas.md)                 |
| Etiquetas desde la base (`etiquetas_db`)     | `ETIQUETAS_DB_ENABLED`       | todo el sitio lee el árbol de etiquetas de la base en lugar de `hardcodedTags.js`, y el editor de Etiquetas guarda en la base al momento                                        | migración `0029_etiquetas.sql`; Etiquetas → Importar a la base (ver abajo)                              | [etiquetas.md](etiquetas.md)               |

Las migraciones las aplica gorrite antes del merge del código que las necesita
([0028](decisiones/0028-migraciones-antes-del-merge.md), [datos.md](datos.md)).

### Cómo se relacionan

- **`personas_eventos` → `perfiles_publicos`**: los roles se guardan igual, pero en las páginas
  públicas solo se ven con «Perfiles públicos» prendido (sin él no hay a qué perfil enlazar).
- **`personas_eventos` + `cuentas`**: que une organizadore vea las respuestas de su evento desde
  Mi rincón pide los dos prendidos (y el permiso «puede tener perfiles» en la cuenta).
- **`perfiles_publicos` + `cuentas`**: los pedidos "Es mi perfil" y los perfiles que se crean
  desde una cuenta necesitan las cuentas prendidas. Sin `cuentas`, `/amigues` igual lee la base.
- **`series` y `etiquetas_db`**: las series son etiquetas. Con `etiquetas_db` apagado, Eventos →
  Series guarda con un commit al archivo; prendido, en la base. Prendé `etiquetas_db` con `series`
  prendido o apagado, da igual: todo lo de series lee el árbol que esté en uso.
- `borrar_desde_panel` y `propinas` no dependen de ningún otro.

### Estado recomendado

Ninguno se prende directo en producción: **primero en un preview** (con «🧪 Entrar como admin de
prueba», [demo.md](demo.md)), se revisa, y después en producción. Antes de prender uno en
producción, fijate en su guía que estén aplicadas sus migraciones y hechos sus pasos previos (la
columna «Antes de prenderlo»). Si uno tiene importación, el orden es siempre **importar → revisar
→ prender**.

Orden sugerido entre los que dependen: `cuentas` y `perfiles_publicos` antes que
`personas_eventos`; `etiquetas_db` es independiente de los demás.

## Cómo prender `etiquetas_db`

Pasa las etiquetas del archivo `src/lib/utils/hardcodedTags.js` a la base. El detalle de qué lee
de dónde está en [etiquetas.md](etiquetas.md), «Leer y editar desde la base».

### 1. En un preview

1. Abrí el preview de un PR que esté al día con `main` (el importador lee el archivo y los
   textos de la wiki que vienen en ese deploy) y entrá con «🧪 Entrar como admin de prueba».
2. **Etiquetas → «Importar a la base»** (`/admin/etiquetas/importar`). Anda con el interruptor
   apagado. Antes de escribir muestra qué va a pasar con cada etiqueta (se crea, se actualiza, sin
   cambios, editada en el panel, queda para la próxima tanda…). Importá: trabaja por tandas de
   unas 120 escrituras y sigue solo hasta terminar. Se puede repetir sin miedo: es idempotente y
   no pisa lo que se editó en el panel.
3. **Revisá** los avisos del importador (relacionadas con etiquetas que no existen, alias de
   etiquetas que no existen: esos no se importan, a propósito) y que no queden etiquetas
   pendientes ni con error. Una segunda pasada tiene que decir «sin cambios» en todas.
4. **Prendé** Ajustes → Interruptores → «Etiquetas desde la base».
5. **Mirá el sitio** (esperá 30 segundos): `/wiki` y una página de etiqueta, un listado de
   eventos filtrado por etiqueta, el buscador, una serie y su página, el editor de un evento, y
   `/admin/etiquetas` (que ahora dice que guarda en la base). Tiene que verse igual que antes.
6. Probá editar una etiqueta en `/admin/etiquetas` y ver el cambio en el sitio.

### 2. En producción

1. Confirmá con gorrite que la migración `0029_etiquetas.sql` está aplicada en producción.
2. Entrá al panel de kinkyvibe.ar con GitHub y repetí los pasos 2 a 6 de arriba: importar,
   revisar, prender, mirar.
3. Desde ahí, las etiquetas se editan en el panel y quedan en la base. **Editar
   `hardcodedTags.js` ya no cambia nada** en el sitio (es solo el respaldo), y reimportar no pisa
   lo editado en el panel.

### Qué sigue leyendo archivos con el interruptor prendido

- **Los textos de la Kinkipedia** (`/wiki/<entrada>`) siguen saliendo de sus `.md` en
  `src/lib/posts/wiki/`. El importador copia el texto a la base, pero el sitio todavía muestra el
  del `.md`.
- **Las publicaciones** siguen nombrando las etiquetas en su `tags:` del `.md`. Renombrar una
  etiqueta (por defecto) hace un commit que reescribe esas publicaciones; hasta que el sitio se
  vuelve a publicar (unos minutos), se ven con el nombre viejo como etiqueta suelta.
- **`hardcodedTags.js`**: solo como respaldo, si la base no tiene etiquetas o no se puede leer.
- El RSS y el sitemap se arman en el build, sin la base: no muestran etiquetas.

### Cómo apagarlo

- **Normal**: Ajustes → Interruptores → apagar «Etiquetas desde la base». En 30 segundos todo
  vuelve a leer el archivo. Las etiquetas de la base quedan guardadas (al prenderlo de nuevo
  vuelven como estaban).
- **De golpe**: `ETIQUETAS_DB_ENABLED=0` en las variables del entorno, en el panel de Cloudflare.
  Manda sobre el panel hasta que se borre la variable.
- **Ojo**: lo que se cambió en la base mientras estuvo prendido **no está en el archivo**. Al
  apagarlo, esos cambios dejan de verse; y si se renombró una etiqueta reescribiendo las
  publicaciones, esas publicaciones usan el nombre nuevo, que el archivo no conoce, y se ven
  como etiqueta suelta hasta que alguien lo agregue al archivo (o se vuelva a prender).

## Cómo prender `contenido_db` (cuando se mergee)

Eventos, material, amigues y wiki pasan de los `.md` a la base (PRs #166 a #169, todavía sin
mergear). Esta sección se completa cuando estén en `main`: qué migraciones pide, cómo se importa,
qué revisar, qué sigue leyendo los `.md` y cómo se apaga. Mientras tanto, ver
[contenido.md](contenido.md).

## Cómo prender `lo_que_sigo` (cuando se mergee)

Lo que sigo (decisión [0025](decisiones/0025-lo-que-sigo.md)), hoy «Próximamente» en Mensajes.
El PR está en curso; esta sección se completa cuando esté en `main`.
