# Panel de admin

## Qué hace

`/admin` es donde la organización maneja el sitio sin tocar código: cargar y editar eventos,
material y amigues, ver las ventas, confirmar transferencias, controlar el ingreso en la puerta,
mandar mails a quienes compraron, ajustar cobros, el Fondo y los textos de los mails, y ver quién
cambió qué. Se entra con la cuenta de GitHub (solo las cuentas de la lista de admins; el login no
le pide permisos a GitHub, solo lee el id de la cuenta). Anda en la compu y en el celu, arranca
en tema claro y tiene un buscador (`/` o Ctrl/⌘+K, ver
[El buscador](#el-buscador)) que encuentra eventos, órdenes, entradas, códigos, personas, perfiles
y etiquetas (y cada sección por sus palabras: «pie de mail», «alias», «reembolso»…,
`NAV_KEYWORDS` en `src/lib/admin/commands.js`).

## Lo que nunca se tiene que romper

- **Cada `load`, cada form action y cada `+server.js` del panel llama a `requireAdmin`** (o
  `getEventAdmin`) en el servidor. Las form actions **no** pasan por el layout: protegerlas en el
  layout no alcanza. Varias rutas tienen su prueba al lado (`*.test.js`); sumá una en cada ruta
  nueva.
- **Pasar un límite** (cupo, horario, "solo anticipadas"…) es siempre: cálculo en el servidor →
  `409 needsConfirmation` → diálogo en la página (`OverrideDialog`, nunca `window.confirm`) →
  reenvío con la clave → registro `tickets.override`. Nunca un parámetro que la compra pública
  pueda usar (decisiones 0003 y 0006, [entradas.md](entradas.md)).
- **Toda acción que cambia datos queda en Actividad** (`logAdminAction`, tabla `admin_audit`),
  sin DNI, tokens, secretos ni datos bancarios.
- **El DNI no se muestra completo por defecto**: en el control de ingreso se ven los últimos 3 y
  verlo completo queda registrado (`order.reveal_dni`). La búsqueda por DNI solo devuelve los
  últimos 3.
- **Los datos de amigues (mail, teléfono, cumpleaños) son públicos a propósito** (0010): no es un
  problema a arreglar.
- El modo demo y el admin falso de dev no existen en producción ([demo.md](demo.md)).

## Secciones

La lista única de secciones está en `src/lib/admin/nav.js` (menú lateral, barra y panel "Más" del
celu, botón "Para revisar", página "Próximamente" y buscador salen de ahí). Es el **mapa del panel**
que aprobó gorrite: Inicio arriba, las áreas (desde la opción C, la **Puerta** es un área propia)
y **Ajustes al pie**. Dentro de cada área, las
secciones van por frecuencia de uso (lo de todos los días primero) y lo que viene, al final.

**Menú simplificado** (revisión de UI, paso 3): el menú no muestra las 9 áreas sino 7 grupos
(`NAV_GROUPS` en `nav.js`): Puerta, Eventos, Ventas, Comunidad (con Mensajes), Contenido (con
Etiquetas), Estadísticas y Ajustes al pie. Estadísticas va sola, como su propia entrada (gorrite,
4/10: no dentro de Ventas). Es solo el menú: cada sección sigue en su área y en su URL.

**Opción C** (gorrite, 11/10; [decisión 0038](decisiones/0038-navegacion-del-panel-opcion-c.md),
prototipos en `/estilo/prototipos/panel-nav`): la **barra lateral muestra 8 secciones** con ícono
y nombre, sin sub-ítems: Inicio, **Puerta** (sección propia y resaltada: se usa en el celu, con
gente esperando), Eventos, Ventas, Comunidad, Contenido, Estadísticas y Ajustes al pie
(`sideSections` en `nav.js`). Cada una lleva a la primera página de su grupo (Comunidad →
Personas…; Ajustes, a su portada: ver abajo), y en la página principal de cada sección de un grupo
el layout pone una barra de **pestañas** con todas las secciones del grupo, como la que tenía
Ajustes (`sectionTabs`), **también en Eventos** (Eventos, Agenda, Series, Lugares, Roles y preguntas). La
Puerta, que es una sola página, no lleva. **Crear no está en el menú** (es una acción, no un
lugar): «Cargar evento» es un botón de la página de Eventos (y del Inicio y de la barra de
arriba), está en el buscador y tiene `g n`. Sin menú «+ Crear» ni «Más» en la ficha del evento:
las pestañas de la ficha y los ajustes de mails no cambian (quedan para otra decisión).

**Ajustes: portada con 4 grupos de tarjetas** (gorrite, 12/10;
[decisión 0042](decisiones/0042-ajustes-portada-con-grupos.md)): «Ajustes» (barra lateral, panel
«Más» del celu, «Ir a…») lleva a `/admin/ajustes`, una portada con los subgrupos de `nav.js`
(`AJUSTES_SUBGROUPS`: Plata, Comunicación, Equipo, Sistema) y una tarjeta por sección: el ícono, el
nombre, qué hay (`desc` del ítem) y una **línea de estado** («Mercado Pago y transferencia», «10 %
(fijado a mano)», «2 textos cambiados», «3 admins», «4 en prueba», «Todo al día», «Último cambio:
hace 5 min»…), resaltada si hay algo para mirar. La arma `src/lib/server/admin/ajustesStatus.js`
con una sola tanda a la base (ajustes guardados, interruptores, lo último del registro, propinas
aprobadas) más lo de Automatizaciones; una tarjeta sin un dato barato y claro no lleva línea (el
Fondo, si no hay uno fijado a mano ni llegó ninguno automático; cualquier parte que no se pudo
leer). El Fondo automático dice de cuándo es si el último dato tiene más de un día («12 % de cada
entrada (último dato hace 30 h)»): con fondo.kinkyvibe.ar caído se sigue cobrando ese (auditoría
de confiabilidad, O36). Ajustes **no lleva pestañas** (ni la lista ▾ del celu): el grupo tiene `landing` en
`NAV_GROUPS`, y cada página de Ajustes vuelve a la portada con «← Ajustes» (`areaBackLink`).

**Opción C, parte 2** (gorrite, 11/10; [decisión 0039](decisiones/0039-navegacion-del-panel-opcion-c-parte-2.md)):

- **La Puerta sale de la barra lateral** (grupo `puerta` con `side: false`): quedan 7 secciones.
  Sigue en la barra de abajo del celu, en «Ir a…», en la pestaña Puerta de cada evento y en el bot;
  su URL no cambia. Como ya no es una sección de la barra, entra en Recientes.
- **«+ Crear ▾»** reemplaza a «+ Cargar evento» en la barra de arriba (en el celu, un «+» en el
  header): `CreateMenu.svelte` con los ítems de `src/lib/admin/createMenu.js` (evento, serie
  —`/admin/eventos/series?crear` abre el formulario—, lugar, eventos desde una planilla, rol,
  código de descuento, perfil, material y entrada de la Kinkipedia) y lo que viene (producto,
  colección, video) gris, sin link, con «Próximamente» (sale del `soon` de su sección; con
  «Ocultar lo que viene», no aparece). Menú accesible: ↓/Enter abren, ↑/↓/Inicio/Fin recorren,
  Escape cierra y el foco vuelve al botón. Las que no eran ya una acción están en «Ir a…» como
  «Crear: …» (`createCommands` en `paletteActions.js`).
- **Pestañas con contadores**: cada pestaña de sección lleva el contador «a revisar» de su sección
  (`sectionTabs(path, { counts })`, el mismo de la barra lateral y de «Para revisar»); en la ficha
  del evento, Órdenes muestra las órdenes a revisar y Transferencias las que esperan confirmación
  (antes Órdenes mostraba el total de órdenes). Lo que viene va al final de las pestañas, gris y
  sin link, salvo con «Ocultar lo que viene» (sin pasar `hideSoon`, `sectionTabs` sigue sin
  mostrarlo).
- **Pestañas en el celu** (< 600 px): todas las barras del panel usan `Tabs` con `menu` (la de
  sección, la de la ficha del evento y los filtros de Ventas, Perfiles y Propinas): un botón
  «Sección: Órdenes ▾» de ancho entero, lleno de violeta (la navegación principal
  de la página), que abre la lista; sin tira que se desliza. En la ficha del evento, las acciones
  del encabezado bajan debajo de las pestañas, más chicas: Editar y «⋯ Acciones» (Ver página,
  Duplicar, Imagen para compartir). `menuCaption` cambia «Sección» («Pestaña», «Ver»). Desde
  el 12/10 `menu` es lo de siempre en `Tabs`: una barra nueva también pasa a la lista (gorrite).
- **Más ágil**: mientras SvelteKit trae la página siguiente (`$navigating`) hay una barrita de 3
  px arriba de todo (aparece después de 120 ms, así lo rápido no parpadea; quieta con movimiento
  reducido) y el link o botón que se tocó queda «cargando» (`data-pending` y `aria-busy`, estilo
  en `panel.scss`) hasta que llega. La barra lateral, las pestañas, la barra de abajo, «+ Crear»,
  Fijados y Recientes llevan `data-sveltekit-preload-data="hover"` (el `<body>` ya lo tenía para
  todo el sitio): precargan al pasar el mouse o con el foco. Los `load` del panel solo leen (no
  marcan nada como visto ni escriben), así que precargar no cambia nada; «Salir» lleva
  `data-sveltekit-reload` y no se precarga.
- **Links «volver»**: `areaBackLink` no da link si la página del área es «Próximamente» (como
  Mensajes, cuya página es la Bandeja). Las secciones que son pestañas hermanas (Series,
  Transferencias, Códigos) ya no tienen «← Eventos»/«← Ventas»: la pestaña es el camino.
  `src/routes/(authed)/admin/backLinks.test.js` controla que cada «← …», cada `back={{ href }}` y
  cada «Volver…» del panel lleve a una página que existe y no es «Próximamente», que los armados
  con una variable estén revisados, y que ninguna página con pestañas tenga «←» a una hermana.
- `/admin/eventos` ya no tiene los botones «Agenda» y «Series» en el encabezado (son pestañas).

**Íconos en las pestañas** (gorrite, 11/10): cada pestaña de sección lleva el mismo ícono que su
sección en la barra lateral (`sectionTabs` lo saca de `nav.js`), y las de la ficha del evento
también (`EVENT_TABS`: las que son una sección del menú, con `section`, usan el ícono de esa
sección: Ventas, Puerta, Códigos, Preguntas; las demás tienen uno propio de Lucide). El ícono es `aria-hidden`; el nombre de la pestaña sigue siendo su nombre
accesible. En una pantalla angosta (< 600 px), si las pestañas no entran con sus nombres, quedan
solo los íconos y el nombre de la actual; las otras llevan su nombre en `title` y `aria-label`
(`$lib/components/ui/Tabs.svelte`). `nav.test.js` controla que cada pestaña tenga el ícono de su
sección. Las pestañas que son filtros (Próximos/Pasados, Todas/Para aprobar…) no llevan ícono.

**Pestañas de la ficha del evento** (gorrite, 11/10): son 7, Resumen, Editar, Ventas, Puerta,
Códigos, Mails y Preguntas (`EVENT_TABS`; las de venta solo si el evento vende entradas). **Ventas**
junta lo que eran tres pestañas y **Mails** lo que eran dos: cada parte es una **vista** de la
pestaña (`views`), con su URL de siempre, y la ficha las muestra como botones (`.kv-segmented`)
debajo de las pestañas:

| Pestaña | Vistas (URL)                                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| Ventas  | Totales (`/ventas`), Órdenes (`/ordenes`), Transferencias (`/transferencias`), Lista de espera (`/lista-espera`, ver abajo) |
| Mails   | Mandar un aviso (`/mail`), Plantillas (`/mails`, y cada mail en `/mails/<id>`)                                              |

Las direcciones no cambiaron (los links de los mails, el buscador y las pruebas siguen andando):
`eventHref(slug, 'ordenes')` da `/ordenes` como antes, y `eventTabOf(pathname)` dice qué pestaña
y qué vista marcar (las subpáginas, como `/ordenes/cargar`, cuentan como su vista). Una orden
tiene su link: `/ordenes#orden-<id>` (`orderHref` en `src/lib/admin/orderFormat.js`, que usa la
Puerta); la página baja hasta ella, la marca y, si el filtro «Mostrar» la escondía, pasa a
«Todas». La pestaña
Ventas lleva el número de transferencias esperando confirmación; los botones de Órdenes,
Transferencias y Lista de espera, los suyos (en la lista, las anotaciones vivas). En el celu,
con 4 vistas (Ventas con la lista de espera) los botones no entran en una fila: son una grilla de
dos columnas iguales, sin deslizarse de costado; con 2 o 3, la píldora de siempre.

En el celu (< 600 px) la ficha no muestra la tira de pestañas sino un botón con el ícono y el
nombre de la pestaña actual y ▾, que abre la lista entera (ícono y nombre, ninguna escondida, sin
menú «Más»). El botón lleva `aria-expanded`; al abrir, el foco va a la pestaña actual; las flechas,
Inicio y Fin recorren la lista; Escape la cierra y devuelve el foco al botón; tocar afuera o salir
con Tab también la cierra. Es la opción `menu` de `$lib/components/ui/Tabs.svelte`; en la compu,
la tira de siempre. Lo prueba `tests/tickets/menu.spec.js`.

Cada sección vive en **`/admin/<área>/<sección>`**. Las excepciones: Inicio (`/admin`), Puerta
(`/admin/checkin`, porque esa URL está guardada en los celus de la puerta) y las áreas de una sola
sección (Etiquetas), que usan la URL del área.

| Área         | Secciones (URL)                                                                                                                                                                                                                                                                                                                                           | Para qué                                                                                                                                                                                                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —            | Inicio (`/admin`)                                                                                                                                                                                                                                                                                                                                         | próximos eventos, para revisar, plata del mes, actividad, "desde tu última visita"                                                                                                                                                                                                                                                |
| Puerta       | Puerta (`/admin/checkin`)                                                                                                                                                                                                                                                                                                                                 | elegir el evento y abrir su modo puerta (`/admin/eventos/<slug>/ingreso`)                                                                                                                                                                                                                                                         |
| Eventos      | Eventos (`/admin/eventos`), Cargar evento (`/nuevo`, fuera del menú: botón en Eventos), Agenda (`/agenda`, + Importar planilla en `/importar` y Agenda impresa en `/agenda-impresa`), Series (`/series`), Lugares (`/lugares`, + Vincular lugares en `/vincular` e Importar de eventos en `/importar`), Roles y preguntas (`/roles`)                      | lista y ficha de cada evento (`/admin/eventos/<slug>`, ver «Pestañas de la ficha del evento»); modo puerta; series; lugares; roles de personas en eventos y preguntas de inscripción                                                                                                                                              |
| Ventas       | Todas las ventas (`/admin/ventas`), Transferencias (`/transferencias`), Códigos (`/codigos`) · próximamente: Tienda (`/tienda`, fase 8)                                                                                                                                                                                                                   | ventas de todos los eventos, bandeja de transferencias, códigos de descuento                                                                                                                                                                                                                                                      |
| Comunidad    | Personas (`/admin/comunidad/personas`), Perfiles (`/perfiles`: la única lista de perfiles, con los lugares en su filtro; decisión de gorrite del 1/10), Cuentas (`/cuentas`; la ficha de un perfil es `/cuentas/perfiles/<id>`)                                                                                                                           | quienes compraron (con notas), todos los perfiles (fichas de /amigues, de cuentas y del panel; filtros, CSV, «Para aprobar», pedidos "Es mi perfil"), cuentas del público ([cuentas.md](cuentas.md), [amigues.md](amigues.md))                                                                                                    |
| Mensajes     | Plantillas (`/admin/mensajes/plantillas`), Configuración (`/configuracion`), Lo que sigo (`/lo-que-sigo`) · próximamente: Bandeja (`/admin/mensajes`, fase 5)                                                                                                                                                                                             | textos de los mails ([mails.md](mails.md)), remitente, pie, recordatorios y envíos en tandas, el estado de «Lo que sigo» en números ([lo-que-sigo.md](lo-que-sigo.md#en-el-panel))                                                                                                                                                |
| Etiquetas    | Árbol de etiquetas (`/admin/etiquetas`, + Importar a la base en `/importar`)                                                                                                                                                                                                                                                                              | la taxonomía del sitio ([etiquetas.md](etiquetas.md))                                                                                                                                                                                                                                                                             |
| Contenido    | Material (`/admin/contenido/material`), No listadas (`/no-listadas`) · próximamente: Colecciones (`/colecciones`, fase 4), Videos (`/videos`, fase 7)                                                                                                                                                                                                     | editores de contenido ([contenido.md](contenido.md))                                                                                                                                                                                                                                                                              |
| Estadísticas | Ventas en el tiempo (`/admin/estadisticas/ventas`), Asistencia (`/asistencia`), Visitas al sitio (`/visitas`), Bot de Telegram (`/bot`); `/admin/estadisticas` redirige a Ventas                                                                                                                                                                          | ventas, series, medios de pago y Fondo; quiénes vinieron y vuelven; visitas anónimas del sitio ([analiticas.md](analiticas.md)); uso del bot ([telegram.md](telegram.md)). Ver «Estadísticas» abajo                                                                                                                               |
| Ajustes      | Portada (`/admin/ajustes`) · Plata: Cobros (`/admin/ajustes/cobros`), Fondo (`/fondo`), Propinas (`/propinas`) · Comunicación: Vistas previas al compartir (`/vistas-previas`), Textos del bot (`/textos-bot`) · Equipo: Admins (`/admins`) · Sistema: Interruptores (`/interruptores`), Automatizaciones (`/automatizaciones`), Actividad (`/actividad`) | datos para transferir y comisión de MP, % del Fondo, propinas, textos de la vista previa al compartir un link, todo lo que dice el bot de Telegram, lista de admins, interruptores, lo que corre solo (crons, mails programados, bot; para mirar, más «Actualizar comandos del bot»), registro (con CSV y "Recuperar" lo borrado) |

**Ficha de una persona** (`/admin/comunidad/personas/<id>`, con un id corto sacado del mail; nunca
el mail en la URL). Es una sola ficha con todo lo que sabemos de alguien, encontrada por el mail
normalizado (sin espacios ni mayúsculas) y por su cuenta: Notas internas (arriba, después del
resumen), Cuenta (fechas, contraseña sí/no, sesiones,
«Mis datos», permiso para tener perfiles), Compras (todas las órdenes por cuenta o por mail, con
entradas, respuestas, recordatorios y mails a compradores), Perfiles (los que gestiona, pedidos «Es
mi perfil», invitaciones y los eventos donde participan), Lo que sigue (seguimientos, avisos,
series, calendario y Telegram: nunca tokens ni el id del chat) y Actividad. La
ficha de una cuenta (`/admin/comunidad/cuentas/<id>`) muestra la misma ficha (también para una
cuenta borrada), así que los links viejos siguen andando. Las notas internas van por el mail; una
cuenta borrada ya no tiene mail, así que sus notas quedan atadas a la cuenta (`account_id`,
migración 0045, con `email` vacío). Borrar una nota pide confirmar y se recupera desde Actividad
(`deleted_at`, migración 0049; decisión 0033). El DNI no viene con la página: cada
«Mostrar» lo pide aparte y queda en Actividad (`person.dni.reveal`, sin el DNI). Propinas y códigos
de ingreso no se pueden atar a una persona y no aparecen. Código: `src/lib/server/admin/ficha.js`
(una sola tanda de consultas), `fichaRoutes.js` y `src/lib/components/admin/personas/Ficha.svelte`.

**Estadísticas** (tres pestañas, decisión de gorrite del 11/10; la cuarta, la del bot, desde el
12/10). Cada pestaña lee **solo su fuente** y tiene su período en la URL (`?periodo=`), así un link
se puede compartir:

- **Ventas en el tiempo** (`/admin/estadisticas/ventas`, id `estadisticas`: el atajo `g s` y el
  buscador siguen yendo acá): entradas, cobrado y entrada promedio (con el cambio contra el período
  anterior), ventas en el tiempo, por serie, cómo pagan, opciones del fondo y Fondo y finanzas.
  Períodos 30 días / 90 días / **12 meses** (por defecto) / Todo, y filtro de serie (`?serie=`,
  el slug sin la fecha, como «Por serie»). Los números, «Por serie», «Cómo pagan», las opciones del
  fondo y «Fondo y finanzas» cuentan por el **mes del evento** (ver «Ventas por mes» abajo): las
  ventas de los eventos que empiezan desde el comienzo del período hasta el fin del mes en curso.
  Solo el gráfico «Ventas en el tiempo» va por **fecha de compra** (muestra cuándo se vendió). Lee
  en SQL las órdenes compradas, o de eventos que empiezan, desde el comienzo del período anterior
  (para comparar).
- **Asistencia** (`/asistencia`): vinieron (check-in), personas que entraron, primera vez y
  vuelven (con el período anterior), vendidas y entraron, primera vez y vuelven, vuelven a la misma
  serie, vuelven por serie y asistencia por evento. Mismos períodos, por defecto 12 meses; cuentan
  los eventos que ya pasaron y **empezaron** en el período. Lee todas las órdenes: «primera vez» y
  «ya habían venido» necesitan la historia completa.
- **Visitas al sitio** (`/visitas`): las visitas anónimas ([analiticas.md](analiticas.md)), 7 /
  **30** (por defecto) / 90 días. Analytics Engine guarda el detalle unos 3 meses: más atrás solo
  quedan los totales por mes de `analytics_monthly`, y la página lo dice. Nunca lee las órdenes.
- **Bot de Telegram** (`/bot`): las estadísticas de uso del bot (decisión
  [0045](decisiones/0045-estadisticas-del-bot.md), [telegram.md](telegram.md) «Estadísticas de
  uso»): quién lo usó en 7 / **30** (por defecto) / 90 días, con sus interacciones y el último día;
  los totales por tipo de las últimas 12 semanas; y el detalle de una semana (`?semana=AAAA-Wss`),
  con lo buscado y las cosas solo desde 5 veces y solo si esa semana lo usaron 5 personas o más
  (los umbrales, en la consulta). Lee solo las dos tablas del bot (y el vínculo con cuentas y
  admins); nunca las órdenes.

**Ventas por mes** (decisión de gorrite, Mesa `plata-numeros-panel`): todo número de ventas por
mes del panel cuenta cada orden en el **mes del evento**, no en el de la compra ni en el de la
aprobación. Vale para «Entradas este mes» del Inicio y para Estadísticas › Ventas (números de
arriba y «Fondo y finanzas» por mes), así cierran entre sí:

- Cuenta el **comienzo** del evento (`start`; en la base, la columna `start_at` de `objects`). Un
  evento de varios días (un taller en partes, un fin de semana) cuenta entero en el mes en que
  empieza.
- El mes es el calendario de **Argentina** (UTC−3): un evento que empieza el 31/10 a las 22:00 es
  de octubre aunque en UTC ya sea 1/11, y uno del 1/11 a las 00:30 es de noviembre.
- Si el evento ya no está en la base, la orden cuenta por su fecha de compra (para que esa plata no
  desaparezca).
- Las propinas «Para el Fondo» que suma el «Neto del fondo» del Inicio no tienen evento: van por su
  fecha de aprobación.
- No cambian: «Ventas en el tiempo» y «Ventas por día» de la ficha (fecha de compra, muestran cuándo
  se vendió), ni los totales por evento.

Código: `src/lib/server/admin/saleMonth.js` (`SALE_AT_SQL` y `saleAt`, una sola definición),
`monthMoneyQuery` (`inicio.js`), `loadPeopleOrders` (`event_start`), `salesPage` (`statsPages.js`),
`computeStats` y `lastMonths` (`stats.js`, meses en hora de Argentina) y `fondoByMonth` (`charts.js`).

Ventas y Asistencia nunca llaman a Analytics Engine. `/admin/estadisticas` redirige a Ventas (una de
las dos redirecciones del panel, ver «Mover una URL»). Código: `src/lib/admin/statsPeriod.js`
(períodos), `src/lib/server/admin/statsPages.js` (lo que muestra cada pestaña, sobre
`computeStats` y `charts.js`), `src/lib/components/admin/stats/` (`PeriodFilter`, `Visits`) y
`src/lib/server/analytics/report.js` (`loadVisits` con `days`).

**Agenda** (`/admin/eventos/agenda`, cambiada en #171). Usa todo el ancho de la pantalla; en la
compu el mes llena el alto y los días crecen con sus eventos. Tiene dos vistas, Calendario y
Planilla:

- **Carga rápida**: tocar un día vacío (o «Evento») abre una hoja para duplicar un evento que ya
  existe (buscador, con series y ediciones recientes primero) o «Empezar de cero» con el título.
  Crea un **borrador** en ese día sin salir de la agenda: no listado, con la marca `borrador: true`
  en su `.md` (`DRAFT_KEY` en `src/lib/utils/sheetImport.js`), por el mismo camino que Importar
  planilla (`src/lib/server/eventos/drafts.js`).
- **«Qué falta»** (`eventMissing.js`): imagen, resumen, dónde, región, precio, link o entradas, y
  quién organiza. Se ve en los borradores del calendario y en la planilla.
- **«Confirmar»** un borrador (en la agenda y en la ficha del evento): le saca la marca y lo lista;
  queda en Actividad (`event.confirm`). Publicarlo desde la planilla también le saca la marca.
- **Filtro «A confirmar»** (calendario y planilla): solo los borradores con la marca. Un evento no
  listado a propósito (sin la marca) no aparece ahí ni ofrece «Confirmar».
- **Una palabra para cada cosa**: «Borrador» es solo el que tiene la marca; un evento sin listar a
  propósito dice «No listado» (lista de eventos, agenda, Inicio). El contador de Contenido › No
  listadas no cuenta los eventos no listados a propósito, y el Inicio nunca destaca un borrador
  como el evento de hoy.
- **Limitación conocida**: un borrador recién creado se ve en la agenda hasta que recargás la
  página; después desaparece hasta que el sitio se vuelve a publicar con su commit (unos minutos),
  porque la agenda lee los eventos del deploy.

**«Hoy» en el Inicio**: un recuadro por cada evento de hoy que no sea borrador (hora, título,
lugar, entradas y «Abrir Puerta»). Si el evento tiene portada, a la izquierda va su miniatura:
un cuadrado fijo de 64 px (`TodayThumb.svelte`, en `src/lib/components/admin/inicio/`), con
`alt=""` porque el título está al lado y carga diferida. Sale de `thumb` de `upcomingEvents`
(`inicio.js`): la misma portada que las tarjetas del sitio. En producción se pide achicada a
128 × 128 por las transformaciones de Cloudflare (`thumbnailUrl` en `seo.js`, ver
[compartir.md](compartir.md)); en un preview y en local, la portada tal cual. Sin portada no se
muestra nada. Las listas de Eventos y de Contenido (Material, No listadas) piden sus miniaturas
igual (`thumbnailUrl`).

**Mover una URL** (regla de gorrite para el paso 2 del mapa): **sin redirecciones** desde la vieja
(un favorito puede dar "no encontrado", y está bien), pero **nada interno** puede apuntar a ella.
**Dos excepciones**, aprobadas por gorrite el 11/10: `/admin/estadisticas` redirige (307) a
`/admin/estadisticas/ventas` (con el mismo `?periodo=`), porque era una página muy usada y se partió
en tres pestañas (`src/routes/(authed)/admin/estadisticas/+server.js`); y `/admin/ajustes/mails`
redirige (308, también los formularios abiertos) a Mensajes › Configuración
(`/admin/mensajes/configuracion`), porque todo lo de mails se juntó en Mensajes
(`src/routes/(authed)/admin/ajustes/mails/+server.js`). Ningún link nuestro apunta a las viejas
(lista `REDIRECTED` de `adminPaths.test.js`). Dos pruebas lo cuidan:

- `src/lib/admin/adminPaths.test.js` junta cada `'/admin/…'` escrito en `src/` y verifica que
  exista esa ruta (estática o dinámica); además, que ningún archivo de `src/`, `docs/`, `tests/` ni
  `scripts/` nombre una URL vieja (lista `REMOVED_TREES`) o una página borrada (`REMOVED`). Al
  mudar una sección, sumá su URL vieja a `REMOVED_TREES`.
- `tests/tickets/menu.spec.js` (Playwright, con el admin falso) entra a cada link del menú y espera
  que abra en su propia URL.

Los links que se arman en varios lugares salen de `nav.js` (`navItem`, `eventHref`,
`contentAdminHref`) o de `links.js`; no los escribas a mano. Las migraciones de D1 viejas nombran
URLs de antes en sus comentarios: son append-only y no se tocan.

**Para revisar** (decisión [0030](decisiones/0030-para-revisar-y-recuperar.md)): botón global en la
barra de arriba y en el header del celu, con un contador. Por ahora lleva a la tarjeta "Para
revisar" del Inicio.

- **La regla: el contador es la cantidad de filas de la tarjeta.** Cada fila cuenta 1, también la
  que junta varias cosas: «3 transferencias esperando confirmación» (una fila por evento), «4
  eventos próximos sin imagen», «2 perfiles nuevos para revisar», el chequeo nocturno con sus
  problemas o las etiquetas. Si la tarjeta tiene 7 filas, el botón dice 7 y el Inicio dice «7 cosas
  para revisar». Sin filas, «todo al día».
- **Entradas con la configuración rota** (auditoría de confiabilidad, O19): un evento próximo y no
  cancelado que tiene entradas pero cuya configuración ya no se puede leer (una regla endurecida
  después, un dato editado a mano) no vende y la ficha lo muestra como «no vende». Con la opción
  `broken`, `listTicketedEvents` (`src/lib/server/tickets/events.js`) los anota y «Para revisar»
  suma una fila por evento («… no puede vender entradas: su configuración tiene un error», con el
  error de validación y «Editar»).
- **Cuando la base falla, el Inicio lo dice** (auditoría de confiabilidad, O18): cada consulta que
  cae a su respaldo por un error queda anotada (el parámetro `failed` de `runQuery` y `runQueries`
  en `src/lib/server/db/batch.js`, que pasa también por `combineQueries` y `mapQuery`) y el load
  devuelve `unreadable`, solo con sus nombres (sin SQL ni mensajes de error). Arriba aparece en rojo
  «No pudimos leer: … Lo que ves puede estar incompleto; si sigue así, avisale a gorrite.», y ni el
  saludo ni la tarjeta vacía dicen «todo al día». El contador del menú y Ajustes no lo muestran
  todavía (Ajustes ya usa `null` como «no se pudo leer»).
- **Una sola fuente**: `src/lib/server/admin/review.js`. `reviewRows()` arma las filas (con los
  constructores de `inicio.js`: `reviewItems`, `transferMissingItem`, `onlineMismatchItem`,
  `profileReviewItems`, `claimReviewItems`, `groupReviewItems`, `integrityReviewRow`, y los de las
  filas de Etiquetas y del importador) y `reviewCount(rows)` es `rows.length`. La tarjeta del
  Inicio (`+page.server.js`) y el contador del menú (`panelCounts.js`, `review`) llaman a las dos con
  los mismos datos: `reviewQueries` (lo que no depende de los eventos), `reviewEventQueries` (lo que
  depende de los eventos que vienen) y `reviewTagUsage` (el uso de las etiquetas). Nada de esto le
  pide algo a GitHub. Los tests `para-revisar.test.js` e `inicio-tanda.test.js` siembran casos y
  comprueban que el botón dice lo mismo que la tarjeta.
- **Las filas**: primero, una roja por cada pausa de emergencia prendida (`TICKETS_PAUSED`,
  `MAILS_PAUSED`; `pauseItems`, lleva a Ajustes › Interruptores, [interruptores.md](interruptores.md#pausas-de-emergencia)),
  después «Transferencia» tildada sin datos para
  transferir, eventos cancelados con algo por devolver (una por evento: órdenes aprobadas sin
  reembolsar y transferencias vigentes, aunque el evento ya haya pasado; decisión 0044),
  transferencias por confirmar (una por evento), órdenes para revisar (pago tardío,
  pago duplicado o una venta en la puerta sin conexión que pasó un límite o quedó registrada con otro total que el
  que se cobró, decisión 0035), mails que no
  salieron (hasta 20), el cupo de Resend terminado (un día después del último 429 por cupo; ver
  [mails.md](mails.md)), mails de la lista de espera que no salieron (una fila, lleva a Ventas ›
  Lista de espera del evento más reciente), cupos sobrevendidos, links de transmisión que
  faltan, recordatorios que no salieron o fallaron, el link que no le llegó a todes, eventos sin imagen y borradores (juntos si
  son 2 o más), eventos con lugar y etiqueta «Online», perfiles nuevos y pedidos «Es mi perfil»
  (juntos si son 2 o más), **Etiquetas** («N cosas para revisar en Etiquetas»: sin declarar, fuera
  del árbol y referencias rotas, lo mismo que las pestañas de su tarjeta «Para revisar»; «Sin usar»
  no cuenta), **el importador de contenido** («N archivos .md para revisar en Contenido → En la
  base», su lista «Para revisar») y el chequeo nocturno. Las de Etiquetas y del importador llevan
  a su página, que sigue mostrando su lista.
- **Sin PRs de contenido** (gorrite, 9/10): el contenido vive solo en la base, así que los PRs
  `contenido/*` de GitHub ya no son filas y ninguna página del panel los pide para esto. El estado
  de un PR suelto (`contentPullStatus` en `src/lib/server/admin/contentPulls.js`) sigue para el
  aviso «Guardado» del editor (`/admin/contenido/estado`) y para deshacer un borrado.
- **El importador, desde lo guardado**: comparar cada .md del deploy con la base es demasiado para
  cada página. Contenido → En la base guarda lo que encontró cada vez que se abre (y después de
  importar, que la vuelve a cargar) en `review_snapshots` (migración 0047,
  `src/lib/server/admin/reviewSnapshots.js`), y la fila dice «revisado …», como el chequeo nocturno.
  Si nadie abre esa página después de un deploy con .md nuevos, la fila no se entera hasta que
  alguien la abre.
- **Cuándo se actualiza el botón**: el layout lo calcula al cargar una página del panel y después
  de cada acción (guardar, confirmar una transferencia…), no en cada cambio de página.

**Lista de espera** (en construcción, interruptor `lista_espera`; decisión
[0040](decisiones/0040-lista-de-espera.md), detalle en
[tickets.md](tickets.md#lista-de-espera-en-construcción)):

- **Ventas › Lista de espera, en la ficha del evento** (`/admin/eventos/<slug>/lista-espera`, la
  última vista de Ventas, después de Transferencias; se ve con el interruptor prendido, o si el
  evento tiene lista o gente anotada; su número son las anotaciones vivas y el Resumen muestra
  «Lista de espera: N»).
  Cuentas por alcance, la fila en orden, lo terminado y el CSV (con los mails: dato personal).
  Acciones, cada una con su diálogo y en Actividad sin el mail (`waitlist.*`): «Terminar la reserva
  y pasar a la siguiente» (el diálogo pregunta si le avisamos por mail, con «Mandarle un mail a …»
  marcada; Actividad dice «con mail» o «sin mail»; gorrite, 12/10), «Sacar de la lista», «Ofrecer ahora», «Cerrar la lista» (termina las
  anotaciones y además la apaga en el evento: saca `lista_espera` del archivo; gorrite, 12/10) y
  «Volver a probar» los mails que no salieron. Con la lista apagada, la vista avisa y muestra lo
  que quedó.
- **Sin página de Ajustes**: los tiempos de reserva, el aviso a todes y el cierre son fijos, en el
  código (`WAITLIST_SETTINGS` de `src/lib/utils/waitlistHold.js`; gorrite, 12/10: cambiarlos es un
  PR).
- **Editar → Entradas → «Lista de espera»** y la nota en «Vender en puerta» y «Cargar entradas a
  mano» («Hay N personas en la lista de espera… Podés vender igual»).

**Barra lateral** (`SideNav.svelte`, solo en la compu; en el celu está el panel "Más"):

- **Cada admin elige cómo se comporta** (gorrite, 11/10), en el menú de su cuenta (el avatar),
  «Panel lateral»: **Siempre abierto** (lo de siempre, el default), **Solo íconos** (una franja
  angosta; el nombre sale como cartelito al pasar el mouse o con el foco del teclado, y sigue en el
  link para los lectores de pantalla) o **Se oculta** (no ocupa lugar; el botón ☰ de la barra de
  arriba lo abre encima del contenido; se cierra con la X, Escape, tocando afuera o al navegar).
  No hay preferencias por admin en la base (les admins están en el código), así que se guarda en
  **localStorage, por login** (`kv-panel-lateral:<login>`, `src/lib/admin/sidebarMode.js`, con
  try/catch): vale para ese navegador y sin storage vuelve a «Siempre abierto». Se aplica como
  `data-lateral` en `<html>` y un script del `<head>` (como el del tema) lo pone antes de pintar,
  así no se ve la barra equivocada al cargar. En el celu no cambia nada (no hay barra lateral).
- **Compacta** (gorrite, 11/10): renglones con `--space-3xs` de alto, todos los íconos de 18 px y
  el logo más chico. Las pestañas también son más bajas en la compu; en el celu tienen 44 px
  (`--tap`).

- **7 secciones, sin sub-ítems** (opción C, ver arriba; la Puerta salió en la parte 2). La sección de la página actual se marca
  (también en sus subpáginas: en una ficha de evento, Eventos; en Plantillas, Comunidad). Cada
  sección muestra la suma de los contadores de su grupo y la pista «g x» de su primera página.
  Lo que viene («Próximamente») ya no se ve en la barra (sí en las pestañas, en «+ Crear», en el
  panel "Más" del celu y en su URL reservada); «Ocultar lo que viene» vale para todos ellos. Ya no hay
  grupos para abrir y cerrar (`navPrefs.js` solo guarda «Ocultar lo que viene»).
- **Recientes** (debajo de las secciones): las últimas páginas que abriste, como los «Shortcuts»
  de Stripe (`src/lib/admin/recentPlaces.js`). Se muestran **las que entran** en el alto de la
  pantalla, **hasta 7**: `SideNav` mide el lugar que sobra entre las secciones y Ajustes, y las que
  no entran enteras quedan `visibility: hidden` (no se ven, no se leen, no se enfocan); si no entra
  ninguna, no aparece el título. No se guardan Inicio, las páginas que ya son una sección de la
  barra ni las de error, y no se muestra la página en la que estás. El nombre sale del título de
  la página, en dos partes (`recentParts`): el nombre y una línea chica de contexto («Órdenes» /
  «Fiesta de Primavera» en una ficha, «Transferencias» / «Ventas», «Ana Ejemplo» / «Personas»),
  con el ícono de la página (`placeIcon`: el de la pestaña del evento o el de la sección;
  `PlaceLink.svelte`). Las guardadas antes, sin contexto, se ven con su nombre. Cada una tiene 📌
  (al pasar el mouse o con el foco) para fijarla. Se guardan en **localStorage, por login** (`kv-panel-recientes:<login>`, con
  try/catch; sin storage no hay recientes y el menú anda igual): quedan en ese navegador y no salen
  de ahí. En «Solo íconos» no se muestran; en el celu, las primeras 5 van en el panel «Más».
- **Fijados** (arriba de Recientes, parte 2): las páginas que fijaste con 📌 desde Recientes o
  desde «Ir a…» (en cada resultado que lleva a una página del panel, al pasar el mouse o el
  elegido; con el teclado, Alt+F). Hasta 7 (`PIN_MAX`), en tu orden: se arrastran, o con «Subir» y
  «Bajar» (con el foco en la fila aparecen sus botones); «Soltar» la saca. No se fijan las
  «Próximamente» ni las secciones de la barra (`canPin`). Recientes no repite las fijadas. En
  **localStorage, por login** (`kv-panel-fijados:<login>`, `src/lib/admin/pinnedPlaces.js`, con
  try/catch). En el celu se ven en el panel «Más» (sin reordenar).
- **La Puerta entra directo al evento de hoy** (gorrite, Mesa 12/10): si hay **exactamente un**
  evento hoy que la puerta puede operar (presencial, con entradas, `checkinGroup` → `hoy`, la
  misma regla de la lista), `/admin/checkin` redirige (303) a su modo puerta,
  `/admin/eventos/<slug>/ingreso?hoy`. Con ninguno o varios, la lista de siempre. En el modo puerta
  abierto así, debajo del título, «Es el único evento de hoy · **Otro evento**», que lleva a
  `/admin/checkin?lista`: con `?lista` la lista se muestra siempre (sin bucles: el modo puerta
  nunca redirige a la lista). «Elegir otro evento» (en las opciones `…`) también va a `?lista`.
  La regla es `checkinAutoSlug` / `onlyTodaySlug` (`src/lib/utils/doorEvents.js`), la misma con
  la que la Mini App de Telegram (decisión 0037) ya deja elegido el único evento de hoy.
- **Scroll propio**: la barra es `sticky`, del alto de la pantalla y con `overflow-y: auto`, así
  que si no entra scrollea sola y no se mueve con la página.

**Consultas en tanda** (Inicio y contadores del menú): el Inicio hace **dos** idas a la base
(`db.batch`) en vez de una por consulta (eran 33): la primera con todo lo que no depende de la
lista de eventos, la segunda con lo que sí (totales, recordatorios, "desde tu última visita", la
tendencia de ventas). Los contadores del menú son también **dos** como mucho: la primera con los
contadores (las dos cuentas de órdenes van en una sola consulta, cada una por su índice; «No
listadas» se cuenta con una consulta, sin armar las listas públicas) y las consultas de «Para
revisar» que no dependen de los eventos; la segunda, solo si hay eventos que vienen con entradas,
con lo que depende de ellos (totales, links, envíos fallidos, recordatorios). Son las mismas
consultas que el Inicio (`reviewQueries` y `reviewEventQueries` en `src/lib/server/admin/review.js`):
consultas chicas, por índice, que devuelven pocas filas (una por evento, hasta 20 mails, hasta 50
órdenes…). Fuera de las tandas y a la par: la lista de eventos y el uso de las etiquetas (los posts
de la base, que el isolate recuerda mientras la base no cambie). Esas lecturas no esperan una a
la otra: cada categoría de posts, los perfiles y la wiki van a la par (`allMeta` y `fichaMetas`),
la lectura de qué eventos tienen lugar sale a la par de la lista (`listTicketedEvents` y
`getEventTickets`, que la usan solo si hace falta), y en la ficha de un evento, una vez sabida su
venta, los contadores, el aviso de cambio de fecha, la lista de espera y el chip del taller van
juntos (el 404 sigue saliendo antes). Lo mide `npm run medir:panel` ([pruebas-y-ci.md](pruebas-y-ci.md)). Si una
consulta de la tanda falla (por ejemplo, falta una migración), cada una se corre sola con su
respaldo, como antes. Para sumar algo al Inicio: un `…Query` en `src/lib/server/admin/inicio.js`
(ver `src/lib/server/db/batch.js`) y una línea en la tanda que corresponda; el test
`src/routes/(authed)/admin/inicio-tanda.test.js` cuenta las idas.

**Eventos → lista, por páginas** (gorrite, 2/10): la página no trae todos los eventos (son
cientos). Trae los próximos, los borradores y los pasados de los últimos 90 días; «Ver anteriores»
(en Pasados) pide al servidor la tanda siguiente (`/admin/eventos/lista.json?anteriores=N`), y
buscar busca primero en lo cargado y enseguida en todos (`?q=`). Los filtros son al instante sobre
lo cargado y sus cuentas son de todos. El CSV sale del servidor con todos los eventos del filtro o
de la búsqueda (`/admin/eventos/eventos.csv`). Ver `src/lib/server/eventos/panelList.js` y
`src/lib/admin/eventList.js`.

**Aviso «Online con lugar»** (pedido de gorrite, 9/10): un evento con la etiqueta «Online» (o
«online», «virtual») que además tiene un lugar: uno vinculado (edge `lugar`, sin borrar) o un
«Dónde» en texto libre (`location` o `location_name`) que no sea «Online», «Virtual», «Zoom»… La
página y la venta lo tratan como presencial (una sola regla, `eventMode` en
`src/lib/utils/eventPlace.js`, ver [amigues.md](amigues.md) «Online o presencial»), pero la
etiqueta sigue confundiendo filtros y listas (aparece entre los eventos online). **Solo avisa**: no
cambia datos ni la venta, y no bloquea guardar. Una sola función decide:
`onlineTagMismatch(meta, { hasVenue })` en `src/lib/utils/onlineTagMismatch.js`. Aparece en:

- el editor del evento (pestaña Editar): aviso amarillo dentro de «🏷️ Etiquetas», debajo de los
  botones de idioma, lugar y precio; cambia mientras se edita;
- la ficha (pestaña Resumen): el mismo aviso arriba, con cómo lo tratan hoy las entradas (si vende)
  y un link a Editar;
- «Revisar antes de publicar» de Nuevo evento (`publishWarnings` en `src/lib/utils/eventMissing.js`):
  el aviso «Online o presencial», con el mismo texto;
- **Para revisar** (Inicio): la fila «N eventos con lugar y etiqueta «Online»», que cuenta 1 en el
  contador de Para revisar (una fila) y lleva a esa lista de Eventos (`/admin/eventos?filtro=online-con-lugar`).
  Cuenta los eventos que vienen (también los de hoy) y los de los **últimos 30 días**
  (`ONLINE_MISMATCH_DAYS` y `onlineReviewTest` en `src/lib/admin/eventList.js`), sin los
  despublicados: uno más viejo ya no se arregla para nadie. Las etiquetas y el «Dónde» están en el
  JSON del evento, así que no se cuenta del todo en SQL: una sola sentencia
  (`onlineMismatchCountQuery` en `src/lib/server/admin/inicio.js`) trae los candidatos (eventos con
  una etiqueta que dice «online» o «virtual», en `data.tags` o como edge) con si tienen lugar
  vinculado, y `onlineTagMismatch` decide en JS. Va en la primera tanda del Inicio y en la de los
  contadores del menú (sin idas de más);
- la lista de Eventos con ese filtro: no tiene chip en la barra de filtros (se llega desde Para
  revisar; `REVIEW_FILTERS` en `eventList.js`). Arriba dice en qué lista estás, con «Volver a Para
  revisar» y «Ver todos los eventos». Usa la misma ventana que la cuenta. Cada fila de la lista
  (con o sin el filtro, también las viejas) lleva la marca «online con lugar» y un botón «Editar»
  que va a las etiquetas del editor. Saber qué eventos tienen lugar vinculado es una consulta más
  para todos (`listEventVenues`); sin base, mira solo el texto libre.

**Celu**: la barra de abajo sigue igual (Inicio, Eventos, Puerta, Ventas, Más). "Más" muestra
las áreas y, al tocar una, sus secciones. Cuando llegue la Bandeja (fase 5), el cuarto lugar pasa a
ser "Para revisar".

**Lo que viene**: las secciones aprobadas que todavía no existen están en `nav.js` con
`soon: true, phase: N` y un `soonText`. Se ven al final de su área, grises y punteadas, con
«Próximamente», y **no son links** (no hay nada que abrir todavía); su URL reservada igual abre una sola página genérica "Próximamente" (`[...section=soon]`, con el
matcher `src/params/soon.js`) que dice qué va a hacer. Cada persona puede esconderlas con «Ocultar
lo que viene» en su menú de usuario (en el navegador, con try/catch). El matcher va en el
JavaScript de todas las páginas del sitio, así que no importa `nav.js` (con sus íconos): mira la
lista de URLs de `src/lib/admin/soonSections.js`, que `nav.test.js` compara con las secciones
`soon: true` de `nav.js`. Al sumar, construir o sacar una, se cambian las dos.

**Atajos de teclado** (en la compu). `/` o Ctrl/⌘+K abren el buscador, `?` la hoja de atajos y
`g` + una letra va a una sección (`GO_SHORTCUTS` en `src/lib/admin/commands.js`; la hoja de `?`,
las pistas del menú y los chips del buscador salen de ahí). Las letras van por frecuencia de uso
(remapeo de «atajos visibles», a confirmar por gorrite):

| Tecla | Sección          | Tecla | Sección             |
| ----- | ---------------- | ----- | ------------------- |
| `g i` | Inicio           | `g f` | Perfiles            |
| `g e` | Eventos          | `g u` | Cuentas             |
| `g n` | Cargar evento    | `g q` | Árbol de etiquetas  |
| `g g` | Agenda           | `g m` | Material            |
| `g c` | Puerta           | `g s` | Ventas en el tiempo |
| `g v` | Todas las ventas | `g a` | Asistencia          |
| `g t` | Transferencias   | `g w` | Visitas al sitio    |
| `g d` | Códigos          | `g h` | Actividad           |
| `g p` | Personas         |       |                     |

Cómo se descubren (`src/lib/admin/shortcutHints.js`):

- **Pistas en el menú**: cada sección con atajo muestra «g x» chiquito a la derecha
  (`NavShortcut.svelte`), solo con `(hover: hover) and (pointer: fine) and (min-width: 1100px)`
  (`HINTS_MEDIA`): nunca en el celu, la tablet ni el panel "Más". La pista es `aria-hidden`; el
  link no lleva `aria-keyshortcuts` porque ese atributo no describe secuencias («g e» querría
  decir «g» o «e»).
- **Al apretar `g`** las pistas se encienden (color de acento) hasta que llega la segunda tecla, se
  cancela o pasan 1,2 s (`goPending`, lo maneja el teclado de `SearchBox.svelte`). Dejar `g`
  apretada no cuenta como `g g`.
- **Entradas a la hoja de atajos**: «Atajos de teclado ?» al pie de la barra lateral y el botón
  `?` al lado del avatar (solo con mouse), además de «Ctrl K» (⌘ K en Mac) junto al `/` del
  buscador.
- **Aviso de una vez** «¿Sabías que hay atajos?» (`ShortcutTip.svelte`) en la primera visita
  desde una compu con mouse. «Ver atajos» o «Entendido» lo cierran para siempre en ese navegador
  (localStorage `kv-panel-tip-atajos`, con try/catch). **Si cambiás las letras, subí
  `SHORTCUT_TIP_VERSION`** para que el aviso vuelva a aparecer.

**Ciclo de vida de una sección** (documentado también en `nav.js`):

1. **Próximamente**: `soon: true, phase: N, soonText`.
2. **En prueba**: la página existe pero su interruptor está apagado (`flag: 'clave'`). Solo la ven
   les superadmins (hoy son todes les admins), con la etiqueta "prueba". Si con el interruptor
   apagado la página da 404, `hiddenWhenOff: true` y no se muestra.
3. **Lista**: se prende el interruptor; cuando el interruptor desaparece, se borra `flag`.
4. **Descartada**: se borra el ítem.

## Agenda impresa

**Agenda impresa** (`/admin/eventos/agenda-impresa`, botón en la Agenda y «Ir a…»): arma la hoja
A4 de volantes para repartir en papel, con el diseño de gorrite (4 volantes A6 para cortar, en
blanco y negro). Es una pantalla propia sin el menú del panel (`bare: true`), así al imprimir sale
solo la hoja: se imprime o se guarda como PDF desde el navegador (márgenes «Ninguno» y «Gráficos
de fondo» prendido). **Solo lee**: no escribe en la base y lo que se cambia en la página no se
guarda en ningún lado.

- **Qué eventos**: los publicados y listados de un rango de días (por defecto hoy y los 13
  siguientes; `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`), sin los cancelados. Se tildan cuáles van y se
  ordenan con ↑ ↓; en un volante entran 4 (con más, avisa y van los primeros 4).
- **Qué sale de los datos** (`src/lib/utils/agendaImpresa.js`, puro y con pruebas; los junta
  `src/lib/server/eventos/agendaImpresa.js`):
  - fecha y hora en hora de Argentina, «sábado 26 de julio. 20:00 hs» (el diseño lleva «hs»);
  - el lugar **como lo ve cualquiera** (`feedVenues`): nunca una dirección que el nivel del lugar
    no muestra. Con «Sólo barrio», «San Telmo (dirección x privado)»; online, «Online»; sin lugar
    vinculado, el «Dónde» en texto libre. Solo en el volante, «Ciudad Autónoma de Buenos Aires»
    (y «C.A.B.A.», «Capital Federal») se acorta a «CABA» (`shortenCity`); el sitio no cambia;
  - el precio con las reglas del precio en la puerta (`doorPricesText`): «Entrada: $ 16.500»,
    «Desde $ 10.000», «A la gorra», «Gratis»; sin entradas por el sitio, las etiquetas «Gratis» o
    «a la gorra», o la línea no va;
  - el ícono y el subtítulo de la **serie** del evento (el emoji de la etiqueta y la primera
    oración de su descripción, si es corta); sin serie, ✨ y sin subtítulo.
- **Qué se cambia a mano** (por evento): ícono, subtítulo, lugar y precio; y de la hoja, el
  encabezado, el pie, cuántos volantes por A4 (4 = A6, 2 = A5 apaisado, 1 = A4), el fondo y un QR
  al calendario (`qrSvg`, el mismo de las entradas).
- **Fondo y letra**: el fondo de dibujos (`static/agenda-impresa/fondo.svg`) se sacó del archivo
  del diseño (una imagen con su máscara, que le da el trazo fino) y se pasó a vectores; va con el
  tamaño, la posición y la transparencia (33 %) del PDF. La letra es «1797» (Neue_Haut, © 2018 Claustro
  Comfama San Ignacio, diseño de Santiago Arango García, **CC BY 4.0**), recortada a latín y
  español en `static/fonts/1797/` con su `LICENSE.txt`; se carga solo en esta página. El logo es el
  del sitio (`src/routes/logo.png`) pasado a blanco y negro con un filtro.

## El buscador

**«Ir a… o buscar»** (opción C): el botón de la barra de arriba (y del header del celu) se llama
así y abre la paleta, igual que `/` y Ctrl/⌘+K desde cualquier lado. Lleva a cualquier página del
panel escribiendo su nombre (también «Cargar evento» y las de Ajustes) y encuentra eventos por su
nombre. Es un atajo más, nunca el único camino: todo está también en la barra lateral y sus
pestañas. Es un `<dialog>` modal (el resto de la página queda inerte, el foco va al campo y vuelve
al cerrar), con ↑/↓, Enter y Esc.

**Sin nada escrito** (gorrite, Mesa 12/10) lista tus **Fijados** y después tus **Recientes**, con
los mismos nombres, contexto e íconos que la barra lateral (`placeSections` en
`paletteActions.js`; las recientes sin la página actual ni las fijadas, como en la barra). Se
eligen con ↑/↓ y Enter como cualquier resultado, y Alt+F (o el 📌) fija o suelta la elegida. Al
escribir, busca como siempre; al borrar lo escrito, vuelven. Sin ninguna de las dos, un aviso
(«Todavía no tenés páginas fijadas ni recientes…»). Al cambiar lo escrito, el elegido vuelve a
ser el primero.

La paleta (`SearchBox.svelte`) junta **acciones** (en el navegador) y **registros**
(`GET /admin/buscar`, `src/lib/server/admin/search.js`).

- **Sin mayúsculas ni tildes, en todo**: «jose» encuentra «José», «nunez» a «Núñez», «muller» a
  «Müller». Todo compara con `foldText` (`src/lib/server/tickets/orders.js`), la misma función de
  los eventos, las etiquetas y la búsqueda de la Puerta. SQLite no ignora tildes, así que cada
  consulta a la base usa un `LIKE` flojo (`looseLike`: las letras que pueden llevar tilde, como
  a e i o u n c y, valen cualquier carácter) y la comparación de verdad se hace en JS sobre lo que
  vuelve, con un techo de `MAX_CANDIDATES` filas (las más nuevas). Sin columnas nuevas ni
  migraciones: alcanza para cientos o pocos miles de filas. La referencia `KV-…`, el código de la
  entrada y el DNI se siguen comparando en SQL (el DNI nunca sale de la base).
- **Qué encuentra y adónde lleva**: eventos (a la ficha; del primero salen atajos a Puerta,
  Órdenes, Mail a compradores y Ventas si vende entradas, y Duplicar siempre), órdenes (a la
  orden), personas (a **su ficha**, `personHref`), perfiles (al editor), etiquetas (también por
  sus alias: `aka` o `{ id, aliasOf }` llevan a la etiqueta de verdad), entradas y códigos.
- **Acciones**: cada sección del menú (`buildCommands`) más las de `paletteActions.js`: «Para
  revisar», Nuevo material, Nuevo perfil, Clasificar perfiles, Importar lugares (Importar
  eventos es «Importar planilla»), Vincular lugares, «Nuevo código de descuento» (abre el
  formulario, `#nuevo`), «Cambiar tema» y «Ocultar/Mostrar lo que viene» (estas dos las cambia el
  layout, por eventos de `SearchBox`).
- **Qué va arriba** (`recordsFirst`): las acciones, salvo que lo buscado sea claramente un
  registro: algún registro coincide entero (nombre, título, email, código o `KV-…`, marcado
  `exact`) y ninguna acción se llama exactamente así, o hay registros y ninguna acción coincide
  por su nombre (solo por sus palabras extra). Dentro de cada grupo, primero lo que coincide igual,
  después al comienzo, al comienzo de una palabra y en el medio; a igual coincidencia, lo más
  nuevo.

### Operadores

Los lee una sola función pura, `parseSearchQuery` (`src/lib/utils/searchQuery.js`): la usan la
paleta (acciones, y si hace falta preguntarle al servidor) y `/admin/buscar` (registros). Nunca
falla: lo que no entiende queda como texto. Sin mayúsculas ni tildes, como el resto.

| Operador                                             | Qué hace                                                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| palabras sueltas                                     | Tienen que estar todas, en cualquier orden («perez jose» encuentra «José Pérez»).                                                |
| `"frase exacta"`                                     | Esas palabras juntas y en ese orden.                                                                                             |
| `-palabra`, `-"frase"`                               | Sin eso.                                                                                                                         |
| `>tema`                                              | Solo acciones (tiene que ir al comienzo; no le pregunta al servidor).                                                            |
| `#shibari`, `etiqueta:shibari`                       | Eventos con esa etiqueta (por id, nombre o alias; si ninguna se llama así, las que empiezan así) y la etiqueta. `-#…`: sin ella. |
| `@ana`, `persona:ana`                                | Solo personas y perfiles.                                                                                                        |
| `e:fiesta`, `evento:fiesta`                          | Solo eventos. Con `puerta`, `ordenes`, `mail`, `ventas` o `duplicar` al final, el atajo a esa pestaña del primero va arriba.     |
| `orden:ana`                                          | Solo órdenes. `orden:pendiente` (o `estado:pendiente`): las órdenes en ese estado, con o sin texto.                              |
| `tipo:evento` (`,` para varios)                      | Solo ese tipo: evento, orden, persona, perfil (amigue), etiqueta, entrada, codigo, accion. `-tipo:orden`: todos menos ese.       |
| `lugar:palermo`                                      | Eventos cuyo lugar lo dice.                                                                                                      |
| `hoy`, `mañana`, `semana` («esta semana»), `finde`   | Eventos en esos días, en hora de Argentina, del más próximo al más lejano. Las acciones siguen («Abrir la puerta de hoy»).       |
| `cuando:sabado`, `cuando:15/10`, `cuando:15/10/2026` | El próximo sábado (hoy cuenta) o esa fecha (sin año, la de cualquier año).                                                       |

- Los filtros dejan solo los tipos a los que se aplican (`#…`, eventos y etiquetas; `lugar:` y
  `cuando:`, eventos; las fechas sueltas, eventos y acciones; `estado:`, órdenes) y se cruzan con `tipo:`/`@`/`e:`. Si no queda ninguno («estado:pendiente
  #shibari»), la paleta lo dice.
- Un `algo:` que no es operador (`20:30`, `foo:bar`) es texto. Entre comillas, una palabra de
  fecha también (`"semana"`, por un evento que se llame así).
- Para la base, el filtro flojo (`looseLike`) usa la palabra o frase más larga; las demás y las
  excluidas se comparan en JS (`matchTerms`).
- **Ayuda**: con la paleta vacía hay una línea con ejemplos; «Cómo buscar» (al pie de la paleta,
  como acción y en la hoja de atajos `?`) explica todos con ejemplos que se pueden tocar
  (`SEARCH_TIPS` en `paletteActions.js`; un test verifica que cada ejemplo use un operador).
- El buscador público del sitio (`SearchPalette.svelte`) es otro y no tiene operadores.

**Cambios sin guardar.** Los editores del panel (eventos, material, perfiles, la agenda) usan
`UnsavedChanges` (`src/lib/components/admin/panel/`): mientras hay cambios guardan un borrador en
ese navegador (`draft.js`), al volver ofrecen «Recuperar / Descartar», y antes de salir preguntan
con un diálogo («Seguir editando / Salir igual»); cerrar o recargar la pestaña muestra el aviso del
navegador. «Importar planilla» avisa igual pero sin borrador: el diálogo dice que lo cargado se
pierde.

## Dónde está el código

| Qué                                 | Dónde                                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Páginas                             | `src/routes/(authed)/admin/`                                                                                                                 |
| Lógica del servidor del panel       | `src/lib/server/admin/` (inicio, ventas, personas, búsqueda, auditoría…)                                                                     |
| Lógica de entradas que usa el panel | `src/lib/server/tickets/` (`overrides.js`, `door.js`, `manual.js`, `checkin.js`…)                                                            |
| Quién es admin                      | `ADMINS` en `src/lib/server/auth.js` (por id numérico de GitHub); `requireAdmin`                                                             |
| Login con GitHub                    | `src/routes/login`, `src/routes/callback`, `src/lib/server/session.js`                                                                       |
| Menú, atajos, tema, borradores      | `src/lib/admin/` (`nav.js`, `navPrefs.js`, `sidebarMode.js`, `commands.js`, `paletteActions.js`, `shortcutHints.js`, `theme.js`, `draft.js`) |
| Componentes y estilos               | `src/lib/components/admin/` (`panel/`, `door/`, `inicio/`…), `src/lib/admin/panel*.scss`                                                     |

El editor de texto de los formularios de eventos, material y amigues (CodeMirror, sección «Texto»,
`src/lib/components/admin/event-form/BodySection.svelte`) se baja recién cuando se monta esa
sección (`import()`), no con el resto del panel. Mientras llega se ve el texto en un recuadro del
mismo tamaño con «Cargando el editor…»; si no se puede bajar, queda un campo de texto común. Si
agregás otro editor pesado, cargalo igual.

## Cómo probar

```sh
npm run dev:admin      # admin falso; los commits de contenido van a una carpeta temporal
npm run dev:tickets    # admin falso + entradas simuladas (para Ventas, Transferencias, puerta…)
npx vitest run src/lib/server/admin src/lib/admin
npx playwright test -c playwright.tickets.config.js
```

En el preview de un PR: «🧪 Entrar como admin de prueba» en `/login` ([demo.md](demo.md)).

## Tareas comunes

**Agregar una sección.** Si está aprobada pero no se construye todavía, sumá el ítem en `nav.js`
con `soon: true`, `phase` y `soonText`, al final de su área. Para construirla, cambiá `soon` por
`false` (con `flag` si sale detrás de un interruptor), creá la ruta en `src/routes/(authed)/admin/…` con `requireAdmin` en el `load` y en cada
action, registrá los cambios con `logAdminAction` y agregá una prueba de que sin sesión redirige y
sin permiso da 403. Lo nuevo sale detrás de un interruptor, apagado (0001; ver
[interruptores.md](interruptores.md)).

**Agregar une admin.** Hoy es código: sumar `{ id, login }` en `ADMINS` de `auth.js`, con el id
sacado de `https://api.github.com/users/<login>` (no tipeado a mano). Ajustes › Admins solo lo
muestra. Ahí mismo cada admin vincula y desvincula su Telegram para la puerta por Telegram
(«Vincular Telegram», con el interruptor `telegram_puerta`; ver [`telegram.md`](telegram.md)).

**Ver quién hizo algo.** Ajustes › Sistema › Actividad (filtros y CSV).

**Recuperar lo borrado** (Ajustes › Sistema › Actividad, «Borrados que podés recuperar»). Todo
sale de `panel_deletions` (migración 0021), que escribe solo `src/lib/server/admin/deletions.js`,
en la misma tanda que el borrado; «Recuperar» va por `undoDeletion` (también «Deshacer»).

| Qué                                     | Cómo se borra                                    | Fila (`path`)                     | En la lista             |
| --------------------------------------- | ------------------------------------------------ | --------------------------------- | ----------------------- |
| Eventos y material                      | por el cliente del repo (la base)                | `src/lib/posts/<tipo>/<slug>.md`¹ | Evento, Material        |
| Perfiles                                | borrado suave del objeto                         | `objeto:perfil:<id>`              | Amigues                 |
| Imágenes y archivos de la biblioteca    | borrado suave del objeto                         | `objeto:imagen:<id>`, `…archivo…` | Biblioteca · …          |
| Etiquetas y series (también los alias)  | borrado suave (Etiquetas: sacar un alias…)       | `objeto:etiqueta:<id>`, `…serie…` | Etiqueta, Serie         |
| El texto propio de un mail de un evento | se borra la fila; antes, una copia de sus textos | `plantilla:<evento>:<mail>`       | Mail del evento         |
| Preguntas de inscripción                | borrado suave (`deleted_at`, 0049)               | `pregunta:<id>`                   | Pregunta de inscripción |
| Roles agregados desde el panel          | borrado suave (`deleted_at`, 0049)               | `rol:<nombre>`                    | Rol                     |
| Notas internas de una persona           | borrado suave (`deleted_at`, 0049)               | `nota:<id>`                       | Nota interna            |

¹ Es solo el nombre de la fila (la forma de siempre): esos archivos ya no están en el repo (0032).

**La excepción: las notas de la Agenda** (las notas por día de la tarjeta Agenda,
`agenda_day_notes`, `src/lib/server/admin/dayNotes.js`) se borran de verdad (`DELETE`): no pasan
por `panel_deletions` y no aparecen en «Borrados que podés recuperar». Una nota borrada por error
solo vuelve con un backup o con Time Travel.

Decisión 0030: las etiquetas, las series y los mails por evento se recuperan. Una etiqueta vuelve
con sus datos y sus relaciones (nunca se fueron); si mientras tanto se creó otra con el mismo
nombre, «Recuperar» avisa y no hace nada. Un mail no pisa un texto guardado después (avisa).

Decisión 0033 (reemplaza la parte de 0030 que las dejaba permanentes): las preguntas de
inscripción, los roles y las notas internas también se recuperan. Borrar pide confirmar, marca
`deleted_at` y escribe la fila con `softDeletionStatement` en la misma tanda; lo que las lista o usa
saltea las borradas. Una pregunta vuelve con lo que eligió cada evento (sus respuestas nunca se
fueron); un rol vuelve a la lista (las publicaciones lo siguen mostrando mientras tanto; agregarlo
de nuevo con el mismo nombre también lo vuelve); una nota vuelve a la ficha de su persona o cuenta.
Recuperar respeta los topes de preguntas y de roles. La fila de una nota no lleva el texto ni el
mail: «Nota interna» con un link a la ficha (por el id corto). En la lista, cada una lleva un link a
donde se ve (`deletionLink` de `src/lib/admin/deleteText.js`). Actividad anota `signup_field.restore`,
`persona_role.restore` y `person.note.restore`.

**Algo "para revisar".** Aparece en Inicio, en Ventas y en la ficha del evento (pago tarde que
pasó el cupo, posible cobro doble); "Marcar como revisada" después de resolverlo. Para sumar una
fila nueva a «Para revisar»: su constructor en `inicio.js` o `review.js`, sus datos en
`reviewQueries`/`reviewEventQueries` (una consulta chica en la tanda que corresponda) y una línea en
`reviewRows`; así la cuentan la tarjeta y el botón. Sumá su caso a `para-revisar.test.js`. Los perfiles
nuevos de cuentas aparecen en Inicio y en el contador de Comunidad › Perfiles hasta que se marcan
como revisados (o se ocultan o borran) desde su ficha.

**Dejar que una cuenta tenga perfiles.** Comunidad › Cuentas → buscar el mail → la ficha → "Darle el
permiso". Queda en Actividad. Sacarlo no borra sus perfiles: solo deja de verlos
([cuentas.md](cuentas.md), «Permiso para tener perfiles»).

## Lo que viene

Decisiones 0002, 0003, 0008 y 0010: niveles de permiso (superadmins → organizadores), bandeja de mails dentro del panel,
el panel como CRM, formularios nuevos (edición larga con índice, compra en tres pasos) y más
gráficos.

## Lo que sigo

Mensajes › Lo que sigo (`/admin/mensajes/lo-que-sigo`) es **para mirar** el estado de «Lo que
sigo»: los interruptores, **«Lo más seguido»** justo debajo (cuántas cuentas siguen cada
etiqueta, perfil o lugar, aunque sea una, y al abrir «Quiénes» las cuentas que la siguen, con link
a su ficha; [0043](decisiones/0043-lo-que-sigo-en-el-panel.md)), **«Por persona»** (cada cuenta
con cuántas cosas sigue y cuáles), los totales, los avisos que salieron (7 y 30 días y desde el
principio, por tipo y canal), el paso de «Avisame si se repite» y Telegram, con links a donde se
configura cada cosa. Quién sigue qué solo lo ven les admins, en esta página y en las fichas. Se
ve también con el interruptor apagado. Los números salen de `src/lib/server/sigo/stats.js`;
detalle en [lo-que-sigo.md](lo-que-sigo.md#en-el-panel). Lo de cada persona está en su ficha
(«Lo que sigue»).

## Automatizaciones

Ajustes → Automatizaciones (`/admin/ajustes/automatizaciones`) junta, **para mirar**, todo lo
que corre solo (la única acción es «Actualizar comandos del bot», abajo). La lógica está en `src/lib/server/admin/automatizaciones.js`.

- **Tareas programadas**: los dos crons de `wrangler.toml` (`[triggers]`, los mismos que
  `src/lib/server/scheduled.js`): la vuelta de mails cada 15 minutos y el backup nocturno (con el
  chequeo de integridad después). Cada una con la próxima corrida y la última vez: el último mail
  que salió (la base no guarda las vueltas que no mandaron nada) y el último backup de R2 (solo en
  producción; en un preview, la última corrida del chequeo, `integrity_runs`). En producción, si
  no hay ningún backup nocturno o el último tiene más de 36 horas (alguna noche no corrió), el
  backup queda en amarillo con «El último backup tiene N horas»; lo mismo si el último chequeo
  tiene más de 36 horas.
- **Mails que salen solos**: recordatorios de entradas (los configurados en Mensajes → Configuración),
  links de transmisión, avisos de series y de «Lo que sigo» (nuevo y recordatorio), con el último
  envío, los pendientes y los que fallaron (`reminder_sends`, `stream_link_sends`,
  `series_notifications`, `follow_notifications`). «Mail a compradores» no está: sale desde la
  página del evento, no del cron. Lo que queda de un «Avisar a les compradores» (cambio de fecha)
  sí lo manda el cron, pero esta página todavía no lo muestra.
- **Bot de Telegram**: el interruptor, si el secreto del webhook y el token están cargados (sí/no;
  nunca el valor) y cuántos chats hay vinculados. El botón **Actualizar comandos del bot**
  (`?/comandos`) le registra a Telegram el menú «/» y muestra qué quedó o el error; queda en el
  registro (`telegram.commands`). Detalle en [`telegram.md`](telegram.md).
- **Reglas**: «próximamente» (las del tipo «si pasa X, hacé Y»).

Cada fila linkea a donde se configura. Nunca muestra a quién se le mandó algo.
