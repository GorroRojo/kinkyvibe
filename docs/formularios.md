# Formularios

## Qué hace

Detrás del interruptor `formularios` (apagado; [interruptores.md](interruptores.md)). Decisión de
gorrite: [0057](decisiones/0057-formularios.md).

- **Panel › Comunidad › Formularios** (`/admin/comunidad/formularios`): la lista de formularios,
  las encuestas de los eventos y las plantillas. Cada formulario tiene su editor (nombre,
  dirección, texto de arriba, quién responde, privacidad, quién ve las respuestas, las preguntas y,
  si se manda por mail, su mail) y su página de respuestas (resumen, cada respuesta y CSV). Se
  borra (suave) y se recupera desde Actividad con sus respuestas.
- **Cómo salen por defecto** (`/admin/comunidad/formularios/por-defecto`, botón arriba de la
  lista): un solo lugar para lo que vale en cada encuesta y cada formulario nuevo. Ver
  [Cómo salen por defecto](#cómo-salen-por-defecto).
- **Dónde se encuentra** (gorrite, 5/11: «que sea fácil de encontrar»): Comunidad › Formularios en
  el menú; el buscador (Ctrl/⌘+K: «formulario», «encuesta», «Cómo salen por defecto los
  formularios», «Plantilla de formulario: …» por cada plantilla, «Crear: Formulario»); «+ Crear ▾»
  (Formulario); la ficha de cada evento (Resumen › «Formularios de este evento», con la encuesta y
  los formularios que lo eligieron, y Mails › Encuesta, con links a todos los formularios y a «Cómo
  salen por defecto»); y la descripción del interruptor en Ajustes › Interruptores. El Inicio no
  tiene un lugar para funciones (sus «Acciones rápidas» son lo de todos los días): no se sumó.
  Con el interruptor apagado no aparece nada de esto (`paletteCommands({ flags })`).
- **Formularios propios** en `kinkyvibe.ar/formularios/<dirección>` (la dirección sale del nombre
  y se puede cambiar).
- **La encuesta después de cada evento** en `/calendario/<evento>/encuesta`: un día después de
  que termina un evento con entradas (se cambia en «Cómo salen por defecto»), a cada compra
  confirmada le llega un mail con un link personal que sirve una sola vez. Sale siempre, aunque
  sea tarde (gorrite, 5/11). Es anónima por defecto, con las 5 preguntas del prototipo (#566).
  Cada evento la prende o la apaga, cambia su mail o la borra en su ficha › Mails › Encuesta. Al
  duplicar un evento, la copia lleva su encuesta como estaba.
- **Plantillas** para copiar y editar: «¿Cómo la pasaste?» (la que copia cada evento para su
  encuesta), «Proponé un taller o una colaboración», «Pedido de beca» y «Contanos qué te parece».
- **Un solo editor de preguntas** para los formularios y las preguntas de inscripción
  ([personas-eventos.md](personas-eventos.md)): la pestaña Preguntas de cada evento y Eventos ›
  Roles y preguntas usan siempre el mismo editor, con orden (gorrite, 5/11: no depende del
  interruptor; el editor viejo, `SignupFieldList`/`SignupFieldForm` y sus acciones por pregunta,
  se borró).
- **Les organizadores** ven las respuestas de los formularios de sus eventos en Mi rincón, como las
  de inscripción.

Apagado, nada de esto se ve: las páginas públicas y las del panel dan 404 y el cron no manda nada.
Las preguntas de inscripción se editan con el editor nuevo igual.

## Lo que nunca se tiene que romper

- **Una respuesta anónima no guarda identidad.** Nombre, pronombre y mail son lo que define si una
  respuesta es anónima (gorrite, 5/11). En «Anónimo», o en «Que cada persona elija» con «Responder
  anónimamente» marcada (que esconde los tres campos), se guarda solo lo respondido y el **día**
  (sin hora): ni nombre, ni pronombre, ni mail, ni cuenta, ni compra. `saveResponse` ni siquiera
  los manda, y los CHECK de `form_responses` (0079 y el de `pronouns` en 0080) lo impiden igual.
  Lo prueban `store.test.js`, `segunda-parte.test.js` y `formularios-publico.test.js`.
- **El link personal sirve una vez.** La respuesta y la marca `form_sends.used` van en la misma
  tanda, condicionadas a que el link no se haya usado: dos envíos a la vez guardan una sola.
- **Quién ve las respuestas:** admins y, si el formulario es de un evento y no es «Solo admins»,
  les organizadores de ESE evento, con la regla de las respuestas de inscripción
  (`requireOrganizer`, decisión [0024](decisiones/0024-organizadores-ven-respuestas.md)). Si no
  corresponde, 404. Les organizadores nunca ven mails.
- **Se ven todas las respuestas, siempre** (sin mínimo). El panel muestra nombres solo si la
  respuesta no es anónima **y** la privacidad de hoy no es «Anónimo» (`showsIdentity`).
- **Las páginas públicas no se cachean** (`private, no-store`, `noindex`) y nunca traen respuestas
  de nadie.
- Cada `load` y cada acción del panel llama a `requireFormsAdmin`; abrir las respuestas, bajar el
  CSV, guardar, abrir o cerrar y mandar quedan en Actividad (sin las respuestas).

## Cómo funciona

### Datos (migraciones 0079 y 0080, solo agregan)

| Tabla            | Qué guarda                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forms`          | cada formulario (`kind`: `form`, `survey` o `template`), sus preguntas en orden (JSON) y su configuración                                                         |
| `form_responses` | cada respuesta: `answers` `[{ id, label, value }]` (la pregunta copiada como estaba), `day` y, si no es anónima, quién (nombre, `pronouns`, mail, cuenta u orden) |
| `form_sends`     | el link personal de cada compra (estados como `reminder_sends`) y `used` (si ya se respondió)                                                                     |

- `forms.access`: `link` (cualquiera con el link), `account` (con cuenta) o `ticket` (quienes
  tenían entrada para `event_slug`). `privacy`: `named`, `anonymous` o `choose`. `audience`:
  `organizers` (admins y organizadores del evento) o `admins`. `open`: recibe respuestas (en una
  encuesta, también si se manda). `send_at`: en un formulario `ticket` que no es encuesta, desde
  cuándo se manda el link («Mandar el link a quienes tienen entrada»).
- `forms.mail_subject` y `forms.mail_body` (0080): el mail propio de una encuesta o un formulario
  «quienes tenían entrada» (vacío = el de «Cómo salen por defecto»). `forms.deleted_at` (0080):
  borrado suave.
- Una encuesta por evento (índice único, también con la borrada: borrar la encuesta de un evento
  la apaga para ese evento hasta que se recupere). Se crea copiando la plantilla «¿Cómo la pasaste?»
  cuando hace falta: cuando el cron la manda, al prenderla o apagarla, al tocar «Ver y editar las
  preguntas» en la ficha o al guardar su mail. Toma la privacidad y quién ve las respuestas de
  «Cómo salen por defecto». Los `load` solo leen.
- Las plantillas viven en la base como cualquier formulario; las que faltan se crean solas
  (`ensureTemplates`, `templates.js`). Cambiar una plantilla no cambia lo ya copiado.

### Privacidad

| Modo                   | El formulario muestra                                                                                                                                | Se guarda                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Con nombre             | nombre, pronombres (opcional) y mail con el link; con cuenta, nombre y pronombres (opcionales) y el mail de la cuenta; con entrada, los de la compra | quién respondió y la respuesta |
| Anónimo                | «Es anónimo: no guardamos quién respondió.»                                                                                                          | solo la respuesta y el día     |
| Que cada persona elija | la casilla «Responder anónimamente»                                                                                                                  | según la casilla               |

Se puede cambiar cuando se quiera; el editor avisa qué pasa con lo que ya llegó
(`privacyChangeWarning`). Lo anónimo sigue anónimo. Pasar a «Anónimo» esconde los nombres de lo que
llegó con nombre (siguen guardados: volver a «Con nombre» los muestra). Si alguna respuesta no
muestra quién la mandó, la lista va mezclada (`shuffled`), así el orden no ayuda a adivinar.

### El link personal

`inviteUrl()` arma `…/calendario/<evento>/encuesta#<orden>.<firma>` (o `/formularios/<dirección>#…`).
La firma es HMAC con una clave al azar en D1 (`form_link_key`, `signedLinks.js`): no se guarda
ningún token. El fragmento no viaja con el pedido de la página: `PublicForm.svelte` lo lee, pregunta
con `?/check` si sirve (`invalid`, `used` u `ok`) y lo manda con la respuesta. Sin clave: «Esta
encuesta es para quienes fueron: buscala en tu mail».

### Envío (`send.js`)

El cron de cada 15 minutos (`POST /api/cron/recordatorios`, con lo que sobra de la tanda; nunca con
`MAILS_PAUSED`) llama a `runFormsCron`:

- la encuesta de cada evento con entradas, no cancelado, desde los días de «Cómo salen por defecto»
  después de su fin (`eventEnd`; uno si no se cambió). **Sale siempre, aunque sea tarde** (gorrite,
  5/11; antes había un corte de 3 días). Si la encuesta no sale sola, solo sale la de los eventos
  que la prendieron;
- los formularios `ticket` que une admin mandó, desde `send_at`;
- a cada compra aprobada creada antes de que tocara, una vez (`form_sends`, con reintentos), con
  `optOut` («No fui yo» y rebotes) y `Auto-Submitted`.

A CONFIRMAR: para que al prender el interruptor no les llegue la encuesta de todos los eventos
viejos a la vez, la primera vuelta del cron anota desde cuándo salen (`forms_surveys_since` en
`ticket_settings`, `surveysSince`): una encuesta que tocaba antes no sale nunca (la ficha lo
dice); una que toca después sale siempre, aunque sea tarde.

Un link que falló todos sus intentos aparece en «Para revisar» (una fila por formulario, como los
recordatorios que fallaron; decisión 0030: cada fila cuenta 1) con «Reintentar», que los vuelve a
la cola para la próxima vuelta del cron (`retryFailedFormSends`).

### El mail

`email.js`: asunto y texto en el formato seguro de los mails del panel (negrita, links, sin HTML),
con `{{evento}}`, `{{formulario}}`, `{{preguntas}}` («Son 5 preguntas cortas y es anónima…») y
`{{link}}` (el link personal; el botón va siempre). Vale el propio del formulario, si no el de
«Cómo salen por defecto», si no el de siempre (los textos del prototipo; el asunto de siempre de
la encuesta no lleva el título del evento, que se ve en la notificación del celu). Se edita con
vista previa («Ver cómo queda», no guarda) en la ficha del evento › Mails › Encuesta, en el editor
de cada formulario «quienes tenían entrada» y en «Cómo salen por defecto» (`FormMailEditor`,
`mailAdmin.js`).

### Cómo salen por defecto

`defaults.js`, en `ticket_settings` (la tabla de los ajustes del panel), una fila JSON
`forms_defaults`: sin migración. Sin fila, o con un campo que no vale, ese campo vale lo de siempre
(`FORM_DEFAULTS`):

| Qué                                               | Lo de siempre          |
| ------------------------------------------------- | ---------------------- |
| La encuesta sale sola en cada evento con entradas | sí                     |
| Cuántos días después del evento (0 a 14)          | 1                      |
| Privacidad de la encuesta                         | Anónimo                |
| Quién ve las respuestas de la encuesta            | admins y organizadores |
| Mail de la encuesta (asunto y texto)              | el del prototipo       |
| Quién responde un formulario nuevo                | cualquiera con el link |
| Privacidad de un formulario nuevo                 | Con nombre             |
| Mail con el link de un formulario                 | «Tenés entrada para…»  |

Vale para lo que se crea (o se manda) desde que se guarda: lo que ya existe no cambia. Desde ahí
hay un link a editar las preguntas de la plantilla de la encuesta.

### Borrar

Como lo demás que se recupera (decisión 0033): `deleteForm` marca `deleted_at`, cierra el
formulario y escribe la fila de «Borrados que podés recuperar» en la misma tanda; nada lo lista, lo
responde ni lo manda. «Recuperar» en Actividad lo vuelve con sus respuestas, cerrado (una encuesta
se prende desde la ficha). Las plantillas no se borran (se vuelven a crear solas).

### Duplicar un evento

Al duplicar (`/admin/eventos/nuevo?desde=…`, `copyFromSource`), además del archivo del evento
(entradas, recordatorios, personas…), la imagen y el lugar, se copian las preguntas de inscripción
(las propias, en su orden, y la elección de generales con sus tipos de entrada:
`copyEventSignupFields`) y la encuesta como estaba (prendida o apagada, preguntas, privacidad,
quién ve las respuestas y mail; sin respuestas: `copyEventSurvey`). Los otros formularios atados al
evento no se copian (son de ese evento: sus links ya salieron a quienes tenían entrada para él).

### Spam

En los formularios sin link personal: un campo trampa invisible (`sitio_web`: si llega lleno, se
contesta «gracias» y no se guarda nada) y hasta 10 respuestas por hora por conexión (hash, sin la
IP) y por cuenta (`FORM_RATE_LIMIT`).

### El editor de preguntas compartido

`QuestionEditor.svelte` (una tarjeta por pregunta, ↑ ↓ y arrastrar, «Duplicar», «Sacar», vista
previa con `FormQuestions.svelte`, el mismo componente de la página pública). Manda la lista entera
como JSON. Solo usa piezas del panel (`Field`, `Segmented`, `Checkbox`, `Button`); una guarda en
`QuestionEditor.dom.test.js` falla si un archivo del panel de formularios arma inputs a mano.

En las preguntas de inscripción (con el interruptor prendido), `?/saveFields`
(`saveFieldsAction`) guarda la lista en `signup_fields` como siempre: las que traen su id se
editan si cambiaron, las nuevas se crean, las que se sacaron se borran (suave, se recuperan desde
Actividad) y el orden va a `position` (las que ya había quedan en el orden que tenían).

## Dónde está el código

| Qué                               | Dónde                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Reglas puras                      | `src/lib/utils/formularios.js`, `src/lib/admin/questionEditor.js`                                           |
| D1, plantillas, link, mail, envío | `src/lib/server/formularios/` (`store.js`, `templates.js`, `invite.js`, `email.js`, `send.js`)              |
| Por defecto y mail en el panel    | `defaults.js`, `mailAdmin.js`, `…/comunidad/formularios/por-defecto`, `FormMailEditor.svelte`               |
| Páginas públicas                  | `public.js`, `src/routes/(content)/formularios/[slug]`, `…/calendario/[event]/encuesta`                     |
| Panel                             | `admin.js`, `responses.js`, `src/routes/(authed)/admin/comunidad/formularios/`, `…/eventos/[slug]/encuesta` |
| Organizadores                     | `organiza.js`, `src/routes/(content)/mi-rincon/perfiles/[slug]/respuestas/[event]/formularios/`             |
| Componentes                       | `src/lib/components/formularios/` (público), `src/lib/components/admin/forms/` (panel)                      |

## Cómo probarlo

```sh
npx vitest run src/lib/utils/formularios.test.js src/lib/admin/questionEditor.test.js \
  src/lib/server/formularios src/lib/components/admin/forms src/lib/components/formularios \
  "src/routes/(authed)/admin/comunidad/formularios" "src/routes/(authed)/admin/eventos/roles" \
  "src/routes/(content)/formularios" "src/routes/(content)/mi-rincon/perfiles"
```

A mano: `FORMULARIOS_ENABLED=1 npm run dev:admin`, Comunidad › Formularios.

## Lo que confirmó gorrite (5/11)

- La encuesta sale siempre, aunque sea tarde (sin el corte de 3 días).
- Nombre, pronombre y mail definen si una respuesta es anónima: con nombre se piden nombre y mail
  (obligatorios) y pronombre (opcional); anónimo no pide ni guarda ninguno.
- El límite es de 10 respuestas por hora por conexión y por cuenta.
- El editor nuevo de las preguntas de inscripción va siempre, sin el interruptor.
- Un link que no se pudo mandar aparece en «Para revisar», con «Reintentar».
- Los formularios se borran y se recuperan desde Actividad, con sus respuestas (decisión 0033).

## A CONFIRMAR

Lo eligió la sesión que lo armó, para avanzar (gorrite no lo decidió):

- A CONFIRMAR: al prender el interruptor no sale la encuesta de los eventos que ya tocaban (ver
  Envío).
- A CONFIRMAR: con cuenta, el nombre y los pronombres son opcionales (el mail es el de la cuenta);
  con entrada, van los de la compra.
- A CONFIRMAR: al duplicar un evento no se copian los otros formularios atados a él.
