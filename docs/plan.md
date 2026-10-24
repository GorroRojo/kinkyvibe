# Plan

El plan de kinkyvibe en un solo archivo: lo que está en curso, lo que sigue, lo que espera a
gorrite, lo de algún día y lo descartado. Reemplaza a la vieja `docs/hoja-de-ruta.md`, al issue
#70 y a los artifacts de plan. Si algo no está acá, no está en el plan.

Último repaso: 2026-10-19

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
- **«espera gorrite» siempre tiene tarjeta en la Mesa.** Quien pasa un ítem a ese estado le
  arma en el mismo momento una tarjeta en la Mesa de trabajo, con contexto y opciones; si no hay
  pregunta concreta para gorrite, el estado no es «espera gorrite». El repaso de los lunes lista
  los que no tienen tarjeta.
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

## Fase 0

### Entradas y lanzamiento

- `lanzamiento-decisiones` · fase 0 · hecho · entradas · Qué pasa con las entradas si un evento se cancela o se reprograma; tope del Fondo por evento; cuándo cierra la venta; quién puede reembolsar y si hacen falta reembolsos parciales; si las extras cuentan para el Fondo (gorrite, 12/10) · #338, [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md), [tickets.md](tickets.md#preguntas-para-les-organizadores)
- `fondo-aportes-entradas` · fase 0 · sigue · entradas · Los aportes de las entradas solidarias aprobadas suman al total del mes del Fondo que lee kv-fondo (`/api/fondo/propinas-total`), igual que las propinas al Fondo y sin nombres; coordinado con kv-fondo en #265 · [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)
- `mp-plazo-comision` · fase 0 · hecho · entradas · Elegir en la cuenta de Mercado Pago el plazo más largo que les sirva y cargar esa comisión en Ajustes › Cobros (decidido: el plazo más largo, recargo más bajo para quien compra; gorrite, 12/10) · [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md), [tickets.md](tickets.md#pendientes-antes-de-vender-de-verdad)
- `lanzamiento-pruebas-mp` · fase 0 · hecho · entradas · De punta a punta en el sandbox de MP: compra, rechazo y reintento, pago con la reserva vencida, reembolso, contracargo, código con total muy chico, entrada con el Fondo (gorrite, 12/10)
- `lanzamiento-compra-real` · fase 0 · hecho · entradas · Una compra real de monto chico con la cuenta de verdad, y su reembolso (gorrite, 12/10) (depende de: mp-plazo-comision)
- `lanzamiento-mails` · fase 0 · sigue · mails · Probar los mails en Gmail, Hotmail, Yahoo y un mail de trabajo (spam, .ics, recordatorio, cambio de fecha) y revisar SPF, DKIM y DMARC
- `lanzamiento-cupo-carga` · fase 0 · sigue · entradas · La última entrada vendida a la vez desde el sitio y la puerta, qué muestra «Para revisar», y 50–100 intentos de compra en pocos minutos contra un preview
- `lanzamiento-preparar` · fase 0 · hecho · entradas · Borrar los eventos de prueba, revisar remitente y contacto de devoluciones, el webhook de MP; quién revisa transferencias y quién está en la puerta; una segunda persona con acceso a todo; guías cortas (puerta, transferencias, reembolsos, «si se cae el sitio»); plan B en papel; no mergear durante una venta grande (hecho, con la segunda persona ya admin; gorrite, 12/10)
- `lanzamiento-avisos-venta` · fase 0 · sigue · entradas · Avisos durante una venta: errores de MP, mails que no salieron, cupo pasado
- `lanzamiento-piloto` · fase 0 · hecho · entradas · Abrir con un evento piloto propio y chico, después dos o tres normales, después los de amigues; el piloto ya vendió y anduvo bien (gorrite, 12/10) (depende de: lanzamiento-decisiones, lanzamiento-pruebas-mp)
- `puerta-celus-reales` · fase 0 · hecho · entradas · La puerta con celulares reales (Android y iPhone): escanear, código, buscar, vender en efectivo y transferencia, sin conexión y con dos celus a la vez (gorrite, 12/10)
- `puerta-nota-precio-libre` · fase 0 · sigue · entradas · Al vender en la puerta, poder sumar una nota y cobrar cualquier precio (gorrite, 12/10, al probar la puerta) (depende de: puerta-celus-reales)
- `qr-mp-puerta` · fase 0 · sigue · entradas · Cobrar con el QR de Mercado Pago en la puerta (gorrite, 11/10) (depende de: puerta-sin-conexion)
- `boton-comprar-afuera` · fase 0 · hecho · sitio · Cuando las entradas se venden en otro sitio, el botón tiene el mismo peso que «Comprar entradas» (gorrite, 10/10) · #331
- `lista-espera-boton-evento` · fase 0 · hecho · entradas · La página de un evento agotado con lista lleva a anotarse (antes solo se podía desde la página de compra) (gorrite, 12/10) · #351
- `formularios-mail-origen` · fase 0 · hecho · sitio · «Confirmar» y los otros botones de los links de los mails daban «Cross-site POST form submissions are forbidden» (no-referrer manda `Origin: null`): same-origin, y confirmar se manda solo al abrir (gorrite, 12/10) · #355
- `puerta-precio-publico` · fase 0 · hecho · entradas · «También hay entradas en la puerta» muestra el precio en puerta de los tipos (uno, «desde» o «a la gorra») cuando no hay nota (gorrite, 12/10) · #354
- `plata-montos-puerta` · fase 0 · hecho · entradas · La puerta y la carga a mano leen el monto como la compra online (`parseAmount`): «5000.00» ya no se guarda como $ 500.000, y la gorra de la puerta respeta el tope técnico (auditoría de plata, M2) · #368
- `plata-puerta-sin-conexion-precio` · fase 0 · hecho · entradas · Una venta en la puerta sin conexión que al sincronizarse queda registrada con otro total que el que cobró el celu (cambió el precio o el % del Fondo mientras tanto) sale en «Para revisar» con los dos montos; no se corrige sola · #372
- `plata-puerta-precio-cero` · fase 0 · hecho · entradas · Vender en la puerta un tipo con precio en puerta $ 0 (no a la gorra) ya no da un error 500: avisa «Esta entrada es sin cargo en la puerta: cargala a mano.» (con y sin conexión), y el editor no deja guardar un precio en puerta de $ 0 · #374
- `plata-fondo-precio-visto` · fase 0 · hecho · entradas · El porcentaje del Fondo que se cobra es el que se vio: si cambió entre la página y la compra, `?/buy` avisa («El descuento del Fondo cambió») y contesta con el de ahora en vez de cobrar otro precio sin decir nada (auditoría de plata, M3) · #373
- `compra-tramo-cambio-reintento` · fase 0 · hecho · entradas · Después de «El precio cambió» (otro tramo de preventa), confirmar de nuevo ya no da el mismo aviso hasta recargar: `?/buy` contesta con el tramo de ahora y la página muestra ese precio y manda ese tramo · #377
- `plata-lista-espera-rechazada` · fase 0 · hecho · entradas · Una orden de Mercado Pago rechazada ya no devuelve la oferta de la lista de espera mientras su reserva sigue vigente (se puede reintentar el pago): vuelve recién cuando la orden se cancela o vence, así el lugar no queda guardado dos veces; tenía que estar antes de cerrar `lista-espera-prender` (auditoría de plata, M6) · #371
- `plata-evento-cancelado-revisar` · fase 0 · hecho · entradas · Un evento cancelado con órdenes aprobadas sin reembolsar o transferencias vigentes sale en «Para revisar» (una fila por evento, con cuántas y el monto, aunque la fecha ya haya pasado), y confirmar una transferencia de un evento cancelado pregunta antes («El evento está cancelado.»); nada se reembolsa ni se cancela solo (decisión 0044; auditoría de plata, M8) · #376
- `plata-mp-contracargo` · fase 0 · hecho · entradas · Un contracargo de Mercado Pago (`charged_back`) sobre una compra aprobada la deja reembolsada y libera el lugar como antes, pero ya no le manda a quien compró el mail «Reembolsamos tu compra» (no se lo devolvimos nosotres: lo revirtió su banco); queda un aviso en el log y les admins con «Cada venta» prendido reciben un aviso de contracargo por Telegram · #375
- `puerta-buscar-dni-cola` · fase 0 · hecho · entradas · «Buscar persona» en la puerta trae solo los últimos 3 dígitos del DNI, los que muestra la sugerencia; buscar por el DNI completo sigue andando (se compara en el servidor) y verlo entero sigue siendo «ver completo», que queda en el registro de actividad · #383
- `seguridad-cookie-ordenes` · fase 0 · hecho · entradas · La cookie que recuerda las compras de este navegador (`kv_orders`) va firmada: el servidor solo cuenta las órdenes que firmó él; las cookies viejas sin firma dejan de contar · #381
- `codigos-tope-entradas` · fase 0 · hecho · entradas · Códigos de descuento con tope opcional de entradas por compra (`max_tickets`, migración 0058); los códigos combo son de 1 entrada, y los usos se cuentan sin depender de mayúsculas (gorrite: «Sí, con combos de 1 entrada») · #369
- `tickets-spec-arreglar` · fase 0 · sigue · pruebas · Dos pruebas de `tests/tickets/tickets.spec.js` que no corren en la CI: arregladas en #325 («1 aprobado» en singular; esperar a que cargue la página). Falta sumarlas a la CI
- `ci-guardia-ultima-corrida` · fase 0 · hecho · pruebas · La guardia de merge mira la última corrida de cada chequeo: una corrida vieja cancelada en el mismo commit (al editar la descripción del PR se vuelve a correr todo) ya no bloquea; tampoco un trabajo de matriz cancelado antes de expandirse (con el nombre de plantilla)
- `puerta-sin-conexion` · fase 0 · hecho · entradas · Vender en la puerta sin conexión · #286, [0035](decisiones/0035-vender-en-puerta-sin-conexion.md)
- `transferencia-dias-habiles` · fase 0 · hecho · entradas · Reserva por transferencia de 2 días hábiles · #261, [0031](decisiones/0031-reserva-transferencia-dias-habiles.md)
- `aviso-cambio-fecha` · fase 0 · hecho · mails · «Avisar a les compradores» cuando cambia la fecha · #266
- `ics-en-mail` · fase 0 · hecho · mails · El .ics y Google Calendar en los mails de entradas · #256
- `aviso-transferencia-sin-datos` · fase 0 · hecho · entradas · Aviso cuando un evento tiene transferencia y faltan los datos de Cobros · #214
- `entradas-editor-preventas-arreglo` · fase 0 · hecho · entradas · Editor de entradas: keys únicas también con un borrador recuperado (se colgaba: «Sacar» muerto), «Preventas» con errores a la vista ya no deja la tarjeta vacía (Chromium, fieldset y container queries) y «Sacar» desactivado que explica por qué · #348
- `fondo-propinas-unicas` · fase 0 · hecho · fondo · Donaciones de una vez al Fondo con las propinas, el total del mes para kv-fondo y el mail «tu link» · #287, #268

### Legales

- `legales-minimos` · fase 0 · espera gorrite · legales · Página `/legales` mínima en borrador (solo previews), después del piloto (gorrite, 12/10). Plan cuando gorrite lo retome: bajarla a lo mínimo con la leyenda de la AAIP y los 10 días de arrepentimiento por mail; falta definir quién figura como responsable; inscribir la base y el botón de arrepentimiento, por ahora no (depende de: lanzamiento-piloto) · #282 (borrador), [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)
- `legales-bot-estadisticas` · fase 0 · espera gorrite · legales · La página de privacidad (`/legales`, todavía en borrador) tiene que contar las estadísticas de uso del bot: quién lo usa y cuánto por día (180 días, con el nombre de Telegram) y, aparte, para qué, solo sumado por semana (depende de: legales-minimos, bot-estadisticas) · [telegram.md](telegram.md#estadísticas-de-uso-0045)

### Panel

- `agenda-impresa` · fase 0 · hecho · panel · Agenda impresa: volantes A4 (4 A6, 2 A5 o 1 A4) para repartir con los próximos eventos, con el diseño de gorrite; ícono y subtítulo de la serie, lugar con su privacidad y precio, todo editable en la página sin guardar nada · #370, [panel.md](panel.md#agenda-impresa)
- `nav-c-puerta-hoy` · fase 0 · hecho · panel · La Puerta abre directo en el evento de hoy si hay uno solo · #314, [0039](decisiones/0039-navegacion-del-panel-opcion-c-parte-2.md)
- `nav-c-ir-a-recientes` · fase 0 · hecho · panel · «Ir a…» (⌘K) vacío muestra Fijados y Recientes · #314
- `ajustes-4-grupos` · fase 0 · hecho · panel · Ajustes como portada con 4 grupos de tarjetas (Plata, Comunicación, Equipo, Sistema) en vez de pestañas · #317, [0042](decisiones/0042-ajustes-portada-con-grupos.md)
- `ajustes-fondo-linea` · fase 0 · sigue · panel · Portada de Ajustes: línea de estado del Fondo aunque todavía no haya llegado el porcentaje automático (hoy la tarjeta va sin línea; buscarlo haría lenta la portada) (depende de: ajustes-4-grupos)
- `panel-pestanas-celu` · fase 0 · hecho · panel · En el celu, la lista ▾ de pestañas de la ficha se ve menos importante que los botones de acción (gorrite, #303) · #331
- `buscador-pestanas-nombres` · fase 0 · hecho · panel · Los atajos del buscador a las pestañas de un evento (`eventTabActions`) dicen «Órdenes» y «Mail a compradores»: pasar a «Ventas › Órdenes» y «Mails › Mandar un aviso» · #323
- `navprefs-grupos-limpiar` · fase 0 · hecho · panel · Sacar de `navPrefs.js` las funciones de grupos abiertos (`kv-panel-grupos`) y sus pruebas, que la barra sin grupos ya no usa · #323
- `login-sin-permisos` · fase 0 · hecho · panel · El login de admins no le pide permisos a GitHub (antes pedía `public_repo`, de cuando el panel guardaba en el repo): solo lee el id de la cuenta · #382, [panel.md](panel.md)
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

- `promesas-entre-pedidos` · fase 0 · hecho · sitio · Bug: GET /admin y GET / se colgaban minutos a veces (cachés del isolate que compartían una consulta en camino entre pedidos); ahora entre pedidos solo se comparte lo ya leído · #352
- `ux-auditoria-restos` · fase 0 · hecho · sitio · Lo que seguía abierto de la auditoría de UX del 4/10: anclas del glosario, áreas de toque, migas de pan (ya estaban, #215) y búsqueda vacía de la wiki · #333
- `wiki-sin-entrada-editar` · fase 0 · hecho · sitio · «Editar contenido» en términos de la wiki que no tienen entrada (TODO en `UserMenu.svelte`) · #323
- `wiki-html-default-seguro` · fase 0 · hecho · sitio · El texto de la wiki sin `wiki_body_html` guardado se muestra con la lista corta (como los eventos); la migración 0059 deja `libre` escrito en las páginas que ya estaban. Las imágenes de los textos con la lista corta (perfiles y demás), solo de la biblioteca propia (`/media/…`) · #384
- `areas-toque-restos` · fase 0 · hecho · sitio · Toques de menos de 44px que pedían diseño: «Comprar entradas» en las tarjetas de las listas mide 44px en el celu (hecho, el botón mismo); el índice y «Enlace a esta sección» de los textos, las series hijas en la Kinkipedia y la línea de madres e hijas de un término quedan como están (gorrite: dejarlo así) · #335
- `filtros-celu-probar` · fase 0 · sigue · sitio · Probar la barra de filtros en celulares reales y, si va, cerrar el PR de prototipos · #294, #283
- `filtros-sin-efecto` · fase 0 · sigue · sitio · Esconder etiquetas del filtro que no cambiarían los resultados · #17
- `lectura-barra-progreso` · fase 0 · sigue · sitio · Barra de progreso de lectura: una barra fina arriba, solo en los textos largos de Material y Kinkipedia (gorrite, 12/10) · #19, [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)
- `lectura-ajustes` · fase 0 · algún día · sitio · Ajustes de lectura: tamaño de letra y tema; falta diseño · #20
- `textos-desplegables` · fase 0 · sigue · sitio · Secciones desplegables y notas al pie en los textos · #22
- `fragmentos-reutilizables` · fase 0 · algún día · sitio · Fragmentos reutilizables de publicaciones y del glosario; falta diseño · #23
- `negociacion-bottoms` · fase 0 · sigue · sitio · Negociación interactiva para bottoms (gorrite, 12/10); necesita una forma de meter componentes interactivos en los textos guardados en la base; #25 es el prototipo · #14, #25, [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)
- `inicio-carrusel` · fase 0 · sigue · sitio · Carrusel en la portada: gorrite lo quiere (12/10) · #15, [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)
- `mapa-direccion-libre` · fase 0 · sigue · sitio · Mapa para eventos con dirección en texto libre (sin lugar cargado); vincular datos de producción, lo hace Claude de a tandas, cada una con el OK de gorrite en la Mesa (12/10) · [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)
- `compartir-imagen-mas` · fase 0 · algún día · sitio · Imagen para compartir: más paletas, apaisado y carrusel, estilo por serie
- `icono-tipo-series` · fase 0 · hecho · sitio · Ícono grande del tipo en el encabezado cuando no hay miniatura, también en las series · #327
- `ldtag-plantilla` · fase 0 · hecho · sitio · `LDTag.svelte` tiene datos de una plantilla vieja: borrarlo o pasarlo a datos de Kinky Vibe · #327
- `missing-tags` · fase 0 · sigue · sitio · `missingTags` siempre vuelve vacío (lo documenta un `it.fails` en `src/lib/utils/tags.test.js`): hacerlo andar, así los links de descripciones a etiquetas que no existen pasan a texto
- `prerender-paginas` · fase 0 · algún día · sitio · Prerenderizar páginas de contenido para servirlas como archivos
- `me-interesa` · fase 0 · algún día · sitio · El botón anónimo «Me interesa» en los eventos, que quedó para más adelante
- `readme-rutas` · fase 0 · hecho · docs · El README lista `/nosotres` y `/servicios`, que ya no existen · #327
- `lectura-tiempo` · fase 0 · hecho · sitio · «X min de lectura» con la velocidad de cada persona · #274, #21, #46
- `filtros-celu` · fase 0 · hecho · sitio · Barra de filtros con chips y árbol en una hoja en el celu · #294, #18
- `vistas-previas-links` · fase 0 · hecho · sitio · Vistas previas de links (Collage, textos editables) · #257
- `calendario-carrusel` · fase 0 · hecho · sitio · Vuelve la fila de próximos eventos del calendario · #227

### Estándares web y SEO

- `seo-peso-paginas` · fase 0 · hecho · seo · Peso de las páginas: pasados del calendario de a un mes a pedido · #334, [seo.md](seo.md)
- `seo-titulos` · fase 0 · hecho · seo · El mes en el título de los eventos repetidos, el salto de `h1` a `h3` en las listas y `DefinedTerm` para etiquetas con descripción · [seo.md](seo.md) · #327
- `tarjetas-lcp` · fase 0 · hecho · seo · Las primeras tarjetas del inicio cargan su imagen enseguida (el LCP arrancaba ~2 s tarde por `lazy`) · #356, [seo.md](seo.md)
- `tarjetas-imagen-chica` · fase 0 · sigue · seo · Copia chica de cada imagen para las tarjetas, hecha al subirla (sin usar el cupo de transformaciones de Cloudflare) y una pasada por las que ya están: ~3 MB menos en el inicio · [seo.md](seo.md)
- `seo-peso-resto` · fase 0 · sigue · seo · Lo que quedó del peso de las páginas: hasta 5 etiquetas por tarjeta con un «+N» que despliega el resto y relacionadas de a 20 (opciones 1b y 2a de seo.md; que la búsqueda no se rompa si las etiquetas no están cargadas; gorrite, 12/10), panel de etiquetas armado al abrirlo en celu, `siteTags` aparte (no ahorra sin un archivo estático), íconos de las tarjetas en sprite (gorrite: no por ahora) · [seo.md](seo.md)
- `noai-por-post` · fase 0 · algún día · seo · Opción de «noai» por publicación (los robots de IA los maneja gorrite en Cloudflare)
- `estandares-web` · fase 0 · hecho · seo · JSON-LD, microformatos, rel=me, security.txt, vCard, feeds Atom y JSON · #278, #280
- `fechas-iso` · fase 0 · hecho · seo · Fechas ISO 8601 válidas en metadatos, JSON-LD y `<time datetime>` · #319, [seo.md](seo.md)
- `fechas-formateadores` · fase 0 · hecho · sitio · Los formateadores y toda lectura de fechas guardadas usan `parseSiteDate`, que lee cada forma sin `Date.parse` · #332, [seo.md](seo.md)

### Diseño

- `diseno-aprobar-componentes` · fase 0 · hecho · diseño · Revisión de los 9 grupos de `/estilo` por gorrite (paso 3 del sistema de diseño), con lo que pidió cambiar y tablas que se ordenan · #69, #341, [estilo.md](estilo.md)
- `diseno-versiones-publicas` · fase 0 · sigue · diseño · Versiones para el sitio público de Field, Checkbox, Switch, Notice, Card, Badge, Table, el toast de deshacer y el diálogo de confirmar
- `diseno-envoltorios` · fase 0 · sigue · diseño · Pasar los imports viejos a `$lib/components/ui` y borrar los envoltorios (gorrite, 5/10)
- `diseno-restos-ui` · fase 0 · sigue · diseño · Revisar lo que quedó del paso 2 de la revisión de UI: links de texto, opciones como tarjetas, chips de monto, tablas editables, el encabezado de evento en otras páginas
- `diseno-fijar` · fase 0 · sigue · diseño · Fijar el sistema: pruebas de capturas que frenen (hoy el informe de impacto ya fotografía cada grupo de `/estilo`, pero solo informa), reglas de CI (sin colores ni tamaños sueltos), sección de UI en CLAUDE.md (depende de: diseno-aprobar-componentes)
- `diseno-ordenar-listas` · fase 0 · sigue · diseño · Ordenar las listas del panel que no son tablas o se paginan en el servidor (Ventas › Órdenes es una lista de tarjetas; Cuentas con 500 o más): orden en el servidor o pasar a `Table`

### Bot de Telegram

- `bot-avisos-admin-3` · fase 0 · sigue · bot · Telegram para admins, parte 3: el resumen del día del evento y los recordatorios (el evento de mañana, falta el lugar o el link de la transmisión) (depende de: bot-avisos-admin) · [0041](decisiones/0041-telegram-para-admins.md)
- `bot-avisos-admin-probar` · fase 0 · hecho · bot · Prender `telegram_admin` en un preview y probarlo con un Telegram vinculado (la migración 0054 ya está en preview y producción) (depende de: bot-avisos-admin)
- `bot-avisos-admin-2-probar` · fase 0 · hecho · bot · Telegram para admins, parte 2: aplicar la migración 0055 en preview y producción antes de mergear #322, y probarlo en un preview con una compra de prueba y el cron de las 9 (depende de: bot-avisos-admin)
- `bot-estadisticas-prender` · fase 0 · hecho · bot · Estadísticas de uso del bot: aplicar la migración 0057 en preview y producción antes de mergear, `/setinlinefeedback` al 100 % en @BotFather y volver a registrar el webhook (`npm run telegram:webhook`), y prender «Telegram: estadísticas de uso», primero en un preview (depende de: bot-estadisticas) · [telegram.md](telegram.md#puesta-en-marcha-de-las-estadísticas-la-hace-gorrite)
- `bot-avisos-admin-aprobada` · fase 0 · algún día · bot · Guardar cuándo se aprobó cada orden (`approved_at`, necesita migración) para que «vendidas desde ayer» del resumen diario no dependa de `updated_at`, si hace falta (depende de: bot-avisos-admin)
- `bot-avisos-admin-menu` · fase 0 · algún día · bot · `/estado` y `/avisos` en el menú «/» solo de les admins vinculades (`setMyCommands` por chat desde el cron; borrarlo al desvincular), si hace falta
- `bot-busquedas-vacias-panel` · fase 0 · sigue · bot · Contar cuántas búsquedas del bot no encuentran nada, para el panel (sin guardar quién ni qué) (depende de: bot-busquedas-vacias)
- `bot-sin-resultados-grupo` · fase 0 · sigue · bot · Sin resultados en un grupo: «⭐ Seguir» la etiqueta buscada como link al chat privado (hoy no aparece; haría falta un deep link nuevo) (depende de: bot-busquedas-vacias)
- `bot-sin-resultados-tildes` · fase 0 · sigue · bot · Sin resultados: las palabras sugeridas salen como las guarda el índice, sin tildes ni mayúsculas («guia», no «Guía»); mostrarlas como se escriben en el título (depende de: bot-busquedas-vacias)
- `bot-puerta-probar` · fase 0 · espera gorrite · bot · Probar la Puerta por Telegram en un preview con celus reales (vincular, abrir, escanear); gorrite lo prueba en el próximo evento, sin bot de prueba (12/10) · [0037](decisiones/0037-puerta-por-telegram.md)
- `bot-puerta-2` · fase 0 · sigue · bot · Bot 4/5: Puerta por Telegram parte 2 (contador en vivo, escribir el código a mano) (depende de: bot-busquedas-vacias, bot-puerta-probar)
- `bot-kinkipedia-ramas-probar` · fase 0 · hecho · bot · Mirar en Telegram la Kinkipedia por ramas con el árbol de verdad: que las ramas de arriba sean las de `/wiki` y que ninguna quede con un solo hijo de más (depende de: bot-secciones-ajustes)
- `bot-mis-entradas-partes` · fase 0 · hecho · bot · Mis entradas: un taller de varias partes sigue en «próximas» hasta la última parte · #329
- `bot-estadisticas` · fase 0 · hecho · bot · Estadísticas de uso del bot (Estadísticas → Bot de Telegram): quién lo usa y cuánto, por persona y día, y aparte, sumado por semana, para qué (pantallas, comandos, búsquedas, cosas públicas, Mini App); nunca qué buscó o miró cada persona; umbral de 5 y retención de 180 días, detrás de `telegram_estadisticas` · #346, [0045](decisiones/0045-estadisticas-del-bot.md)
- `rincon-compras-partes` · fase 0 · sigue · cuentas · Mi rincón, «Mis compras»: en un taller de varias partes, mostrar la fecha de la próxima parte (hoy muestra la de la parte 1)
- `bot-mis-entradas-transmision` · fase 0 · sigue · bot · Mis entradas: mandar el link de la transmisión de un evento online por el chat; la tarjeta muestra «Ver la transmisión» cuando el link está cargado, con la misma regla que la página de la entrada (gorrite, 12/10) · [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)
- `bot-mis-entradas-probar` · fase 0 · hecho · bot · Probar «Mis entradas» en Telegram con una entrada de prueba (el QR por la API solo se prueba contra el bot de verdad)
- `bot-avisos-apagados` · fase 0 · algún día · bot · Recordar si alguien apagó a propósito los avisos de algo, para que dejar de seguirlo y volver a seguirlo desde el bot no los prenda (volver a vincular ya no saca `/silenciar`, #321; necesita migración, aplicarla antes del merge, 0028) · [0036](decisiones/0036-seguir-en-el-bot-prende-avisos.md)
- `bot-textos-miniapp` · fase 0 · algún día · bot · Los textos de la página de la puerta (`/telegram/puerta`, solo admins) en «Textos del bot» (los de la Mini App del calendario ya están, #321)
- `bot-visible-sitio` · fase 0 · sigue · bot · Que el bot se vea en el sitio, discreto: un link en el pie, una línea en el calendario y la tarjeta de Mi rincón que ya existe; los textos van en un PR con capturas (gorrite, 12/10) · [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)
- `bot-mensajes-enriquecidos` · fase 0 · hecho · bot · Lo que el bot manda del sitio (Kinkipedia, material, eventos) se lee adentro del chat como mensaje enriquecido (Bot API 10.1–10.3), en el modo inline y en la tarjeta compacta, apagado con `telegram_enriquecido` · #336, [telegram.md](telegram.md#mensajes-enriquecidos-y-compartir)
- `bot-compartir-miniapp` · fase 0 · hecho · bot · Mini App del calendario: «📤 Mandar a un chat» en cada evento y link directo a un evento (`?startapp=`), apagado con `telegram_enriquecido` · #336, [telegram.md](telegram.md#compartir-desde-la-mini-app-del-calendario)
- `bot-enriquecido-probar` · fase 0 · hecho · bot · Registrar la Main Mini App en @BotFather, prender `telegram_enriquecido` en un preview y mirar los mensajes enriquecidos y «Mandar a un chat» en dos celus (uno con una app vieja) (depende de: bot-mensajes-enriquecidos, bot-compartir-miniapp)
- `bot-entrar-con-telegram` · fase 0 · algún día · bot · «Entrar con Telegram» (OpenID Connect) para las cuentas: no elegido por ahora (gorrite, 12/10)
- `bot-navegar-secciones` · fase 0 · hecho · bot · Bot 1/5: recorrer el sitio por secciones · #308
- `bot-mis-entradas` · fase 0 · hecho · bot · Bot 2/5: «🎟 Mis entradas» con el QR de la puerta · #313
- `bot-secciones-ajustes` · fase 0 · hecho · bot · Secciones del bot: Kinkipedia por las ramas del árbol de etiquetas (como `/wiki` y en su orden), Series sin las que no tienen ediciones, volver a vincular no saca `/silenciar` y los textos de la Mini App del calendario en «Textos del bot» · #321
- `bot-funciones-viejas` · fase 0 · hecho · bot · Borradas las funciones que el bot ya no usaba (`formatEventList`, `formatEvent`, `formatChoices`, `formatPickList`, `eventListKeyboard`, `eventDetailKeyboard`) y sus pruebas · #321
- `bot-busquedas-vacias` · fase 0 · hecho · bot · Bot 3/5: sugerencias en vez de «no encontré nada» (búsquedas parecidas, la sección más cercana, lo que viene y «⭐ Seguir» la etiqueta; también en el modo inline) · #318
- `bot-avisos-admin` · fase 0 · hecho · bot · Telegram para admins: parte 1 («📊 Estado» y «🔔 Mis avisos», apagado con `telegram_admin`) y parte 2 (resumen diario de ventas y avisos en el momento de cada venta y cada transferencia, solo a quien los prendió, con horario de silencio; migración 0055) · #315, #322, [0041](decisiones/0041-telegram-para-admins.md)
- `bot-textos` · fase 0 · hecho · bot · «Textos del bot» editables desde Ajustes · #302
- `bot-inline-buscar` · fase 0 · hecho · bot · Modo inline y búsqueda en todo el sitio · #298, #300
- `buscar-sintaxis` · fase 0 · hecho · sitio · Una sola sintaxis de búsqueda para el sitio, el bot y el panel, escrita en [buscar.md](buscar.md) · #350, [0046](decisiones/0046-sintaxis-de-busqueda.md)
- `buscar-sintaxis-sitio` · fase 0 · sigue · sitio · El buscador del sitio (Ctrl+K) entiende la sintaxis base (depende de: buscar-sintaxis)
- `buscar-sintaxis-bot` · fase 0 · sigue · bot · El bot (inline y Buscar) entiende la sintaxis base, no solo el prefijo al principio (depende de: buscar-sintaxis)
- `buscar-sintaxis-panel` · fase 0 · sigue · panel · El buscador del panel usa el mismo parser para la base (formas largas de tipo, `material:`, `wiki:`…) y suma lo suyo (depende de: buscar-sintaxis)
- `buscar-guia-visible` · fase 0 · sigue · sitio · «¿Cómo buscar?» en el buscador del sitio y en /ayuda/buscar, «🔎 Cómo buscar» en la Ayuda del bot y la tabla completa en la paleta del panel (depende de: buscar-sintaxis)
- `enlaces-sintaxis` · fase 0 · hecho · contenido · La sintaxis del cuerpo de todos los objetos (red de páginas enlazadas), escrita en [enlaces.md](enlaces.md) · [0047](decisiones/0047-cuerpos-enlazados.md)
- `bot-inline-vista-chica` · fase 0 · hecho · bot · Lo que se manda con el bot inline lleva la vista previa del link chica, al costado (gorrite, 12/10)
- `telegram-puerta` · fase 0 · hecho · bot · Puerta por Telegram como Mini App, con vínculo desde el panel · #273, #304

### Mails

- `mails-codigo-seguimiento` · fase 0 · sigue · mails · Códigos copiables: probar en un iPhone con Mail de Apple, averiguar por qué Gmail toma el mail por inglés y sumar `OTP-Token` u `One-Time-Code` cuando un cliente lo use · #297, [mails.md](mails.md#códigos-copiables)
- `gmail-tarjeta-evento` · fase 0 · algún día · mails · Tarjeta de evento en Gmail: registrarse con Google y revisar el volumen de envío; gorrite manda el formulario (gorrite: después, 12/10)
- `bimi` · fase 0 · algún día · mails · BIMI para los mails (gorrite: más adelante)

### Pruebas y CI

- `tests-auditoria` · fase 0 · sigue · pruebas · Auditoría de pruebas: acelerar primero, borrar solo con el sí de gorrite por cada una
- `test-importer-flaky` · fase 0 · sigue · pruebas · `etiquetas/importer.test.js` a veces cuenta un error de más con la máquina cargada: prueba frágil o carrera real (depende de: tests-auditoria)
- `test-estiloguard-lento` · fase 0 · hecho · pruebas · `estiloGuard` y `series-crear` pasaban el límite de 5 s con la máquina cargada: la preparación cara va en `beforeAll` · #325
- `test-cuentas-lento` · fase 0 · hecho · pruebas · `cuentas.test.js` «límite de intentos por mail y por conexión» pasaba los 5 s con la máquina cargada: los mails del límite por conexión tienen cuenta con hash barato (queda uno sin cuenta) · #330
- `tickets-ajustes-spec` · fase 0 · hecho · pruebas · `tests/tickets/ajustes.spec.js` buscaba la pestaña «Cobros», que se fue con la portada de Ajustes: ahora entra por la portada y su tarjeta · #330
- `tests-consultas-batch` · fase 0 · hecho · pruebas · `importTags` de la semilla en tandas de `saveObjects` (1835 → 80 consultas) · #328
- `ci-duraciones` · fase 0 · sigue · pruebas · Actualizar `scripts/vitest/durations.json` cuando se suman o cambian pruebas lentas, para que las 3 partes sigan parejas
- `ci-cache-semilla` · fase 0 · sigue · pruebas · Guardar en caché la base ya sembrada de `e2e` (~1 min), con clave por migraciones, semilla e importador
- `tests-rapidos` · fase 0 · hecho · pruebas · Pruebas y CI más rápidas, `test:related` · #307, #311, #312, #285
- `prueba-fugas` · fase 0 · hecho · pruebas · Prueba de que lo privado no sale en público · #291

## Fase 1

### Plan y forma de trabajo

- `plan-unico` · fase 1 · en curso · plan · Este archivo como único plan, con `plan-lint`, la línea `Plan:` en cada PR y el comentario `Plan revisado contra main` antes de mergear · [pruebas-y-ci.md](pruebas-y-ci.md)
- `plan-repaso-semanal` · fase 1 · sigue · plan · Repaso semanal del plan (lunes a la mañana): una sesión nueva lo compara con lo mergeado y la Mesa, deja registro y abre un PR de docs o dice «sin cambios»; el vigilante `.github/workflows/repaso-vigilante.yml` (GitHub Action diaria, sin Claude) abre un issue si pasan 8 días sin PR con la etiqueta `repaso-semanal` y lo cierra cuando vuelve a haber uno (depende de: plan-unico)
- `plan-fuentes-viejas` · fase 1 · sigue · plan · Banner «reemplazado por docs/plan.md» en los artifacts de plan viejos; cerrar #70 y los issues viejos ya mapeados a un id; cerrar #46 (lo reemplazó #274, con crédito); las notas de las sesiones pasan a la Mesa (depende de: plan-unico)
- `fases-siguiente` · fase 1 · hecho · plan · El próximo bloque grande es «Lo que sigo» del panel (respondido en la Mesa el 12/10; es `lo-que-sigo-panel`)
- `hoja-de-ruta` · fase 1 · hecho · plan · La hoja de ruta en el repo; la reemplaza este archivo · #264, #284

### Infraestructura

- `prettier-ignore-temporal` · fase 1 · sigue · infra · Formatear y sacar de `.prettierignore` la lista temporal de archivos que tocaban ramas abiertas
- `cf-dashboard-limpiar` · fase 1 · hecho · infra · Dashboard de Cloudflare: borrar las variables `*_ENABLED` que ya no hacen nada; el proyecto viejo de Pages queda por las dudas (gorrite, 12/10)
- `backup-simulacro` · fase 1 · hecho · infra · Simulacro de restaurar un backup en local (`node scripts/d1-restore.js <fecha> --local`): corrió en Windows, igual que el backup (gorrite, 12/10) · #345
- `sveltekit-3` · fase 1 · sigue · infra · Revisar qué pide SvelteKit 3 (rutina del 9/11; gorrite: esperar, sin parches antes)
- `rss-aviso-sacar` · fase 1 · sigue · infra · Sacar el aviso del RSS el 27/10 (rutina)
- `push-pwa` · fase 1 · sigue · infra · Notificaciones push y PWA (gorrite, 12/10) · #16, #43, [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)
- `errores-alertas` · fase 1 · algún día · infra · Enterarse de los errores de producción: un Worker que mire los registros y avise si falla una compra
- `vivo-durable-objects` · fase 1 · algún día · infra · Presencia («alguien está editando») y contadores en vivo con un Durable Object
- `r2-ciclo-vida` · fase 1 · algún día · infra · Regla de R2 que limpie subidas a medias después de un día
- `seguridad-endurecer` · fase 1 · espera gorrite · infra · Endurecer la configuración de GitHub y Cloudflare: ver Mesa
- `auditoria-seguridad` · fase 1 · espera gorrite · infra · Auditoría de seguridad en una sesión aparte de gorrite, antes de la fase 4: ver Mesa
- `conector-claude-lectura` · fase 1 · sigue · panel · Conector de Claude (MCP) solo de lectura para admins: buscar y leer objetos y listar ventas por slug o nombre, sin SQL a mano ni ids tipeados; detrás de un interruptor, apagado. Va después de los arreglos del acceso de admins que salgan de la auditoría (gorrite, 12/10) (depende de: auditoria-seguridad)
- `analiticas` · fase 1 · hecho · infra · Visitas y embudo de compra con Workers Analytics Engine · #215

## Fase 2

### Contenido en la base

- `conector-claude-edicion` · fase 2 · sigue · panel · Conector de Claude, parte 2: los cambios que se pueden hacer desde el panel (editar campos, crear borradores, vincular un lugar), cada uno por el mismo guardado del panel y con el historial a nombre de Claude; nada de plata ni mails (depende de: conector-claude-lectura)
- `importar-material-script` · fase 2 · hecho · contenido · `scripts/importar-material.js`: carga un paquete privado de borradores de material como no listado, por el camino del panel · #342, [contenido.md](contenido.md#tareas-comunes)
- `importar-material-correr` · fase 2 · sigue · contenido · ver Mesa: cargar el paquete de borradores con el conector de Claude cuando esté, en vez del script (gorrite, 12/10) (depende de: importar-material-script, conector-claude-edicion)
- `subir-archivos` · fase 2 · hecho · contenido · gorrite corre `node scripts/subir-archivos.js --target=production` (PDF, video y ODT a la biblioteca): corrido en preview y producción (12/10) · [contenido.md](contenido.md#lo-que-falta)
- `archivos-borrar` · fase 2 · sigue · contenido · Un PR que borra `src/lib/archivos/` y su glob en `render.js`, ahora que los archivos están en la biblioteca (depende de: subir-archivos)
- `codigo-muerto-github` · fase 2 · sigue · contenido · Código que quedó del panel con GitHub: `sharedImage.js`, la edición del archivo de etiquetas en `tagConfig.js`, ramas «no se guardó en la base», y que el panel guarde objetos sin pasar por «rutas de `.md`» (`getRepoClient`, `withContentDb`, `commitFiles`)
- `restos-limpieza` · fase 2 · sigue · contenido · Restos chicos: la regla de estilo que no alcanza a `.kv-texto-libre` (unas 200 páginas, con antes y después), un solo `foldText` en vez de las copias, un solo helper de imagen de una publicación, renombrar el `isAdmin` de `objects/visibility.js`, el campo de texto `perfil.avatar`
- `docs-a-confirmar` · fase 2 · sigue · docs · Cerrar los «a confirmar» de los docs que gorrite ya confirmó (por ejemplo en lo-que-sigo.md) y las líneas viejas de tickets.md
- `markdown-frontmatter` · fase 2 · hecho · contenido · El renderizador corta el encabezado de un texto en cualquier `---`, aunque esté a mitad de línea · #327
- `textos-viejos-arreglos` · fase 2 · sigue · contenido · Arreglos de datos en textos viejos (etiquetas HTML sin cerrar, `&nbsp;`, negritas rotas): cambios en producción, lo hace Claude de a tandas, cada una con el OK de gorrite en la Mesa (12/10) · [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)
- `objetos-pendientes` · fase 2 · sigue · contenido · Revisar lo que queda de «Pendiente» en objetos.md (historial dentro de `saveObject`, borrar `event_venues` cuando todo esté en la base) · [objetos.md](objetos.md)
- `url-cambiar` · fase 2 · sigue · panel · Cambiar la dirección (URL) de un evento u otro objeto desde el panel, con redirección 301 desde la vieja (necesita migración)
- `borrar-para-siempre` · fase 2 · algún día · panel · Purga definitiva de lo borrado, por une superadmin
- `grafo-objetos` · fase 2 · algún día · contenido · Vista de grafo de los objetos, estilo Obsidian
- `perfil-campos-cv` · fase 2 · algún día · contenido · Campos de perfil: afiliación, formación, experiencia, habilidades (TODO en `types.d.js`; microformato `h-resume`)
- `datos-1` · fase 2 · sigue · datos · ver Mesa
- `datos-2-chequeo-por-pedido` · fase 2 · hecho · datos · El «¿cambió algo?» de la caché una sola vez por pedido, y caché para `/amigues` · #324
- `datos-3-estados-entradas` · fase 2 · hecho · datos · Los estados de entradas de las listas en una sola tanda · #324
- `datos-4-visibilidad-perfiles` · fase 2 · hecho · datos · Una sola regla de visibilidad para perfiles y lugares (`shownProfileWhere` / `isShownProfile`) · #324
- `datos-5-ayudas-compartidas` · fase 2 · hecho · datos · Ayudas compartidas: la dirección del sitio, la descripción del evento, «próximo»; limpiar sesiones viejas en el cron · #328
- `limpieza-md` · fase 2 · hecho · contenido · Contenido solo en la base, sin `.md` ni mdsvex · #275, [0032](decisiones/0032-borrar-los-md.md)
- `imagenes-r2` · fase 2 · hecho · contenido · Imágenes y archivos en R2 con la biblioteca · #215, #217, #226, #230

### Cuentas y perfiles

- `lo-que-sigo-fichas` · fase 2 · sigue · panel · «N cuentas lo siguen» en la ficha de una etiqueta y de un perfil del panel (solo admins; quiénes, en Mensajes › Lo que sigo) (depende de: lo-que-sigo-panel) · [0043](decisiones/0043-lo-que-sigo-en-el-panel.md)
- `lo-que-sigo-avisos-fallidos` · fase 2 · en curso · panel · Contar los avisos de «Lo que sigo» que fallaron (hoy se borra su fila para reintentar: necesita migración; gorrite: sí, contalos, 12/10) (depende de: lo-que-sigo-panel) · #347
- `admins-cuenta-normal` · fase 2 · sigue · cuentas · Admins con la cuenta del sitio en vez de GitHub: ser admin como permiso de la cuenta, la lista de admins a la base, migrar lo que guarda ids de GitHub; con decisión propia y por partes, con GitHub de respaldo (gorrite, 11/10)
- `passkeys` · fase 2 · sigue · cuentas · Passkeys para las cuentas · [cuentas.md](cuentas.md#pendiente-partes-siguientes)
- `compra-con-cuenta` · fase 2 · sigue · cuentas · Guardar `orders.account_id` al comprar y que `requiere_cuenta` pida ingresar de verdad · [0002](decisiones/0002-cuentas-y-perfiles.md)
- `amigues-editan-perfil` · fase 2 · sigue · cuentas · Mandarle a cada amigue un link por mail para gestionar su perfil desde Mi rincón (gorrite, 11/10)
- `sesiones-dispositivos` · fase 2 · algún día · cuentas · Ver dónde hay una sesión abierta y cerrarla
- `lo-que-sigo-panel` · fase 2 · hecho · panel · Mensajes › Lo que sigo: el estado para mirar (interruptores, números, avisos que salieron, «Avisame», Telegram, «Lo más seguido» arriba con el número exacto y quiénes siguen cada cosa, y «Por persona»; solo admins) · #320, [0043](decisiones/0043-lo-que-sigo-en-el-panel.md), [0025](decisiones/0025-lo-que-sigo.md)
- `enlaces-guardar` · fase 2 · sigue · contenido · Al guardar, los `[[…]]`, `@` y `#` del cuerpo se vuelven relaciones del grafo, por objeto (no por título) (depende de: enlaces-sintaxis)
- `enlaces-lo-que-enlaza` · fase 2 · sigue · sitio · «Lo que enlaza acá» en cada página, respetando quién puede ver qué (depende de: enlaces-guardar)
- `enlaces-falta` · fase 2 · sigue · panel · Lista de los enlaces a páginas que no existen («falta») y cuántas veces se enlazan (depende de: enlaces-guardar)
- `enlaces-markdown` · fase 2 · sigue · contenido · Las extensiones de enlaces.md en el procesador de Markdown: notas al pie, tablas, `[[a\|b]]`, secciones, incrustados, etiquetas, avisos, consultas vivas y directivas (depende de: enlaces-sintaxis)
- `enlaces-editores` · fase 2 · sigue · panel · Los dos editores: Markdown con autocompletado y vista previa, y uno visual con fichas, con ida y vuelta sin pérdida (depende de: enlaces-markdown)
- `enlaces-pasar-viejos` · fase 2 · sigue · datos · Pasar los links internos viejos (URL) a `[[…]]`, de a tandas con el OK de gorrite (depende de: enlaces-guardar)

## Fase 3

- `lista-espera` · fase 3 · hecho · entradas · Lista de espera por evento o tipo de entrada, apagada · #310, [0040](decisiones/0040-lista-de-espera.md)
- `lista-espera-prender` · fase 3 · espera gorrite · entradas · Prender `lista_espera` (ya prendido en producción y probado en un preview) y probarla en un evento real (anotarse, reembolso, oferta y compra con el link) (depende de: lista-espera)
- `lista-espera-mail-terminar` · fase 3 · hecho · entradas · «Terminar la reserva y pasar a la siguiente» pregunta si le avisamos por mail («se terminó tu lugar», marcado de entrada) (depende de: lista-espera) · #339
- `promos-varios-eventos` · fase 3 · hecho · entradas · Promociones de varios eventos, versión chica (gorrite, 12/10): código combo, la compra de un evento trae en su mail un código personal para otro; detrás de `combo_codigos`, migración 0056 · #340
- `talleres-partes-mails-preview` · fase 3 · sigue · entradas · Vista previa de los mails de cada parte de un taller en el panel
- `talleres-viejos-a-partes` · fase 3 · sigue · entradas · Pasar a talleres en partes los talleres viejos de varios días (datos de producción, probando antes en el demo), lo hace Claude de a tandas, cada una con el OK de gorrite en la Mesa (12/10) · [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md), [talleres-partes.md](talleres-partes.md#pendiente)
- `plata-talleres-partes-ventas` · fase 3 · hecho · entradas · Talleres en partes: sumar como parte un evento con entradas vendidas, o prender o apagar «Entradas por parte» con ventas, pregunta antes («Cambiar igual») y lo confirmado queda en la actividad · #380, [talleres-partes.md](talleres-partes.md#entradas)
- `pasar-entrada` · fase 3 · algún día · entradas · Pasarle una entrada a otra persona por mail
- `encuesta-post-evento` · fase 3 · sigue · mails · Encuesta automática después de cada evento (pedido de gorrite): a quién, cuándo, preguntas, anónima o no, respuestas en el panel, se apaga por evento
- `preguntas-sugeridas` · fase 3 · sigue · panel · Preguntas de inscripción sugeridas para elegir rápido
- `campos-propios-tipos` · fase 3 · algún día · panel · Campos propios y tipos simples desde el panel; falta diseño
- `recurrencia-rrule` · fase 3 · algún día · sitio · Recurrencia tipo RRULE (las series y los talleres en partes cubren una parte) · #29
- `rol-organizadore` · fase 3 · sigue · cuentas · Rol de organizadore con permisos sobre sus eventos; primero un prototipo para mirar y decidir
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
- `bot-canal-anuncios` · fase 5 · algún día · bot · Canal de anuncios de Telegram: si va y qué publica
- `proto-conector-claude` · fase 5 · sigue · panel · Conector de Claude, lo de plata (confirmar transferencias, reembolsos), para mirar y decidir; la lectura y la edición van antes (depende de: conector-claude-edicion)

## Fase 6

- `social` · fase 6 · algún día · sitio · Lo social: sin publicaciones libres ni feeds por ahora; la comunidad vive en Telegram · [0001](decisiones/0001-ritmo-y-orden.md)
- `proto-indieweb-activitypub` · fase 6 · sigue · sitio · Investigación y prototipo de IndieWeb y ActivityPub (webmention, federación como Mobilizon o Gancio), para mirar y decidir

## Fase 7

- `videos` · fase 7 · algún día · contenido · Videos con Cloudflare Stream y links firmados; el cobro separado del proveedor de las entradas · nav: videos · [0009](decisiones/0009-infraestructura.md)
- `proto-segundo-pago` · fase 7 · sigue · entradas · Prototipo de un segundo proveedor de pago (de reserva para las entradas, y para lo que no puede ir por Mercado Pago)
- `negocio-2` · fase 7 · espera gorrite · plan · ver Mesa

## Fase 8

- `tienda` · fase 8 · algún día · tienda · La tienda: sin decidir qué se vende ni con qué · nav: tienda

## Descartado

Para que no vuelvan: si alguien lo propone de nuevo, primero se habla con gorrite.

- `negocio-1` · fase 7 · descartado · plan · ver Mesa (gorrite, 12/10)
- `bot-miniapp-historia` · fase 0 · descartado · bot · «Compartir en tu historia» desde la Mini App: no (gorrite, 12/10)
- `kinkipedia-series-mejor` · fase 0 · descartado · sitio · Kinkipedia más rica y una lista de series mejor armada (gorrite, 12/10) · [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)
- `kv-fondo-repo` · fase 1 · descartado · infra · Sumar kv-fondo a este repo: se quedan separados, kv-fondo sigue en su repo privado y hablan por la API (gorrite, 12/10) · [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)
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
- `eventos-sin-imagen` · fase 2 · descartado · contenido · Eventos sin imagen y campos vacíos: el panel ya tiene el filtro «Sin imagen» y la fila «Para revisar», así que no espera nada de gorrite
