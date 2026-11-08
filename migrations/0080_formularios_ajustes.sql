-- Migration number: 0080 	 2026-11-05T19:00:00.000Z
-- Formularios, segunda parte (docs/formularios.md; respuestas de gorrite del 5/11). Creada a mano
-- con el formato de `npm run db:migrations:new` (0076, 0077 y 0078 están reservadas para otros
-- PRs). Va junto con 0079 (mismo PR): solo agrega columnas, todas NULL o con valor por defecto, así
-- que anda con el código de antes (decisión 0028).
--
-- - `form_responses.pronouns`: el pronombre de quien respondió con nombre. Nombre, pronombre y mail
--   son los datos que definen si una respuesta es anónima: en una anónima, el CHECK de la columna
--   impide guardarlo (como el de 0079 con nombre, mail, cuenta, orden y hora).
-- - `forms.mail_subject` y `forms.mail_body`: el asunto y el texto del mail con el link personal
--   (encuesta de un evento o formulario «quienes tenían entrada»). Vacío = lo de «Cómo salen por
--   defecto» (y si eso también está vacío, el texto de siempre).
-- - `forms.deleted_at`: borrado suave (decisión 0033): el formulario y sus respuestas quedan, se
--   recupera desde Actividad («Borrados que podés recuperar», `panel_deletions`).

ALTER TABLE form_responses ADD COLUMN pronouns TEXT
	CHECK (pronouns IS NULL OR (anonymous = 0 AND length(pronouns) <= 60));
ALTER TABLE forms ADD COLUMN mail_subject TEXT NOT NULL DEFAULT '' CHECK (length(mail_subject) <= 150);
ALTER TABLE forms ADD COLUMN mail_body TEXT NOT NULL DEFAULT '' CHECK (length(mail_body) <= 2000);
ALTER TABLE forms ADD COLUMN deleted_at INTEGER;
