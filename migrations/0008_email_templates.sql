-- Migration number: 0008 	 Plantillas de los mails editables desde el panel.
--
-- Una fila por mail que se cambió en /admin/ajustes/mails/plantillas (id: 'tickets', 'transfer',
-- 'stream', 'reminder', 'refund'; ver src/lib/utils/emailTemplates.js). Sin fila, el mail sale
-- con el texto del código. Solo el asunto, el título y el texto de arriba, en un formato seguro
-- (texto con {{variables}} y **negrita**, nunca HTML); el QR, los links y los datos de la compra
-- los sigue poniendo el código.
CREATE TABLE IF NOT EXISTS email_templates (
	id TEXT PRIMARY KEY NOT NULL,
	subject TEXT NOT NULL,
	heading TEXT NOT NULL,
	body TEXT NOT NULL,
	updated_at INTEGER NOT NULL, -- ms desde epoch
	updated_by TEXT NOT NULL -- login de GitHub de le admin
);
