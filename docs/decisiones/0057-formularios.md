# 0057. Formularios: quién responde, privacidad y quién ve las respuestas

- Fecha: 2026-11-05
- Estado: Aceptada. Decidido por gorrite (Mesa de trabajo, 5/11), sobre el prototipo de la
  encuesta después del evento (#566). Amplía [0024](0024-organizadores-ven-respuestas.md) a los
  formularios.

## Contexto

gorrite pidió una encuesta automática después de cada evento (plan `encuesta-post-evento`) y el
prototipo (#566) dejó preguntas abiertas: a quién, anónima o no, quién ve las respuestas, si las
preguntas se editan. Al mismo tiempo hacían falta otros formularios (proponer un taller, pedir una
beca) y el editor de las preguntas de inscripción necesitaba orden. Se resolvió todo junto como
«Formularios», detrás del interruptor `formularios`.

## Decisión

- **Dónde.** Panel › Comunidad › «Formularios» (lista, editor y respuestas). La encuesta de cada
  evento también se ve desde su ficha (Mails › Encuesta).
- **Un solo editor de preguntas** para los formularios y las preguntas de inscripción: los mismos
  tipos (texto, opciones, casilla) más «Puntaje de 1 a 5»; ↑ ↓ (y arrastrar en la compu),
  duplicar y vista previa. Las preguntas de inscripción guardan su orden; las que ya había quedan
  en el que tenían.
- **Quién responde:** cualquiera con el link, personas con cuenta, o quienes tenían entrada para un
  evento (con un link personal por mail que sirve una sola vez).
- **Privacidad, tres modos, se cambia cuando se quiera:**
  - «Con nombre»: se guarda quién respondió;
  - «Anónimo»: no se guarda nombre, mail, cuenta ni compra; solo las respuestas y el día. El panel
    las muestra mezcladas;
  - «Que cada persona elija»: el formulario muestra «Responder anónimamente»; si la marca, se
    guarda como anónima.
  - Al cambiar: lo anónimo sigue anónimo (nunca se guardó quién fue). Pasar uno con nombre a
    «Anónimo» esconde en el panel los nombres de lo que ya llegó. El editor avisa antes de guardar.
- **Quién ve las respuestas:** les admins y les organizadores del evento, con la misma regla que
  las respuestas de inscripción ([0024](0024-organizadores-ven-respuestas.md)). Un formulario
  puede ser «Solo admins» (el pedido de beca). Se ven **todas** las respuestas, siempre: sin
  mínimo de respuestas para mostrar.
- **Direcciones legibles:** `kinkyvibe.ar/formularios/<nombre>` (sale del nombre y se puede
  cambiar); la encuesta de un evento en `/calendario/<evento>/encuesta`. El link personal es esa
  misma dirección con una clave en el fragmento (`…/encuesta#<clave>`), personal y de un solo uso;
  sin la clave, la página dice «Esta encuesta es para quienes fueron: buscala en tu mail».
- **La encuesta después del evento:** un formulario anónimo para quienes tenían entrada, con las 5
  preguntas del prototipo, que sale solo un día después de cada evento. Cada evento la puede apagar.
- **Plantillas para copiar y editar:** «Proponé un taller o una colaboración» (con cuenta, para
  poder responder), «Pedido de beca» (con nombre, solo admins) y una de comentarios generales.
- **Respuestas:** promedios de los puntajes, cuántas veces se eligió cada opción, la lista de
  textos y el CSV.
- **Spam** en los formularios abiertos: un límite por persona (conexión y cuenta) y un campo trampa
  invisible.

## Descartado

- No hay formulario de inscripción a eventos gratis: para eso están las preguntas de inscripción.
- Un mínimo de respuestas antes de mostrarlas (para proteger el anonimato): gorrite prefiere ver
  todas.
- Respuestas de la encuesta solo para admins (lo que hacía el prototipo).

## Consecuencias

- Migración 0079 (solo agrega `forms`, `form_responses` y `form_sends`). Una respuesta anónima no
  tiene dónde guardar identidad: un CHECK de la tabla lo impide.
- Respuestas de gorrite del 5/11 (detalle en [formularios.md](../formularios.md)): nombre,
  pronombre y mail definen si una respuesta es anónima; la encuesta sale siempre, aunque sea tarde;
  los mails se editan (por evento y por defecto) y lo que sale por defecto se cambia en un solo
  lugar; los formularios se borran y se recuperan (0033); los links que fallaron van a «Para
  revisar»; el editor de preguntas de inscripción va siempre, sin el interruptor; al duplicar un
  evento se copian su encuesta y sus preguntas. Migración 0080 (solo agrega columnas).
- Detalle y código en [formularios.md](../formularios.md).
