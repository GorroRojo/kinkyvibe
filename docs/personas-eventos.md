# Personas en eventos y preguntas de inscripción

## Qué hace

Dos cosas, las dos detrás del interruptor **`personas_eventos`** (Ajustes → Interruptores,
apagado por defecto; variable `PERSONAS_EVENTOS_ENABLED`: `1` lo fuerza prendido, `0` apagado).
Apagado, ni las páginas, ni el editor, ni la compra, ni el CSV de Órdenes cambian.

1. **Personas con rol (B7).** Un evento o una publicación de material lista personas con su rol
   («Organiza: Colectivo de Prueba»). Cada rol apunta a un **perfil** (Cuentas → Perfiles). La
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
  2. une admin lo aprobó: `PROFILE_APPROVED_SQL` de `src/lib/server/admin/cuentas.js`, la misma
     marca de «Para revisar» (lo creó une admin, o une admin lo revisó/ocultó/borró);
  3. el interruptor de perfiles está prendido (`profilesSwitchOn()`: hoy `cuentas`).

  Si no, ese perfil no aparece en absoluto (ni «perfil oculto»). Todo eso vive en un solo lugar:
  `src/lib/server/personas/index.js`.

- **El frontmatter es público** (el repo es público): la dirección del perfil queda en el `.md`.
  Por eso el editor solo ofrece perfiles públicos y aprobados.
- **Las respuestas son datos de quien compra:** solo admins (Órdenes y su CSV). Nunca van a una
  página pública, a un mail ni al registro de actividad.
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
- Links: `profileHref()` → `/amigues/<slug>`. La página pública de los perfiles de la base llega con
  el trabajo de amigues; mientras tanto, la lista «Participa en» aparece en la ficha de amigues cuya
  dirección coincide con la del perfil.

### Preguntas

| Tabla                  | Qué guarda                                                                 |
| ---------------------- | -------------------------------------------------------------------------- |
| `signup_fields`        | cada pregunta; `event_slug` NULL = general                                 |
| `event_signup_general` | qué generales usa cada evento                                              |
| `order_answers`        | las respuestas de cada orden (JSON `[{ id, label, value }]`), con la orden |

Topes: 10 preguntas propias por evento, 30 generales, 12 opciones por pregunta, 120 letras por
pregunta y 500 por respuesta. En el CSV de Órdenes, una columna por pregunta (las de hoy y las que
solo tienen respuestas viejas); sin preguntas ni respuestas, el CSV es el de siempre.

## Dónde está el código

| Qué                              | Dónde                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Reglas puras de roles            | `src/lib/utils/personas.js`                                                                              |
| Quién se muestra, editor, perfil | `src/lib/server/personas/index.js`                                                                       |
| Lista de roles                   | `src/lib/server/personas/roles.js`                                                                       |
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
  "src/routes/(authed)/admin/ajustes/personas" scripts/demo/n3-personas.test.js
```

A mano: `PERSONAS_EVENTOS_ENABLED=1 CUENTAS_ENABLED=1 npm run dev`, cargar
`scripts/demo/n3-personas.sql` en la base local
(`npx wrangler d1 execute kinkyvibe --local --file scripts/demo/n3-personas.sql`).
