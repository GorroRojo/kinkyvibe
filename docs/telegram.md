# Bot de Telegram

Decisión: [0029](decisiones/0029-bot-de-telegram.md). Es otra **vista** del sitio, no un reemplazo:
el sitio sigue siendo lo que encuentra la gente, el CMS y el lugar donde se paga. El bot lee los
mismos datos y manda un link para todo lo demás.

## Qué hace: navegación por pantallas

Decisiones [0029](decisiones/0029-bot-de-telegram.md) y [0034](decisiones/0034-bot-seguir-y-token.md).

- **`/start` (o `/inicio`) es el inicio**: un mensaje con botones `Hoy · Semana · Finde` /
  `🔎 Buscar · ⭐ Lo que sigo` / `📚 Material · 📖 Kinkipedia` / `👥 Amigues · 🔁 Series` (las
  secciones del sitio, abajo) / `💗 Fondo · ❓ Ayuda` / `📅 Calendario` (la Mini App, solo en
  privado) · `Abrir kinkyvibe.ar ↗`. «Lo que sigo» y «🎟 Mis entradas» (en su fila, abajo de
  «Buscar») solo aparecen con «Lo que sigo» prendido. Para les admins con el Telegram vinculado,
  suma «🚪 Puerta» (abajo, «La puerta por Telegram») y «📊 Estado · 🔔 Mis avisos» (abajo, «Estado
  y avisos para admins»).
  `/inicio` es lo mismo que `/start` sin nada, por el mismo camino del router (`/start <código>` y
  `/start adm_<código>` siguen vinculando; `/inicio <algo>` no vincula nada).
- **Cada botón cambia ese mismo mensaje** (no manda otro). Las listas van de a 5 con
  «‹ 2/3 ›» (el del medio es un botón deshabilitado, Bot API 10.3) e «🏠 Inicio»; la tarjeta de un
  evento, «‹ 2/7 ›» entre los eventos de la lista, «‹ Volver» (a la página de la lista que lo
  tiene) e «🏠 Inicio».
- **Los comandos son atajos a las mismas pantallas** (no hay dos lógicas): `/inicio`, `/hoy`,
  `/semana`, `/finde`, `/proximos`, `/evento [texto]`, `/buscar`, `/fondo`, `/ayuda`, `/sigo`,
  `/entradas`. `/hoy`,
  `/semana` y `/finde` siguen siendo hoy, los próximos 7 días y el finde (viernes a domingo), en
  hora de Argentina (`windows.js`).
- **La tarjeta de un evento**: foto (la imagen destacada, como URL absoluta) o, sin token o en
  grupos, vista previa grande del link del evento; el título; la fecha con la entidad `date_time`
  (Bot API 9.5: Telegram la muestra en el idioma y la hora de quien lee; adentro va el texto en
  castellano para las apps viejas); el lugar **solo como lo muestra la página pública del evento**
  (`feedVenues` + `eventPlace`: un lugar oculto dice «Lugar a confirmar», nunca la dirección) y
  los botones:
  - «🎟 Comprar en el sitio» (verde, Bot API 9.4) a `/calendario/<evento>/entradas`, o el estado de
    la venta deshabilitado («Agotadas», «Abre el 5/10»), igual que las tarjetas del calendario;
    sin entradas acá, «Abrir en el sitio»;
  - «📅 Agregar al calendario» (link de Google Calendar con título, fecha, link y el lugar público;
    sin fin cargado, 2 horas);
  - «🗺 Cómo llegar», solo si la página muestra el mapa (`googleMapsLink` del lugar o el
    `location_map` del evento);
  - «⭐ Seguir» (abajo).
- **Buscar** busca en **todo el sitio** (eventos, material, Kinkipedia, series y amigues), con el
  mismo índice y el mismo orden que el buscador del sitio (`/api/search-index.json`, ver «Modo
  inline» abajo): solo lo que ve une visitante sin cuenta.
  - «🔎 Buscar» manda un mensaje nuevo que abre «responder» (`force_reply`, Bot API 10.3) con
    «Cancelar»; la respuesta trae los resultados. `/buscar <texto>` los trae directo (también en
    grupos; en un grupo, `/buscar` solo explica `/buscar cuerdas`).
  - La lista va de a 5, cada cosa con el ícono de su tipo (📅 evento, 📚 material, 📖 Kinkipedia o
    serie, 👥 amigues), «‹ 2/3 ›», «🔎 Buscar otra cosa» e «🏠 Inicio».
  - Tocar un resultado abre su tarjeta: un evento próximo, la tarjeta de siempre; lo demás (y un
    evento que ya pasó), una **tarjeta compacta**: título, una o dos líneas (el resumen, o el tipo
    de perfil), la foto achicada si hay y se puede, «Ver en el sitio», «‹ Volver» (a esa página de
    resultados) e «🏠 Inicio». La lista y la tarjeta (`siteScreens.js`) son las mismas de las
    secciones (abajo).
  - **Sin resultados** (`noResults.js`, `searchSuggest.js`), en lugar de solo «No encontré nada»,
    en este orden y corto para un teléfono:
    1. **Parecidos** («¿Quisiste decir…?»): hasta 3 botones «🔎 <búsqueda> (<cuántas>)» que buscan
       eso (`q:0:<texto>`). Salen del mismo índice y el mismo buscador del sitio (`search`,
       `editDistance`): lo buscado con cada palabra cambiada por la más parecida de un título o una
       etiqueta (más tolerante que el buscador, que ya perdona un error: 1 letra en palabras de 3
       o 4, 2 hasta 7, 3 desde 8), cada palabra sola si eran varias («cuerdas zzz» → «cuerdas»), una
       etiqueta usada con nombre o alias parecido y, si lo buscado es una etiqueta del árbol
       (`resolveTag`, con alias y sin tildes), primero sus hijas, relacionadas y madres. Solo se
       ofrece lo que trae algo.
    2. **La sección más cercana**: donde está la mayoría de lo de esa etiqueta (y sus parientes) o
       de la primera sugerencia, con el botón de la sección del inicio (ya filtrada por la
       etiqueta si está en esa sección, `c:<s>:0:<etiqueta>`). Si son eventos, «📅 Calendario»: la
       Mini App en privado, la lista de próximos en un grupo.
    3. **Lo que viene**: los 3 próximos eventos del índice, con la línea de la lista de resultados.
    4. **«⭐ Seguir <etiqueta>»** si lo buscado es una etiqueta (que todavía no tiene nada público),
       solo por chat privado y con «Lo que sigo» prendido (en un grupo no aparece). Es el mismo
       `follow` que «Seguir» en una tarjeta (seguir.js, con sus topes y «Algo nuevo» por Telegram,
       0036). El botón (`sf:<etiqueta>:<texto>`) vuelve a buscar lo mismo y saca la etiqueta **de
       lo buscado**: uno armado a mano no puede seguir otra cosa, y si la búsqueda ya trae algo
       contesta «Eso ya no está disponible.». Sin chat vinculado, cómo conectarlo; después de
       seguirla, el botón queda «✓ Ya seguís <etiqueta>».
    - Siempre «🔎 Buscar otra cosa · 🏠 Inicio». Si no hay nada para ofrecer, el mensaje de siempre y
      lo que viene.
    - El árbol de etiquetas llega por `inline.tags` (`siteTagManager`); si falla, sugiere igual sin
      parientes ni «Seguir». **No se guarda ni se loguea quién buscó ni qué** (lo prueba
      `router-sin-resultados.test.js`).
  - `/evento <texto>` sigue siendo **solo de eventos próximos** (título, dirección o fecha).
- **Las secciones del sitio** (`sections.js`): «📚 Material», «📖 Kinkipedia», «👥 Amigues» y
  «🔁 Series» en el inicio. Cada una es una lista de a 5 con «‹ 2/7 ›» (cada cosa con su línea,
  como en Buscar), «🏷 Filtrar por etiqueta» e «🏠 Inicio»; tocar algo abre la tarjeta compacta
  de Buscar con «‹ Volver» (a esa página, con su etiqueta) e «🏠 Inicio».
  - **Qué muestra**: lo mismo que Buscar, del índice público de la búsqueda (`inlineSource.js`):
    nada oculto, «solo con cuenta», sin aprobar, no listado ni borrado. Amigues deja afuera además
    los lugares no listados que el índice tiene porque se llega desde un evento (como `/amigues`).
    Series deja afuera las series sin ediciones (ningún evento del índice con su etiqueta: no hay
    nada para mostrar), como la lista de series de `/wiki`; Buscar las sigue encontrando.
    Ningún evento (para eso, Hoy, Semana, Finde y el calendario).
  - **Orden**, como el sitio: el material del más nuevo (`/material`); amigues y las series por
    nombre (`/amigues`, `/wiki`); la Kinkipedia, en el orden del árbol de etiquetas de `/wiki`
    (abajo).
  - **La Kinkipedia, por las ramas del árbol de etiquetas** (como `/wiki`): arriba, las ramas de
    arriba de todo que tienen algo («📂 Prácticas», con cuántas cosas tiene adentro) y las entradas
    sueltas; tocar una rama muestra su entrada (si tiene) y lo de adentro, con «‹ Volver» a la rama
    madre. Las ramas van en el mismo orden que en `/wiki` (las hijas de cada etiqueta, `children`,
    como las ordena el panel), no por nombre, también al pasar de página; después, por nombre, las
    otras entradas de esa etiqueta y, arriba de todo, las sueltas. Una rama se ve si tiene una
    entrada o alguna hija (o nieta…) la tiene; una etiqueta con dos madres está en las dos. Cada
    entrada cuelga de su etiqueta (si dos son de la misma, la de su página es la de la rama y la
    otra va adentro). La tarjeta vuelve a la rama de la que vino. En vez de «🏷 Filtrar por
    etiqueta»: las ramas son el filtro. El árbol sale de `publicSearchIndex` (`tags`) y
    `makeInlineSource` lo pasa como `tree` (madres, nombre e hijas en orden de cada etiqueta); sin
    árbol, la lista por nombre de antes. Textos: «📂 {rama}» (el título y el botón) y «Adentro:
    {cantidad}», en «Secciones del sitio».
  - **Filtrar**: las etiquetas más usadas de esa sección (las que tienen al menos 2 cosas, hasta
    8, dos por fila, con cuántas), «✖ Sin filtro» para sacarla y «‹ Volver». Si la sección no tiene
    etiquetas para ofrecer, el botón no aparece.
  - Un botón viejo o armado a mano solo abre algo **de la lista de esa sección** (y una etiqueta,
    solo si está en esa sección); si no, «Eso ya no está disponible.» y no cambia el mensaje.
  - Solo aparecen con el índice (el webhook siempre lo pasa); en grupos andan igual (efímeros, sin
    fotos), porque es todo público.
