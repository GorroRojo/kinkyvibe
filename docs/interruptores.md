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

| Interruptor (clave)                           | Variable                  | Qué prende                                                                                                                                                                                                                                                                                                                    | Antes de prenderlo                                                                 | Guía                             |
| --------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------- |
| Lo que sigo (`lo_que_sigo`)                   | `LO_QUE_SIGO_ENABLED`     | con cuenta, seguir etiquetas (y series), perfiles y lugares: «Seguir» en sus páginas y Mi rincón → Lo que sigo, con calendario y mails. Apagado, `/mi-rincon/sigo` da 404                                                                                                                                                     | migración `0032_lo_que_sigo.sql`                                                   | [lo-que-sigo.md](lo-que-sigo.md) |
| Bot de Telegram (`telegram_bot`)              | `TELEGRAM_BOT_ENABLED`    | el bot contesta `/proximos` y `/evento`; con «Lo que sigo» prendido, además conecta chats con cuentas y manda esos avisos por Telegram. Apagado, el bot no contesta                                                                                                                                                           | `TELEGRAM_WEBHOOK_SECRET` y el webhook apuntando a `/api/telegram`; migración 0033 | [telegram.md](telegram.md)       |
| Donaciones únicas al Fondo (`propinas_fondo`) | `PROPINAS_FONDO_ENABLED`  | `/propinas?de=fondo`: el formulario de propina para el Fondo, sin publicación, al que lleva «Una vez» de fondo.kinkyvibe.ar. Apagado, esa página solo explica que las propinas se dejan desde cada publicación (y el POST con `source=fondo` da 404). El total `GET /api/fondo/propinas-total` no depende de este interruptor | migración `0052_propinas_origen.sql`                                               | [propinas.md](propinas.md)       |
| Puerta por Telegram (`telegram_puerta`)       | `TELEGRAM_PUERTA_ENABLED` | les admins con el Telegram vinculado (Ajustes → Admins → «Vincular Telegram») marcan ingresos desde la Mini App `/telegram/puerta`, con el escáner de QR de Telegram. Pide el bot prendido. Apagado, `/telegram/puerta` da 404 (y no se puede vincular, salvo con `telegram_admin`)                                           | migración 0050; `TELEGRAM_BOT_TOKEN` y `TELEGRAM_BOT_USERNAME`                     | [telegram.md](telegram.md)       |
| Telegram para admins (`telegram_admin`)       | `TELEGRAM_ADMIN_ENABLED`  | les admins con el Telegram vinculado ven «📊 Estado» (vendidas contra cupo, reservas, lo que hay para revisar; solo cantidades) y eligen sus avisos en «🔔 Mis avisos» (apagados por defecto). Pide el bot prendido. Apagado, el bot contesta como si no existiera                                                            | migración 0054 (para «Mis avisos»)                                                 | [telegram.md](telegram.md)       |
| Lista de espera (`lista_espera`)              | `LISTA_ESPERA_ENABLED`    | en construcción: cuando un evento o un tipo se agota, la gente se anota en una lista; si se libera un lugar, se le avisa a la próxima persona y se le guarda un rato. Se activa por evento (`lista_espera`). Apagado, la venta anda como siempre                                                                              | migración `0053_lista_de_espera.sql`                                               | [tickets.md](tickets.md)         |

Las migraciones las aplica gorrite antes del merge del código que las necesita
([0028](decisiones/0028-migraciones-antes-del-merge.md), [datos.md](datos.md)).

### Cómo se relacionan

- **`telegram_puerta` + `telegram_bot`**: la puerta por Telegram pide los dos. Con el bot
  apagado, la puerta no anda aunque su interruptor esté prendido.
- **`telegram_admin` + `telegram_bot`**: el estado y los avisos para admins piden los dos.
  Vincular el Telegram de une admin (Ajustes → Admins) anda con `telegram_puerta` o con
  `telegram_admin`.
- **`telegram_bot` + `lo_que_sigo`**: vincular un chat con una cuenta (Mi rincón → Lo que sigo) y
  los avisos por Telegram piden los dos prendidos. Solo con `telegram_bot`, el bot contesta
  `/proximos` y `/evento` y nada más.
- Las cuentas del público ya no tienen interruptor (ver abajo): «Lo que sigo» solo mira el suyo.

