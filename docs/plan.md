# Plan

El plan de kinkyvibe en un solo archivo: lo que está en curso, lo que sigue, lo que espera a
gorrite, lo de algún día y lo descartado. Reemplaza a la vieja `docs/hoja-de-ruta.md`, al issue
#70 y a los artifacts de plan. Si algo no está acá, no está en el plan.

## Reglas

- **Cada ítem es una línea** con este formato (lo controla `scripts/plan-lint.js` en la CI):

  ``- `id-corto` · fase N · estado · área · qué es (depende de: otro-id) · links``
  - `id-corto`: estable, en minúsculas con guiones; no se renombra (los PRs lo citan).
  - `fase N`: el paso del orden aprobado (0–8, ver abajo). La línea va en la sección de su fase.
  - `estado`: `hecho`, `en curso`, `sigue`, `espera gorrite`, `algún día` o `descartado`.
  - `depende de: a, b` (opcional): ids que existen acá y no están en una fase posterior.
  - `nav: <id>` (opcional): la sección «Próximamente» de `src/lib/admin/nav.js` que es este
    ítem. Su `phase` en `nav.js` tiene que ser la misma fase, y toda sección con `phase` tiene
    que tener su ítem acá.

- **El PR que hace o cambia algo actualiza su línea en el mismo PR** (estado, links). Lo nuevo
  que queda pendiente entra como línea nueva. Lo hecho queda con `hecho` y su PR, en una línea.
- **Todo PR lleva en su descripción una línea** `Plan: <id>[, <id>]` o `Plan: ninguno`. La CI
  falla si falta o si un id no existe en este archivo (los PRs de bots, como Dependabot, no la
  necesitan).
- **Antes de mergear un PR que toca este archivo**, se relee su diff contra el `main` actual y
  se deja en el PR el comentario `Plan revisado contra main <sha>` con el SHA actual de `main`
  (completo o de 7 caracteres o más). `scripts/hooks/check-merge.js` bloquea el merge si falta.
- Los conflictos en este archivo se resuelven a mano: es a propósito un solo archivo.
- Las decisiones de producto siguen en [decisiones/](decisiones/README.md); acá solo se linkean.
- **Nada privado** (el repo es público): ni datos de personas, ni plata ni estrategia, ni
  detalles de seguridad. Un ítem privado lleva su id y «ver Mesa»; el detalle vive en la Mesa de
  trabajo con el mismo id.

## Fases

El orden de [0001](decisiones/0001-ritmo-y-orden.md) («Bases para crecer»), con el orden de lo
que seguía ajustado por [0026](decisiones/0026-orden-1-10.md). Cada ítem va en la fase de su
tema; lo que no es de ningún bloque grande (arreglos, entradas y panel del día a día, pruebas y
CI) va en la fase 0.

| Fase | Qué                                                                                 |
| ---- | ----------------------------------------------------------------------------------- |
| 0    | Arreglos y pedidos chicos, entradas, panel, sitio público, bot de Telegram, pruebas |
| 1    | Workers, backups, registro de decisiones y este plan, limpiezas e infraestructura   |
| 2    | Cuentas, perfiles y el modelo de objetos (contenido en la base)                     |
| 3    | Series, lugares, roles, preventas, campos personalizados y formularios              |
| 4    | Guardados, colecciones y amistades                                                  |
| 5    | Bandeja, mails masivos, CRM y sus canales, conector de Claude                       |
| 6    | Lo social (algún día)                                                               |
| 7    | Videos                                                                              |
| 8    | Tienda                                                                              |

**Abierto con gorrite:** cuál es el próximo bloque grande (`fases-siguiente`) y si «Lo que
sigo» del panel es la fase 2 como dice `nav.js` (`lo-que-sigo-panel`).

## Fase 0

### Entradas y lanzamiento

