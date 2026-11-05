# Conector de Claude

## Qué hace

Les admins pueden sumar el sitio como **conector** en claude.ai (o en Claude Code) y pedirle a
Claude cosas del sitio en palabras: «¿cuántas entradas vendimos para la fiesta del sábado?»,
«mostrame el perfil de tal persona», «¿qué eventos hay este mes?». Claude busca y lee lo mismo que
une admin ve en el panel, **sin cambiar nada**, sin SQL a mano y sin ids: todo se pide por nombre o
por la dirección (slug).

- Solo para les admins de la lista (`ADMINS` en `src/lib/server/auth.js`): cada une conecta con su
  propia cuenta de GitHub, la misma del panel.
- Cada pedido de Claude queda en **Actividad** a nombre de le admin (familia «Conector de Claude»).
- Está detrás del interruptor `conector_claude` (Ajustes → Interruptores), **apagado**. Apagado,
  no existe (404).
- Con un segundo interruptor, `conector_claude_edicion` (**apagado**), Claude además puede
  **cambiar** lo que edita el panel (eventos, material, perfiles, lugares, etiquetas y la
  Kinkipedia), crear borradores sin publicar y **deshacer** cualquier cambio, siempre en dos pasos
  (ver [Cambios](#cambios) y [Deshacer](#deshacer)). gorrite, 3/11: «editar todo, siempre que se
  pueda deshacer».
- Es la parte 1 y 2 de tres (plan: `conector-claude-lectura`, `conector-claude-edicion`,
  `conector-claude-borradores`); lo de plata (`proto-conector-claude`) va después. Decisión [0003](decisiones/0003-superadmins-y-permisos.md):
  «Claude puede operar el panel con un conector, siempre con permiso».

## Lo que nunca se tiene que romper

- **Nunca una llamada sin token válido de admin.** `/mcp` contesta 401 a cualquier pedido sin un
  token de acceso firmado por el sitio, para `/mcp`, sin vencer, de un id que siga en `ADMINS` y
  emitido después de su último «Cerrar mis conexiones». Le admin de prueba ([demo.md](demo.md))
  solo puede autorizar en un preview, nunca en producción.
- **Leer no cambia nada.** Las herramientas de lectura no escriben nada (salvo el registro en
  Actividad y el límite de pedidos) y van marcadas `readOnlyHint`.
- **Cambiar, solo lo que el panel ya hace y por su mismo código**, nunca SQL a mano: el «Guardar»
  de la pestaña Editar de un evento, del editor de material, del editor de perfiles (también los
  lugares), de una etiqueta y de la entrada de la Kinkipedia; las altas de borradores (Agenda,
  Nuevo material, Nuevo perfil) y de códigos (Ventas → Códigos). Con su validación, el control de
  que nadie guardó en el medio, el historial y lo que sigue a un guardado (lugar, lista de espera,
  aviso de cambio de fecha).
- **Todo cambio se puede deshacer**: cada guardado deja una versión en el historial, con sus
  relaciones, y `deshacer` vuelve a cualquiera por el mismo guardado (ver [Deshacer](#deshacer)).
- **Nada de plata ni mails**: ni ventas, ni reembolsos, ni envíos, ni cancelar un evento (ver
  [Lo que no hace](#lo-que-no-hace)).
- **Lo que se aplica es exactamente lo que se vio**: `aplicar` no guarda si lo que había cambió
  desde la vista previa o si las entradas no son las mismas.
- **Sin SQL ni ids en las entradas.** Las herramientas reciben texto, un slug o un nombre; el
  servidor resuelve. Si un nombre coincide con varios, devuelve las opciones para volver a pedir.
- **Muestra lo mismo que el panel le muestra a le admin** que usa el conector, ni más ni menos
  (gorrite, 3/11/2026). Una orden, como la pestaña Ventas › Órdenes: del DNI, los últimos 3
  dígitos, como la lista (el completo se pide aparte en el panel, con «Mostrar»); el pago de
  Mercado Pago, la nota, las entradas y las respuestas a las preguntas, como ahí. Un objeto, con
  todos sus datos, como el editor. Lo que el panel no muestra, el conector tampoco. Los mails de
  amigues son públicos a propósito (decisión 0010), como en el panel.
- **Dos migraciones**: `0072` (las llaves para rutinas y «confirmado por» en el historial) y
  `0073` (las relaciones de cada versión del historial, para deshacer). La lectura no las necesita.

## Cómo sumarlo en claude.ai (gorrite, una vez prendido)

1. En el sitio: Ajustes → Interruptores → prender **«Conector de Claude (solo lectura)»** (primero
   en un preview, ver abajo). Tarda hasta 30 s.
2. En [claude.ai](https://claude.ai): **Personalizar → Conectores → «Agregar conector
   personalizado»** (en inglés, _Customize → Connectors → Add custom connector_). En un plan de
   equipo, le Owner lo agrega en la configuración de la organización y cada admin lo conecta.
3. Nombre: `KinkyVibe`. URL: **`https://kinkyvibe.ar/mcp`** (también está para copiar en Ajustes →
   Admins → «Conector de Claude»). La «Configuración avanzada» se deja vacía: Claude se registra
   solo. Si la pide, el ID de cliente es `kinkyvibe-claude`, sin secreto.
4. «Conectar»: se abre el sitio. Si no tenés sesión, entrás con GitHub; después, la pantalla
   «¿Conectar Claude?» dice qué va a poder leer (y cambiar, si Claude pidió el permiso
   `edicion`) y a dónde vuelve (`claude.ai`). «Permitir».
   Permitilo solo si recién lo pediste vos desde Claude: si alguien te pasa un link a esa
   pantalla, cancelá (la pantalla lo avisa, y no se puede mostrar dentro de otra página).
5. En una conversación, prendé el conector (menú de herramientas) y pedí: «¿cómo viene la venta de
   la fiesta de noviembre?». La primera vez, Claude pregunta antes de usar cada herramienta.

**Claude Code**: `claude mcp add --transport http kinkyvibe https://kinkyvibe.ar/mcp` y después
`/mcp` para conectar. La pantalla de permiso avisa que vuelve «a un programa en esta compu»
(`localhost`): permitilo solo si lo abriste vos recién.

**En un preview**: la URL es la del preview más `/mcp`. El login con GitHub anda solo en
kinkyvibe.ar, así que ahí se entra con «🧪 Entrar como admin de prueba» ([demo.md](demo.md)) y
se autoriza como `demo` (solo en previews). Prender el interruptor en el panel del preview. La base
de preview es otra (datos inventados): las conexiones de un preview no valen en producción.

## Cómo cortarlo

| Para                             | Hacé                                                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desconectar Claude de tu cuenta  | Ajustes → Admins → «Cerrar mis conexiones de Claude» (ningún token tuyo de antes vale). En claude.ai, además, «Desconectar» en el conector.                      |
| Desconectar a todes              | Ajustes → Admins → «Cerrar las de todes» (cambia la clave de las firmas: ningún token de nadie vale).                                                            |
| Apagarlo                         | Ajustes → Interruptores → apagar «Conector de Claude». De golpe y sin panel: variable `CONECTOR_CLAUDE_ENABLED=0` en Cloudflare.                                 |
| Que une ex admin no pueda usarlo | Sacarle de `ADMINS`: sus tokens dejan de valer en el siguiente pedido.                                                                                           |
| Que Claude no cambie nada        | Ajustes → Interruptores → apagar «Conector de Claude: cambios» (sigue leyendo). De golpe: `CONECTOR_CLAUDE_EDICION_ENABLED=0`.                                   |
| Cortar una rutina                | Ajustes → Admins → «Llaves para rutinas» → «Revocar» (o «Revocar todas mis llaves»). «Cerrar mis conexiones» y «Cerrar las de todes» también revocan las llaves. |

Además, una conexión dura como mucho 30 días; después Claude pide «Conectar» otra vez. Si no se
usa en 20 horas, también (el token de renovación vence).

## Las herramientas

| Herramienta        | Qué recibe                                                                                                                            | Qué devuelve                                                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `buscar`           | `texto`; opcional `tipo` (evento, material, perfil, etiqueta, lugar) y `limite`                                                       | tipo, slug, título, visibilidad y enlaces (al sitio y al panel) de lo que coincide, también lo oculto. Usa el índice de búsqueda de la base (`searchObjects`, sin tildes, cada palabra como comienzo).                                                                         |
| `leer`             | `nombre` (slug o nombre); opcional `tipo`                                                                                             | todos los datos del objeto, como el editor del panel, quién y cuándo lo creó y editó, sus relaciones y sus enlaces; o las opciones si hay varios.                                                                                                                              |
| `ventas`           | `evento` (slug o nombre); opcional `estado` (todas, aprobadas, pendientes, reembolsadas, vencidas, canceladas) y `limite` (hasta 500) | el resumen de la pestaña Ventas (vendidas, reservadas, cupo, recaudado, neto sin la comisión de MP, Fondo, por tipo, órdenes por estado) y las órdenes como en la pestaña Órdenes: referencia, nombre, últimos 3 del DNI, mail, montos, su estado, pago MP, nota y respuestas. |
| `eventos_proximos` | opcional `dias` (hasta 365) y `limite`                                                                                                | los eventos desde hoy: slug, título, fechas, lugar, si está oculto, sin publicar o es borrador, y si vende entradas, vendidas, reservadas y cupo.                                                                                                                              |
| `historial`        | `tipo` (evento, material, perfil, lugar, etiqueta, kinkipedia), `objeto` (slug o nombre); opcional `limite` (hasta 50)                | `version_actual` y `versiones`: `[{ version, cuando, quien, origen, cambios, es_la_actual?, deshacer_vuelve_aca?, sin_relaciones_guardadas? }]`. `cambios` son los nombres de los campos que cambiaron, no los valores.                                                        |

Fuera de `vite dev`, los eventos de prueba de la venta (`prueba-entradas-*`) no aparecen, como en
el buscador del panel. Cada herramienta anota en Actividad `conector.<herramienta>` con un resumen
(«Claude: miró las ventas de «…»»), sin datos de compradores. Autorizar (`conector.autorizar`) y
cerrar conexiones (`conector.cerrar`, `conector.cerrar_todes`) también quedan.

## Cambios

Con `conector_claude` y `conector_claude_edicion` prendidos, y una conexión con el permiso
`edicion` (ver «Permisos» abajo), aparecen dos herramientas más. Todo
cambio va en dos pasos: `vista_previa` muestra exactamente qué va a cambiar (lo que el bot del
equipo muestra para pedir el ✅) y `aplicar` lo guarda, con las mismas entradas más la huella y la
versión de la vista previa. En un chat con une admin pueden ir una atrás de la otra; lo que importa
es que `aplicar` nunca guarda algo distinto de lo que alguien vio.

| Herramienta    | Qué recibe                                                                                                       | Qué devuelve                                                                                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vista_previa` | `operacion` y, según la operación, `tipo`, `objeto`, `evento`, `a_version`, `cambios`                            | `resumen` (el antes y después en un texto corto), `cambios` (`[{ campo, antes, despues }]`), `avisos`, `hash`, `version`, `objetivo`, `titulo`, `enlaces`. No guarda nada.                                     |
| `aplicar`      | lo mismo, más `hash` y `version` de la vista previa; opcional `confirmado_por` (hasta 40) y `pedido` (hasta 500) | `aplicado: true`, `resumen`, `avisos`, `confirmado_por`, `enlaces` (y `creado`, la dirección de un borrador); o `aplicado: false` con `motivo` (`cambió`, `no coincide`, `el panel no lo guardó`) y `mensaje`. |

Operaciones (`operacion`):

- **`editar_objeto`**: `tipo` (evento, material, perfil, lugar, etiqueta, kinkipedia), `objeto`
  (slug o nombre; una etiqueta, también su nombre exacto) y `cambios`, alguno de los campos de
  abajo. Cada tipo se guarda por el «Guardar» de su editor del panel.
- **`editar_evento`** (de #607, sigue igual): lo mismo que `editar_objeto` con `tipo: evento`; el
  evento va en `evento`.
- **`crear_borrador`**: `tipo` (evento, material, perfil, lugar, etiqueta) y `cambios` (ver
  [Borradores](#borradores)); una etiqueta nueva se publica al toque.
- **`deshacer`**: `tipo`, `objeto` y opcional `a_version` (ver [Deshacer](#deshacer)). Sin
  `cambios`.
- **`crear_codigo`** (`evento` opcional: sin él, vale para todos). `cambios`: `codigo`, `tipo`
  (`porcentaje` o `monto`), `valor`, y si hace falta `desde`, `hasta` (`AAAA-MM-DDTHH:MM`),
  `usos_maximos`, `entradas_maximas`. Los mismos campos y la misma validación que el formulario.

Los `cambios` de cada tipo (lo que no se manda queda como está; fechas `AAAA-MM-DDTHH:MM`, hora de
Argentina):

| Tipo              | Campos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| evento y material | `titulo`; `descripcion` (markdown, con las reglas de HTML de le admin que autorizó: HTML libre, ver abajo); `resumen`; `etiquetas` (la lista entera); `personas` (`[{ nombre, rol }]`: `nombre` es la dirección de un perfil, que va como perfil, o un nombre libre; la lista entera); `visibilidad` (`listado` o `no_listado`); `imagen` (la dirección o el nombre de una imagen de la biblioteca; vacío la saca); `link`, `texto_del_link`; `propiedades` (`{ clave: valor }` para otras propiedades del texto, como `original_published_date` o `redirect`; `null` la saca; las que tienen su campo, o las de la venta, no van acá) |
| evento (además)   | `inicio` y `fin` (`fin` vacío saca la hora de fin; si cambia `inicio` sin `fin`, el fin se mueve igual, como en el editor); `lugar` (nombre o slug de un lugar que ya existe; vacío, sin lugar); `estado` (`anunciado`, `abierto` o `agotadas`; cancelar, no: ver abajo); `precios` (`[{ tipo, precio }]`, como en #607: un tipo que ya existe, con precio fijo); `entradas` (`[{ tipo, precio? \| a_la_gorra?: { minimo, sugerido } \| tandas?: [{ nombre, precio, cantidad?, hasta? }], cupo? }]`: un tipo que no existe se suma; `cupo: null`, sin límite; una tanda que ya existe se reconoce por su nombre)                       |
| perfil y lugar    | `titulo`; `tipo_de_perfil` (persona, proyecto, lugar; un lugar no cambia de tipo); `visibilidad` (`listado` o `no_listado`); `quien_lo_ve` (`publico`, `miembres`, `oculto`); `bio`, `descripcion`, `pronombres`, `link_de_pronombres`, `texto_del_link`, `email`, `telefono`, `cumpleanos`, `identidad_de_genero`, `que_hace`, `direccion`, `barrio`, `ciudad`, `accesibilidad`, `como_llegar`; `links`, `etiquetas`, `autores` (listas); `no_indexar`, `mostrar_miembres` (sí/no); `latitud`, `longitud`; `privacidad` (la del lugar); `imagen`                                                                                      |
| etiqueta          | `nombre_visible`, `icono`, `color`, `descripcion`, `imagen` (un archivo de la biblioteca vieja, como en el panel). Renombrar, mover, fusionar y los alias, desde el panel: cambian muchas publicaciones y deshacerlos no es volver una versión atrás                                                                                                                                                                                                                                                                                                                                                                                   |
| kinkipedia        | `titulo`, `resumen`, `autores`, `etiquetas`, `texto` (la entrada de la wiki de una etiqueta que ya existe)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

- **La huella** (`hash`) cubre la operación, el objetivo, las entradas ya normalizadas (con los
  nombres resueltos en el servidor) y la versión de lo que había; la firma el servidor con su
  clave. La **versión** de un evento o un material es la del objeto más el sha de su texto; la de
  un perfil, una etiqueta o una entrada de la Kinkipedia, la del objeto (sube con cada guardado);
  la de un código o un borrador, «nuevo».
- **«Confirmado por»**: el historial del objeto guarda quién guardó (le admin dueñe de la conexión),
  que fue por Claude y quién lo confirmó; la pestaña Editar del evento muestra «Última edición: …,
  Claude, confirmado por Mel (autorizó @login)», o solo «Claude» si no vino `confirmado_por` (el
  chat de le propie admin). En Actividad: `conector.aplicar`, a nombre de le admin, con «Claude,
  confirmado por Mel: editó el evento «…» (título, precio de «General»)». El texto del `pedido` no
  se guarda en Actividad. Cada vista previa queda también (`conector.vista_previa`).
- **HTML libre** (gorrite, 3/11: «html libre está bien, sólo lo hacemos nosotres por ahora»): lo
  que guarda el conector usa las mismas reglas de HTML que cuando le admin que autorizó guarda en el
  panel. Les admins del panel son superadmins ([0003](decisiones/0003-superadmins-y-permisos.md)),
  así que una descripción nueva queda con HTML libre ([0004](decisiones/0004-modelo-de-contenido.md));
  también se puede cambiar la de un evento que ya tenía HTML libre.
- **Sin tope de cambios** (gorrite, 3/11: «Sin tope: aviso por Telegram si hay muchos cambios en
  una hora»). Cuando en la última hora (ventana móvil) se aplicaron **20 cambios o más**
  (`BURST_THRESHOLD` en `src/lib/server/mcp/avisoCambios.js`; es una constante, no una variable),
  les admins que prendieron **«Cambios de Claude»** en «🔔 Mis avisos» del bot (apagado por
  defecto, como todos los avisos de admins; [telegram.md](telegram.md)) reciben por Telegram:

  > ⚠️ Claude aplicó 20 cambios en la última hora desde el conector.
  > Autorizó: @login
  > Confirmado por: Mel, Juan

  «Autorizó» son les admins dueñes de las conexiones que aplicaron; «Confirmado por», los nombres
  de `confirmado_por` (la línea no sale si no vino ninguno). Nada del pedido ni de compradores.
  Cuenta las filas `conector.aplicar` de Actividad con `detail.aplicado` (los rechazados no
  cuentan). Sale **una vez por hora como mucho**: antes de mandar se toma una fila del bucket
  `mcp-aviso-cambios` de `rate_limits` solo si no hay otra de la última hora; si no le llegó a nadie
  (Telegram falló), se suelta y el próximo cambio reintenta. Corre en segundo plano después de
  guardar (`waitUntil`): sin el bot, sin «Telegram para admins», sin `TELEGRAM_BOT_TOKEN` o con
  Telegram caído, el cambio se guarda igual y el problema solo queda en el log.

## Deshacer

`deshacer` vuelve un objeto a una versión anterior de su historial, con el mismo par
`vista_previa` y `aplicar` y por el mismo guardado del panel que una edición (con su validación,
el control de que nadie guardó en el medio y lo que sigue a un guardado). Lo que se guarda es una
**versión nueva**, de Claude y con «confirmado por», así que un deshacer también se deshace.

- **A qué versión**: sin `a_version`, a la de antes del último guardado; con `a_version`, a esa (el
  número que muestra `historial`). Un «Guardar» del editor de eventos que cambia el lugar deja dos
  versiones seguidas (el texto y, enseguida, el lugar, con los mismos datos): cuentan como un solo
  guardado.
- **La vista previa** dice «Volver el evento «…» a la versión N (del …, de …):» y el antes y después
  de cada campo que cambia. Lo técnico que el guardado del panel escribe solo (la fecha de
  «Actualizado», `puerta: true`, que es lo mismo que no tenerla) vuelve igual, pero no se lista
  (`TECHNICAL` en `historial.js`; gorrite, 3/11). Si ya está así, no hay nada que deshacer. Una versión borrada no se
  restaura (borrar y recuperar, desde el panel); un objeto en su primera versión (un borrador recién
  creado, por ejemplo) tampoco: se borra desde el panel.
- **Las relaciones**: desde la migración `0073` cada versión guarda también sus relaciones
  (`object_revisions.edges`: etiquetas, personas con perfil, imagen, lugar…), y deshacer las
  devuelve. Una versión de antes no las tiene: deshacer devuelve los datos y deja las relaciones
  como están, y la vista previa lo avisa. La `0073` agrega la versión actual de cada evento,
  material, perfil y etiqueta con sus relaciones, así lo primero que se cambie después se puede
  deshacer.
- **Historial en todos los editores**: el editor de perfiles y el de etiquetas guardaban sin
  historial; ahora dejan su versión como los eventos (decisión 0004, «historial: todo»). Lo que pide
  el conector queda como «Claude, confirmado por …» también en la Kinkipedia, el lugar de un
  evento, los perfiles y las etiquetas (`panelRevisionStatement` en
  `src/lib/server/contenido/author.js`).
- **Lo mismo que una edición**: deshacer hasta un evento cancelado, o cambiar el cupo o el estado
  con gente en la lista de espera, tampoco se hace (ver abajo).

## Borradores

`crear_borrador` crea uno sin publicar por el alta del panel; lo demás se completa después con
`editar_objeto`:

- **evento**: el «Borrador» de la Agenda: `cambios` con `titulo`, `inicio` y opcional `fin` (el
  mismo día) y `copia_de` (un evento para duplicar, como en la agenda). Queda no listado, con
  `status: anunciado` y la marca `borrador: true` («A confirmar»). La dirección la elige el panel
  al guardar y vuelve en `creado`.
- **material**: «Nuevo material»: `titulo` y lo que pide el formulario (al menos una etiqueta y une
  autore en `personas`, con rol `Autore`); opcional `slug`, `resumen`, `descripcion`, `link`,
  `texto_del_link`, `propiedades`. Queda no listado.
- **perfil** y **lugar**: «Nuevo perfil»: `titulo` y los campos de un perfil (sin imagen). Nace
  oculto (`quien_lo_ve: oculto`).
- **etiqueta** (gorrite, 3/11): una etiqueta nueva, por el «Guardar» de Etiquetas (un cambio
  `create`, con las reglas del editor: el nombre, que no exista otra ni un alias igual, la madre).
  `cambios`: `nombre` (el nombre exacto) y opcional `madre` (una etiqueta que ya existe),
  `nombre_visible`, `icono`, `descripcion`; el color y la imagen, después con `editar_objeto`. Las
  etiquetas no tienen borrador: queda publicada al toque. No se deshace desde acá (es su primera
  versión): se borra desde el panel, como renombrar, mover o fusionar.

## Lo que no hace

Nada que mande mails ni mueva plata (gorrite, 3/11): ni ventas, ni reembolsos, ni envíos, ni
confirmar transferencias (eso es `proto-conector-claude`, para mirar y decidir). En los eventos:

- **Cancelar**: `estado: cancelado` (y `propiedades.status`, y deshacer hasta una versión cancelada)
  se rechaza con «Cancelar un evento no se hace desde el conector…». En el panel, cancelar cierra
  la lista de espera (el cron le manda un mail a cada persona anotada) y abre «Reembolsar todas»
  (decisión 0051). El conector no lo hace ni a medias.
- **Con gente en la lista de espera**, no cambia el estado ni la venta salvo los precios (el cupo,
  las tandas, un tipo nuevo, el cierre): un lugar que se libera le manda la oferta por mail a la
  próxima persona. Desde el panel.
- **La fecha sí**: cambiarla solo anota el cambio y la ficha ofrece «Avisar a les compradores»,
  que nunca sale solo (como en #607). La vista previa lo avisa si hay entradas vendidas.
- **La venta**: los medios de pago, la meta, la lista de espera, la puerta y prender o apagar la
  venta, desde el panel (`propiedades` no los acepta).

## Rutinas que corren solas

La conexión de claude.ai vence (si no se usa en 20 horas, o a los 30 días), y una rutina programada
no puede volver a tocar «Permitir». Para eso están las **llaves para rutinas**:

1. En el sitio: Ajustes → Admins → «Llaves para rutinas» → nombre (p. ej. «Rutinas de mi compu»)
   → «Crear llave». Se muestra **una sola vez**: copiala.
2. En la compu de la rutina (Claude Code):
   `claude mcp add --transport http kinkyvibe https://kinkyvibe.ar/mcp --header "Authorization: Bearer <llave>"`.
3. La rutina usa el conector como cualquier chat: `vista_previa`, y `aplicar` con `confirmado_por`
   (quién tocó ✅) y `pedido`.

La llave vale como su admin, con permiso de cambiar (como una conexión con `edicion`: la creaste
para eso) y los mismos controles en cada pedido (sigue en `ADMINS`, los interruptores), hasta que se revoque o pase un año. La tarjeta muestra cuándo se usó por última vez.
Hasta 5 vigentes por admin.

## Cómo funciona

```
claude.ai ──POST /mcp (sin token)──▶ 401 + WWW-Authenticate: resource_metadata=…/.well-known/oauth-protected-resource/mcp
          ──GET  /.well-known/oauth-protected-resource/mcp  ──▶ { resource: …/mcp, authorization_servers: [sitio] }
          ──GET  /.well-known/oauth-authorization-server    ──▶ endpoints, PKCE S256, cliente público
          ──POST /mcp/registro (redirect_uris de Claude)     ──▶ { client_id: "kinkyvibe-claude" }
navegador ──GET  /mcp/autorizar?…&code_challenge=…           ──▶ login de GitHub si hace falta → «¿Conectar Claude?»
          ──POST «Permitir»                                  ──▶ 303 a claude.ai/api/mcp/auth_callback?code=…&state=…&iss=…
claude.ai ──POST /mcp/token (code + code_verifier)           ──▶ token de acceso (1 h) + de renovación (20 h)
          ──POST /mcp (Authorization: Bearer …)              ──▶ initialize, tools/list, tools/call
```

- **Protocolo**: MCP sobre «Streamable HTTP» (versión `2025-11-25`; acepta también `2025-06-18` y
  `2025-03-26`), hecho a mano en `src/lib/server/mcp/rpc.js`: JSON-RPC, un mensaje por POST,
  respuesta en JSON, sin sesiones ni SSE (`GET /mcp` da 405, como permite la especificación). El SDK
  oficial de TypeScript está pensado para Node (Express y sus transportes); para cuatro
  herramientas de lectura no hacía falta sumar una dependencia.
- **Permisos** (gorrite, 3/11): dos scopes de OAuth, `lectura` y `edicion` (`SCOPES` en
  `oauth.js`). El `WWW-Authenticate` del 401 y los metadatos (`scopes_supported`) anuncian los dos
  (`scope="lectura edicion"`). Si Claude pide `edicion`, la pantalla «¿Conectar Claude?» dice que
  va a poder **leer y cambiar** (y, si los cambios están apagados en el sitio, que va a poder cuando
  se prendan); si pide solo `lectura` o no manda `scope`, que no puede cambiar nada. El permiso
  queda en el código y en los tokens, y se mantiene al renovar; un scope desconocido vuelve a
  Claude con `invalid_scope`. `vista_previa` y `aplicar` solo aparecen (y solo andan) con un
  token con `edicion` **y** los dos interruptores prendidos; con uno de solo `lectura`, Claude
  recibe «Esta conexión solo tiene permiso de lectura…». Las **llaves para rutinas** (`kvc1_…`)
  cuentan como con `edicion`: le admin las crea a propósito, para rutinas que cambian cosas. Las
  conexiones de antes de este cambio tienen solo `lectura`: para cambiar hay que volver a
  conectar el conector en Claude.
- **OAuth 2.1 sin guardar tokens** (`src/lib/server/mcp/oauth.js`): el código y los tokens son JSON
  firmados con HMAC-SHA256 con una clave al azar que se crea sola en `ticket_settings`
  (`mcp_oauth_clave`, como los links firmados). El código vale 60 s y un solo uso; cada token de
  renovación, un solo uso (se rota en cada renovación). El «un solo uso» se anota en `rate_limits`
  (tope 1 en una ventana de 24 h, por eso la renovación vence a las 20 h). Si un token de
  renovación se usa dos veces, se cierran todas las conexiones de ese admin. «Cerrar mis
  conexiones» guarda `mcp_desde:<id de GitHub>` en `ticket_settings`.
- **Clientes**: el registro dinámico (RFC 7591) no guarda nada: si las direcciones de vuelta son
  las de Claude (`https://claude.ai/api/mcp/auth_callback`, la de claude.com, o
  `http://localhost:<puerto>/callback` y `http://127.0.0.1:<puerto>/callback` para Claude Code),
  devuelve siempre `kinkyvibe-claude`. Cualquier otra vuelta se rechaza, también en
  `/mcp/autorizar`, que entonces muestra el error en el sitio y no vuelve a ningún lado. No se
  anuncian documentos de cliente (CIMD): habría que ir a buscar URLs de terceros.
- **El POST de tokens** llega de los servidores de Claude como formulario, sin `Origin`: el Worker
  le pone el del sitio para que el chequeo CSRF de SvelteKit no lo rechace
  (`src/lib/server/mcp/tokenPost.js`, como la baja en un clic). Esa ruta no mira cookies.
- **Límites**: 60 pedidos por minuto por admin en `/mcp`; 60 por minuto por conexión en
  `/mcp/token` y 30 por hora en `/mcp/registro` (todo Claude sale de pocas IPs de Anthropic,
  `160.79.104.0/21`, así que son generosos).

## Dónde está el código

| Qué                                   | Dónde                                                                                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth (tokens, PKCE, vueltas, cortes) | `src/lib/server/mcp/oauth.js`                                                                                                                                                                   |
| Protocolo MCP (JSON-RPC)              | `src/lib/server/mcp/rpc.js`                                                                                                                                                                     |
| Herramientas de lectura               | `src/lib/server/mcp/tools.js`                                                                                                                                                                   |
| Cambios (vista previa y aplicar)      | `src/lib/server/mcp/edicion.js`, `cambios.js`, `objetos.js`, `editarPost.js`, `editarEvento.js`, `editarMaterial.js`, `editarPerfil.js`, `editarEtiqueta.js`, `borradores.js`, `crearCodigo.js` |
| Historial y deshacer                  | `src/lib/server/mcp/historial.js`; la versión con relaciones en `src/lib/server/contenido/revisions.js`                                                                                         |
| Llaves para rutinas                   | `src/lib/server/mcp/llaves.js`, Ajustes → Admins                                                                                                                                                |
| Rutas                                 | `src/routes/mcp/` (`+server.js`, `token`, `registro`, `autorizar`) y `src/routes/.well-known/`                                                                                                  |
| Interruptor, límites, respuestas      | `src/lib/server/mcp/http.js`, `conector_claude` en `src/lib/server/flags.js`                                                                                                                    |
| Cortar conexiones                     | Ajustes → Admins (`src/routes/(authed)/admin/ajustes/admins/`)                                                                                                                                  |
| POST de tokens sin `Origin`           | `src/lib/server/mcp/tokenPost.js`, `worker/index.js`                                                                                                                                            |

## Cómo probar

```sh
CONECTOR_CLAUDE_ENABLED=1 npm run dev:tickets   # admin falso: la pantalla de permiso no pide login
```

Con un cliente de prueba (un script con `fetch`): `POST /mcp/registro` con
`redirect_uris: ["http://localhost:9999/callback"]`, abrir `/mcp/autorizar?…` con un
`code_challenge` S256, mandar el formulario «Permitir» (`POST /mcp/autorizar?/permitir` con
`accept: text/html`) y leer el `code` del `Location`, `POST /mcp/token`, y después `initialize`,
`tools/list` y `tools/call` contra `/mcp` con `Authorization: Bearer …`. Sin token, con uno
inventado o con el de renovación en lugar del de acceso: 401. Con
`ADMIN_DEV_MOCK_LOGIN=AlguienQueNoEsAdmin`: la pantalla de permiso da 403. Sin el interruptor:
todo 404. El chequeo CSRF de SvelteKit no corre en `vite dev`: el POST de tokens sin `Origin` se
prueba en un preview.

Los cambios: con `CONECTOR_CLAUDE_EDICION_ENABLED=1` también, `vista_previa` y `aplicar` sobre un
evento de la semilla; después, la pestaña Editar muestra «Claude, confirmado por …». Deshacer:
`historial` del mismo evento, `vista_previa` con `operacion: deshacer` y `aplicar`; el texto
vuelve a ser el de antes. Las pruebas: `src/lib/server/mcp/*.test.js` (`deshacer.test.js`: deshacer,
cada tipo, los borradores y lo que no se hace) y `src/lib/server/db/migration0073.test.js`.

## Lo que viene

- Si hace falta ver y cortar cada conexión por separado (no solo «todas las mías»), una tabla de
  conexiones: migración aparte.
