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
| Borrar desde el panel (`borrar_desde_panel`) | `BORRAR_DESDE_PANEL_ENABLED` | botón "Borrar" en eventos, material y amigues, con "Deshacer" y "Recuperar" desde Actividad (los eventos con entradas vendidas no se borran)                                    | —                                                                                                       | `src/lib/server/admin/deletions.js`        |
| Perfiles públicos (`perfiles_publicos`)      | `PERFILES_PUBLICOS_ENABLED`  | `/amigues` lee los perfiles de la base (personas, proyectos, lugares), "Es mi perfil", mapas y la privacidad de las direcciones de los lugares. Apagado, todo sale de los `.md` | migraciones 0017 y 0024; Perfiles → Importar y clasificar; revisar la clasificación; cargar los lugares | [amigues.md](amigues.md), «Prenderlo»      |
| Personas en eventos (`personas_eventos`)     | `PERSONAS_EVENTOS_ENABLED`   | roles (Organiza, Facilita, Enseña…) entre eventos o material y perfiles, y preguntas extra al comprar o inscribirse (Eventos → Roles y preguntas, pestaña Preguntas)            | migraciones 0018 y 0026                                                                                 | [personas-eventos.md](personas-eventos.md) |
| Propinas (`propinas`)                        | `PROPINAS_ENABLED`           | el bloque de propina con Mercado Pago al pie de las publicaciones de KinkyVibe y "Dejá una propina" en el pie de página, en lugar del cafecito; `/propinas`                     | migraciones 0019 y 0022; revisar Ajustes → Plata → Propinas                                             | [propinas.md](propinas.md)                 |

Las migraciones las aplica gorrite antes del merge del código que las necesita
([0028](decisiones/0028-migraciones-antes-del-merge.md), [datos.md](datos.md)).

### Cómo se relacionan

- **`personas_eventos` → `perfiles_publicos`**: los roles se guardan igual, pero en las páginas
  públicas solo se ven con «Perfiles públicos» prendido (sin él no hay a qué perfil enlazar).
- **`personas_eventos` + `cuentas`**: que une organizadore vea las respuestas de su evento desde
  Mi rincón pide los dos prendidos (y el permiso «puede tener perfiles» en la cuenta).
- **`perfiles_publicos` + `cuentas`**: los pedidos "Es mi perfil" y los perfiles que se crean
  desde una cuenta necesitan las cuentas prendidas. Sin `cuentas`, `/amigues` igual lee la base.
- `borrar_desde_panel` y `propinas` no dependen de ningún otro.

### Estado recomendado

Ninguno se prende directo en producción: **primero en un preview** (con «🧪 Entrar como admin de
prueba», [demo.md](demo.md)), se revisa, y después en producción. Antes de prender uno en
producción, fijate en su guía que estén aplicadas sus migraciones y hechos sus pasos previos (la
columna «Antes de prenderlo»). Si uno tiene importación, el orden es siempre **importar → revisar
→ prender**.

Orden sugerido entre los que dependen: `cuentas` y `perfiles_publicos` antes que
`personas_eventos`.

## Interruptores que quedaron fijos

«Contenido solo en la base» (paso 2, decisión de gorrite): tres interruptores que ya estaban
prendidos en producción quedaron **prendidos para siempre** y salieron de la lista. Sus variables
(`CONTENIDO_DB_ENABLED`, `ETIQUETAS_DB_ENABLED`, `SERIES_ENABLED`) ya no hacen nada y una fila
vieja en `feature_flags` se ignora. No se pueden apagar: el camino viejo (los `.md`, el archivo de
etiquetas) ya no existe.

| Era                                   | Qué quedó                                                                                                                                                                           | Guía                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `contenido_db` (Contenido en la base) | los eventos y el material se leen y se guardan **solo** en la base; un `.md` de evento o material que la base no tiene no se muestra; «Descargar todo» arma los `.md` desde la base | [contenido.md](contenido.md) |
| `etiquetas_db` (Etiquetas en la base) | el árbol sale de la base (el archivo es solo respaldo si la base no tiene etiquetas) y el editor guarda solo en la base (sin commits al archivo)                                    | [etiquetas.md](etiquetas.md) |
| `series` (Series de eventos)          | «Edición N de…», páginas de serie, «Avisame si se repite», calendarios `.ics` y Eventos → Series, siempre                                                                           | [etiquetas.md](etiquetas.md) |

Una base nueva (un preview nuevo, la base local) necesita importar el contenido y las etiquetas:
Contenido → En la base → Importar y Etiquetas → Importar a la base (en la compu,
`npm run content:import`, que `npm run dev` ya corre solo, y `npm run tags:import`).

## Cómo prender `lo_que_sigo` (cuando se mergee)

Lo que sigo (decisión [0025](decisiones/0025-lo-que-sigo.md)), hoy «Próximamente» en Mensajes.
El PR está en curso; esta sección se completa cuando esté en `main`.