- **`/fondo`**: cuánto juntó el Fondo este mes, la meta y el descuento de este mes en las
  entradas. Solo lectura, con la memoria de `tickets/fondoMonth.js` (10 minutos, último valor
  guardado) y solo los campos de `/api/porcentaje` (issue #265); nada de quiénes aportan ni de
  propinas.
- Nada de estado en la base: el botón lleva todo. Un botón viejo (también los `ev:`/`ls` de antes)
  sigue andando; si el evento ya no está entre los próximos públicos, contesta «Ese evento ya no
  está disponible.» y no cambia el mensaje.

### El `callback_data` de cada botón (`nav.js`, hasta 64 bytes)

| Pantalla                                                             | `callback_data`                  |
| -------------------------------------------------------------------- | -------------------------------- |
| Inicio                                                               | `h`                              |
| Lista (`d` hoy, `w` semana, `f` finde, `p` próximos; página desde 0) | `l:<v>:<p>`                      |
| Tarjeta (`v`: a qué lista vuelve; `n`: al inicio)                    | `e:<id>:<v>`                     |
| Buscar / Cancelar                                                    | `s` / `sx`                       |
| Lo que sigo / Fondo / Ayuda                                          | `g` / `fo` / `a`                 |
| Seguir: opciones / seguir una                                        | `f:<id>` / `fy:<id>:<etiqueta>`  |
| Buscar en todo el sitio: resultados (página `p`)                     | `q:<p>:<texto>`                  |
| Buscar en todo el sitio: una cosa (vuelve a la página `p`)           | `r:<hash>:<p>:<texto>`           |
| Buscar sin resultados: seguir la etiqueta buscada                    | `sf:<etiqueta>:<texto>`          |
| Una sección (`s`: `m`, `w`, `a`, `s`; página `p`; etiqueta opcional) | `c:<s>:<p>[:<etiqueta>]`         |
| Las etiquetas de una sección (la elegida, opcional)                  | `ct:<s>[:<etiqueta>]`            |
| Una cosa de una sección (vuelve a la página `p`, con su etiqueta)    | `cd:<s>:<hash>:<p>[:<etiqueta>]` |
| Mis entradas (`u` próximas, `o` pasadas; página `p`)                 | `t:<v>:<p>`                      |
| Una entrada (vuelve a esa lista)                                     | `tk:<hash>:<v>`                  |
| Contador (no hace nada)                                              | `x`                              |
| Admins: Estado, la lista (página `p`) / un evento                    | `ax:<p>` / `ae:<hash>`           |
| Admins: Mis avisos / prender o apagar uno                            | `an` / `an:<k>`                  |

`id` es la dirección del evento si es simple y tiene hasta 40 bytes; si no, `#<hash>`.
`<etiqueta>` es un hash corto del nombre, que se busca entre las etiquetas de ese evento.
En la búsqueda, `<texto>` es lo buscado recortado a 40 bytes (así cada botón repite la misma
búsqueda) y `<hash>` un hash corto de la dirección de la cosa, que se busca **entre los resultados
de ese texto**: un botón armado a mano no puede abrir nada que no esté en el índice público.
En las secciones, `<s>` es `m` material, `w` Kinkipedia, `a` amigues o `s` series; `<hash>` se
busca **entre lo de esa sección** y `<etiqueta>` (hash corto de su id), entre sus etiquetas. En la
Kinkipedia, `<etiqueta>` es la **rama** abierta (el mismo hash, entre las ramas con algo adentro):
un botón de filtro de antes abre esa rama si existe, o contesta «Eso ya no está disponible.». El más
largo (`cd:m:<7>:<999>:<7>`) tiene 24 bytes. Los de admins viven aparte (`adminNav.js`, abajo).
En Mis entradas, `<hash>` es un hash corto del id de la entrada, que se busca **solo entre las
entradas de la cuenta vinculada a ese chat**: un botón armado a mano con el de otra entrada
contesta «Esa entrada ya no está acá.», lo mismo que un botón viejo. El botón nunca lleva el
token.

**Deep links** (`t.me/<bot>?start=…`, solo `A-Za-z0-9_-`): `hoy`, `semana`, `finde`, `proximos`,
`ev-<id>` (la tarjeta), `seguir-<id>`, `sigo`, `mis-entradas`, `fondo`, `buscar`, `inicio`
(`mis-entradas` y no `entradas`: 8 letras se leería como un código de vincular). El código de vincular
(8 letras y números) sigue entrando por `?start=<código>`; un deep link conocido de 8 letras
(`proximos`) se mira antes y no cuenta como código (los códigos nunca llevan I ni O).

### Con token y sin token

- **Con `TELEGRAM_BOT_TOKEN`** (0034): el webhook contesta 200 enseguida y llama a la API en
  `waitUntil` (`run.js`, siempre por `callTelegramApi`, que nunca muestra el token). Así el botón
  deja de «cargar» apenas cambia la pantalla, las tarjetas pueden ir con foto (texto → foto con
  `editMessageMedia`; de foto a texto se borra y se manda de nuevo) y se sabe si algo falló:
  - 429 (demasiado rápido): el botón contesta «Más despacio 🙂» y no se reintenta;
  - «message is not modified»: se ignora;
  - si una edición falla (mensaje borrado, muy viejo, foto que Telegram no pudo bajar), se manda
    la pantalla de nuevo o la tarjeta sin foto, una sola vez.
- **Sin token**: como antes, un solo método en el mismo pedido; tarjetas con vista previa grande.

### Grupos y efímeros

En un grupo el bot muestra **solo lo público** (lo mismo que el sitio sin sesión) y no necesita
ser admin (con el modo privacidad de fábrica solo ve los comandos y las respuestas a él).

- **Comandos efímeros** (Bot API 10.2): en los grupos los comandos se registran con
  `is_ephemeral` (alcance `all_group_chats`). Si alguien manda `/semana` así, la respuesta también
  es efímera (`ephemeral_message_parameters` + `reply_parameters.ephemeral_message_id`, dentro de
  los 15 segundos): **solo la ve quien preguntó**. Sus botones cambian solo su vista
  (`editEphemeralMessageText`).
- **Un comando común** (app vieja o escrito a mano): una sola respuesta pública. Tocar un botón de
  esa respuesta **no la edita para todes**: manda un efímero en su lugar solo para quien tocó
  (`replace_callback_query_message`, Bot API 10.3).
- **Si un efímero no se puede** (la app no los soporta, pasaron los 15 segundos): lo más privado
  posible, contestar el botón con el link al chat privado con el bot (con token; sin token no se
  puede saber que falló).
- En grupos no hay fotos (un efímero de foto no puede volver a texto), ni «Buscar» con
  `force_reply`, ni nada de cuentas: «Lo que sigo» y «Seguir» son links al chat privado.
- Telegram avisa que un efímero puede no llegar y desaparecer: por eso nada personal en
  efímeros, aunque los vea una sola persona.

### «Seguir» y «Lo que sigo» (0034)

La primera acción que escribe. Solo con «Lo que sigo» prendido y **por chat privado vinculado a
una cuenta** (mirado en cada mensaje):

- «⭐ Seguir» en una tarjeta muestra las etiquetas y series de ese evento que se pueden seguir
  (hasta 5, primero las series; las que ya sigue, deshabilitadas). Tocar una la sigue por el mismo
  camino que el botón del sitio (`resolveTag` + `follow` de `sigo/follows.js`), con sus topes y
  sus opciones por defecto (calendario y mail de lo nuevo), **más «Algo nuevo» por Telegram**
  ([0036](decisiones/0036-seguir-en-el-bot-prende-avisos.md)): el aviso del botón suma «Te aviso
  por acá cuando haya algo nuevo. Podés apagarlo en Mi rincón.». No los prende si el chat está en
  `/silenciar` ni si ya lo seguía (sus opciones quedan como estaban: la base no distingue «nunca
  lo tocó» de «lo apagó»). Seguir desde el sitio no los prende; dejar de seguir no apaga nada más.
  El resto de los avisos y dejar de seguir, en Mi rincón → Lo que sigo.
- `/sigo` y «⭐ Lo que sigo»: los nombres de lo que sigue la cuenta.
- Sin chat vinculado: explica cómo conectarlo. En un grupo: link al privado
  (`?start=seguir-<id>` o `?start=sigo`), sin mirar ninguna cuenta.
- Como en el sitio, no va al registro de actividad del panel (lo que sigue cada cuenta es
  privado); queda una línea en el log sin cuenta ni etiqueta.

### «🎟 Mis entradas»

Las entradas de la cuenta vinculada, con **el mismo QR** que su página (`/entradas/t/<token>`) y
el mail: el que escanea la puerta. Solo lectura, con «Lo que sigo» prendido y **por chat privado
vinculado** (mirado en cada mensaje), como «Lo que sigo» (`tickets.js` lee, `misEntradas.js` arma
las pantallas).

- **Cuáles**: las de las compras **aprobadas** de la cuenta, con las mismas reglas que Mi rincón
  (`ordersForAccount`: compradas con la cuenta o con su mail verificado; una gratis pedida sin la
  sesión de esa cuenta, solo después de «Sí, son mías» en Mi rincón). Nada de reservas por
  transferencia, reembolsadas ni de otras cuentas. Una consulta para las compras y una para todas
  sus entradas.
- **La lista** (`/entradas`, «🎟 Mis entradas» del inicio, `?start=mis-entradas`): de a 5, agrupadas
  por evento (la fecha, el título y cuántas entradas hay), un botón por entrada («🎟 <nombre> ·
  <evento>»), «‹ 2/3 ›», «🕘 Pasadas» (o «🎟 Próximas») e «🏠 Inicio». Una entrada queda en
  «próximas» hasta 12 horas después del fin de su evento (o del comienzo, sin fin): así se puede
  mostrar en la puerta con el evento empezado. Las pasadas, de la más reciente, hasta 30.
  **Talleres en varias partes** con una sola entrada ([talleres-partes.md](talleres-partes.md)):
  la entrada vale para todas, así que queda en «próximas» hasta 12 horas después de la última
  parte (sin las canceladas); la lista y la tarjeta muestran la fecha de la parte que toca, con
  «· Parte 2 de 3», y la lista se ordena por esa fecha (`partsCoveredBy` decide qué partes cubre,
  la misma regla que la lista de partes de los mails).
- **La tarjeta**: el QR **como foto**, el evento, la fecha (`tg-time`), el nombre y los pronombres
  de la entrada, el tipo, el código corto («ABC 234», para dictarlo si el QR no se lee) y si es
  válida o ya se usó (cuándo). Botones: «🔗 Ver la entrada» (su página), «‹ 2/3 ›» entre las
  entradas de esa lista, «‹ Volver» (a la página de la lista que la tiene) e «🏠 Inicio». Nunca el
  DNI ni los datos de quien compró.
- **El QR**: el servidor lo arma con lo mismo que la página y el mail (`qrcode-generator`, puro
  JS, anda en Workers; `qrPng` en `tickets/qr.js` lo da como PNG en blanco y negro) con el mismo
  texto (`<sitio>/entradas/t/<token>`, que `extractToken` de la puerta entiende) y lo **sube** con
  `sendPhoto` / `editMessageMedia` (`attach://qr`, multipart en `callTelegramApi`). Se sube y no
  se manda la URL de `/entradas/t/<token>/qr.gif` porque Telegram trata distinto un GIF por URL y
  así no depende de que Telegram pueda bajar nada del sitio. Necesita el token del bot; **sin
  token** (o si Telegram rechaza la foto) la tarjeta sale como texto y «Ver la entrada» abre la
  página con el QR.
- **Online**: sin QR (como su página y el mail); el link de la transmisión está en la página de la
  entrada.
- **Sin vincular**: cómo conectar la cuenta, con «Abrir Mi rincón → Lo que sigo». **En un grupo**:
  «Esto se hace por chat privado…» y el link `?start=mis-entradas`, sin mirar ninguna cuenta.
- **Privacidad**: el token de una entrada va solo en la foto y en el link de su tarjeta, por el
  chat privado de esa cuenta (como el mail); nunca en un log ni en un `callback_data`. Pruebas:
  `router-entradas.test.js` (botones armados a mano, grupos, interruptores) y
  `entradas-privacy.test.js` (con la base: otra cuenta, mail sin verificar, reembolsadas, cuenta
  borrada).
- **Textos**: en «Textos del bot», sección «Mis entradas», con sus vistas previas.

### La Mini App del calendario (`/telegram/app`)

El calendario del sitio en formato compacto para abrir adentro de Telegram, **sin login**: los
próximos eventos públicos por día, con el lugar público y el estado de la venta (las mismas
funciones que `/calendario`).

- Carga `telegram-web-app.js` como dicen las docs y usa los colores del tema de Telegram
  (`--tg-theme-*`, con los del modo claro de respaldo). En un navegador común también anda.
- «📲 Agregar a la pantalla de inicio» (`addToHomeScreen`, Bot API 8.0) solo si Telegram dice que
  se puede y todavía no está.
- Los links (el evento, comprar) se abren en el navegador, afuera de Telegram (`openLink`): pagar
  sigue en el sitio, con Mercado Pago.
- Se abre con el botón «📅 Calendario» del inicio (solo en privado: `web_app` no anda en grupos).
  El botón de menú del bot sigue siendo la lista de comandos.
- **Textos**: en «Textos del bot», sección «Mini App del calendario», con su vista previa
  (aproximada: es una página, no un mensaje). Van sin formato. La página los lee una vez por
  pedido (`miniAppTexts` en `miniapp.js`); como la página se guarda hasta 5 minutos
  (`max-age=300`), un cambio puede tardar eso en verse. Los estados de la venta («Agotadas»…) son
  los del sitio (`ticketCta`).
- Con `telegram_enriquecido`: «📤 Mandar a un chat» en cada evento y el link directo a un evento
  (abajo, «Mensajes enriquecidos y compartir»).

## Textos del bot (lo edita el panel)

Pedido de gorrite (11/10): «¿Dónde puedo editar el wording de todas las cosas del bot?». En
**Ajustes › Comunicación › Textos del bot** (`/admin/ajustes/textos-bot`, solo admins) está todo
lo que dice el bot: los mensajes, los botones, los avisos que salen al tocar un botón y las
descripciones del menú «/». Como «Vistas previas al compartir» y las plantillas de los mails: cada
texto con su original, «Volver al texto original», sus variables (chips que se suman donde está el
cursor) y una vista previa que imita un mensaje de Telegram con sus botones (salta a la pantalla
del campo que tocás). Cada guardado queda en Actividad (`settings.save`, `telegram_bot_texts`) con
**solo las claves** que cambiaron, nunca el texto.

- **Dónde está cada cosa**: los originales, qué es cada uno, sus variables y la validación, en
  `src/lib/utils/botTexts.js` (secciones Inicio y menú, Comandos, Eventos, Seguir y avisos,
  Vincular cuenta, Puerta, Secciones del sitio, Mis entradas, Mini App del calendario, Mensajes
  enriquecidos y compartir, y Errores). El bot pide cada texto con `botText(clave, variables)`
  (`src/lib/server/telegram/texts.js`); no queda texto para la gente escrito en las pantallas.
- **Dónde se guarda**: en `ticket_settings`, la fila `telegram_bot_texts` (un JSON con solo los
  cambiados), como `link_preview_texts`. Sin tabla nueva ni migración.
- **Una lectura por pedido**: el webhook lee la fila una vez, después de chequear el secreto, y
  corre el pedido entero (también lo que sigue en `waitUntil`) con esos textos
  (`runWithBotTexts`, `AsyncLocalStorage`, como `contenido/author.js`). El cron los lee una vez
  por corrida para los avisos de Lo que sigo y para el menú «/». Si no se pueden leer, los
  originales.
- **Sin nada cambiado, el bot dice lo mismo que antes, byte a byte**: `bot.golden.json` se sacó
  del código de antes y `texts-golden.test.js` compara cada pantalla, respuesta, aviso y comando.
- **Formato**: en los mensajes, texto común, `**negrita**` y `[texto](https://…)`; todo lo demás
  se escapa para el HTML de Telegram (`/vincular <código>` sale tal cual) y algo que parece HTML
  (`<b>`) no se puede guardar. Los botones, los avisos de un botón y los comandos van sin formato.
  Las variables van con una llave (`{evento}`); una que no existe, una llave suelta o un `**` sin
  cerrar no se pueden guardar (el error dice cuál y cuáles se pueden usar). El valor de una
  variable nunca se vuelve formato ni link. Algunas tienen que quedar (`{evento}` en «Ver: …»).
- **Límites de Telegram**: botones 64 bytes (los emojis y las tildes ocupan más), avisos de un
  botón 200 caracteres (el de «Seguir» sigue acortando el nombre para entrar, #290), comandos 256 y
  mensajes 4096. El `callback_data` de los botones no depende del texto: cambiar un botón no rompe
  los mensajes viejos.
- **Comandos**: lo que registra el menú «/» (`setMyCommands`) son las descripciones de acá. Como
  cambian el hash del registro, el cron las registra solo en la próxima corrida (hasta 15
  minutos); «Actualizar comandos del bot» las registra ya.
- **Buscar**: la respuesta se reconoce por el mensaje de Buscar; vale el original y el de ahora,
  así cambiarlo no rompe los que ya se mandaron.
- Lo que sigue en el código: los datos (títulos, fechas, lugares, links), los símbolos de las
  flechas («‹ 2/3 ›»), el «✓ » de la etiqueta elegida, los íconos de cada tipo en las listas
  (📅 📚 📖 👥) y el « ↗» que se suma en los grupos. La página de la puerta no es un mensaje del
  bot: sus textos siguen en su página. Los de la Mini App del calendario sí están (arriba), y los
  de «📤 Mandar a un chat» en la sección «Mensajes enriquecidos y compartir».
- **Buscar en todo el sitio y el modo inline** (#298) y **las secciones** tienen sus secciones en
  el registro («Buscar en todo el sitio y modo inline», «Secciones del sitio»). Los primeros se
  pasaron con la misma prueba: sus casos se agregaron a `bot.golden.json` con el código de antes y
  no cambiaron al pasarlos. «‹ Volver», «🏠 Inicio» y «🔎 Buscar otra cosa» son los mismos de
  siempre.
- **Buscar sin resultados**: sus textos nuevos («¿Quisiste decir…?», el botón de cada parecido,
  la línea y el botón de «Seguir», «Mientras tanto, lo que viene» y el botón del modo inline con
  una búsqueda parecida) están en «Buscar en todo el sitio y modo inline», con su vista previa. El
  «⭐ Seguir» ya seguido usa el de Seguir («✓ Ya seguís …») y la sección, los botones del inicio. En
  `bot.golden.json` cambió a propósito un solo caso (`router: sitio: /buscar nada`), que ahora
  suma lo que viene.

## Modo inline

En **cualquier chat** (también uno donde el bot no está), escribir `@<bot> <texto>` muestra lo que
coincide de todo lo público del sitio; elegir un resultado manda una tarjeta compacta en ese chat.
Código: `inline.js` (la respuesta, funciones puras) e `inlineSource.js` (de dónde sale).

- **Qué busca**: lo mismo que el buscador del sitio, con su mismo índice
  (`publicSearchIndex` en `src/lib/server/search/publicIndex.js`, el de `/api/search-index.json`,
  armado una vez por cambio de la base y compartido con el endpoint) y su mismo orden (`search` +
  `groupHits`: próximos eventos, series, material, amigues, Kinkipedia, eventos pasados).
- **Prefijos** (opcionales): `evento:`, `material:`, `wiki:` (o `kinkipedia:`, con las series),
  `serie:`, `amigues:`. Con prefijo y sin texto: todo lo de ese tipo (los eventos, solo los
  próximos; el material, del más nuevo).
- **Sin texto**: los próximos eventos (del más cercano) y después 5 materiales recientes.
- **Cada resultado**: título (con el ícono de la etiqueta en la Kinkipedia y las series), una
  descripción (la fecha y la zona en los eventos; el resumen en el material y la Kinkipedia; el
  tipo de perfil en amigues) y la miniatura si hay.
- **La miniatura** es siempre chiquita (160 × 160, JPEG, por las transformaciones de imágenes de
  Cloudflare: `/cdn-cgi/image/width=160,height=160,fit=cover,…/media/img/…`), **nunca la imagen
  entera**: sin `onerror=redirect`, si no se puede achicar no hay miniatura. Solo en producción
  (`kinkyvibe.ar`, la zona con transformaciones); en un preview o en local, sin miniaturas. Cada
  miniatura distinta cuenta una vez por mes en el cupo de 5000 (docs/compartir.md): son unas
  pocas cientos. La foto de la tarjeta compacta del chat (Buscar) es la misma idea, de 480 px.
- **La tarjeta que se manda**: el título en negrita y una o dos líneas; en un evento, como la
  tarjeta del bot: la fecha (`tg-time`), el lugar como lo muestra la página (`feedVenues` +
  `eventPlace`) y el estado de la venta si no se puede comprar. Botones: «Ver en el sitio» y, si el
  evento vende entradas acá y están a la venta, «🎟 Entradas». Solo botones con link (un botón de
  pantalla no anda en un mensaje inline). HTML escapado (`parse_mode: HTML`). Arriba del texto va
  la vista previa del link de la página (su imagen para compartir), chica y al costado, como cuando
  une usuarie la achica al mandar un link (`link_preview_options` con `prefer_small_media` y
  `show_above_text`; gorrite, 12/10). La tarjeta del bot en su chat sigue con la grande. Sin
  https, apagada.
- **`answerInlineQuery`**: `InlineQueryResultArticle` con `thumbnail_url`, 20 por página con
  `next_offset` (hasta 200 en total), `cache_time` 120 segundos e `is_personal: false` (es lo
  mismo para todes). Sin resultados, un botón arriba («No encontré nada. Probá en el bot») que abre
  el bot en privado en Buscar (`start_parameter=buscar`). Si hay una búsqueda parecida que trae
  algo (las mismas de Buscar sin resultados, `searchSuggest.js`, con el mismo prefijo), se muestran
  sus resultados y el botón dice «Nada para «querdaz». Te muestro «cuerdas»».
- **Privacidad**: solo lo que hay en el índice público (ni oculto, ni «solo con cuenta», ni sin
  aprobar, ni no listado, ni borrado; los links a cosas no públicas ya se filtran en los metadatos,
  #291). Lo de más (imagen, fecha, tipo de perfil, lugar y venta) se busca solo para las direcciones
  que ya están en el índice, y el lugar de un evento, con las funciones de su página: nunca la calle
  de un lugar que la oculta. Pruebas: `inline-privacy.test.js` (con la base).
- **Interruptor**: con `telegram_bot` apagado el webhook contesta 200 sin leer nada, también a los
  `inline_query`.
- **Barato**: cada consulta usa el índice ya armado; entre consultas se reusa por 60 segundos sin
  mirar la base; por página, una lectura de los lugares y una de la venta (recordada 30 segundos)
  para todos los eventos juntos. Un tope **en memoria** de 30 consultas por minuto por persona (un
  tope en D1 sería una escritura por letra); pasado, no contesta. Telegram además manda una
  consulta por pausa al escribir y guarda la respuesta 120 segundos.
- **Textos**: en «Textos del bot», sección «Buscar en todo el sitio y modo inline».

### Puesta en marcha del modo inline (la hace gorrite)

1. En @BotFather: `/setinline`, elegir el bot y poner el placeholder **«Buscá en Kinky Vibe…»**.
   (`/setinlinefeedback` no hace falta para el modo inline; solo para contar los resultados
   mandados en las estadísticas de uso, abajo.)
2. Volver a registrar el webhook para que pida los `inline_query`: desde tu compu,
   `TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… npm run telegram:webhook` (los mismos valores
   que en Cloudflare; el script los lee de variables de entorno, nunca los muestra, y al final
   imprime la dirección y los `allowed_updates` que quedaron). Si el webhook se había registrado
   sin `allowed_updates`, Telegram ya manda los `inline_query`, pero registrarlo así deja la lista
   explícita. Cada vez que cambie `WEBHOOK_ALLOWED_UPDATES`, repetir este paso.
3. Probar en cualquier chat: `@<bot>` (los próximos eventos), `@<bot> cuerdas`, `@<bot> wiki:`.

## Mensajes enriquecidos y compartir

Pedido de gorrite (Mesa, 12/10): «Mensajes enriquecidos + compartir desde la Mini App». Detrás del
interruptor **Telegram: mensajes enriquecidos y compartir** (`telegram_enriquecido`,
`TELEGRAM_ENRIQUECIDO_ENABLED`), apagado (0001), que además pide el bot prendido. Apagado, todo
sale como antes, byte a byte (la golden no cambia).

### Mensajes enriquecidos (Bot API 10.1–10.3)

Los «rich messages» de Telegram (`sendRichMessage`, `editMessageText` con `rich_message`,
`InputRichMessageContent` en el modo inline; nombres sacados de core.telegram.org/bots/api, 10.3
del 24/8/2026) dejan mandar un mensaje armado por bloques. El bot los usa para que **se lea el
contenido adentro del chat**, sin salir de Telegram (`rich.js`, funciones puras):

- **Qué va**: el título (con su ícono), el resumen en itálica, el texto en párrafos, la fecha
  (`tg-time`), el lugar y la venta en un evento, y un pie chiquito («Kinkipedia · Kinky Vibe»). Si
  el texto se cortó, «Esto es el comienzo. El resto está en el sitio…». Los botones son los de
  siempre: «Ver en el sitio» (y «🎟 Entradas»).
- **De dónde sale**: del índice público de la búsqueda, lo mismo que Buscar y el modo inline: el
  título, el resumen y el cuerpo **en texto plano y recortado** (hasta 2500 caracteres en material
  y Kinkipedia, 400 en eventos: `BODY_MAX` de `siteIndex.js`). Por eso no hay títulos ni listas
  adentro del texto, y un material largo se lee hasta ahí. Nada que no esté ya en el índice o en
  la tarjeta de siempre; el lugar, como la página del evento.
- **Dónde**: en el **modo inline** (Kinkipedia, series, material y eventos; amigues sigue con la
  tarjeta) y en la **tarjeta compacta** del chat (Buscar y las secciones), por chat privado. En
  el modo inline no hay foto (Telegram solo acepta archivos ya subidos); en el chat, la foto
  achicada arriba (`<figure><img>`).
- **Solo con el token**: así hay vuelta atrás. Si Telegram rechaza el enriquecido (una app que no
  lo soporte, una foto que no pudo bajar), sale la tarjeta de siempre, una sola vez: en el modo
  inline, la misma respuesta con las tarjetas de texto; en el chat, la pantalla de texto
  (`deliver.js`). Sin token, en los grupos y en los efímeros, la de siempre.
- **«📅 Abrir en el calendario»**: un evento mandado por el modo inline o desde la Mini App suma
  ese botón, el link directo a la Mini App en ese evento (abajo). Solo con
  `TELEGRAM_BOT_USERNAME`.
- **Sin confirmar**: cómo se ve un enriquecido en una app de Telegram vieja. Por eso el
  interruptor: prenderlo primero en un preview y mirarlo en un par de celus.

### Compartir desde la Mini App del calendario

- **«📤 Mandar a un chat»** en cada evento (solo adentro de Telegram, con el interruptor y el
  token). La Mini App manda su `initData` y la dirección del evento a `/telegram/app/compartir`; el
  servidor valida el `initData` (`initData.js`), busca el evento **en el índice público** (y que no
  haya empezado), arma **la misma tarjeta del modo inline** (enriquecida si se puede) y la guarda
  con `savePreparedInlineMessage` (Bot API 8.0) para ese usuario de Telegram. La Mini App abre el
  selector de chats de Telegram con `shareMessage(id)`: la persona elige a quién mandarla. En una
  app vieja (antes de la 8.0) o si falla, abre el modo inline del bot en el chat que se elija
  (`switchInlineQuery("evento: <título>")`).
- No se guarda nada de nadie: el id del usuario va solo en ese pedido a Telegram. Un tope de 30
  por hora por persona (la tabla de topes, que se limpia sola). Sin interruptor, sin token o sin
  base, la ruta da 404.
- **Link directo a un evento**: `t.me/<bot>?startapp=ev-<id>` (el mismo id que los deep links del
  bot, `miniAppEventLink` en `inline.js`) abre la Mini App con ese evento marcado y a la vista
  («📌 Te pasaron este evento»). Telegram lo pasa como `tgWebAppStartParam` (y `start_param` en el
  `initData`); la página lo compara con el de cada evento que muestra (`share.js`), así que un link
  armado a mano no muestra nada que la página no muestre. **Necesita la Main Mini App registrada en
  @BotFather** (paso 6 de la puesta en marcha).
- «Compartir en tu historia» (`shareToStory`): no (gorrite, 12/10).
- **Textos**: en «Textos del bot», sección «Mensajes enriquecidos y compartir desde la Mini App»,
  con su vista previa (la Kinkipedia y un evento como mensaje enriquecido, y la Mini App).

### Puesta en marcha (la hace gorrite)

1. Tienen que estar `TELEGRAM_BOT_TOKEN` y `TELEGRAM_BOT_USERNAME` (los mismos de siempre).
2. Registrar la **Main Mini App** en @BotFather (paso 6 de abajo) con la URL
   `https://kinkyvibe.ar/telegram/app`: sin eso, «📅 Abrir en el calendario» no abre la Mini App.
3. Prender **Telegram: mensajes enriquecidos y compartir** primero en un preview, y probar en dos
   celus (uno con la app al día y otro más viejo): `@<bot> wiki: <algo>`, Buscar → abrir una
   entrada, y en la Mini App «📤 Mandar a un chat» y tocar «📅 Abrir en el calendario» en lo que
   llegó. Después, en producción.
4. Para cortarlo de golpe: `TELEGRAM_ENRIQUECIDO_ENABLED=0` o apagar el interruptor.

## El menú de comandos (autocompletado)

Cuando alguien escribe «/», Telegram sugiere los comandos que se le registraron con
`setMyCommands`. La lista vive en **un solo lugar**, `src/lib/server/telegram/commands.js`: de ahí
salen lo que entiende el router y lo que se registra (un test, `commands.test.js`, chequea que
coincidan).

- **Para todes** (alcance `default`): `/inicio` (primero), `/proximos`, `/hoy`, `/semana`,
  `/finde`, `/evento`, `/buscar` («Buscá en todo el sitio: eventos, material, Kinkipedia y
  amigues»), `/fondo`, `/ayuda`.
- **En grupos** (alcance `all_group_chats`): los mismos, **efímeros** (`is_ephemeral`).
- **En chats privados** (alcance `all_private_chats`): esos y, solo con «Lo que sigo» prendido,
  `/vincular`, `/sigo`, `/entradas`, `/silenciar`, `/reanudar`, `/desvincular`.
- `/start` y `/help` funcionan pero no van en el menú: en su lugar están `/inicio` (lo mismo que
  `/start` sin nada) y `/ayuda`. Sin `language_code`.

**Se registran solos**: el cron de cada 15 minutos (`/api/cron/recordatorios`,
`commandsSync.js`) arma las listas, les saca un hash y lo compara con el último registrado
(`ticket_settings`, clave `telegram_commands_sync`). Si cambió (otra lista en el código, o se
prendió o apagó «Lo que sigo») y está el token, manda los tres `setMyCommands`, guarda el hash y
lo anota en el registro de actividad (`telegram.commands`, «automático»). Si Telegram falla, lo
loguea sin el token y no guarda el hash: se reintenta en la próxima corrida. Sin token, no hace
nada. **Ya no hace falta tocar el botón después de cada deploy.**

El botón **Actualizar comandos del bot** (Ajustes → Automatizaciones → tarjeta **Bot de
Telegram**, solo admins) queda para registrarlos ya: hace lo mismo, lo anota con quién fue y
guarda el mismo hash. La tarjeta muestra «Último registro: <fecha> (automático/manual)». No hace
falta `/setcommands` en @BotFather (se pisa).

**Después de mergear un cambio en la lista** (por ejemplo, cuando se sumó `/inicio`): no hace
falta hacer nada. El hash de la lista cambia y el cron la registra en los 15 minutos siguientes
(el botón queda por si se quiere ya). En la app de Telegram puede hacer falta cerrar y abrir el
chat para ver el menú nuevo.

## Fase 2: vincular la cuenta y avisos de «Lo que sigo»

Detrás de **dos** interruptores: `telegram_bot` y `lo_que_sigo` (las cuentas ya no tienen
interruptor). Con cualquiera apagado no se ve nada de Telegram en Mi rincón, el bot contesta «Todavía no se puede conectar una
cuenta con el bot» y el cron no manda nada por Telegram. Trae la migración
`0033_telegram_avisos.sql`.

### Vincular

1. En **Mi rincón → Lo que sigo**, la tarjeta **Telegram** tiene «Conectar Telegram». Da un código
   de 8 caracteres (`ABCD-2345`), al azar, **de un solo uso**, que **vence en 15 minutos**. Se
   guarda solo su hash (SHA-256); pedir otro anula el anterior.
2. La persona le manda al bot, **por chat privado**, `/vincular ABCD-2345`. Si está cargada la
   variable `TELEGRAM_BOT_USERNAME`, la tarjeta tiene además «Abrir el bot en Telegram»
   (`t.me/<bot>?start=<código>`), que manda el código solo (llega como `/start <código>`).
3. El chat queda vinculado a la cuenta. Un chat es de una sola cuenta y una cuenta tiene un solo
   chat: vincular de nuevo reemplaza el anterior. Si la cuenta estaba en `/silenciar`, **sigue en
   silencio** (pausar es apagarlos a propósito, como en
   [0036](decisiones/0036-seguir-en-el-bot-prende-avisos.md)): volver a vincular, desde el mismo
   chat u otro, no los prende. `/desvincular` borra el chat, así que vincular después empieza de
   cero. El silencio de otra cuenta que tenía ese chat no pasa a la que lo vincula.

En grupos el bot **no** vincula ni toca nada de cuentas (contesta que se hace por chat privado).
Los intentos de `/vincular` se topean por chat (10 por hora) y pedir códigos, por cuenta (10 por
hora). Para vincular no se guarda nada del perfil de Telegram, solo el id del chat (las
estadísticas de uso, abajo, guardan aparte el nombre y el @usuario de quien usa el bot). Borrar la
cuenta borra el chat vinculado y sus códigos.

### Comandos de la cuenta (solo por chat privado)

- `/vincular <código>`: conecta este chat.
- `/silenciar`: pausa **todos** los avisos por Telegram (lo elegido en Lo que sigo queda) hasta
  `/reanudar`.
- `/reanudar`: vuelve a mandarlos.
- `/sigo`: lo que sigue la cuenta (y «⭐ Seguir» en las tarjetas, arriba).
- `/entradas`: las entradas de la cuenta, con el QR («🎟 Mis entradas», arriba).
- `/desvincular`: desconecta el chat. También se puede desde la tarjeta («Desconectar Telegram»).
  «Salir en todos lados» en Mi rincón también lo desconecta (`unlinkAccount`).

### Los avisos

En Lo que sigo, la grilla de avisos tiene la columna **Telegram** (`notifyChannels` en
`src/lib/utils/sigo.js`):

- sin el bot: «Próximamente», como antes;
- con el bot y sin chat vinculado: apagada, «Sin conectar», con una nota que manda a la tarjeta;
- con el chat vinculado: «Algo nuevo» y «Recordatorio» por Telegram, por cada cosa seguida
  (columnas `tg_new` y `tg_reminder` de `follows`, apagadas por defecto; seguir desde el bot
  prende «Algo nuevo», 0036).

Los manda el mismo cron que los mails de Lo que sigo (`src/lib/server/sigo/notify.js`, cada 15
minutos), con estas reglas:

- **Uno por cuenta, evento, tipo y canal**: `follow_notifications` tiene ahora la columna
  `channel` (`mail` o `telegram`) en la clave. La fila se toma antes de mandar; si Telegram falla,
  se suelta y se reintenta en la próxima corrida.
- **Horario de silencio**: entre las 23 y las 9, hora de Argentina, no sale nada por Telegram ni
  se toma ninguna fila. Lo pendiente sale en la primera corrida desde las 9 (el recordatorio sale
  igual si el evento todavía no empezó). Los mails no esperan.
- **Algo nuevo** solo de eventos que el cron vio **después** de vincular el chat (así conectar
  Telegram no manda una tanda de todo lo ya anunciado).
- El mensaje lleva **solo título, fecha y link**: nada del lugar ni de qué más sigue la cuenta.
- Si Telegram dice que el chat ya no recibe (bloqueó al bot o borró el chat), se desvincula.
- Hasta 50 por corrida, aparte de los mails.
- Para mandar hace falta el token del bot (`TELEGRAM_BOT_TOKEN`). **Sin el token, los avisos por
  Telegram se saltean** con una línea en el log (`falta TELEGRAM_BOT_TOKEN`); el resto sigue.

## Lo que nunca se tiene que romper

- **Sin reglas propias de visibilidad.** Buscar en todo el sitio, las secciones y el modo inline
  muestran solo lo del índice público de la búsqueda (`inlineSource.js` → `publicSearchIndex`). Lo demás, solo lo
  que le da `src/lib/server/telegram/events.js`, que es el único lugar que sabe cómo se leen los eventos
  (con `sitePosts` de `src/lib/server/contenido/posts.js`: de la base o de los `.md`, según
  `contenido_db`). No armar consultas propias ni leer los `.md` o la base desde otro lado.
- **Nada oculto, no listado ni ya empezado.**
- **Sin datos de compradores ni de lugares con dirección privada** (0005, 0007, 0029): el lugar de
  una tarjeta sale de las mismas funciones que la página pública del evento.
- **Nada personal en grupos** (tampoco en efímeros) ni sin chat vinculado; «Seguir» es lo único
  que escribe (0034).
- El secreto del webhook se chequea **antes** que el interruptor y en tiempo constante.
- Todo texto del bot, en español rioplatense con el lenguaje inclusivo del sitio.
- **Las estadísticas de uso nunca guardan qué miró o buscó cada persona** (0045): quién y cuánto
  en una tabla, qué se usa sumado por semana en otra, sin ninguna clave ni hora fina en común.

## Cómo está armado

| Archivo                                       | Para qué                                                            |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `src/routes/api/telegram/+server.js`          | La ruta del webhook: junta secreto, interruptor y eventos           |
| `src/lib/server/telegram/webhook.js`          | Verifica el secreto, lee el update y contesta (probable sin Svelte) |
| `src/lib/server/telegram/router.js`           | Interpreta el comando o el botón y elige la respuesta               |
| `src/lib/server/telegram/nav.js`              | El `callback_data` de las pantallas y los deep links                |
| `src/lib/server/telegram/screens.js`          | Las pantallas (texto y botones), funciones puras                    |
| `src/lib/server/telegram/navigate.js`         | Qué pantalla va para cada botón                                     |
| `src/lib/server/telegram/siteScreens.js`      | Buscar en todo el sitio: la lista por tipo y la tarjeta compacta    |
| `src/lib/server/telegram/sections.js`         | Las secciones del sitio: listas, etiquetas y su tarjeta, puras      |
| `src/lib/server/telegram/inline.js`           | El modo inline (`answerInlineQuery`), funciones puras               |
| `src/lib/server/telegram/inlineSource.js`     | De dónde sale lo que busca el bot: el índice público y sus extras   |
| `src/lib/server/search/publicIndex.js`        | El índice público de la búsqueda, armado y recordado (con el sitio) |
| `src/lib/server/telegram/updates.js`          | Los `allowed_updates` del webhook (`npm run telegram:webhook`)      |
| `src/lib/server/telegram/deliver.js`          | Cómo se manda: editar, foto, efímero en grupos                      |
| `src/lib/server/telegram/run.js`              | Con token: llama a la API (429, «not modified», fallback)           |
| `src/lib/server/telegram/seguir.js`           | «Seguir» y «Lo que sigo» desde el bot (0034)                        |
| `src/lib/server/telegram/tickets.js`          | Mis entradas: las entradas de la cuenta vinculada (la base)         |
| `src/lib/server/telegram/misEntradas.js`      | Mis entradas: la lista y la tarjeta con el QR, funciones puras      |
| `src/lib/server/telegram/adminNav.js`         | Admins (0041): los botones de «📊 Estado» y «🔔 Mis avisos»         |
| `src/lib/server/telegram/adminBot.js`         | Admins (0041): las pantallas, funciones puras                       |
| `src/lib/server/telegram/adminData.js`        | Admins (0041): quién es admin, el estado (cantidades), Mis avisos   |
| `src/lib/server/telegram/miniapp.js`          | La Mini App del calendario (`/telegram/app`)                        |
| `src/lib/server/telegram/rich.js`             | Los mensajes enriquecidos (Bot API 10.1), funciones puras           |
| `src/lib/server/telegram/share.js`            | Compartir desde la Mini App y el link directo a un evento           |
| `src/routes/telegram/app/compartir/`          | `savePreparedInlineMessage` para «📤 Mandar a un chat»              |
| `src/lib/server/telegram/uso.js`              | Estadísticas de uso: qué se escribe en cada tabla, retención        |
| `src/lib/server/telegram/usoUpdate.js`        | Estadísticas de uso: quién mandó el update, comando, pantalla       |
| `src/lib/server/telegram/usoPanel.js`         | Estadísticas de uso: lo que lee el panel (con el umbral)            |
| `src/lib/server/telegram/commandsSync.js`     | El registro automático del menú «/» (cron)                          |
| `src/lib/server/telegram/commands.js`         | La lista de comandos y el `setMyCommands` del menú «/»              |
| `src/lib/server/telegram/keyboards.js`        | Los botones de antes (`ev:`/`ls`), que siguen andando               |
| `src/lib/server/telegram/format.js`           | Los textos (HTML de Telegram), funciones puras                      |
| `src/lib/server/telegram/texts.js`            | «Textos del bot»: lo cambiado en el panel, `botText`, una lectura   |
| `src/lib/utils/botTexts.js`                   | «Textos del bot»: originales, formato, variables y validación       |
| `src/lib/server/telegram/events.js`           | De dónde salen los eventos (el único lugar para cambiar)            |
| `src/lib/server/flags.js`                     | El interruptor `telegram_bot` (`TELEGRAM_BOT_ENABLED`)              |
| `src/lib/server/telegram/link.js`             | Fase 2: códigos de un solo uso y chats vinculados                   |
| `src/lib/server/telegram/send.js`             | Llamar a la API (`TELEGRAM_BOT_TOKEN`): avisos del cron y comandos  |
| `src/lib/server/telegram/quiet.js`            | Fase 2: el horario de silencio (23 a 9, hora de Argentina)          |
| `src/lib/server/telegram/web.js`              | Fase 2: los dos interruptores y lo que necesita Mi rincón           |
| `src/lib/components/sigo/TelegramCard.svelte` | Fase 2: la tarjeta «Telegram» de Lo que sigo                        |
| `src/routes/(content)/mi-rincon/telegram/`    | Fase 2: las acciones de la tarjeta (`?/codigo`, `?/desconectar`)    |

Sin token, el webhook **contesta en el mismo pedido** (un método de la API como respuesta). Con el
token (0034), llama a la API en `waitUntil`. El token también lo usan el cron (avisos y comandos)
y el botón «Actualizar comandos del bot»; todo pasa por `send.js` (`callTelegramApi`), el único
lugar que llama a la API de Telegram. Nunca se loguea ni se devuelve la URL (lleva el token) y los
errores se muestran sin él.

## Puesta en marcha (la hace gorrite)

1. Crear el bot con @BotFather (un bot propio de la comunidad, no el de avisos personales).
2. Elegir un secreto largo (16 caracteres o más) y cargarlo como secret `TELEGRAM_WEBHOOK_SECRET`
   en Cloudflare (nunca en el repo).
3. Apuntar el webhook del bot a `https://kinkyvibe.ar/api/telegram` con `setWebhook`, pasando ese
   mismo valor como `secret_token` y los `allowed_updates` del código: desde tu compu,
   `TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… npm run telegram:webhook`
   (`scripts/telegram-webhook.js`, con `WEBHOOK_ALLOWED_UPDATES` de
   `src/lib/server/telegram/updates.js`: `message`, `callback_query`, `inline_query`,
   `chosen_inline_result`). El token
   del bot se usa solo en ese paso y el script nunca lo muestra.
4. Prender el interruptor **Bot de Telegram** en Ajustes → Interruptores.
5. Con el token cargado (fase 2, abajo), los comandos se registran solos en la próxima corrida
   del cron (o ya, con **Actualizar comandos del bot** en Ajustes → Automatizaciones).
6. Mini App (opcional): en @BotFather → el bot → **Bot Settings → Configure Mini App** (o «Main
   Mini App»), la URL `https://kinkyvibe.ar/telegram/app`. El botón «📅 Calendario» del inicio
   anda igual sin eso (abre la misma URL); registrarla suma el botón «Abrir» en el perfil del bot.
   **No** cambiar el botón de menú: queda la lista de comandos.
7. Modo inline: ver «Modo inline» abajo (`/setinline` en @BotFather y volver a registrar el
   webhook con `npm run telegram:webhook`).

Apagado, el endpoint contesta 200 sin hacer nada (con un error, Telegram acumularía reintentos).

### Salud del webhook

Si se rota `TELEGRAM_WEBHOOK_SECRET` (o el token) sin volver a correr `npm run telegram:webhook`,
Telegram sigue mandando el secreto viejo, cada pedido da 401 y el bot deja de contestar sin que
nadie se entere. Por eso, una vez por hora (la corrida del cron de los minutos 0 a 14), con token y
el bot prendido, el cron le pide a Telegram `getWebhookInfo` (`checkWebhookHealth` en
`src/lib/server/telegram/webhookHealth.js`). Hay problema si la URL registrada no es
`https://kinkyvibe.ar/api/telegram`, si Telegram anotó un error de entrega en las últimas 2 horas
y todavía hay mensajes esperando (un error suelto que después se entregó, como un 502 mientras se
publica el sitio, no cuenta) o si hay más de 20 mensajes esperando. El resultado queda en `ticket_settings`
(`telegram_webhook_health`: cuándo, qué pasó y el mensaje de error de Telegram, sin el token) y,
mientras el último chequeo con problema tenga menos de 3 horas, el Inicio muestra en «Para
revisar» «El bot de Telegram no está recibiendo mensajes». Se arregla volviendo a registrar el
webhook (paso 3). No llama a `setWebhook` solo: no arreglaría un secreto rotado y pisaría un
cambio de URL hecho a propósito. El log dice `[telegram] webhook: …` y la respuesta del cron suma
`telegramWebhook`.

### Fase 2 (la hace gorrite)

1. **Aplicar la migración `0033_telegram_avisos.sql` en producción y en preview antes de mergear**
   (0028): `npx wrangler d1 migrations apply <base> --remote` (el nombre de la base, de
   `npx wrangler d1 list`). Anda con el código de `main`.
2. Cargar el token del bot (el que da @BotFather) como **secret `TELEGRAM_BOT_TOKEN`** en
   Cloudflare (Worker kinkyvibe → Settings → Variables and Secrets, Production; también Previews
   Base si querés probar ahí). **Nunca en el repo.**
3. Opcional: la variable `TELEGRAM_BOT_USERNAME` (el usuario del bot, sin `@`; no es un secreto)
   para el botón «Abrir el bot en Telegram».
4. Con **Bot de Telegram**, **Lo que sigo** y **Cuentas del público** prendidos, aparece la
   tarjeta en Mi rincón → Lo que sigo. Sin el token, la vinculación anda pero los avisos por
   Telegram no salen (queda la línea en el log).

## Cómo probarlo

```bash
npx vitest run src/lib/server/telegram src/lib/utils/botTexts.test.js "src/routes/(authed)/admin/ajustes/textos-bot" src/lib/server/sigo src/lib/components/admin/telegram "src/routes/(authed)/admin/ajustes/automatizaciones" src/lib/utils/sigo-telegram.test.js "src/routes/(content)/mi-rincon/telegram"
```

Los tests usan eventos y chats inventados. Para probar a mano, un POST al endpoint con el header
`x-telegram-bot-api-secret-token` y un update de ejemplo (`{"message":{"chat":{"id":1},"text":"/proximos"}}`,
o un botón tocado: `{"callback_query":{"id":"1","data":"l:w:0","message":{"message_id":1,"chat":{"id":1}}}}`,
o el modo inline: `{"inline_query":{"id":"1","from":{"id":1},"query":"wiki: cuerdas","offset":""}}`).
Sin `TELEGRAM_BOT_TOKEN` la respuesta del POST es el método que se mandaría; con el token cargado,
no probarlo a mano contra producción (llamaría a la API de verdad).

## Decisiones (confirmadas por gorrite, 5/10)

Propuestas por Claude; **confirmado por gorrite (5/10)**: todo tal como está escrito.

- Código de 8 caracteres sin 0/O ni 1/I, 15 minutos, uno vivo por cuenta; topes de 10 intentos de
  `/vincular` por chat y 10 códigos por cuenta, por hora.
- Un chat por cuenta y una cuenta por chat: vincular de nuevo reemplaza sin preguntar.
- La tarjeta va en Lo que sigo, abajo de lo seguido; sus acciones viven en `/mi-rincon/telegram`
  (que sin JavaScript muestra la misma tarjeta), para no tocar las acciones de Lo que sigo.
- «Algo nuevo» por Telegram solo de lo visto después de vincular el chat.
- En horario de silencio no se encola nada: el cron simplemente no manda por Telegram y lo
  pendiente sale a las 9 (lo que se debe se calcula de nuevo en cada corrida).
- Si Telegram contesta 403 (bloqueó al bot), el chat se desvincula.
- Al vincular y desvincular, las casillas de Telegram elegidas en cada cosa seguida se guardan
  (desconectado no mandan nada; al reconectar vuelven).
- `/start <código>` también vincula (para el link `t.me/<bot>?start=<código>`).

## La puerta por Telegram (0037)

Les admins marcan ingresos desde Telegram, con el escáner de QR del celular. Es la segunda acción
del bot que escribe (decisión [0037](decisiones/0037-puerta-por-telegram.md)) y sale detrás del
interruptor **Puerta por Telegram** (`telegram_puerta`, `TELEGRAM_PUERTA_ENABLED`), apagado
(0001). Pide además el bot prendido (`telegram_bot`). Con cualquiera de los dos apagado:
`/telegram/puerta` y su API dan 404, el panel no deja vincular y `/start adm_<código>` contesta
que ahora no se puede.

- `/telegram/puerta` (opcional `?evento=<dirección>`): abre adentro de Telegram, se **elige el
  evento de una lista** (los de hoy, también los ya empezados, y los de los próximos 3 días; con
  uno solo hoy, queda elegido), escanea con el escáner nativo (`showScanQrPopup`) y manda cada
  código a `/telegram/puerta/api`. Fuera de Telegram no hace nada.
  - La lista la da `/telegram/puerta/eventos` (POST con el `initData`), con **los mismos permisos
    que marcar** (abajo) y de lo mismo que /admin/checkin (`listTicketedEvents` + `checkinGroup`,
    sin los online, hasta 20): solo dirección, título y comienzo (`doorEvents` en `puerta.js`).
  - `?evento=` sigue andando y gana sobre la lista. Para un evento que no está en la lista, «Otro
    evento: escribir la dirección»; si la lista no carga, queda escribirla, como antes.
- **Cómo se abre**: con el botón «🚪 Abrir la puerta» que manda el bot cuando confirma el vínculo,
  o con «🚪 Puerta» en el inicio (`/start`, `/inicio`, «🏠 Inicio»). Los dos son el mismo botón
  `web_app` a `/telegram/puerta`, solo en chat privado (`web_app` no anda en grupos).
- **«🚪 Puerta» en el inicio** solo si quien escribe es une admin vinculade (`telegram_admin_links`)
  que **sigue** en `ADMINS`, con `telegram_puerta` y el bot prendidos. Se mira solo al mostrar el
  inicio por chat privado: una consulta por id del usuario de Telegram (`botDoor` de `puerta.js`,
  la misma que usa la Mini App). Si falla, el inicio sale sin el botón. Les demás ven el inicio de
  siempre.
- En **cada pedido** el servidor (`puerta.js`): valida el `initData` (`initData.js`: HMAC-SHA-256
  con la clave `HMAC-SHA-256("WebAppData", token)`, todos los campos menos `hash` ordenados y
  unidos con `\n`, comparación en tiempo constante, `auth_date` de menos de 1 hora y no del
  futuro, sin claves repetidas); busca a le admin vinculade a ese usuario de Telegram
  (`telegram_admin_links`); y exige que ese id de GitHub **siga siendo admin** (`isAdmin` de
  `auth.js`, con `ADMINS`): sacar a alguien de la lista le corta la puerta aunque el vínculo siga
  en la base. Si no: 403 (`not_linked` / `not_admin`).
- **Vincular** (les admins entran con GitHub y no tienen cuenta pública, así que no usa
  `telegram_chats` ni Mi rincón; `adminLink.js`, migración `0050`):
  1. En el panel, Ajustes → Admins → «Tu Telegram en el bot» → **Vincular Telegram**: crea un
     código al azar (8 caracteres, 40 bits), de un solo uso, que vence en 15 minutos; se guarda
     solo su SHA-256 (`telegram_admin_link_codes`). Hay uno solo vivo por admin y un tope de 10
     por hora. Muestra el link `t.me/<bot>?start=adm_<código>` y su QR (necesita los
     interruptores `telegram_bot` y `telegram_puerta` o `telegram_admin`, y
     `TELEGRAM_BOT_USERNAME`). La confirmación del bot trae «🚪 Abrir la puerta» solo con la puerta
     prendida y «📊 Estado · 🔔 Mis avisos» solo con `telegram_admin`.
  2. El bot recibe `/start adm_<código>` **solo por chat privado** (en un grupo contesta que se
     hace por privado). Marca el código usado en la misma sentencia que lo lee, vuelve a chequear
     `isAdmin` y guarda `id de GitHub ↔ id del usuario de Telegram` (una cuenta de Telegram por
     admin y viceversa: vincular de nuevo reemplaza). Confirma en el chat. Código inválido,
     vencido o ya usado: «Ese link no sirve…». Tope de 10 intentos por hora por usuario de
     Telegram. No depende de «Lo que sigo».
  3. **Desvincular** en el mismo lugar borra el vínculo y los códigos.
  4. Vincular y desvincular quedan en Actividad (`telegram.admin_link`, `telegram.admin_unlink`).
     «Seguir» desde el bot sigue sin registro.
- Para el vínculo, de Telegram solo se guarda el id del usuario (ni nombre ni usuario). La lista
  muestra quién tiene Telegram vinculado.
- Marca con lo mismo que el modo puerta del panel (`extractToken` + `checkIn`), con el login de le
  admin; contesta solo el resultado y el nombre de la entrada. Tope de 600 escaneos por hora.
- Solo Telegram Web puede embeberla (`frame-ancestors https://web.telegram.org`).
- **Salvedades para la noche del evento** (auditoría de confiabilidad, OX3):
  - **Necesita señal en cada escaneo**: no guarda la lista ni tiene modo sin conexión. Sin red,
    cada escaneo falla.
  - **Cada hora hay que cerrarla y volver a abrirla desde el bot**: el `initData` vale una hora
    (`auth_date`, decisión 0037) y después cada escaneo contesta «Pasó más de una hora desde que
    abriste la puerta: cerrala y volvé a abrirla desde el bot».
  - Para una puerta larga o con mala señal, usá el **modo puerta del panel**
    (`/admin/eventos/<slug>/ingreso`), que guarda la lista y sigue sin conexión
    ([tickets.md](tickets.md), punto 9). La de Telegram sirve de respaldo (por ejemplo, si no se
    puede entrar con GitHub), con señal.

### Puesta en marcha de la puerta (la hace gorrite)

1. **Aplicar la migración `0050_telegram_admins_puerta.sql` en producción y en preview antes de
   mergear** (0028): `npx wrangler d1 migrations apply <base> --remote` (el nombre de la base, de
   `npx wrangler d1 list`). Solo crea dos tablas y un índice: anda con el código de `main`.
2. Tienen que estar el secret `TELEGRAM_BOT_TOKEN` (valida el `initData`) y la variable
   `TELEGRAM_BOT_USERNAME` (el link de «Vincular Telegram»), los mismos de la fase 2.
3. Prender **Puerta por Telegram** primero en un preview, con el bot prendido, y probar: vincular
   desde Ajustes → Admins, abrir la puerta con el botón del bot y escanear una entrada de prueba.
4. Después, en producción. Cada admin vincula su Telegram una vez.
5. Para cortarla de golpe: `TELEGRAM_PUERTA_ENABLED=0` en Cloudflare o apagar el interruptor.
   Sacar a alguien de `ADMINS` le corta la puerta aunque siga vinculade.

## Estado y avisos para admins (0041)

Decisión [0041](decisiones/0041-telegram-para-admins.md): lo que 0029 planeaba para organizadores,
primero para admins (después, lo mismo para organizadores con **sus** eventos). Sale detrás del
interruptor **Telegram para admins** (`telegram_admin`, `TELEGRAM_ADMIN_ENABLED`), apagado (0001),
que además pide el bot prendido. Va en tres PR:

1. La base y el estado a pedido: «📊 Estado» y «🔔 Mis avisos» (#315).
2. **(este) El resumen diario de ventas y los avisos en el momento** (cada venta, cada
   transferencia): abajo, «Los avisos que salen».
3. El día del evento (resumen) y los recordatorios (el evento de mañana, falta el lugar o el link).

**Quién**: une admin con el Telegram vinculado desde el panel (el mismo vínculo que la puerta,
`telegram_admin_links`) que **sigue** en `ADMINS`, mirado **en cada mensaje y cada botón** de
admins (`adminData.js`, `linkedBotAdmin`), solo por chat privado con esa misma persona (el id del
chat tiene que ser el del usuario). Sacar a alguien de `ADMINS` o desvincular le corta todo en el
próximo botón. A cualquier otra persona (sin vincular, en un grupo, con el interruptor apagado o si
falla la base) el bot le contesta **exactamente lo mismo que a un comando o botón que no existe**
(«No entendí…»): no dice que hay algo para admins, tampoco con un botón armado a mano
(`router-admin.test.js`).

- **Dónde**: «📊 Estado · 🔔 Mis avisos» en el inicio de une admin vinculade (por privado) y en la
  confirmación del vínculo. También `/estado` y `/avisos`, que **no** van en el menú «/» (es el
  mismo para todes; registrarlos solo para admins, con un alcance por chat, queda para después).
- **📊 Estado**: los eventos con entradas de hoy y de los próximos días (también no listados y
  cancelados, hasta 30, de a 5) → por evento:
  - vendidas contra cupo de cada tipo y, si tiene tramos, de cada tramo (marcando el que se vende
    ahora) y el total;
  - reservas sin pagar (Mercado Pago en curso o transferencias esperando; cuentan para el cupo) y
    cuántas vencen en la próxima hora;
  - transferencias por confirmar y órdenes para revisar;
  - la lista de espera (personas esperando o con oferta), solo si la tabla `waitlist_entries`
    existe (migración 0053, la lista de espera) y hay alguien; si no, esa línea no sale;
  - «🔄 Actualizar», «Ver en el panel ↗» (`/admin/eventos/<dirección>`) y «‹ Volver».
- **Solo cantidades**: las consultas son `SUM`/`COUNT` sobre `orders` (y la lista de espera); nunca
  leen nombres, mails, DNI, titulares, códigos ni tokens (`admin-privacy.test.js` llena la base con
  todo eso y revisa que no aparezca en ninguna pantalla). Lo de cada compra, en el panel.
- **🔔 Mis avisos**: cinco tipos (resumen diario, cada venta, cada transferencia, día del evento,
  recordatorios), **todos apagados al empezar**; tocar uno lo prende o lo apaga (✅/⬜). Se guarda
  por id de GitHub en `telegram_admin_notices` (migración `0054`, sin fila = apagado): volver a
  vincular no borra lo elegido. Ya salen el resumen diario, cada venta y cada transferencia (abajo);
  el día del evento y los recordatorios, con el PR 3 (la pantalla lo dice).
- Los textos están en «Textos del bot» (sección «Estado y avisos (admins)»), con sus pantallas en
  la vista previa.

### Los avisos que salen (PR 2, `adminNotify.js`)

Para todos:

- **A quién**: `noticeRecipients` en cada envío: admins con el Telegram vinculado, que **siguen** en
  `ADMINS` y prendieron ese aviso. Solo por el chat privado con esa persona (el id del chat es el
  de su usuario). Nadie recibe nada que no prendió.
- **Interruptores**: nada sale sin el bot (`telegram_bot`) y «Telegram para admins»
  (`telegram_admin`) prendidos, ni sin `TELEGRAM_BOT_TOKEN`.
- **Solo cantidades**: el título del evento, el tipo de entrada, el tramo y números. Las funciones
  que arman los textos ni reciben la orden (`orderSummary` saca cantidad, tipo y tramo), así un
  campo nuevo de la orden nunca termina en Telegram. Nada de nombres, mails, DNI, titulares ni
  códigos (`adminNotify.test.js` llena la base con todo eso y lo revisa). Cada aviso trae «Ver en
  el panel ↗» (`/admin/eventos/<dirección>`).
- **Nada dos veces**: antes de mandar se toma una fila de `telegram_admin_sent` (migración
  `0055`, clave `venta:<orden>`, `transferencia:<orden>` o `resumen:<día>:<evento>`); si Telegram
  falla se suelta (el resumen se reintenta en la corrida siguiente). Si le admin bloqueó al bot, no
  se reintenta y el vínculo sigue (lo usa la puerta). El cron borra las filas de más de 30 días.
- Los textos están en «Textos del bot» (sección «Estado y avisos (admins)»), con su vista previa.

**Resumen diario** («☀️ Resumen diario · <evento>»): el cron de cada 15 minutos
(`POST /api/cron/recordatorios`, `runAdminNoticesCron`) lo manda en su primera corrida desde las
**9 de Argentina** (`ADMIN_DAILY_HOUR`; nunca en el horario de silencio, de 23 a 9). Uno por
evento de hoy o próximo (los de «📊 Estado») **que tuvo movimiento** entre las 9 de ayer y las 9 de
hoy: entradas aprobadas o transferencias nuevas. Sin movimiento, no sale nada. Lleva:

- vendidas desde ayer a las 9 y el total contra el cupo (`23/50`, o solo el número si algún tipo no
  tiene cupo);
- transferencias nuevas desde ayer (si hay);
- reservas sin pagar y cuántas vencen en las próximas 24 horas, transferencias por confirmar,
  órdenes para revisar y la lista de espera (lo mismo que «📊 Estado»).

«Desde ayer» se cuenta con `updated_at` de las órdenes aprobadas (la tabla no guarda aparte cuándo
se aprobó): es cuando se aprobó, salvo que algo la haya vuelto a tocar después.

**Cada venta** y **cada transferencia**: en el momento, desde los flujos de compra
(`queueOrderNotice`, en segundo plano con `waitUntil`; **nunca traba ni hace fallar** una compra o
una confirmación):

- venta aprobada por Mercado Pago (`processPayment`), entrada gratis (`checkout.js`) y
  transferencia confirmada desde el panel (en el evento o en Ventas → Transferencias): «🎟 Se vendió
  1 General (Preventa 1) de **Fiesta X** · 23/50» (vendidas del tipo contra su cupo);
- orden nueva por transferencia (`checkout.js`): «💸 Transferencia para confirmar: 2 General de
  **Fiesta X** · 3 por confirmar».
- contracargo de Mercado Pago (`processPayment`, pago `charged_back`): «⚠️ Contracargo en Mercado
  Pago: orden KV-1A2B3C4D de **Fiesta X** ($ 10.000). El banco revirtió el pago; las entradas
  quedaron anuladas.» No tiene interruptor propio: les llega a quienes prendieron **«Cada
  venta»** (clave `contracargo:<orden>`, aparte de la de la venta). Solo la referencia, el evento y
  el total; nunca quién compró.
- cupo de mails de Resend terminado (el cron de 15 minutos, cuando el reintento del mail de las
  entradas recibe un 429 de cupo; `notifyMailQuota`): «📭 Resend frenó los mails por el cupo.
  Compras aprobadas que esperan el mail con sus entradas: 4. …». También a quienes prendieron
  **«Cada venta»**, como mucho uno por hora de reloj (clave `mails-cupo:<hora>`), con la cantidad de
  órdenes aprobadas de las últimas 48 h sin mail. Un 429 de tasa (demasiados por segundo) no avisa.
- Solo las del sitio (canal `online`): las de la puerta y las cargadas a mano las hace une admin.
- En el horario de silencio salen igual, pero **sin sonido** (`disable_notification`): una venta
  avisada a las 9 de la mañana ya no sirve.
- Si Telegram falla en ese momento, ese aviso no se reintenta (el resumen diario la cuenta igual).

### Puesta en marcha del estado y los avisos (la hace gorrite)

1. **Aplicar la migración `0054_telegram_admin_avisos.sql` en producción y en preview antes de
   mergear** (0028): `npx wrangler d1 migrations apply <base> --remote`. Solo crea una tabla: anda
   con el código de `main`. «📊 Estado» no la necesita; «🔔 Mis avisos», sí.
2. Prender **Telegram para admins** primero en un preview, con el bot prendido. Vincular el
   Telegram en Ajustes → Admins (anda con este interruptor o con el de la puerta), tocar «🏠 Inicio»
   en el bot y probar «📊 Estado» y «🔔 Mis avisos».
3. Después, en producción. Para cortarlo de golpe: `TELEGRAM_ADMIN_ENABLED=0` o apagar el
   interruptor.
4. PR 2: **aplicar la migración `0055_telegram_admin_enviados.sql` en producción y en preview antes
   de mergear** (0028). Solo crea una tabla: anda con el código de `main`. Después, prender
   «Resumen diario», «Cada venta» o «Cada transferencia» en «🔔 Mis avisos» y probar en un preview
   (una compra de prueba, o esperar al cron de las 9).

## Estadísticas de uso (0045)

Pedido de gorrite (12/10), decisión [0045](decisiones/0045-estadisticas-del-bot.md). Detrás del
interruptor **Telegram: estadísticas de uso** (`telegram_estadisticas`,
`TELEGRAM_ESTADISTICAS_ENABLED`), apagado (0001); necesita el bot prendido. Se ven en **Panel →
Estadísticas → Bot de Telegram** (`/admin/estadisticas/bot`, solo admins).

La regla: **nunca se puede saber qué miró o buscó una persona.** Se puede saber quién usa el bot
y cuánto (solo totales), y para qué se usa, solo sumado.

**Dos tablas que no se pueden cruzar** (migración `0057_telegram_uso.sql`):

- `telegram_uso_personas`: por persona (id de usuario de Telegram) y por día (hora de Argentina),
  `interacciones` (cuántos updates de esa persona manejó el bot), el nombre y el @usuario. **Nada
  de qué hizo**: ni tipo de acción, ni búsqueda, ni cosa, ni una hora más fina que el día.
- `telegram_uso_totales`: por semana ISO (hora de Argentina), `tipo` y `clave`, cuántas veces
  (`n`). **Ni el id de nadie, ni el día, ni la hora.**

No comparten ninguna clave (una tiene el id y no sabe qué; la otra sabe qué y no tiene id) ni una
hora fina (una tiene el día; la otra, solo la semana). Las dos son `WITHOUT ROWID`: no queda ni el
orden en que se insertaron las filas. Y en el panel, el detalle de una semana sale solo si esa
semana usaron el bot **5 personas o más** (abajo): con menos, lo contado sería de alguien de la
lista de arriba.

- **Qué es una interacción**: cada update con un usuario (que no sea un bot): un mensaje, un
  comando, un botón, una consulta inline (Telegram manda una por pausa al escribir), un resultado
  inline elegido o abrir la Mini App del calendario. La puerta (`/telegram/puerta`) no cuenta.
- **El nombre**: el `first_name` y el `username` que Telegram manda en cada update (los del último
  día del período). En el panel, si ese Telegram está vinculado a una cuenta del sitio
  (`telegram_chats`), se muestra la cuenta (su mail, con link a su ficha: las cuentas no tienen
  nombre); si es une admin vinculade (`telegram_admin_links`), su login; si no, el nombre de
  Telegram.
- **Los tipos** (`USO_TIPOS` en `uso.js`):
  - `pantalla`: la pantalla de cada botón, sin ids, hashes ni búsquedas (`list:w`, `event`,
    `section_doc:m`, `admin`…);
  - `comando`: el nombre del comando (`start`, `buscar`…; uno que no existe, `(otro)`), **nunca lo
    que viene después** (`/start <código>`, `/vincular <código>`);
  - `busqueda`: lo buscado en el bot (la respuesta a «🔎 Buscar», `/buscar <texto>`,
    `/evento <texto>`);
  - `inline`: lo buscado en el modo inline (solo la primera página: pedir «más» no es otra
    búsqueda). Las consultas que Telegram contesta desde su caché (120 segundos) no llegan al bot:
    se cuentan de menos;
  - `objeto`: una cosa abierta en el bot (la tarjeta de un evento, la tarjeta compacta de Buscar o
    de una sección), como `evento:<dirección>`, `material:…`, `wiki:…`, `serie:…` o `amigues:…`;
  - `inline_elegido`: la cosa que alguien mandó desde el modo inline (`chosen_inline_result`);
  - `miniapp`: abrir la Mini App del calendario (la página manda su `initData` a
    `POST /telegram/app/uso`, que lo valida con el token);
  - `seguir` (desde una tarjeta o desde una búsqueda sin resultados), `vincular` (una cuenta o une
    admin) y `desvincular`.
- **Lo buscado** se guarda en minúsculas, sin espacios de más y hasta 60 caracteres; vacío,
  «(vacía)».
- **Solo lo público**: una cosa se cuenta solo si está en el índice público de la búsqueda (el
  mismo del bot: nada oculto, «solo con cuenta», sin aprobar, no listado ni borrado) y el sitio la
  lista (no los lugares no listados a los que lleva un evento); las tarjetas de eventos salen de
  `listUpcoming`, que ya filtra. Un resultado inline elegido se busca rearmando la misma lista con
  lo mismo buscado (el id del resultado es su lugar en la lista): si el índice cambió en el medio,
  puede contar otra cosa pública, nunca una que no lo es.
- **Una escritura por update**: un solo `db.batch` (la fila de la persona y los contadores), en
  `waitUntil`, después de armar la respuesta. Nunca la traba ni la cambia: si la base falla, se
  pierde ese conteo y nada más. Apagado, no se arma nada ni se lee nada de más.
- **Retención**: el cron de cada 15 minutos (`/api/cron/recordatorios`, `pruneUso`) borra las filas
  por persona de más de **180 días** (también con el interruptor apagado). Los totales por semana
  quedan: no tienen a nadie.
- **El panel**: quién usó el bot en los últimos 7, 30 o 90 días (interacciones y último día, con
  la tabla ordenable), los totales por tipo de las últimas 12 semanas (siempre) y el detalle de la
  semana elegida: pantallas y comandos por clave, y lo buscado y las cosas **solo si se contaron 5
  veces o más esa semana**; lo demás, sumado en «otras (menos de 5 veces)». El umbral está en la
  consulta (`usoPanel.js`): lo de menos ni sale de la base. Con menos de 5 personas esa semana, no
  hay detalle (ni se consulta). La página dice en una línea que lo que buscó o miró cada persona
  nunca se guarda.
- **Pruebas**: `uso.test.js` (qué lleva cada tabla, que una base caída no cambia la respuesta, que
  apagado no escribe) y `uso-privacy.test.js` (con la base y las rutas de verdad: nada oculto, no
  listado ni «solo con cuenta» se cuenta; el umbral en la consulta; apagado no escribe; la Mini
  App; la retención). `bot.golden.json` no cambió.

### Puesta en marcha de las estadísticas (la hace gorrite)

1. **Aplicar la migración `0057_telegram_uso.sql` en producción y en preview antes de mergear**
   (0028): `npx wrangler d1 migrations apply <base> --remote`. Solo crea dos tablas y un índice:
   anda con el código de `main`.
2. Para contar los resultados mandados desde el modo inline: en @BotFather, `/setinlinefeedback`,
   elegir el bot y **100 %** (si no, Telegram no manda `chosen_inline_result`). Después, volver a
   registrar el webhook (`npm run telegram:webhook`, ver «Puesta en marcha del modo inline») para
   que lo pida. Sin esto, lo demás se cuenta igual.
3. Prender **Telegram: estadísticas de uso** primero en un preview, usar el bot y mirar
   Estadísticas → Bot de Telegram. Después, en producción.
4. Para cortarlo de golpe: `TELEGRAM_ESTADISTICAS_ENABLED=0` o apagar el interruptor.

## Qué sigue

- ~~Cambiar `events.js` a `sitePosts` cuando `contenido_db` esté en `main`.~~ Hecho: el bot lee
  por la capa compartida (tests con el interruptor apagado y prendido en
  `src/lib/server/telegram/events-source.test.js`).
- ~~Fase 2: vincular un chat con una cuenta y sumar Telegram a "Lo que sigo" (0025).~~ Hecha
  (arriba), con la migración 0033.
- ~~Navegación por pantallas, efímeros, Seguir, Mini App del calendario.~~ Hecho (0034).
- ~~La puerta con el escáner de QR de Telegram.~~ Hecha (0037, arriba), detrás de
  `telegram_puerta`.
- ~~Puerta por Telegram: elegir el evento de una lista (los de hoy) en lugar de escribir la
  dirección, y un botón para abrirla sin volver a vincular.~~ Hecho: la lista en la Mini App y
  «🚪 Puerta» en el inicio.
- ~~Modo inline y buscar en todo el sitio.~~ Hecho (arriba).
- ~~Recorrer el sitio por secciones desde el inicio («📚 Material», «📖 Kinkipedia», «👥 Amigues», con
  listas y etiquetas), reusando la lista y la tarjeta compacta de `siteScreens.js`.~~ Hecho
  (arriba, «Las secciones del sitio»), también «🔁 Series». Pruebas: `router-secciones.test.js` y
  `inline-privacy.test.js` (con la base).
- ~~Pasar los textos de #298 a «Textos del bot».~~ Hecho, con la golden.
- ~~«🎟 Mis entradas» con el QR de la puerta.~~ Hecho (arriba).
- Fase 3: avisos y estado para organizadores (0029). Empezó por admins (0041, arriba): falta el
  resumen diario y los avisos en el momento (PR 2), el día del evento y los recordatorios (PR 3), y
  después lo mismo para organizadores con sus eventos.
- `/estado` y `/avisos` en el menú «/» solo de les admins vinculades (`setMyCommands` con un
  alcance por chat), si hace falta.
- ~~Mensajes enriquecidos y compartir desde la Mini App.~~ Hecho (arriba), detrás de
  `telegram_enriquecido`. Falta probarlo en celus de verdad.
- Un canal donde el bot publique lo nuevo y «Entrar con Telegram»: no elegidos por ahora
  (gorrite, 12/10).
