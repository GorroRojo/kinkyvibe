# Personas en eventos y preguntas de inscripción

## Qué hace

Dos cosas, las dos detrás del interruptor **`personas_eventos`** (Ajustes → Interruptores,
apagado por defecto; variable `PERSONAS_EVENTOS_ENABLED`: `1` lo fuerza prendido, `0` apagado).
Apagado, ni las páginas, ni el editor, ni la compra, ni el CSV de Órdenes cambian.

1. **Personas con rol (B7).** Un evento o una publicación de material lista personas con su rol
   («Organiza: Colectivo de Prueba»). Cada rol apunta a un **perfil** de persona o de proyecto
   (Perfiles del panel, los mismos de /amigues: [amigues.md](amigues.md)). La
   página del evento muestra los roles con link al perfil, y la página de un perfil lista sus
   eventos y publicaciones por rol («Participa en»).
2. **Preguntas de inscripción (B8).** Preguntas extra al comprar o inscribirse (texto, opciones
   o casilla; obligatorias u opcionales): propias de un evento (pestaña **Preguntas** de su
   ficha) y generales, que se definen una vez (Eventos → **Roles y preguntas**) y cada evento
   elige. Las respuestas se guardan con la orden y se ven en la pestaña **Órdenes** y en su CSV.

## Lo que nunca se tiene que romper

- **Ningún perfil que no sea público filtra su nombre ni su link.** Se muestra solo si:
  1. el perfil es visible para cualquiera (`visibleWhere(ANON)` de los objetos: ni oculto, ni
     «solo con cuenta», ni borrado). Se mira como anónime a propósito: la página es igual para
     todes y se puede cachear;
  2. está aprobado para /amigues (`PROFILE_APPROVED_SQL` de `src/lib/server/admin/cuentas.js`:
     fila en `profile_approvals`, migración 0017), la misma regla que la lista de amigues. Los
     que carga une admin y los importados nacen aprobados; los de una cuenta esperan a une admin;
  3. es una persona o un proyecto (`profileKindOf()` de
     `src/lib/server/objects/types/perfil.js`, que lee el viejo `grupo` como proyecto). Los
     lugares no van como personas: van en «Sucede en» (edge `lugar`, ver amigues.md);
  4. el interruptor `perfiles_publicos` está prendido (`profilesSwitchOn()`): sin él, /amigues
     muestra las fichas `.md` y el link no tendría a dónde ir.

  Si no, ese perfil no aparece en absoluto (ni «perfil oculto»). Todo eso vive en un solo lugar:
  `src/lib/server/personas/index.js`.

- **El frontmatter es público** (el repo es público): la dirección del perfil (la del objeto, en
  minúsculas y guiones) queda en el `.md`.
  Por eso el editor solo ofrece perfiles públicos y aprobados.
- **Las respuestas son datos de quien compra:** las ven les admins (Órdenes y su CSV) y les
  organizadores de ESE evento (ver «Respuestas para les organizadores»). Nunca van a una página
  pública ni a un mail, y el registro de actividad anota quién las miró, nunca qué dicen.
- **La compra es una sola:** las preguntas pasan por `validatePurchase` (validación en el
  servidor, con largos máximos) y las respuestas se guardan en la **misma tanda** que la orden
  (`reserveOrder` → `answersStatement`): si la reserva no entra, no queda nada.
- **Se guarda la pregunta como estaba** al comprar: cambiar o borrar una pregunta no cambia lo que
  ya se respondió.

## Cómo funciona

### Roles en el frontmatter

```yaml
personas:
  - perfil: colectivo-de-prueba # la dirección (slug) del perfil
    rol: Organiza
  - perfil: persona-de-prueba
    rol: Facilita
  - nombre: Persona Sin Perfil # un nombre libre: se muestra sin link
    rol: Fotografía
```

- **Un nombre libre** (`nombre:` en vez de `perfil:`) sirve para cualquier rol: alguien sin perfil
  todavía (se le vincula uno después). En la página va como texto, sin link.