- `lanzamiento-decisiones` · fase 0 · espera gorrite · entradas · Qué pasa con las entradas si un evento se cancela o se reprograma; tope del Fondo por evento; cuándo cierra la venta; quién puede reembolsar y si hacen falta reembolsos parciales; si las extras cuentan para el Fondo · [tickets.md](tickets.md#preguntas-abiertas-para-les-organizadores)
- `mp-plazo-comision` · fase 0 · espera gorrite · entradas · Elegir el plazo de acreditación de Mercado Pago y cargar esa comisión en Ajustes › Cobros · [tickets.md](tickets.md#pendientes-antes-de-vender-de-verdad)
- `lanzamiento-pruebas-mp` · fase 0 · espera gorrite · entradas · De punta a punta en el sandbox de MP: compra, rechazo y reintento, pago con la reserva vencida, reembolso, contracargo, código con total muy chico, entrada con el Fondo. Faltan credenciales de prueba
- `lanzamiento-compra-real` · fase 0 · espera gorrite · entradas · Una compra real de monto chico con la cuenta de verdad, y su reembolso (depende de: mp-plazo-comision)
- `lanzamiento-mails` · fase 0 · sigue · mails · Probar los mails en Gmail, Hotmail, Yahoo y un mail de trabajo (spam, .ics, recordatorio, cambio de fecha) y revisar SPF, DKIM y DMARC
- `lanzamiento-cupo-carga` · fase 0 · sigue · entradas · La última entrada vendida a la vez desde el sitio y la puerta, qué muestra «Para revisar», y 50–100 intentos de compra en pocos minutos contra un preview
- `lanzamiento-preparar` · fase 0 · espera gorrite · entradas · Borrar los eventos de prueba, revisar remitente y contacto de devoluciones, el webhook de MP; quién revisa transferencias y quién está en la puerta; una segunda persona con acceso a todo; guías cortas (puerta, transferencias, reembolsos, «si se cae el sitio»); plan B en papel; no mergear durante una venta grande
- `lanzamiento-avisos-venta` · fase 0 · sigue · entradas · Avisos durante una venta: errores de MP, mails que no salieron, cupo pasado
- `lanzamiento-piloto` · fase 0 · espera gorrite · entradas · Abrir con un evento piloto propio y chico, después dos o tres normales, después los de amigues (depende de: lanzamiento-decisiones, lanzamiento-pruebas-mp, legales-minimos)
- `puerta-celus-reales` · fase 0 · espera gorrite · entradas · La puerta con celulares reales (Android y iPhone): escanear, código, buscar, vender en efectivo y transferencia, sin conexión y con dos celus a la vez
- `qr-mp-puerta` · fase 0 · sigue · entradas · Cobrar con el QR de Mercado Pago en la puerta (gorrite, 11/10) (depende de: puerta-sin-conexion)
- `boton-comprar-afuera` · fase 0 · sigue · sitio · Cuando las entradas se venden en otro sitio, el botón tiene el mismo peso que «Comprar entradas» (gorrite, 10/10)
- `tickets-spec-arreglar` · fase 0 · sigue · pruebas · Dos pruebas de `tests/tickets/tickets.spec.js` que no corren en la CI: arregladas en #325 («1 aprobado» en singular; esperar a que cargue la página). Falta sumarlas a la CI
- `puerta-sin-conexion` · fase 0 · hecho · entradas · Vender en la puerta sin conexión · #286, [0035](decisiones/0035-vender-en-puerta-sin-conexion.md)
- `transferencia-dias-habiles` · fase 0 · hecho · entradas · Reserva por transferencia de 2 días hábiles · #261, [0031](decisiones/0031-reserva-transferencia-dias-habiles.md)
- `aviso-cambio-fecha` · fase 0 · hecho · mails · «Avisar a les compradores» cuando cambia la fecha · #266
- `ics-en-mail` · fase 0 · hecho · mails · El .ics y Google Calendar en los mails de entradas · #256
- `aviso-transferencia-sin-datos` · fase 0 · hecho · entradas · Aviso cuando un evento tiene transferencia y faltan los datos de Cobros · #214
- `fondo-propinas-unicas` · fase 0 · hecho · fondo · Donaciones de una vez al Fondo con las propinas, el total del mes para kv-fondo y el mail «tu link» · #287, #268

### Legales

- `legales-minimos` · fase 0 · espera gorrite · legales · Página `/legales` mínima en borrador (solo previews). Plan cuando gorrite lo retome: bajarla a lo mínimo con la leyenda de la AAIP y los 10 días de arrepentimiento por mail; falta definir quién figura como responsable; inscribir la base y el botón de arrepentimiento, por ahora no · #282 (borrador)

### Panel

- `nav-c-puerta-hoy` · fase 0 · hecho · panel · La Puerta abre directo en el evento de hoy si hay uno solo · #314, [0039](decisiones/0039-navegacion-del-panel-opcion-c-parte-2.md)
- `nav-c-ir-a-recientes` · fase 0 · hecho · panel · «Ir a…» (⌘K) vacío muestra Fijados y Recientes · #314
- `ajustes-4-grupos` · fase 0 · hecho · panel · Ajustes como portada con 4 grupos de tarjetas (Plata, Comunicación, Equipo, Sistema) en vez de pestañas · #317, [0042](decisiones/0042-ajustes-portada-con-grupos.md)
- `ajustes-fondo-linea` · fase 0 · sigue · panel · Portada de Ajustes: línea de estado del Fondo aunque todavía no haya llegado el porcentaje automático (hoy la tarjeta va sin línea; buscarlo haría lenta la portada) (depende de: ajustes-4-grupos)
- `panel-pestanas-celu` · fase 0 · sigue · panel · En el celu, la lista ▾ de pestañas de la ficha se ve menos importante que los botones de acción (gorrite, #303)
- `buscador-pestanas-nombres` · fase 0 · hecho · panel · Los atajos del buscador a las pestañas de un evento (`eventTabActions`) dicen «Órdenes» y «Mail a compradores»: pasar a «Ventas › Órdenes» y «Mails › Mandar un aviso» · #323
- `navprefs-grupos-limpiar` · fase 0 · hecho · panel · Sacar de `navPrefs.js` las funciones de grupos abiertos (`kv-panel-grupos`) y sus pruebas, que la barra sin grupos ya no usa · #323
- `panel-prefs-en-base` · fase 0 · algún día · panel · Fijados y el modo del panel lateral por admin en la base (hoy por navegador), si se suma una tabla de preferencias
- `miniaturas-listas-panel` · fase 0 · hecho · panel · Miniaturas achicadas (`thumbnailUrl`) en Eventos y Contenido, como ya tiene «Hoy» · #323
- `graficos-mas` · fase 0 · algún día · panel · Más gráficos: mapa de la comunidad, Fondo y finanzas
- `editor-textos-sitio` · fase 0 · sigue · panel · Un «modo editar textos» para casi todo lo que dice el sitio, visualmente afuera del panel, con el mismo registro de textos del bot y las vistas previas; por partes, y antes decidir qué queda fijo (gorrite, 11/10)
- `nav-panel-c` · fase 0 · hecho · panel · Navegación del panel opción C, partes 1 y 2 · #301, #309, [0038](decisiones/0038-navegacion-del-panel-opcion-c.md)
- `ficha-evento-7-pestanas` · fase 0 · hecho · panel · Ficha del evento con 7 pestañas y ▾ en el celu; mails a Mensajes · #303, #305
- `panel-iconos-lateral` · fase 0 · hecho · panel · Íconos en las pestañas y modo del panel lateral por admin · #293
- `estadisticas-pestanas` · fase 0 · hecho · panel · Estadísticas en pestañas (Ventas, Asistencia, Visitas) · #258
- `buscador-panel` · fase 0 · hecho · panel · Buscador del panel: tildes, acciones y operadores · #259, #269

### Sitio público

- `ux-auditoria-restos` · fase 0 · sigue · sitio · Lo que sigue abierto de la auditoría de UX del 4/10: anclas del glosario, áreas de toque, migas de pan, búsqueda vacía de la wiki
- `wiki-sin-entrada-editar` · fase 0 · hecho · sitio · «Editar contenido» en términos de la wiki que no tienen entrada (TODO en `UserMenu.svelte`) · #323
- `filtros-celu-probar` · fase 0 · sigue · sitio · Probar la barra de filtros en celulares reales y, si va, cerrar el PR de prototipos · #294, #283
- `filtros-sin-efecto` · fase 0 · sigue · sitio · Esconder etiquetas del filtro que no cambiarían los resultados · #17
- `lectura-barra-progreso` · fase 0 · espera gorrite · sitio · Barra de progreso de lectura; confirmar que se sigue queriendo · #19
- `lectura-ajustes` · fase 0 · algún día · sitio · Ajustes de lectura: tamaño de letra y tema; falta diseño · #20
- `textos-desplegables` · fase 0 · sigue · sitio · Secciones desplegables y notas al pie en los textos · #22
- `fragmentos-reutilizables` · fase 0 · algún día · sitio · Fragmentos reutilizables de publicaciones y del glosario; falta diseño · #23
- `negociacion-bottoms` · fase 0 · espera gorrite · sitio · Negociación interactiva para bottoms; decisión de contenido · #14, #25
- `inicio-carrusel` · fase 0 · espera gorrite · sitio · Carrusel en la portada: decidir si la fila de próximos eventos de #227 lo cierra · #15
- `mapa-direccion-libre` · fase 0 · espera gorrite · sitio · Mapa para eventos con dirección en texto libre (sin lugar cargado); vincular datos de producción lo decide gorrite
- `compartir-imagen-mas` · fase 0 · algún día · sitio · Imagen para compartir: más paletas, apaisado y carrusel, estilo por serie
- `kinkipedia-series-mejor` · fase 0 · espera gorrite · sitio · Kinkipedia más rica y una lista de series mejor armada; falta dirección de gorrite
- `icono-tipo-series` · fase 0 · hecho · sitio · Ícono grande del tipo en el encabezado cuando no hay miniatura, también en las series · #327
- `ldtag-plantilla` · fase 0 · hecho · sitio · `LDTag.svelte` tiene datos de una plantilla vieja: borrarlo o pasarlo a datos de Kinky Vibe · #327
- `missing-tags` · fase 0 · espera gorrite · sitio · `missingTags`: hacerlo andar (los links de descripciones a etiquetas que no existen pasan a texto) o dejarlo
- `prerender-paginas` · fase 0 · algún día · sitio · Prerenderizar páginas de contenido para servirlas como archivos
- `me-interesa` · fase 0 · algún día · sitio · El botón anónimo «Me interesa» en los eventos, que quedó para más adelante
- `readme-rutas` · fase 0 · hecho · docs · El README lista `/nosotres` y `/servicios`, que ya no existen · #327
- `lectura-tiempo` · fase 0 · hecho · sitio · «X min de lectura» con la velocidad de cada persona · #274, #21, #46
- `filtros-celu` · fase 0 · hecho · sitio · Barra de filtros con chips y árbol en una hoja en el celu · #294, #18
- `vistas-previas-links` · fase 0 · hecho · sitio · Vistas previas de links (Collage, textos editables) · #257
- `calendario-carrusel` · fase 0 · hecho · sitio · Vuelve la fila de próximos eventos del calendario · #227

### Estándares web y SEO

- `seo-peso-paginas` · fase 0 · sigue · seo · Lo de «Para hacer después» en seo.md: pasados del calendario a pedido, `siteTags` aparte, íconos en sprite, menos etiquetas por tarjeta, relacionadas de a 20 · [seo.md](seo.md)
- `seo-titulos` · fase 0 · hecho · seo · El mes en el título de los eventos repetidos, el salto de `h1` a `h3` en las listas y `DefinedTerm` para etiquetas con descripción · [seo.md](seo.md) · #327
- `noai-por-post` · fase 0 · algún día · seo · Opción de «noai» por publicación (los robots de IA los maneja gorrite en Cloudflare)
- `estandares-web` · fase 0 · hecho · seo · JSON-LD, microformatos, rel=me, security.txt, vCard, feeds Atom y JSON · #278, #280
- `fechas-iso` · fase 0 · hecho · seo · Fechas ISO 8601 válidas en metadatos, JSON-LD y `<time datetime>` · #319, [seo.md](seo.md)
- `fechas-formateadores` · fase 0 · sigue · sitio · Las fechas de publicación se guardan como `2024-12-06Z-03:00` (no es ISO 8601): los formateadores visibles (`toArgentina`, `argDate*`) siguen leyéndolas con `new Date()`, que no todos los motores entienden; usar `parseSiteDate` o pasar los datos a ISO con una migración (depende de: fechas-iso)

### Diseño

- `diseno-aprobar-componentes` · fase 0 · espera gorrite · diseño · Una página de aprobación por componente para gorrite (paso 3 del sistema de diseño) · #69, [estilo.md](estilo.md)
- `diseno-versiones-publicas` · fase 0 · sigue · diseño · Versiones para el sitio público de Field, Checkbox, Switch, Notice, Card, Badge, Table, el toast de deshacer y el diálogo de confirmar
- `diseno-envoltorios` · fase 0 · sigue · diseño · Pasar los imports viejos a `$lib/components/ui` y borrar los envoltorios (gorrite, 5/10)
- `diseno-restos-ui` · fase 0 · sigue · diseño · Revisar lo que quedó del paso 2 de la revisión de UI: links de texto, opciones como tarjetas, chips de monto, tablas editables, el encabezado de evento en otras páginas
- `diseno-fijar` · fase 0 · sigue · diseño · Fijar el sistema: pruebas de capturas, reglas de CI (sin colores ni tamaños sueltos), sección de UI en CLAUDE.md (depende de: diseno-aprobar-componentes)

### Bot de Telegram

- `bot-avisos-admin` · fase 0 · en curso · bot · Telegram para admins: parte 1 («📊 Estado» y «🔔 Mis avisos», apagado con `telegram_admin`) hecha en #315; parte 2 (resumen diario y avisos en el momento, migración 0055) en #322 · [0041](decisiones/0041-telegram-para-admins.md)
- `bot-avisos-admin-3` · fase 0 · sigue · bot · Telegram para admins, parte 3: el resumen del día del evento y los recordatorios (el evento de mañana, falta el lugar o el link de la transmisión) (depende de: bot-avisos-admin) · [0041](decisiones/0041-telegram-para-admins.md)
- `bot-avisos-admin-probar` · fase 0 · espera gorrite · bot · Prender `telegram_admin` en un preview y probarlo con un Telegram vinculado (la migración 0054 ya está en preview y producción) (depende de: bot-avisos-admin)
- `bot-avisos-admin-menu` · fase 0 · algún día · bot · `/estado` y `/avisos` en el menú «/» solo de les admins vinculades (`setMyCommands` por chat desde el cron; borrarlo al desvincular), si hace falta
- `bot-busquedas-vacias-panel` · fase 0 · sigue · bot · Contar cuántas búsquedas del bot no encuentran nada, para el panel (sin guardar quién ni qué) (depende de: bot-busquedas-vacias)
- `bot-sin-resultados-grupo` · fase 0 · sigue · bot · Sin resultados en un grupo: «⭐ Seguir» la etiqueta buscada como link al chat privado (hoy no aparece; haría falta un deep link nuevo) (depende de: bot-busquedas-vacias)
- `bot-sin-resultados-tildes` · fase 0 · sigue · bot · Sin resultados: las palabras sugeridas salen como las guarda el índice, sin tildes ni mayúsculas («guia», no «Guía»); mostrarlas como se escriben en el título (depende de: bot-busquedas-vacias)
- `bot-puerta-probar` · fase 0 · espera gorrite · bot · Probar la Puerta por Telegram en un preview con celus reales (vincular, abrir, escanear) · [0037](decisiones/0037-puerta-por-telegram.md)
- `bot-puerta-2` · fase 0 · sigue · bot · Bot 4/5: Puerta por Telegram parte 2 (contador en vivo, escribir el código a mano) (depende de: bot-busquedas-vacias, bot-puerta-probar)
- `bot-kinkipedia-ramas-probar` · fase 0 · espera gorrite · bot · Mirar en Telegram la Kinkipedia por ramas con el árbol de verdad: que las ramas de arriba sean las de `/wiki` y que ninguna quede con un solo hijo de más (depende de: bot-secciones-ajustes)
- `bot-mis-entradas-partes` · fase 0 · sigue · bot · Mis entradas: un taller de varias partes sigue en «próximas» hasta la última parte
- `bot-mis-entradas-transmision` · fase 0 · espera gorrite · bot · Mis entradas: mandar el link de la transmisión de un evento online por el chat
- `bot-mis-entradas-probar` · fase 0 · espera gorrite · bot · Probar «Mis entradas» en Telegram con una entrada de prueba (el QR por la API solo se prueba contra el bot de verdad)
- `bot-avisos-apagados` · fase 0 · algún día · bot · Recordar si alguien apagó a propósito los avisos de algo, para que dejar de seguirlo y volver a seguirlo desde el bot no los prenda (volver a vincular ya no saca `/silenciar`, #321; necesita migración, aplicarla antes del merge, 0028) · [0036](decisiones/0036-seguir-en-el-bot-prende-avisos.md)
- `bot-textos-miniapp` · fase 0 · algún día · bot · Los textos de la página de la puerta (`/telegram/puerta`, solo admins) en «Textos del bot» (los de la Mini App del calendario ya están, #321)
- `bot-visible-sitio` · fase 0 · espera gorrite · bot · Que el bot se vea en el sitio (mención, link desde Mi rincón y el pie, textos de `/start` y `/ayuda`); textos y lugar los elige gorrite
- `bot-navegar-secciones` · fase 0 · hecho · bot · Bot 1/5: recorrer el sitio por secciones · #308
- `bot-mis-entradas` · fase 0 · hecho · bot · Bot 2/5: «🎟 Mis entradas» con el QR de la puerta · #313
- `bot-secciones-ajustes` · fase 0 · hecho · bot · Secciones del bot: Kinkipedia por las ramas del árbol de etiquetas (como `/wiki` y en su orden), Series sin las que no tienen ediciones, volver a vincular no saca `/silenciar` y los textos de la Mini App del calendario en «Textos del bot» · #321
- `bot-funciones-viejas` · fase 0 · hecho · bot · Borradas las funciones que el bot ya no usaba (`formatEventList`, `formatEvent`, `formatChoices`, `formatPickList`, `eventListKeyboard`, `eventDetailKeyboard`) y sus pruebas · #321
- `bot-busquedas-vacias` · fase 0 · hecho · bot · Bot 3/5: sugerencias en vez de «no encontré nada» (búsquedas parecidas, la sección más cercana, lo que viene y «⭐ Seguir» la etiqueta; también en el modo inline) · #318
- `bot-textos` · fase 0 · hecho · bot · «Textos del bot» editables desde Ajustes · #302
- `bot-inline-buscar` · fase 0 · hecho · bot · Modo inline y búsqueda en todo el sitio · #298, #300
- `telegram-puerta` · fase 0 · hecho · bot · Puerta por Telegram como Mini App, con vínculo desde el panel · #273, #304

### Mails

- `mails-codigo-seguimiento` · fase 0 · sigue · mails · Códigos copiables: probar en un iPhone con Mail de Apple, averiguar por qué Gmail toma el mail por inglés y sumar `OTP-Token` u `One-Time-Code` cuando un cliente lo use · #297, [mails.md](mails.md#códigos-copiables)
- `gmail-tarjeta-evento` · fase 0 · espera gorrite · mails · Tarjeta de evento en Gmail: registrarse con Google y revisar el volumen de envío; gorrite manda el formulario
- `bimi` · fase 0 · algún día · mails · BIMI para los mails (gorrite: más adelante)

### Pruebas y CI

- `tests-auditoria` · fase 0 · sigue · pruebas · Auditoría de pruebas: acelerar primero, borrar solo con el sí de gorrite por cada una
- `test-importer-flaky` · fase 0 · sigue · pruebas · `etiquetas/importer.test.js` a veces cuenta un error de más con la máquina cargada: prueba frágil o carrera real (depende de: tests-auditoria)
- `test-estiloguard-lento` · fase 0 · hecho · pruebas · `estiloGuard` y `series-crear` pasaban el límite de 5 s con la máquina cargada: la preparación cara va en `beforeAll` · #325
- `test-cuentas-lento` · fase 0 · hecho · pruebas · `cuentas.test.js` «límite de intentos por mail y por conexión» pasaba los 5 s con la máquina cargada: los mails del límite por conexión tienen cuenta con hash barato (queda uno sin cuenta) · #330
- `tickets-ajustes-spec` · fase 0 · hecho · pruebas · `tests/tickets/ajustes.spec.js` buscaba la pestaña «Cobros», que se fue con la portada de Ajustes: ahora entra por la portada y su tarjeta · #330
- `tests-consultas-batch` · fase 0 · hecho · pruebas · `importTags` de la semilla en tandas de `saveObjects` (1835 → 80 consultas) · #328
- `ci-duraciones` · fase 0 · sigue · pruebas · Actualizar `scripts/vitest/durations.json` cuando se suman o cambian pruebas lentas, para que las 3 partes sigan parejas
- `ci-cache-semilla` · fase 0 · espera gorrite · pruebas · Guardar en caché la base ya sembrada de `e2e` (~1 min), con clave por migraciones, semilla e importador
- `tests-rapidos` · fase 0 · hecho · pruebas · Pruebas y CI más rápidas, `test:related` · #307, #311, #312, #285
- `prueba-fugas` · fase 0 · hecho · pruebas · Prueba de que lo privado no sale en público · #291

## Fase 1

### Plan y forma de trabajo

- `plan-unico` · fase 1 · en curso · plan · Este archivo como único plan, con `plan-lint`, la línea `Plan:` en cada PR y el comentario `Plan revisado contra main` antes de mergear · [pruebas-y-ci.md](pruebas-y-ci.md)
- `plan-repaso-semanal` · fase 1 · sigue · plan · Repaso semanal del plan (lunes a la mañana): una sesión nueva lo compara con lo mergeado y la Mesa, deja registro y abre un PR de docs o dice «sin cambios»; el vigilante `.github/workflows/repaso-vigilante.yml` (GitHub Action diaria, sin Claude) abre un issue si pasan 8 días sin PR con la etiqueta `repaso-semanal` y lo cierra cuando vuelve a haber uno (depende de: plan-unico)
- `plan-fuentes-viejas` · fase 1 · sigue · plan · Banner «reemplazado por docs/plan.md» en los artifacts de plan viejos; cerrar #70 y los issues viejos ya mapeados a un id; cerrar #46 (lo reemplazó #274, con crédito); las notas de las sesiones pasan a la Mesa (depende de: plan-unico)
- `fases-siguiente` · fase 1 · espera gorrite · plan · Cuál es el próximo bloque grande (Lo que sigo, Colecciones, Bandeja, Videos o Tienda)
- `hoja-de-ruta` · fase 1 · hecho · plan · La hoja de ruta en el repo; la reemplaza este archivo · #264, #284

### Infraestructura

- `prettier-ignore-temporal` · fase 1 · sigue · infra · Formatear y sacar de `.prettierignore` la lista temporal de archivos que tocaban ramas abiertas
- `cf-dashboard-limpiar` · fase 1 · espera gorrite · infra · Dashboard de Cloudflare: borrar el proyecto viejo de Pages y las variables `*_ENABLED` que ya no hacen nada
- `backup-simulacro` · fase 1 · espera gorrite · infra · Simulacro de restaurar un backup en local (`npm run db:restore -- <fecha> --local`)
- `sveltekit-3` · fase 1 · sigue · infra · Revisar qué pide SvelteKit 3 (rutina del 9/11; gorrite: esperar, sin parches antes)
- `rss-aviso-sacar` · fase 1 · sigue · infra · Sacar el aviso del RSS el 27/10 (rutina)
- `kv-fondo-repo` · fase 1 · espera gorrite · infra · ¿Sumar kv-fondo a este repo?
- `push-pwa` · fase 1 · espera gorrite · infra · Notificaciones push y PWA · #16, #43
- `errores-alertas` · fase 1 · algún día · infra · Enterarse de los errores de producción: un Worker que mire los registros y avise si falla una compra
- `vivo-durable-objects` · fase 1 · algún día · infra · Presencia («alguien está editando») y contadores en vivo con un Durable Object
- `r2-ciclo-vida` · fase 1 · algún día · infra · Regla de R2 que limpie subidas a medias después de un día
- `seguridad-endurecer` · fase 1 · espera gorrite · infra · Endurecer la configuración de GitHub y Cloudflare: ver Mesa
- `auditoria-seguridad` · fase 1 · espera gorrite · infra · Auditoría de seguridad en una sesión aparte de gorrite, antes de la fase 4: ver Mesa
- `analiticas` · fase 1 · hecho · infra · Visitas y embudo de compra con Workers Analytics Engine · #215

## Fase 2

### Contenido en la base

- `subir-archivos` · fase 2 · espera gorrite · contenido · gorrite corre `node scripts/subir-archivos.js --target=production` (PDF, video y ODT a la biblioteca); después un PR borra `src/lib/archivos/` y su glob en `render.js` · [contenido.md](contenido.md#lo-que-falta)
- `codigo-muerto-github` · fase 2 · sigue · contenido · Código que quedó del panel con GitHub: `sharedImage.js`, la edición del archivo de etiquetas en `tagConfig.js`, ramas «no se guardó en la base», el permiso `public_repo` del login, y que el panel guarde objetos sin pasar por «rutas de `.md`» (`getRepoClient`, `withContentDb`, `commitFiles`)
- `restos-limpieza` · fase 2 · sigue · contenido · Restos chicos: la regla de estilo que no alcanza a `.kv-texto-libre` (unas 200 páginas, con antes y después), un solo `foldText` en vez de las copias, un solo helper de imagen de una publicación, renombrar el `isAdmin` de `objects/visibility.js`, el campo de texto `perfil.avatar`
- `docs-a-confirmar` · fase 2 · sigue · docs · Cerrar los «a confirmar» de los docs que gorrite ya confirmó (por ejemplo en lo-que-sigo.md) y las líneas viejas de tickets.md
- `markdown-frontmatter` · fase 2 · hecho · contenido · El renderizador corta el encabezado de un texto en cualquier `---`, aunque esté a mitad de línea · #327
- `textos-viejos-arreglos` · fase 2 · espera gorrite · contenido · Arreglos de datos en textos viejos (etiquetas HTML sin cerrar, `&nbsp;`, negritas rotas): cambios en producción, desde el panel o con OK de gorrite
- `eventos-sin-imagen` · fase 2 · espera gorrite · contenido · Eventos sin imagen y campos vacíos; gorrite elige en el panel
- `objetos-pendientes` · fase 2 · sigue · contenido · Revisar lo que queda de «Pendiente» en objetos.md (historial dentro de `saveObject`, borrar `event_venues` cuando todo esté en la base) · [objetos.md](objetos.md)
- `url-cambiar` · fase 2 · sigue · panel · Cambiar la dirección (URL) de un evento u otro objeto desde el panel, con redirección 301 desde la vieja (necesita migración)
- `borrar-para-siempre` · fase 2 · algún día · panel · Purga definitiva de lo borrado, por une superadmin
- `grafo-objetos` · fase 2 · algún día · contenido · Vista de grafo de los objetos, estilo Obsidian
- `perfil-campos-cv` · fase 2 · espera gorrite · contenido · Campos de perfil: afiliación, formación, experiencia, habilidades (TODO en `types.d.js`; microformato `h-resume`)
- `datos-1` · fase 2 · sigue · datos · ver Mesa
- `datos-2-chequeo-por-pedido` · fase 2 · hecho · datos · El «¿cambió algo?» de la caché una sola vez por pedido, y caché para `/amigues` · #324
- `datos-3-estados-entradas` · fase 2 · hecho · datos · Los estados de entradas de las listas en una sola tanda · #324
- `datos-4-visibilidad-perfiles` · fase 2 · hecho · datos · Una sola regla de visibilidad para perfiles y lugares (`shownProfileWhere` / `isShownProfile`) · #324
- `datos-5-ayudas-compartidas` · fase 2 · hecho · datos · Ayudas compartidas: la dirección del sitio, la descripción del evento, «próximo»; limpiar sesiones viejas en el cron · #328
- `limpieza-md` · fase 2 · hecho · contenido · Contenido solo en la base, sin `.md` ni mdsvex · #275, [0032](decisiones/0032-borrar-los-md.md)
- `imagenes-r2` · fase 2 · hecho · contenido · Imágenes y archivos en R2 con la biblioteca · #215, #217, #226, #230

### Cuentas y perfiles

- `lo-que-sigo-panel` · fase 2 · espera gorrite · panel · La página del panel que junta «Lo que sigo» (lo demás ya existe). `nav.js` la marca fase 2; si se renumera lo decide gorrite · nav: lo-que-sigo · [0025](decisiones/0025-lo-que-sigo.md)
- `admins-cuenta-normal` · fase 2 · sigue · cuentas · Admins con la cuenta del sitio en vez de GitHub: ser admin como permiso de la cuenta, la lista de admins a la base, migrar lo que guarda ids de GitHub; con decisión propia y por partes, con GitHub de respaldo (gorrite, 11/10)
- `passkeys` · fase 2 · sigue · cuentas · Passkeys para las cuentas · [cuentas.md](cuentas.md#pendiente-partes-siguientes)
- `compra-con-cuenta` · fase 2 · espera gorrite · cuentas · Guardar `orders.account_id` al comprar y que `requiere_cuenta` pida ingresar de verdad
- `amigues-editan-perfil` · fase 2 · sigue · cuentas · Mandarle a cada amigue un link por mail para gestionar su perfil desde Mi rincón (gorrite, 11/10)
- `sesiones-dispositivos` · fase 2 · algún día · cuentas · Ver dónde hay una sesión abierta y cerrarla

## Fase 3

- `lista-espera` · fase 3 · hecho · entradas · Lista de espera por evento o tipo de entrada, apagada · #310, [0040](decisiones/0040-lista-de-espera.md)
- `lista-espera-prender` · fase 3 · espera gorrite · entradas · Prender `lista_espera` y probarla en un evento piloto (anotarse, reembolso, oferta y compra con el link) (depende de: lista-espera)
- `lista-espera-mail-terminar` · fase 3 · espera gorrite · entradas · Si «Terminar la reserva y pasar a la siguiente» le manda un mail a esa persona
- `promos-varios-eventos` · fase 3 · espera gorrite · entradas · Promociones de varios eventos (por ejemplo dos a un precio especial); falta diseño (panel, compra, Fondo y reembolsos)
- `talleres-partes-mails-preview` · fase 3 · sigue · entradas · Vista previa de los mails de cada parte de un taller en el panel
- `talleres-viejos-a-partes` · fase 3 · espera gorrite · entradas · Pasar a talleres en partes los talleres viejos de varios días (datos de producción, con OK y probando antes en el demo) · [talleres-partes.md](talleres-partes.md#pendiente)
- `pasar-entrada` · fase 3 · algún día · entradas · Pasarle una entrada a otra persona por mail
- `preguntas-sugeridas` · fase 3 · sigue · panel · Preguntas de inscripción sugeridas para elegir rápido
- `campos-propios-tipos` · fase 3 · algún día · panel · Campos propios y tipos simples desde el panel; falta diseño
- `recurrencia-rrule` · fase 3 · algún día · sitio · Recurrencia tipo RRULE (las series y los talleres en partes cubren una parte) · #29
- `rol-organizadore` · fase 3 · espera gorrite · cuentas · Rol de organizadore con permisos sobre sus eventos; primero un prototipo para mirar y decidir
- `bot-organizadores` · fase 3 · sigue · bot · Avisos y estado de venta para organizadores, cada une con sus eventos, reusando lo de admins; nunca datos de compradores (depende de: rol-organizadore) · [0029](decisiones/0029-bot-de-telegram.md), [0041](decisiones/0041-telegram-para-admins.md)

## Fase 4

- `colecciones` · fase 4 · algún día · contenido · Colecciones, guardados con nota y «No mostrar que voy» · nav: colecciones · [0007](decisiones/0007-amistades-guardados-suscripciones.md)
- `amistades` · fase 4 · algún día · cuentas · Amistades y qué amistades van a un evento · [0007](decisiones/0007-amistades-guardados-suscripciones.md)
- `pausa-despues-fase-4` · fase 4 · sigue · plan · Después de la fase 4: unos días solo de feedback, ajustes y arreglos; recién después las fases 5 a 8 (depende de: colecciones)
- `recorrido-codigo` · fase 4 · sigue · infra · Recorrido guiado del código para gorrite, por capítulos (depende de: pausa-despues-fase-4)

## Fase 5

- `bandeja` · fase 5 · algún día · mails · Bandeja de entrada en el panel, mails individuales y masivos; va primera en Mensajes y decide el cuarto lugar de la barra del celu · nav: bandeja · [0008](decisiones/0008-crm.md)
- `crm` · fase 5 · algún día · mails · Contactos con línea de tiempo, etapas y automatizaciones · [0008](decisiones/0008-crm.md)
- `newsletter` · fase 5 · algún día · mails · Newsletter general y por combinación de etiquetas
- `mails-colas` · fase 5 · algún día · infra · Queues para los mails y Email Workers para recibir
- `bot-canal-anuncios` · fase 5 · espera gorrite · bot · Canal de anuncios de Telegram: si va y qué publica
- `proto-conector-claude` · fase 5 · sigue · panel · Prototipo del conector de Claude para el panel (cargar eventos, ver ventas, confirmar transferencias), para mirar y decidir

## Fase 6

- `social` · fase 6 · algún día · sitio · Lo social: sin publicaciones libres ni feeds por ahora; la comunidad vive en Telegram · [0001](decisiones/0001-ritmo-y-orden.md)
- `proto-indieweb-activitypub` · fase 6 · sigue · sitio · Investigación y prototipo de IndieWeb y ActivityPub (webmention, federación como Mobilizon o Gancio), para mirar y decidir

## Fase 7

- `videos` · fase 7 · algún día · contenido · Videos con Cloudflare Stream y links firmados; el cobro separado del proveedor de las entradas · nav: videos · [0009](decisiones/0009-infraestructura.md)
- `proto-segundo-pago` · fase 7 · sigue · entradas · Prototipo de un segundo proveedor de pago (de reserva para las entradas, y para lo que no puede ir por Mercado Pago)
- `negocio-1` · fase 7 · espera gorrite · plan · ver Mesa
- `negocio-2` · fase 7 · espera gorrite · plan · ver Mesa

## Fase 8

- `tienda` · fase 8 · algún día · tienda · La tienda: sin decidir qué se vende ni con qué · nav: tienda

## Descartado

Para que no vuelvan: si alguien lo propone de nuevo, primero se habla con gorrite.

- `ficha-5-pestanas` · fase 0 · descartado · panel · Ficha del evento con 5 pestañas y «Más»: la reemplazó la de 7 (gorrite, 12/10) · #303
- `menu-pastilla` · fase 0 · descartado · sitio · Menú de la compu con pastillas · #228
- `inicio-presentacion` · fase 0 · descartado · sitio · Presentación con texto en la portada: solo el logo del encabezado · #219
- `buscar-en-encabezado` · fase 0 · descartado · sitio · Sacar el botón flotante de buscar: queda flotante (gorrite, 4/10) · #216
- `agregar-a-mi-calendario` · fase 0 · descartado · sitio · El botón «Agregar a mi calendario» en la página del evento: el .ics va en el mail · #233, #256
- `banderas-verdes-mas` · fase 0 · descartado · contenido · Más publicaciones de banderas verdes (gorrite, 11/10)
- `auch-etiqueta-especial` · fase 0 · descartado · contenido · AUCH como etiqueta especial en todos lados · #271
- `procesos-huerfanos` · fase 0 · descartado · pruebas · Script con permiso para matar procesos de pruebas huérfanos («No hace falta») · #306
- `espera-tiempos-config` · fase 3 · descartado · entradas · Tiempos de la lista de espera configurables por evento y su página de Ajustes · #310
- `metas-serie-por-defecto` · fase 3 · descartado · entradas · Metas por defecto en las series (gorrite, 4/10)
- `serie-por-anio` · fase 3 · descartado · entradas · «Serie por año» para talleres anuales: van como talleres en partes (gorrite, 4/10)
- `sveltekit-3-parche` · fase 1 · descartado · infra · Parche de cookies o rama para SvelteKit 3 antes de tiempo (gorrite, 9/10)
- `md-como-fuente` · fase 2 · descartado · contenido · Contenido en archivos `.md` como fuente: vive en D1 · [0004](decisiones/0004-modelo-de-contenido.md), [0032](decisiones/0032-borrar-los-md.md)
