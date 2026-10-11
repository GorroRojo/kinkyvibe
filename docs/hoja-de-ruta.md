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

En otras sesiones, sin PR todavía: «Avisar a les compradores» de un evento, la barra de kv-fondo,
BIMI para los mails, la agenda de octubre y revisar qué pide SvelteKit 3.

PRs viejos para decidir: #46 (tiempo de lectura, de JorgeT10; ver Próximo 6), #43 (notificaciones
push, de boniSantana) y #25 (negociación interactiva para bottoms).

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
   - el calendario público calcula «hoy» con la hora local y no la de Argentina;
   - docs: cerrar los «a confirmar» que gorrite ya confirmó y las líneas viejas de `tickets.md`.
5. **Borrados recuperables** para preguntas de inscripción, roles y notas internas de una
   persona. S–M. Necesita una decisión nueva: [0030](decisiones/0030-para-revisar-y-recuperar.md)
   las dejó permanentes.
6. **Tiempo de lectura** (#21), rehecho en una rama nueva con crédito a JorgeT10 (#46). S.
7. **Estándares web**: JSON-LD completo, microformatos (`h-event`, `h-card`), feeds visibles
   (webcal de Apple y Outlook en `/calendario`, feed en las páginas de etiquetas),
   `security.txt`, `rel=me`. M.
8. **Auditoría de SEO y AEO** (buscadores y respuestas de IA): informe y arreglos chicos. M.
9. **Sistema de diseño**: una página de aprobación por componente para gorrite, versiones para el
   sitio público (Field, Checkbox, Switch, Notice, Card, Badge, Table), limpiar envoltorios y
   restos de UI, y después fijarlo con pruebas de capturas y reglas de CI. M cada parte.
   Bloqueo: gorrite aprueba cada componente.
10. **Borradores de páginas legales** antes de vender en serio: términos y devoluciones, aviso de
    privacidad (Ley 25.326), datos del proveedor, botón de arrepentimiento. M. Bloqueo: gorrite
    (o alguien de legales) aprueba el texto.
11. **Bot de Telegram, fase 1 de lo que sigue**: que se vea en el sitio (mención, link desde Mi
    rincón y el pie, textos de `/start` y `/ayuda`), después de #262. S–M. Bloqueo: textos y
    lugar los elige gorrite.
12. **Prototipos** (para mirar y decidir, no para prender): lista de espera por evento, segundo
    proveedor de pago, rol de organizadore, conector de Claude para el panel, IndieWeb y
    ActivityPub. L cada uno.

## Más adelante

### Sitio público

- Revisar los hallazgos de la auditoría de UX del 4/10 que siguen abiertos (anclas del glosario,
  áreas de toque, migas de pan, búsqueda vacía de la wiki). M.
- «Editar contenido» en términos de la wiki que no tienen entrada (TODO en `UserMenu.svelte`). S.
- Rediseño de la barra de filtros, con panel desplegable en el celu (#18). M. Bloqueo: maqueta y
  elección de gorrite.
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
- Ícono grande del tipo en el encabezado cuando no hay miniatura (perfiles, series, material,
  lugares). S.
- Passkeys para las cuentas del público. M–L.

### Entradas

- Comprar con cuenta: guardar `orders.account_id` al comprar y que `requiere_cuenta` pida
  ingresar de verdad. M. Bloqueo: `requiere_cuenta` necesita decisión de gorrite.
- Talleres en partes: vista previa de los mails de cada parte en el panel y las fechas de las
  partes en el estado del pedido. S–M.
- Pasar a talleres en partes los talleres viejos de varios días. S. Bloqueo: datos de producción,
  los vincula gorrite (o con su OK, probando antes en el demo).
- Mercado Pago: elegir el plazo de cobro y cargar la comisión real; probar contracargos y pagos
  tardíos en el sandbox. S. Bloqueo: gorrite.
- Probar el modo puerta en celulares reales y con mala señal; un indicador de «offline listo». S.
- Preguntas abiertas para les organizadores (reprogramar o cancelar, tope del Fondo por evento,
  si las extras cuentan para el Fondo, cuándo cierra la venta). Bloqueo: gorrite.

### Panel

- Redirecciones 301 cuando cambia la dirección de un objeto. M.
- Prueba E2E: objetos privados de cada tipo que nunca aparecen en listas, búsqueda, sitemap, RSS,
  imágenes para compartir ni JSON. M.
- Borrar objetos para siempre; campos propios y tipos simples desde el panel. L. Bloqueo: diseño.
- Pestañas arriba en cada sección (como Ajustes) y un menú más simple. M. Bloqueo: proponer la
  estructura antes.
- Más gráficos: mapa de la comunidad, Fondo y finanzas. M.
- Colaboración en tiempo real con Durable Objects. L.
- Preguntas de inscripción sugeridas para elegir rápido. S.

### Mails

- Tarjeta de evento en Gmail: los pasos para registrarse con Google y revisar el requisito de
  volumen de envío. S. Bloqueo: gorrite manda el formulario.
- Colas (Queues) para los mails y Email Workers para recibir. L.
- Newsletter general y por combinación de etiquetas. L.
- Bandeja de entrada en el panel, mails individuales y masivos (fase 5, CRM). L.

### Telegram

- Fase 3: avisos y estado para organizadores, nunca datos de compradores
  ([0029](decisiones/0029-bot-de-telegram.md)). L. Bloqueo: el rol de organizadore.

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
