# 0033. Preguntas de inscripción, roles y notas internas se recuperan

- Fecha: 2026-10-11
- Estado: Aceptada. Reemplaza una parte de 0030 (lo que seguía siendo permanente).

## Contexto

0030 dejó tres borrados permanentes, sin «Recuperar»: las preguntas de inscripción, los roles
agregados desde el panel y las notas internas de una persona. Un clic de más borraba una pregunta
con sus elecciones en cada evento, un rol que usaban otras publicaciones o una nota que nadie más
tenía, sin vuelta atrás.

## Decisión

- **Las tres se recuperan** (gorrite, 11/10), con el mismo camino que lo demás: «Borrados que
  podés recuperar» en Actividad (`panel_deletions`, `undoDeletion`).
- Borrar es **suave**: la fila queda en su tabla con `deleted_at` (migración 0049) y la fila de
  `panel_deletions` se escribe en la misma tanda. Todo lo que lista o usa estas cosas saltea las
  borradas.
- **Preguntas**: las respuestas nunca se tocaron (cada orden guarda la pregunta copiada) y siguen
  en Órdenes y su CSV. Lo que eligió cada evento de una general queda guardado y vuelve con ella.
  Recuperar respeta el tope de preguntas.
- **Roles**: las publicaciones que lo usan lo siguen mostrando como está escrito (como antes); el
  editor lo vuelve a aceptar cuando se recupera. Agregar de nuevo un rol sacado con el mismo nombre
  también lo vuelve. Recuperar respeta el tope de roles.
- **Notas**: vuelven a la ficha de la misma persona o cuenta. En `panel_deletions` y en Actividad
  no va el texto de la nota ni el mail: el id corto de la persona (o la cuenta) y «Nota interna».
- Actividad anota el borrado (como antes) y la recuperación (`signup_field.restore`,
  `persona_role.restore`, `person.note.restore`).
- Sin purga: como el resto de lo que se recupera, lo borrado queda hasta que se decida otra cosa.

## Descartado

- Un «Deshacer» solo en el momento (sin Actividad): no cubre darse cuenta después.
- Copiar la fila a `panel_deletions` y borrarla (como el texto de un mail de un evento): se perdían
  las elecciones de cada evento (`ON DELETE CASCADE`) y las notas iban a quedar copiadas en otra
  tabla.
- Una papelera propia para cada página: ya hay una sola lista para recuperar.

## Consecuencias

- Migración 0049 (solo agrega columnas `deleted_at`, NULL): se aplica antes del merge (0028).
- Código: `src/lib/server/admin/deletions.js` (`softDeletionStatement` y los `undo…`),
  `src/lib/server/tickets/signupFields.js`, `src/lib/server/personas/roles.js`,
  `src/lib/server/admin/people.js` y `ficha.js`. Ver docs/panel.md («Recuperar lo borrado»).