- Roles fijos (código, `FIXED_ROLES` en `src/lib/utils/personas.js`): Autore, Traductore, Organiza,
  Produce, Facilita, Monitorea, Enseña, Fotografía, Diseño. Les admins suman más en Eventos →
  Roles y preguntas (tabla `persona_roles`). Sacar uno no toca los `.md`: se sigue mostrando
  como está escrito, y el editor avisa al guardar.
- **Una sola sección «Personas»** (pedido de gorrite): «Organizan» / «Autores» y «Personas» se
  editan juntas al crear un evento, al editarlo, en material y en la wiki. Un buscador como el de
  «Organizan» (fichas de amigues, perfiles de la base o un nombre libre → «Agregar») y cada persona
  en una fila con su rol (Organiza en eventos y Autore en material es el de quien se suma), para
  subir, bajar o sacar. Sin el interruptor, la sección es el «Organizan» de siempre (sin roles).
  Guardar valida forma, perfil o nombre y rol («Personas, fila 1: elegí un perfil o escribí un
  nombre»); lo que el archivo ya tenía mal no bloquea guardar otros cambios.
- **Dónde se guarda.** En los `.md` no cambia nada: los nombres con el rol de autores (Organiza en
  eventos, Autore en material y wiki) van a `authors:` y el resto a `personas:`, así que un `.md`
  sin cambios en las personas queda igual, byte a byte. En la base (`contenido_db`) es **una sola
  lista**, `[{ profile?, name?, role }]` (`profile` es la dirección del perfil, como `perfil:`;
  `name`, un nombre): en los eventos, los perfiles van como edges (abajo) y el resto en
  `data.personas`; en el material, todo en `data.personas`. Las páginas, las tarjetas, el `.ics`,
  el RSS, la búsqueda y «Participa en» siguen leyendo `authors` y `personas` de la metadata, que
  para los posts de la base se arma desde esa lista (`authors` = los nombres con el rol de autores,
  en orden). El mapa está en un solo lugar, con pruebas de ida y vuelta:
  `src/lib/utils/personasList.js`. Lo importado
  antes (con `data.authors` y `extra.personas`) se lee igual y pasa a la lista única la próxima vez
  que se guarda o se vuelve a importar (no hace falta migrar nada).
- **Un perfil con el rol Organiza** que se suma desde los perfiles de la base va a `personas:`
  (como antes), no a `authors:`: `authors:` lleva nombres (el de la ficha de amigues, si tiene). Una
  ficha de amigues importada a la base es una sola sugerencia: con el rol de autores se guarda su
  nombre en `authors:`; con otro rol, su perfil en `personas:`.
- **«+ Nuevo rol…»** al final del selector de rol: crea el rol ahí mismo (un campo chico → «Crear
  rol») y se lo pone a esa persona. Llama a la misma acción que Eventos › Roles y preguntas
  (`?/addRole`): solo admins, la misma validación (un rol repetido: «… ya está en la lista: elegilo
  de ahí.»), el mismo registro de actividad (`persona_role.add`) y la protección de SvelteKit contra
  pedidos de otros sitios.
- **Edges en la base (eventos).** En un evento de la base, cada perfil de la lista es un **edge
  `persona`** (evento → perfil), no una dirección en `data` (regla 4 de [objetos.md](objetos.md);
  decisión de gorrite, «Contenido solo en la base», paso 3): un edge por perfil con
  `data: { roles: [...], at: [...] }`, cada rol con su lugar en la lista. En `data.personas`
  quedan solo los nombres sin perfil (y una dirección que no es de ningún perfil vivo: no hay a qué
  apuntar), en su orden. Guardar (panel o importación) parte la lista y leer la vuelve a armar
  igual, en el mismo orden, así la metadata, el `.md` que arma la base, la búsqueda y «Participa
  en» no cambian: `src/lib/server/contenido/personasEdges.js`. La migración
  `0035_relaciones_edges.sql` pasó a edges lo que ya estaba guardado. Las lecturas internas traen
  los edges de cualquier perfil, como antes estaba la dirección en el JSON: qué se muestra lo sigue
  decidiendo `personas/index.js`. El material todavía guarda la lista entera en `data.personas`
  (paso aparte).
