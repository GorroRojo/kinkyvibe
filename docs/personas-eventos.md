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
   ficha) y generales, que se definen una vez (Ajustes → **Personas y preguntas**) y cada evento
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
     lugares no van como personas: van en «Sucede en» (`event_venues`, ver amigues.md);
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
```

- Roles fijos (código, `FIXED_ROLES` en `src/lib/utils/personas.js`): Autore, Traductore, Organiza,
  Produce, Facilita, Monitorea, Enseña, Fotografía, Diseño. Les admins suman más en Ajustes →
  Personas y preguntas (tabla `persona_roles`). Sacar uno no toca los `.md`: se sigue mostrando
  como está escrito, y el editor avisa al guardar.
- El editor de publicaciones (eventos, material y wiki) tiene la sección «Personas». Guardar valida
  forma, perfil y rol (`validatePersonas`); como con las entradas, lo que el archivo ya tenía mal no
  bloquea guardar otros cambios.
- **¿Por qué no edges?** Un edge une dos objetos, y los eventos todavía son `.md`. El tipo `evento`
  ya declara el edge `persona` (→ `perfil`, `data: { roles: [...] }`) y `personasToEdges()` arma
  exactamente esa forma: cuando los eventos pasen a la base, cada `personas:` se convierte en edges
  con `saveObject()` y estas lecturas pasan a `getEdges()`.
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

| Qué                              | Dónde                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Reglas puras de roles            | `src/lib/utils/personas.js`                                                                              |
| Quién se muestra, editor, perfil | `src/lib/server/personas/index.js`                                                                       |
| Lista de roles                   | `src/lib/server/personas/roles.js`                                                                       |
| Respuestas para organizadores    | `src/lib/server/personas/organiza.js`, `src/routes/(content)/mi-rincon/perfiles/[slug]/respuestas/`      |
| Entrada y acciones del panel     | `src/lib/server/personas/admin.js`                                                                       |
| Reglas puras de preguntas        | `src/lib/utils/signupFields.js`                                                                          |
| Preguntas y respuestas en D1     | `src/lib/server/tickets/signupFields.js`                                                                 |
| Componentes públicos             | `PersonasConRol.svelte`, `ParticipacionesPorRol.svelte`, `SignupFieldInputs.svelte`                      |
| Componentes del panel            | `admin/PersonasEditor.svelte`, `SignupFieldForm.svelte`, `SignupFieldList.svelte`, `OrderAnswers.svelte` |
| Migración                        | `migrations/0018_personas_eventos.sql`                                                                   |
| Datos de demo (solo preview)     | `scripts/demo/n3-personas.sql`                                                                           |

## Cómo probarlo

```sh
npx vitest run src/lib/utils/personas.test.js src/lib/utils/signupFields.test.js \
  src/lib/server/personas src/lib/server/tickets/signupFields.test.js \
  "src/routes/(authed)/admin/ajustes/personas" scripts/demo/n3-personas.test.js \
  "src/routes/(content)/mi-rincon/perfiles/respuestas-routes.test.js"
```

A mano: `PERSONAS_EVENTOS_ENABLED=1 PERFILES_PUBLICOS_ENABLED=1 CUENTAS_ENABLED=1 npm run dev`,
cargar
`scripts/demo/n3-personas.sql` en la base local
(`npx wrangler d1 execute kinkyvibe --local --file scripts/demo/n3-personas.sql`).
