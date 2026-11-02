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
  **cambiar** algunas cosas, siempre en dos pasos (ver [Cambios](#cambios)).
- Es la parte 1 y 2 de tres (plan: `conector-claude-lectura`, `conector-claude-edicion`); lo de
  plata (`proto-conector-claude`) va después. Decisión [0003](decisiones/0003-superadmins-y-permisos.md):
  «Claude puede operar el panel con un conector, siempre con permiso».

## Lo que nunca se tiene que romper

- **Nunca una llamada sin token válido de admin.** `/mcp` contesta 401 a cualquier pedido sin un
  token de acceso firmado por el sitio, para `/mcp`, sin vencer, de un id que siga en `ADMINS` y
  emitido después de su último «Cerrar mis conexiones». Le admin de prueba ([demo.md](demo.md))
  solo puede autorizar en un preview, nunca en producción.
- **Leer no cambia nada.** Las herramientas de lectura no escriben nada (salvo el registro en
  Actividad y el límite de pedidos) y van marcadas `readOnlyHint`.
- **Cambiar, solo lo que el panel ya hace y por su mismo código**, nunca SQL a mano: el editor de
  eventos (acción «Guardar» de la pestaña Editar) y el alta de códigos (Ventas → Códigos). Con su
  validación, el control de que nadie guardó en el medio, el historial y lo que sigue a un
  guardado (lugar, lista de espera, aviso de cambio de fecha).
- **Lo que se aplica es exactamente lo que se vio**: `aplicar` no guarda si lo que había cambió
  desde la vista previa o si las entradas no son las mismas.
- **Sin SQL ni ids en las entradas.** Las herramientas reciben texto, un slug o un nombre; el
  servidor resuelve. Si un nombre coincide con varios, devuelve las opciones para volver a pedir.
- **Las reglas de privacidad del panel**: el DNI nunca sale (ni los últimos 3), ni el id del pago
  de Mercado Pago, ni las notas internas de una orden, ni las respuestas de inscripción. De los
  datos de un objeto se sacan las claves sensibles (las mismas que saca Actividad,
  `sanitizeDetail`). Los mails de amigues son públicos a propósito (decisión 0010), como en el
  panel.
- **Una sola migración** (`0072`): las llaves para rutinas y «confirmado por» en el historial. La
  lectura no la necesita.

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
   «¿Conectar Claude?» dice qué va a poder leer y a dónde vuelve (`claude.ai`). «Permitir».
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
| `leer`             | `nombre` (slug o nombre); opcional `tipo`                                                                                             | todos los campos del objeto (los públicos y los del panel, sin claves sensibles), quién y cuándo lo creó y editó, sus relaciones y sus enlaces; o las opciones si hay varios.                                                                                                  |
| `ventas`           | `evento` (slug o nombre); opcional `estado` (todas, aprobadas, pendientes, reembolsadas, vencidas, canceladas) y `limite` (hasta 500) | el resumen de la pestaña Ventas (vendidas, reservadas, cupo, recaudado, neto sin la comisión de MP, Fondo, por tipo, órdenes por estado) y las órdenes: referencia `KV-…`, nombre, pronombres, mail, tipo, cantidad, total, código, medio, estado, fecha y cuántes ingresaron. |
| `eventos_proximos` | opcional `dias` (hasta 365) y `limite`                                                                                                | los eventos desde hoy: slug, título, fechas, lugar, si está oculto, sin publicar o es borrador, y si vende entradas, vendidas, reservadas y cupo.                                                                                                                              |

Fuera de `vite dev`, los eventos de prueba de la venta (`prueba-entradas-*`) no aparecen, como en
el buscador del panel. Cada herramienta anota en Actividad `conector.<herramienta>` con un resumen
(«Claude: miró las ventas de «…»»), sin datos de compradores. Autorizar (`conector.autorizar`) y
cerrar conexiones (`conector.cerrar`, `conector.cerrar_todes`) también quedan.

## Cambios

Con `conector_claude` y `conector_claude_edicion` prendidos aparecen dos herramientas más. Todo
cambio va en dos pasos: `vista_previa` muestra exactamente qué va a cambiar (lo que el bot del
equipo muestra para pedir el ✅) y `aplicar` lo guarda, con las mismas entradas más la huella y la
versión de la vista previa. En un chat con une admin pueden ir una atrás de la otra; lo que importa
es que `aplicar` nunca guarda algo distinto de lo que alguien vio.

| Herramienta    | Qué recibe                                                                                                       | Qué devuelve                                                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vista_previa` | `operacion`, `evento` (slug o nombre), `cambios`                                                                 | `resumen` (el antes y después en un texto corto), `cambios` (`[{ campo, antes, despues }]`), `avisos`, `hash`, `version`, `objetivo`, `titulo`, `enlaces`. No guarda nada.           |
| `aplicar`      | lo mismo, más `hash` y `version` de la vista previa; opcional `confirmado_por` (hasta 40) y `pedido` (hasta 500) | `aplicado: true`, `resumen`, `avisos`, `confirmado_por`, `enlaces`; o `aplicado: false` con `motivo` (`cambió`, `no coincide`, `tope por día`, `el panel no lo guardó`) y `mensaje`. |

Operaciones:

- **`editar_evento`** (`evento` obligatorio). `cambios`, alguno de: `titulo`; `inicio` y `fin`
  (`AAAA-MM-DDTHH:MM`, hora de Argentina; `fin` vacío saca la hora de fin; si cambia `inicio` sin
  `fin`, el fin se mueve igual, como en el editor); `lugar` (nombre o slug de un lugar que ya
  existe; vacío, sin lugar); `descripcion` (el texto en markdown; no en un evento con HTML libre);
  `precios` (`[{ tipo, precio }]`: el nombre de un tipo de entrada con precio fijo y el precio en
  pesos; las tandas, la gorra, el cupo y lo demás de la venta, desde el panel); `visibilidad`
  (`listado` o `no_listado`, el «No listado» del editor).
- **`crear_codigo`** (`evento` opcional: sin él, vale para todos). `cambios`: `codigo`, `tipo`
  (`porcentaje` o `monto`), `valor`, y si hace falta `desde`, `hasta` (`AAAA-MM-DDTHH:MM`),
  `usos_maximos`, `entradas_maximas`. Los mismos campos y la misma validación que el formulario.

Lo que no está (el estado del evento, sus etiquetas, la imagen, las personas, borradores nuevos):
desde el panel.

- **La huella** (`hash`) cubre la operación, el objetivo, las entradas ya normalizadas (con los
  nombres resueltos en el servidor) y la versión de lo que había; la firma el servidor con su
  clave. La **versión** de un evento es la de su texto y su lugar; la de un código, «nuevo».
- **«Confirmado por»**: el historial del objeto guarda quién guardó (le admin dueñe de la conexión),
  que fue por Claude y quién lo confirmó; la pestaña Editar del evento muestra «Última edición: …,
  Claude, confirmado por Mel (autorizó @login)», o solo «Claude» si no vino `confirmado_por` (el
  chat de le propie admin). En Actividad: `conector.aplicar`, a nombre de le admin, con «Claude,
  confirmado por Mel: editó el evento «…» (título, precio de «General»)». El texto del `pedido` no
  se guarda en Actividad. Cada vista previa queda también (`conector.vista_previa`).
- **Tope por día**: 50 cambios aplicados en las últimas 24 horas, entre todes (se cambia con la
  variable `CONECTOR_CLAUDE_CAMBIOS_POR_DIA`). Al llegar, `aplicar` contesta «Se llegó al tope de
  50 cambios por día del conector de Claude…» y no guarda nada. Las vistas previas no cuentan.

## Rutinas que corren solas

La conexión de claude.ai vence (si no se usa en 20 horas, o a los 30 días), y una rutina programada
no puede volver a tocar «Permitir». Para eso están las **llaves para rutinas**:

1. En el sitio: Ajustes → Admins → «Llaves para rutinas» → nombre (p. ej. «Rutinas de mi compu»)
   → «Crear llave». Se muestra **una sola vez**: copiala.
2. En la compu de la rutina (Claude Code):
   `claude mcp add --transport http kinkyvibe https://kinkyvibe.ar/mcp --header "Authorization: Bearer <llave>"`.
3. La rutina usa el conector como cualquier chat: `vista_previa`, y `aplicar` con `confirmado_por`
   (quién tocó ✅) y `pedido`.

La llave vale como su admin, con los mismos controles en cada pedido (sigue en `ADMINS`, los
interruptores), hasta que se revoque o pase un año. La tarjeta muestra cuándo se usó por última vez.
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

| Qué                                   | Dónde                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| OAuth (tokens, PKCE, vueltas, cortes) | `src/lib/server/mcp/oauth.js`                                                                  |
| Protocolo MCP (JSON-RPC)              | `src/lib/server/mcp/rpc.js`                                                                    |
| Herramientas de lectura               | `src/lib/server/mcp/tools.js`                                                                  |
| Cambios (vista previa y aplicar)      | `src/lib/server/mcp/edicion.js`, `cambios.js`, `editarEvento.js`, `crearCodigo.js`             |
| Llaves para rutinas                   | `src/lib/server/mcp/llaves.js`, Ajustes → Admins                                               |
| Rutas                                 | `src/routes/mcp/` (`+server.js`, `token`, `registro`, `autorizar`) y `src/routes/.well-known/` |
| Interruptor, límites, respuestas      | `src/lib/server/mcp/http.js`, `conector_claude` en `src/lib/server/flags.js`                   |
| Cortar conexiones                     | Ajustes → Admins (`src/routes/(authed)/admin/ajustes/admins/`)                                 |
| POST de tokens sin `Origin`           | `src/lib/server/mcp/tokenPost.js`, `worker/index.js`                                           |

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
evento de la semilla; después, la pestaña Editar muestra «Claude, confirmado por …». Las pruebas:
`src/lib/server/mcp/*.test.js`.

## Lo que viene

- Crear borradores con el mismo par vista previa y aplicar (`conector-claude-borradores`).
- Si hace falta ver y cortar cada conexión por separado (no solo «todas las mías»), una tabla de
  conexiones: migración aparte.