### Estado recomendado

Ninguno se prende directo en producción: **primero en un preview** (con «🧪 Entrar como admin de
prueba», [demo.md](demo.md)), se revisa, y después en producción. Antes de prender uno en
producción, fijate en su guía que estén aplicadas sus migraciones y hechos sus pasos previos (la
columna «Antes de prenderlo»).

## Interruptores que quedaron fijos

Interruptores que quedaron **prendidos para siempre** y salieron de la lista. Sus variables ya
no hacen nada y una fila vieja en `feature_flags` se ignora (no hace falta borrarla). No se
pueden apagar: el camino «apagado» ya no existe en el código.

- «Contenido solo en la base» (paso 2, decisión de gorrite): `contenido_db`, `etiquetas_db` y
  `series` (variables `CONTENIDO_DB_ENABLED`, `ETIQUETAS_DB_ENABLED`, `SERIES_ENABLED`).
- «Interruptores permanentes»: `cuentas`, `perfiles_publicos`, `personas_eventos`, `propinas` y
  `borrar_desde_panel` (variables `CUENTAS_ENABLED`, `PERFILES_PUBLICOS_ENABLED`,
  `PERSONAS_EVENTOS_ENABLED`, `PROPINAS_ENABLED`, `BORRAR_DESDE_PANEL_ENABLED`). Con la variable
  en `0` ya **no** se cortan: si hace falta frenar una de estas partes, es con un PR.

| Era                                          | Qué quedó                                                                                                                                                                           | Guía                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `contenido_db` (Contenido en la base)        | los eventos y el material se leen y se guardan **solo** en la base; un `.md` de evento o material que la base no tiene no se muestra; «Descargar todo» arma los `.md` desde la base | [contenido.md](contenido.md)               |
| `etiquetas_db` (Etiquetas en la base)        | el árbol sale de la base (el archivo es solo respaldo si la base no tiene etiquetas) y el editor guarda solo en la base (sin commits al archivo)                                    | [etiquetas.md](etiquetas.md)               |
| `series` (Series de eventos)                 | «Edición N de…», páginas de serie, «Avisame si se repite», calendarios `.ics` y Eventos → Series, siempre                                                                           | [etiquetas.md](etiquetas.md)               |
| `cuentas` (Cuentas del público)              | «Ingresar» y «Mi rincón» (código por mail o contraseña, compras de cada mail) siempre; el link del encabezado y del pie siempre                                                     | [cuentas.md](cuentas.md)                   |
| `perfiles_publicos` (Perfiles públicos)      | con base, `/amigues` lee los perfiles de la base (las fichas `.md` que la base no tiene se siguen mostrando desde su archivo), «Es mi perfil», mapas y la privacidad de los lugares | [amigues.md](amigues.md)                   |
| `personas_eventos` (Personas en eventos)     | roles entre eventos o material y perfiles, y preguntas extra al comprar o inscribirse (Eventos → Roles y preguntas, pestaña Preguntas), siempre                                     | [personas-eventos.md](personas-eventos.md) |
| `propinas` (Propinas)                        | el bloque de propina al pie de las publicaciones de KinkyVibe y «Dejá una propina» en el pie de página, siempre (ya no hay nota del cafecito); `/propinas`                          | [propinas.md](propinas.md)                 |
| `borrar_desde_panel` (Borrar desde el panel) | el botón «Borrar» en eventos, material y amigues, con «Deshacer» y «Recuperar», siempre                                                                                             | `src/lib/server/admin/deletions.js`        |

Una base local nueva se llena con la semilla de contenido (`npm run db:semilla`, que
`npm run dev` ya corre solo): eventos, material, fichas de amigues y, si la base no tiene ninguna,
etiquetas y wiki ([contenido.md](contenido.md)). Los importadores del panel ya no existen
([0032](decisiones/0032-borrar-los-md.md)).

## Cómo prender `lo_que_sigo`

Lo que sigo (decisión [0025](decisiones/0025-lo-que-sigo.md)): los pasos están en
[lo-que-sigo.md](lo-que-sigo.md#cómo-prenderlo). Antes y después de prenderlo, el estado (los
interruptores, los números y los avisos que salieron) se mira en Mensajes › Lo que sigo
(`/admin/mensajes/lo-que-sigo`), que se ve también con el interruptor apagado.
