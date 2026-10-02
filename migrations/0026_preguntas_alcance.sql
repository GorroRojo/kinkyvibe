-- Migration number: 0026 	 Preguntas de inscripción: a qué entradas aplican y cuántas veces se preguntan.
--
-- Decisión de gorrite (tanda de pulido): cada pregunta elige a qué tipos de entrada aplica
-- (todos, o algunos) y si se pregunta una vez por compra o una vez por entrada (si alguien compra
-- 3, responde 3 veces: una por cada persona).
--
-- - `signup_fields.per_ticket`: 1 = una vez por entrada; 0 = una vez por compra (lo de siempre).
-- - `signup_fields.ticket_types`: JSON con los ids de los tipos de entrada a los que aplica una
--   pregunta propia de un evento; `[]` = todos (lo de siempre).
-- - `event_signup_general.ticket_types`: lo mismo para una pregunta general en ESE evento (los
--   tipos de entrada son de cada evento); `[]` = todos.
--
-- Solo agrega columnas con valor por defecto: el código que está en `main` nombra sus columnas y
-- no las mira, así que se puede aplicar antes del merge
-- (docs/decisiones/0028-migraciones-antes-del-merge.md). Las respuestas ya guardadas
-- (`order_answers`) no cambian: las de "una vez por entrada" suman `ticket` (1, 2, 3…) al JSON.
ALTER TABLE signup_fields ADD COLUMN per_ticket INTEGER NOT NULL DEFAULT 0 CHECK (per_ticket IN (0, 1));
ALTER TABLE signup_fields ADD COLUMN ticket_types TEXT NOT NULL DEFAULT '[]';
ALTER TABLE event_signup_general ADD COLUMN ticket_types TEXT NOT NULL DEFAULT '[]';
