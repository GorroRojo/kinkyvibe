-- Etiqueta corta (opcional) de cada pregunta de inscripción, para el panel de Órdenes, donde
-- varias respuestas tienen que entrar en un renglón. Vacía (NULL) = se usa la pregunta entera.
-- Quien compra sigue viendo la pregunta entera.
ALTER TABLE signup_fields ADD COLUMN short_label TEXT;