- La wiki se prerenderiza (sin base al compilar): ahí el frontmatter se guarda pero la página no
  muestra personas.
- Links: `profileHref()` → `/amigues/<dirección>`: la vieja si el perfil se importó de una ficha
  `.md` (`profile_sources.legacy_slug`, como `urlSlugOf()` de amigues), si no la del objeto. La
  lista «Participa en» aparece en la página del perfil de la base (`perfiles_publicos`), buscada
  por la dirección del objeto (`objectSlug` de `profilePageData`).

### Preguntas

| Tabla                  | Qué guarda                                                                 |
| ---------------------- | -------------------------------------------------------------------------- |
| `signup_fields`        | cada pregunta; `event_slug` NULL = general                                 |
| `event_signup_general` | qué generales usa cada evento                                              |
| `order_answers`        | las respuestas de cada orden (JSON `[{ id, label, value }]`), con la orden |

**Alcance y edición (migración 0026).** Cada pregunta se puede **editar** (texto, tipo, opciones,
obligatoria y alcance) en vez de borrarla y crearla de nuevo; las respuestas ya guardadas quedan
como se respondieron (con la pregunta copiada como estaba). Y cada pregunta elige:

- **a qué tipos de entrada aplica**: todos (`[]`, lo de siempre) o algunos. Las propias de un evento
  lo guardan en `signup_fields.ticket_types`; una general no tiene tipos propios (son de cada
  evento): cada evento la acota al elegirla (`event_signup_general.ticket_types`). Como una compra
  es de un solo tipo, una pregunta acotada se pide solo al comprar ese tipo;
- **cuántas veces se pregunta**: una vez por compra (lo de siempre) o **una vez por entrada**
  (`signup_fields.per_ticket`): si alguien compra 3, responde 3 veces, dentro de cada entrada del
  formulario (campo `campo_<id>_<entrada>`). Se guarda con `ticket` (1, 2, 3…) en el JSON de
  `order_answers`; en Órdenes cada respuesta dice de qué entrada es y en los CSV (Órdenes y el de
  les organizadores) van juntas en la columna de la pregunta: «Entrada 1: … | Entrada 2: …».

Las reglas puras (qué preguntas aplican a cada tipo, cuántas respuestas pide una compra, validar
el alcance) están en `src/lib/utils/signupFields.js` (`fieldsForTicketType`, `answerSlots`,
`answerSetCount`, `validateFieldScope`).

Topes: 10 preguntas propias por evento, 30 generales, 12 opciones por pregunta, 120 letras por
pregunta y 500 por respuesta. En el CSV de Órdenes, una columna por pregunta (las de hoy y las que
solo tienen respuestas viejas); sin preguntas ni respuestas, el CSV es el de siempre.

### Respuestas para les organizadores

Decisión de gorrite: además de les admins, ven las respuestas quienes **gestionan** (dueñes o
gestores en `profile_managers`, Perfiles del panel) un perfil que figura con el rol **Organiza**
en el `personas:` de ese evento. Solo las de sus eventos.

- **Dónde:** Mi rincón → Perfiles → el perfil → «Respuestas de inscripción» (la sección aparece si
  el perfil organiza algún evento publicado) → `/mi-rincon/perfiles/<perfil>/respuestas/<evento>`
  y su CSV (`…/respuestas.csv`).
- **Qué se ve:** cada pregunta y, por cada orden **confirmada** (`approved`) con respuestas, el
  nombre de quien compró y lo que respondió. Ni mail, ni teléfono, ni DNI, ni montos. Las reservas
  sin pagar, vencidas o reembolsadas no aparecen (les admins las siguen viendo en Órdenes).
