-- Migration number: 0049 	 Preguntas de inscripción, roles y notas internas se borran suave.
--
-- Decisión 0033 (gorrite, 11/10; cambia una parte de 0030): borrar una pregunta de inscripción, un
-- rol agregado desde el panel o una nota interna de una persona ya no borra la fila. Se marca
-- `deleted_at` y, en la misma tanda, se anota en `panel_deletions` (0021) para «Recuperar» en
-- Actividad, como las etiquetas y los perfiles (src/lib/server/admin/deletions.js).
--
-- - `deleted_at`: ms desde epoch; NULL = está (todas las filas de antes quedan así). Quién borró
--   queda en `panel_deletions.deleted_by` y en Actividad (`admin_audit`).
-- - Lo que lee estas tablas saltea las filas con `deleted_at`.
-- - Las respuestas (`order_answers`) nunca dependieron de la pregunta (guardan una copia). Lo que
--   eligió cada evento (`event_signup_general`) queda: con la pregunta borrada no se ve, y vuelve
--   si se recupera.
--
-- Solo agrega columnas que pueden ser NULL, sin valor por defecto: el código que está en `main` no
-- las nombra (borra de verdad y lee sin mirarlas), así que se puede aplicar antes del merge
-- (docs/decisiones/0028-migraciones-antes-del-merge.md).
ALTER TABLE signup_fields ADD COLUMN deleted_at INTEGER;
ALTER TABLE persona_roles ADD COLUMN deleted_at INTEGER;
ALTER TABLE person_notes ADD COLUMN deleted_at INTEGER;
