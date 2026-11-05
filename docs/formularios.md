# Formularios

## Qué hace

Detrás del interruptor `formularios` (apagado; [interruptores.md](interruptores.md)). Decisión de
gorrite: [0057](decisiones/0057-formularios.md).

- **Panel › Comunidad › Formularios** (`/admin/comunidad/formularios`): la lista de formularios,
  las encuestas de los eventos y las plantillas. Cada formulario tiene su editor (nombre,
  dirección, texto de arriba, quién responde, privacidad, quién ve las respuestas y las preguntas)
  y su página de respuestas (resumen, cada respuesta y CSV).
- **Formularios propios** en `kinkyvibe.ar/formularios/<dirección>` (la dirección sale del nombre
  y se puede cambiar).
- **La encuesta después de cada evento** en `/calendario/<evento>/encuesta`: un día después de
  que termina un evento con entradas, a cada compra confirmada le llega un mail con un link
  personal que sirve una sola vez. Es anónima por defecto, con las 5 preguntas del prototipo
  (#566). Cada evento la apaga en su ficha › Mails › Encuesta.
- **Plantillas** para copiar y editar: «¿Cómo la pasaste?» (la que copia cada evento para su
  encuesta), «Proponé un taller o una colaboración», «Pedido de beca» y «Contanos qué te parece».
- **Un solo editor de preguntas** para los formularios y las preguntas de inscripción
  ([personas-eventos.md](personas-eventos.md)): con el interruptor prendido, la pestaña Preguntas de
  cada evento y Eventos › Roles y preguntas usan el mismo editor, con orden.
- **Les organizadores** ven las respuestas de los formularios de sus eventos en Mi rincón, como las
  de inscripción.

Apagado, nada de esto se ve: las páginas públicas y las del panel dan 404, el cron no manda nada y
las preguntas de inscripción se editan como siempre.

## Lo que nunca se tiene que romper

- **Una respuesta anónima no guarda identidad.** En «Anónimo», o en «Que cada persona elija» con
  «Responder anónimamente» marcada, se guarda solo lo respondido y el **día** (sin hora): ni
  nombre, ni mail, ni cuenta, ni compra. `saveResponse` ni siquiera los manda, y un CHECK de
  `form_responses` lo impide igual. Lo prueban `store.test.js` y `formularios-publico.test.js`.
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

### Datos (migración 0079, solo agrega)

| Tabla            | Qué guarda                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `forms`          | cada formulario (`kind`: `form`, `survey` o `template`), sus preguntas en orden (JSON) y su configuración              |
| `form_responses` | cada respuesta: `answers` `[{ id, label, value }]` (la pregunta copiada como estaba), `day` y, si no es anónima, quién |
| `form_sends`     | el link personal de cada compra (estados como `reminder_sends`) y `used` (si ya se respondió)                          |

- `forms.access`: `link` (cualquiera con el link), `account` (con cuenta) o `ticket` (quienes
  tenían entrada para `event_slug`). `privacy`: `named`, `anonymous` o `choose`. `audience`:
  `organizers` (admins y organizadores del evento) o `admins`. `open`: recibe respuestas (en una
  encuesta, también si se manda). `send_at`: en un formulario `ticket` que no es encuesta, desde
  cuándo se manda el link («Mandar el link a quienes tienen entrada»).
- Una encuesta por evento (índice único). Se crea copiando la plantilla «¿Cómo la pasaste?» cuando
  hace falta: cuando el cron la manda, al apagarla o al tocar «Ver y editar las preguntas» en la
  ficha. Los `load` solo leen.
- Las plantillas viven en la base como cualquier formulario; las que faltan se crean solas
  (`ensureTemplates`, `templates.js`). Cambiar una plantilla no cambia lo ya copiado.

### Privacidad

| Modo                   | El formulario muestra                                                    | Se guarda                      |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------ |
| Con nombre             | nombre y mail (abierto a cualquiera); la cuenta o la compra en los otros | quién respondió y la respuesta |
| Anónimo                | «Es anónimo: no guardamos quién respondió.»                              | solo la respuesta y el día     |
| Que cada persona elija | la casilla «Responder anónimamente»                                      | según la casilla               |

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

- la encuesta de cada evento con entradas, no cancelado, desde un día después de su fin
  (`eventEnd`) y hasta 3 días más tarde (así, al prender el interruptor, no salen las de eventos
  viejos);
- los formularios `ticket` que une admin mandó, desde `send_at` y hasta 3 días más tarde;
- a cada compra aprobada creada antes de que tocara, una vez (`form_sends`, con reintentos), con
  `optOut` («No fui yo» y rebotes) y `Auto-Submitted`.

El mail (`email.js`) reusa los textos del prototipo; el asunto de la encuesta no lleva el título
del evento.

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
| Páginas públicas                  | `public.js`, `src/routes/(content)/formularios/[slug]`, `…/calendario/[event]/encuesta`                     |
| Panel                             | `admin.js`, `responses.js`, `src/routes/(authed)/admin/comunidad/formularios/`, `…/eventos/[slug]/encuesta` |
| Organizadores                     | `organiza.js`, `src/routes/(content)/mi-rincon/perfiles/[slug]/respuestas/[event]/formularios/`             |
| Componentes                       | `src/lib/components/formularios/` (público), `src/lib/components/admin/forms/` (panel)                      |

## Cómo probarlo

```sh
npx vitest run src/lib/utils/formularios.test.js src/lib/admin/questionEditor.test.js \
  src/lib/server/formularios src/lib/components/admin/forms \
  "src/routes/(authed)/admin/comunidad/formularios" "src/routes/(authed)/admin/eventos/roles" \
  "src/routes/(content)/formularios" "src/routes/(content)/mi-rincon/perfiles"
```

A mano: `FORMULARIOS_ENABLED=1 npm run dev:admin`, Comunidad › Formularios.

## A CONFIRMAR

Lo eligió la sesión que lo armó, para avanzar (gorrite no lo decidió):

- A CONFIRMAR: la encuesta no sale si pasaron más de 3 días desde que tocaba (como el prototipo).
- A CONFIRMAR: un formulario con nombre abierto a cualquiera pide nombre **y** mail (obligatorios);
  uno con cuenta guarda el mail de la cuenta y pide el nombre como opcional.
- A CONFIRMAR: el límite es de 10 respuestas por hora por conexión y por cuenta.
- A CONFIRMAR: el editor nuevo de las preguntas de inscripción también queda detrás del interruptor
  `formularios` (apagado, el de siempre).
- A CONFIRMAR: un link que no se pudo mandar no aparece en «Para revisar» (se ve en el formulario:
  mandados, por salir, fallaron, usados).
- A CONFIRMAR: los formularios no se borran (se cierran).
