-- Migration number: 0034 	 Plantillas de mails: más partes editables y cambios por evento.
--
-- 1. `email_templates` (0008) suma cuatro partes opcionales: la etiqueta gris de arriba del
--    título, el texto del botón, la línea de ayuda de abajo del botón y el «por qué te llega» del
--    pie. NULL = el texto de siempre. Las filas que ya hay quedan iguales (las cuatro en NULL).
-- 2. `event_email_templates`: lo que cambia solo para los mails de un evento (una fila por evento
--    y mail). Cada parte en NULL = la de la plantilla general (y, si no hay, el texto del código).
--    Sin fila, el evento usa la plantilla general.
--
-- Mismo formato seguro que 0008 (texto con {{variables}} y **negrita**, nunca HTML): el QR, los
-- links y los datos de la compra los sigue poniendo el código. Ver src/lib/utils/emailTemplates.js
-- y docs/mails.md. Anda con el código de antes (no lee las columnas nuevas).
ALTER TABLE email_templates ADD COLUMN label TEXT;
ALTER TABLE email_templates ADD COLUMN button TEXT;
ALTER TABLE email_templates ADD COLUMN help TEXT;
ALTER TABLE email_templates ADD COLUMN why TEXT;

CREATE TABLE IF NOT EXISTS event_email_templates (
	event_slug TEXT NOT NULL, -- el slug del evento (como orders.event_slug)
	id TEXT NOT NULL, -- 'tickets', 'transfer', 'stream', 'reminder', 'refund'
	subject TEXT,
	heading TEXT,
	body TEXT,
	label TEXT,
	button TEXT,
	help TEXT,
	why TEXT,
	updated_at INTEGER NOT NULL, -- ms desde epoch
	updated_by TEXT NOT NULL, -- login de GitHub de le admin
	PRIMARY KEY (event_slug, id)
);