- **Quién entra (todo en el servidor, `requireOrganizer` en `src/lib/server/personas/organiza.js`):**
  1. interruptor `cuentas` prendido, sesión de cuenta (si no, a `/ingresar?next=…`) y el permiso
     «puede tener perfiles»: lo mismo que el resto de Mi rincón (`requireMember`);
  2. interruptor `personas_eventos` prendido;
  3. la cuenta gestiona el perfil (`getManagedProfile`);
  4. el evento está publicado y lista ese perfil con el rol Organiza (sin importar mayúsculas).

  Si algo no se cumple: **404, no 403**, así no se sabe si el evento existe o tiene respuestas.
  Gestionar un perfil con otro rol en el evento (por ejemplo Facilita) no alcanza.

- **Perfiles ocultos o sin aprobar:** quienes los gestionan **entran igual**. Organizar es un
  hecho del evento, no de la visibilidad del perfil, y la página es privada: no le muestra el
  perfil a nadie más. Lo que sí esconde un perfil oculto o sin aprobar es su nombre en las páginas
  públicas (arriba). Si une admin borra el perfil, se pierde el acceso.
- **Registro:** cada vista y cada CSV quedan en el registro de actividad (`signup_answers.view`,
  autor «cuentas (sitio)»): perfil, evento, id de la cuenta y si fue CSV. Sin respuestas.
- **Límite:** 10 CSV por hora por cuenta (`ORGANIZER_CSV_RATE_LIMIT`, tabla `rate_limits`); pasado
  eso, 429.

## Dónde está el código

| Qué                              | Dónde                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reglas puras de roles            | `src/lib/utils/personas.js`                                                                                                                                              |
| Quién se muestra, editor, perfil | `src/lib/server/personas/index.js`                                                                                                                                       |
| Lista de roles                   | `src/lib/server/personas/roles.js`                                                                                                                                       |
| Respuestas para organizadores    | `src/lib/server/personas/organiza.js`, `src/routes/(content)/mi-rincon/perfiles/[slug]/respuestas/`                                                                      |
| Entrada y acciones del panel     | `src/lib/server/personas/admin.js`                                                                                                                                       |
| Reglas puras de preguntas        | `src/lib/utils/signupFields.js`                                                                                                                                          |
| Preguntas y respuestas en D1     | `src/lib/server/tickets/signupFields.js`                                                                                                                                 |
| Componentes públicos             | `PersonasConRol.svelte`, `ParticipacionesPorRol.svelte`, `SignupFieldInputs.svelte`                                                                                      |
| Lista única (md ⇄ base)          | `src/lib/utils/personasList.js` (y `personasPicker.js`, el formulario)                                                                                                   |
| Componentes del panel            | `admin/event-form/PersonasSection.svelte`, `PersonasField.svelte`, `SignupFieldForm.svelte`, `SignupFieldList.svelte`, `OrderAnswers.svelte`, `GeneralFieldScope.svelte` |
| Migración                        | `migrations/0018_personas_eventos.sql`, `migrations/0026_preguntas_alcance.sql`                                                                                          |
| Datos de demo (solo preview)     | `scripts/demo/n3-personas.sql`                                                                                                                                           |

## Cómo probarlo

```sh
npx vitest run src/lib/utils/personas.test.js src/lib/utils/personasList.test.js \
  src/lib/utils/signupFields.test.js \
  src/lib/server/personas src/lib/server/tickets/signupFields.test.js \
  "src/routes/(authed)/admin/eventos/roles" scripts/demo/n3-personas.test.js \
  "src/routes/(content)/mi-rincon/perfiles/respuestas-routes.test.js"
```

A mano: `PERSONAS_EVENTOS_ENABLED=1 PERFILES_PUBLICOS_ENABLED=1 CUENTAS_ENABLED=1 npm run dev`,
cargar
`scripts/demo/n3-personas.sql` en la base local
(`npx wrangler d1 execute kinkyvibe --local --file scripts/demo/n3-personas.sql`).
