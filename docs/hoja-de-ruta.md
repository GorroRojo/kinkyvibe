# Hoja de ruta

Todo lo que queda por hacer, en un solo lugar, para que ninguna sesión tenga que volver a barrer
issues, PRs, notas y TODOs para saber qué sigue. Arrancó con un barrido completo del 11/10/2026.

**Regla:** si terminás un PR, actualizá esta lista en ese mismo PR (ver
[Cómo mantenerla](#cómo-mantenerla)).

Tamaños: **S** (un PR chico, una noche), **M** (un PR grande o dos), **L** (varios PRs o necesita
diseño). «Bloqueo» dice qué falta antes de poder arrancar.

## En curso

PRs abiertos:

- #257: vista previa de links (Open Graph y Twitter completos en cada página pública).
- #259: buscador del panel, parte 1 (tildes en los resultados de la base, personas → ficha,
  acciones que faltaban, orden).
- #260: atajos de teclado visibles en el panel (pistas en el menú, ayuda, aviso de una vez) y
  nuevo mapa de teclas `g`.
- #261: reserva por transferencia hasta las 20 del segundo día hábil, sin paso de confirmar.
- #262: registrar los comandos del bot de Telegram (`setMyCommands`) desde el panel.
- #274: «X min de lectura» en material y Kinkipedia, con reloj, la explicación del cálculo y la
  velocidad de cada persona (navegador y cuenta) (idea de JorgeT10, #46).
- «Textos del bot» (Ajustes › Comunicación): todo lo que dice el bot de Telegram, editable en el
  panel, sin migración.
- Bot: recorrer el sitio por secciones desde el inicio (Material, Kinkipedia, Amigues, Series, con
  páginas y filtro por etiqueta) y los textos de buscar en todo el sitio y del modo inline en
  «Textos del bot» (PR `claude/bot-secciones`).
- Bot: «🎟 Mis entradas» (paso 2 de 5): las entradas de la cuenta vinculada, con el QR de la
  puerta como foto, «Pasadas» y sus textos en «Textos del bot» (PR `claude/bot-mis-entradas`).
- Prueba de que lo privado no sale en público (`src/routes/privados.test.js`): objetos de cada
  tipo y nivel, y datos de personas, en cada lista, feed, JSON, imagen para compartir y dirección
  directa. La metadata pública solo lleva vínculos a objetos que ve cualquiera.
- #297: códigos copiables, los mails de código (ingresar y confirmar) armados para que Gmail y el celu
  reconozcan el código ([mails.md](mails.md#códigos-copiables)).

En otras sesiones, sin PR todavía: «Avisar a les compradores» de un evento, la barra de kv-fondo,
BIMI para los mails, la agenda de octubre y revisar qué pide SvelteKit 3.

Lista de espera ([0040](decisiones/0040-lista-de-espera.md)): todas las partes ya están juntas y
probadas en la rama `claude/lista-espera`, que entra a `main` como un solo PR (borrador). Su vista
quedó dentro de Ventas, como Órdenes y Transferencias (#303); «Cerrar la lista» también la apaga y
no hay página de Ajustes (gorrite, 12/10). Antes del merge, gorrite aplica la migración 0053 en
preview y producción (0028). Bloqueo: gorrite.

PRs viejos para decidir: #43 (notificaciones push, de boniSantana) y #25 (negociación interactiva
para bottoms). #46 (tiempo de lectura, de JorgeT10) lo reemplaza #274.

## Próximo

La cola de las noches, en este orden:

1. **Seguimiento de #260**: varios grupos del menú lateral abiertos a la vez, y que los recuerde;
   abrir y cerrar todos; el menú se desplaza solo hasta lo elegido; `g u` = Cuentas. S.
2. **Operadores de búsqueda** (parte 2 del buscador, después de #259). M.
3. **Después de sacar los `.md`** ([0032](decisiones/0032-borrar-los-md.md), PR «limpieza-md»):
   - gorrite: crear y subir el tag `posts-md-final` en el último commit de `main` con los `.md`
     (el comando está en el PR). S. Bloqueo: gorrite.
   - gorrite: `node scripts/subir-archivos.js --target=production` (PDF, video y ODT del material
     a R2); después, un PR que borra `src/lib/archivos/` y su glob en `render.js`. S. Bloqueo:
     gorrite.
   - Código muerto que quedó del panel con GitHub: funciones de `sharedImage.js`, la edición del
     archivo de etiquetas en `tagConfig.js`, ramas «no se guardó en la base» de la UI, el permiso
     `public_repo` del login. M.
4. **Restos chicos** (un PR o dos):
   - borrar `AddToCalendarButton.svelte` y `admin/agenda/ConfirmPrompt.svelte`, que no se usan;
   - sacar el `CF_PAGES_BRANCH` y los comentarios de «mientras siga en Pages» de `deployBranch.js`
     y `deploy.js`;
   - el `:global(svg)` de `(content)/+layout.svelte` que se mete en el panel (con
     `npm run ui:impacto`);
   - la regla `.content > .kv-texto-libre > *`, que toca unas 200 páginas (con antes y después);
   - un solo `foldText` en lugar de las ~8 copias, y un solo helper para buscar la imagen de una
     publicación;
   - series: usar `requireAdmin` como el resto del panel, y renombrar el `isAdmin` de
     `objects/visibility.js`;
   - restos de imágenes en R2 (`sharedImage.js`, el campo de texto `perfil.avatar`);
   - docs: cerrar los «a confirmar» que gorrite ya confirmó y las líneas viejas de `tickets.md`.
5. **Borrados recuperables** para preguntas de inscripción, roles y notas internas de una
   persona. S–M. Necesita una decisión nueva: [0030](decisiones/0030-para-revisar-y-recuperar.md)
   las dejó permanentes.
6. **Estándares web**: JSON-LD completo, microformatos (`h-event`, `h-card`), feeds visibles
   (webcal de Apple y Outlook en `/calendario`, feed en las páginas de etiquetas),
   `security.txt`, `rel=me`. M.
7. **Auditoría de SEO y AEO** (buscadores y respuestas de IA): informe y arreglos chicos. M.
8. **Sistema de diseño**: una página de aprobación por componente para gorrite, versiones para el
   sitio público (Field, Checkbox, Switch, Notice, Card, Badge, Table), limpiar envoltorios y
   restos de UI, y después fijarlo con pruebas de capturas y reglas de CI. M cada parte.
   Bloqueo: gorrite aprueba cada componente.
9. **Borradores de páginas legales** antes de vender en serio: términos y devoluciones, aviso de
   privacidad (Ley 25.326), datos del proveedor, botón de arrepentimiento. M. Bloqueo: gorrite
   (o alguien de legales) aprueba el texto.
10. **Bot de Telegram, fase 1 de lo que sigue**: que se vea en el sitio (mención, link desde Mi
    rincón y el pie, textos de `/start` y `/ayuda`), después de #262. S–M. Bloqueo: textos y
    lugar los elige gorrite.
11. **Prototipos** (para mirar y decidir, no para prender): segundo proveedor de pago, rol de
    organizadore, conector de Claude para el panel, IndieWeb y ActivityPub. L cada uno.

## Lanzamiento de entradas

Para vender de verdad en todos los eventos sin sorpresas (gorrite, 11/10). Detalle y contexto en
[tickets.md](tickets.md#pendientes-antes-de-vender-de-verdad). Bloqueo general: las decisiones de
gorrite de la primera lista.

**Decisiones de gorrite:**

- Qué pasa con las entradas si un evento se cancela o se reprograma (reembolso, crédito, caso por
  caso).
- Tope del Fondo por evento; cuándo cierra la venta; quién puede reembolsar; si hacen falta
  reembolsos parciales.
- Plazo de acreditación de Mercado Pago y cargar esa comisión en Ajustes → Cobros.
- El mínimo legal: aviso de privacidad, datos del proveedor en la compra y, si corresponde, el
  botón de arrepentimiento (#282).

**Probar antes de abrir:**

- De punta a punta en el sandbox de MP: compra, pago rechazado y reintento, pago después de vencida
  la reserva, reembolso, contracargo, código de descuento con total muy chico, entrada solidaria con
  el Fondo. Bloqueo: credenciales de prueba de MP.
- Una compra real de monto chico con la cuenta de verdad, y su reembolso.
- Transferencia: reserva → confirmar en el panel → entrada por mail; y una reserva vencida.
- Mails en Gmail, Hotmail, Yahoo y un mail de trabajo: spam, .ics, recordatorio, aviso de cambio de
  fecha; revisar SPF, DKIM y DMARC de kinkyvibe.ar.
- Puerta con los celulares reales (Android y iPhone): escanear, escribir código, buscar persona,
  vender en efectivo y por transferencia, todo de nuevo sin conexión y con dos celulares a la vez.
- Cupo en el límite: la última entrada vendida a la vez desde el sitio y la puerta; qué muestra
  «Para revisar».
- Cambio de fecha y cancelación de un evento de prueba, con reembolso a todes.
- Carga chica: 50–100 intentos de compra en pocos minutos contra un preview.
- Que alguien que no sea gorrite use el panel siguiendo la guía.

**Preparar:**

- Borrar los eventos de prueba; revisar remitente, respuesta y contacto de la política de
  devoluciones; el webhook de MP apuntando a donde corresponde.
- Roles: quién revisa transferencias y cada cuánto, quién está en la puerta (y practicó), una
  segunda persona con acceso a Cloudflare, MP y el panel.
- Guías cortas: puerta (una página, para el celu), confirmar transferencias, reembolsar, «qué hacer
  si se cae el sitio».
- Plan B en papel: exportar la lista de entradas antes de cada evento.
- Avisos durante una venta: errores de MP, mails que no salieron, cupo pasado.
- No mergear a `main` mientras hay una venta grande abierta.

**Cómo abrir:** un evento piloto propio y chico → revisar → dos o tres eventos normales → eventos
de amigues y lanzamientos grandes.

## Más adelante

### Sitio público

- Revisar los hallazgos de la auditoría de UX del 4/10 que siguen abiertos (anclas del glosario,
  áreas de toque, migas de pan, búsqueda vacía de la wiki). M.
- Barra de filtros de las listas: probarla en celulares reales (Android y iPhone) y, cuando se
  confirme, sacar los prototipos `/estilo/prototipos/filtros-celu` y `filtros-celu-v2`. S.
- Esconder etiquetas del filtro que no cambiarían los resultados (#17). S–M.
- Barra de progreso de lectura (#19). S. Bloqueo: confirmar que se sigue queriendo.
- Ajustes de lectura: tamaño de letra y tema (#20). M. Bloqueo: diseño.
- Secciones desplegables y notas al pie en los textos (#22). S–M.
- Fragmentos reutilizables de publicaciones y del glosario (#23). L. Bloqueo: diseño.
- Recurrencia tipo RRULE (#29); las series y los talleres en partes cubren una parte. L.
- Negociación interactiva para bottoms (#14, #25). L. Bloqueo: decisión de contenido.
- Mapa para eventos con dirección en texto libre (sin lugar cargado). M. Bloqueo: vincular datos
  de producción lo decide gorrite.
- Imagen para compartir: más paletas, formatos apaisado y carrusel, estilo por serie. M.
- Kinkipedia más rica y una lista de series mejor armada. M. Bloqueo: dirección de gorrite.
- Ícono grande del tipo en el encabezado cuando no hay miniatura, también en las series (perfiles,
  lugares y material ya lo tienen). S.
- Passkeys para las cuentas del público. M–L.
- Botón grande para comprar afuera: cuando las entradas se venden en otro sitio (link externo),
  el llamado a la acción tiene el mismo tamaño y peso que «Comprar entradas» (gorrite, 10/10). S.

### Entradas

- Comprar con cuenta: guardar `orders.account_id` al comprar y que `requiere_cuenta` pida
  ingresar de verdad. M. Bloqueo: `requiere_cuenta` necesita decisión de gorrite.
- Talleres en partes: vista previa de los mails de cada parte en el panel. S.
- Pasar a talleres en partes los talleres viejos de varios días. S. Bloqueo: datos de producción,
  los vincula gorrite (o con su OK, probando antes en el demo).
- Mercado Pago: elegir el plazo de cobro y cargar la comisión real; probar contracargos y pagos
  tardíos en el sandbox. S. Bloqueo: gorrite.
- Probar el modo puerta en celulares reales y con mala señal. S.
- Preguntas abiertas para les organizadores (reprogramar o cancelar, tope del Fondo por evento,
  si las extras cuentan para el Fondo, cuándo cierra la venta). Bloqueo: gorrite.
- Lista de espera, después del merge: prender el interruptor `lista_espera` y probarla en un
  evento piloto (anotarse, un reembolso, la oferta y la compra con el link, con mails de verdad).
  S. Bloqueo: gorrite.
- Lista de espera, a confirmar ([0040](decisiones/0040-lista-de-espera.md)): si «Terminar la
  reserva y pasar a la siguiente» le manda un mail a esa persona. S. Bloqueo: gorrite.
- Promociones de varios eventos: por ejemplo, dos eventos a un precio especial si se compran
  juntos (gorrite, 10/10). M–L. Bloqueo: diseño (cómo se arma la promo en el panel, cómo se ve al
  comprar, cómo se reparte el Fondo y los reembolsos).

### Panel

- Cambiar la dirección (URL) de un evento u otro objeto desde el panel, con redirección 301 desde
  la vieja. Hoy la dirección se arma al crearlo y no se puede cambiar (gorrite preguntó dónde se
  cambia, 10/10). M.
- Invitar a cada amigue a editar su perfil: desde el panel, mandarle un link por mail para que lo
  gestione desde Mi rincón (con cuenta), sin pasar por les admins para cada cambio (gorrite,
  11/10). M. Revisar cómo se asigna hoy quién gestiona un perfil (docs/amigues.md).
- Borrar objetos para siempre; campos propios y tipos simples desde el panel. L. Bloqueo: diseño.
- Navegación del panel, opción C ([0038](decisiones/0038-navegacion-del-panel-opcion-c.md),
  [0039](decisiones/0039-navegacion-del-panel-opcion-c-parte-2.md)), lo que quedó después de la
  parte 2 (Fijados, «+ Crear», Puerta fuera de la barra, pestañas con contadores y ▾ en el celu):
  - Ajustes como 4 grupos (Plata, Comunicación, Equipo, Sistema) con tarjetas, como en el
    prototipo, en vez de 9 pestañas. M. Bloqueo: gorrite.
  - (Descartado por gorrite, Mesa 12/10: la ficha del evento con 5 pestañas y «Más» del
    prototipo; quedan las 7 pestañas con vistas.)
  - Fijados por admin en la base (hoy por navegador), si se suma una tabla de preferencias. M.
- Panel lateral de cada admin: hoy la elección («Siempre abierto», «Solo íconos», «Se oculta»)
  se guarda por navegador (localStorage por login). Si se suma una tabla de preferencias por admin
  en la base, pasarla ahí para que siga a la persona en todos sus dispositivos (gorrite, 11/10;
  PR de íconos en las pestañas). S. Bloqueo: que haga falta una tabla de preferencias.
- Más gráficos: mapa de la comunidad, Fondo y finanzas. M.
- Colaboración en tiempo real con Durable Objects. L.
- Preguntas de inscripción sugeridas para elegir rápido. S.

### Mails

- Tarjeta de evento en Gmail: los pasos para registrarse con Google y revisar el requisito de
  volumen de envío. S. Bloqueo: gorrite manda el formulario.
- Códigos copiables (pedido de gorrite, 11/10/2026; #297): en dos pruebas con mails reales, Gmail
  para celu no mostró «Copiar código» (ni con el código en el asunto) y ofreció traducir el mail
  «del inglés» (también con `Content-Language: es`). Falta: probar en un iPhone con Mail de Apple;
  averiguar por qué Gmail lo toma por inglés; sumar el encabezado `OTP-Token` o `One-Time-Code`
  cuando un cliente de mail lo use. S.
- Colas (Queues) para los mails y Email Workers para recibir. L.
- Newsletter general y por combinación de etiquetas. L.
- Bandeja de entrada en el panel, mails individuales y masivos (fase 5, CRM). L. Cuando esté,
  va primera en Mensajes: Bandeja, Plantillas, Configuración (gorrite, 11/10; hoy va al final
  porque lo que viene va al final de su área).

### Telegram

- Puerta por Telegram, después de #273: prenderla en un preview y probarla con celulares reales
  (vincular, abrir con el botón del bot, escanear); después en producción. S. Bloqueo: gorrite.
- Bot, secciones: filtrar la Kinkipedia por las ramas del árbol de etiquetas (como `/wiki`) en
  lugar de las etiquetas más usadas; y que Series deje afuera las series sin ediciones (como la
  lista de series de `/wiki`; hoy salen las del índice de la búsqueda). S.
- Guardar si alguien apagó a propósito los avisos por Telegram de algo, para que volver a seguirlo
  desde el bot no los prenda de nuevo (hoy la base no lo distingue, 0036). S. Bloqueo: que haga
  falta (necesita migración).
- Textos del bot: sumar a «Textos del bot» los de `/inicio` y el botón «🚪 Puerta» del inicio
  cuando entre `claude/bot-inicio` (si ese PR entra después). S.
- Textos del bot: los textos de las páginas de la Mini App del calendario (`/telegram/app`) y de
  la puerta (`/telegram/puerta`) siguen en el código (son páginas, no mensajes del bot). S.
  Bloqueo: que haga falta.
- Bot, Mis entradas: en un taller de varias partes con una sola entrada, que la entrada siga en
  «próximas» hasta la última parte (hoy cuenta la fecha del evento que vende la entrada). S.
- Bot, Mis entradas: mandar el link de la transmisión de un evento online (hoy la tarjeta manda a
  la página de la entrada, que lo tiene). S. Bloqueo: que gorrite lo quiera en el chat.
- Bot, Mis entradas: después de mergear, probarlo en Telegram con una entrada de prueba (la foto
  del QR subida por la API solo se puede probar contra el bot de verdad). S. Bloqueo: gorrite.
- Bot: borrar las funciones de antes que ya no usa el bot (`formatEventList`, `formatEvent`,
  `formatChoices`, `formatPickList` en `format.js`; `eventListKeyboard` y `eventDetailKeyboard` en
  `keyboards.js`) y sus pruebas. S.

- Telegram para admins, PR 1 (base, «📊 Estado» y «🔔 Mis avisos»,
  [0041](decisiones/0041-telegram-para-admins.md)): aplicar la migración 0054 en preview y
  producción, prender `telegram_admin` en un preview y probarlo con un Telegram vinculado. S.
  Bloqueo: gorrite.
- Telegram para admins, PR 2: el resumen diario de ventas y los avisos en el momento (cada venta,
  cada transferencia que llega), solo a quien los prendió en «🔔 Mis avisos» (`noticeRecipients`),
  con horario de silencio y clave única por envío; solo cantidades y links (0041). M.
- Telegram para admins, PR 3: el resumen del día del evento y los recordatorios (el evento de
  mañana, falta el lugar o el link de la transmisión) (0041). M. Bloqueo: PR 2.
- Telegram para admins: `/estado` y `/avisos` en el menú «/» solo de les admins vinculades
  (`setMyCommands` con un alcance por chat, desde el cron; borrarlo al desvincular). S. Bloqueo:
  que haga falta.
- Fase 3: avisos y estado para organizadores, cada une con **sus** eventos, reusando lo de admins
  (0041; nunca datos de compradores, [0029](decisiones/0029-bot-de-telegram.md)). M. Bloqueo: el
  rol de organizadore.

### Contenido

- Arreglos de datos en textos viejos (etiquetas HTML sin cerrar, `&nbsp;`, negritas rotas). S.
  Bloqueo: son cambios en producción, desde el panel o con OK de gorrite.
- Eventos sin imagen y campos vacíos del CMS. Bloqueo: gorrite elige en el panel.
- Guardados con colecciones y notas, amigues guardades, «No mostrar que voy» (fase 4). L.
- Vista de grafo de los objetos, estilo Obsidian. L.
- Campos de perfil: afiliación, formación, experiencia, habilidades (TODO en `types.d.js`). S.
  Bloqueo: confirmar que se quiere.
- Fases lejanas: social, videos (Cloudflare Stream) y tienda. L.

### Infraestructura

- Prettier en la CI: formatear y sacar de `.prettierignore` la lista temporal de archivos que
  tocaban ramas abiertas, a medida que esas ramas entren. S.
- Ordenar GitHub: cerrar issues ya hechos (#15, #27, #66, #67, #68, casi #69) y decidir los PRs
  viejos. S. Bloqueo: gorrite cierra.
- Dashboard de Cloudflare: borrar el proyecto viejo de Pages y las variables `*_ENABLED` que ya
  no hacen nada. S. Bloqueo: gorrite.
- Simulacro de restaurar un backup (`npm run db:restore -- <fecha> --local`). S. Bloqueo: gorrite.
- Recorrido guiado del código para gorrite, por capítulos. L.
- Un solo ingreso con kv-openauth y admins con cuentas del público en lugar de GitHub. L.
- ¿Sumar kv-fondo a este repo? L. Bloqueo: decisión de gorrite.
- Push y PWA (#16, #43). M. Bloqueo: decisión de gorrite.
- Pruebas más rápidas, lo que quedó después de «tests-mas-rapidos» (#307) y «tests-base-plantilla»
  (plantilla migrada + canal WebSocket con la base de prueba): lo que sigue pesando es la cantidad
  de consultas: `importTags` de la semilla son ~1800 consultas sueltas (ahora ~2 ms cada una en vez
  de ~6); agruparlas en `batch` también aceleraría el import de verdad. M.
- CI: actualizar `scripts/vitest/durations.json` con los artifacts `vitest-durations-*` de `main`
  (`scripts/vitest/merge-durations.js`) cuando se sumen o cambien pruebas lentas, para que las 3
  partes de `tests` sigan parejas. S.
- CI: la semilla en una base nueva (~1 min) es lo más lento de `e2e`. Se podría guardar la base
  ya cargada en caché, con una clave que cambie si cambian las migraciones, la semilla o el código
  que la importa. S. Bloqueo: confirmar que se quiere.

### Estándares web y SEO

Lo grande está en Próximo (7 y 8). Lo que quede de esas auditorías se suma acá.

## Decidido y descartado

- **AUCH como etiqueta especial** en todos lados (TODO en `PostListItem.svelte`): descartado.
- Contenido en archivos `.md` como fuente: el contenido vive en D1 (0004 y 0032).

## Cómo mantenerla

- **Quien hace el PR actualiza esta lista en el mismo PR**: saca lo que terminó y suma lo nuevo
  que quedó pendiente.
- Lo terminado se va de acá: queda en la historia de git y en el PR.
- Cada ítem nuevo lleva de dónde sale (issue, PR, decisión o pedido de gorrite con fecha), su
  tamaño y su bloqueo si tiene.
- Si gorrite cambia el orden de Próximo, se cambia acá; si descarta algo, va a «Decidido y
  descartado».
- Nada privado: ni datos de personas, ni secretos, ni detalles de vulnerabilidades sin arreglar.
  Si algo es delicado, se nombra en general («endurecer X») o se habla con gorrite por privado.
