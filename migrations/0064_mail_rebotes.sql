-- Migration number: 0064 	 2026-10-26T19:33:07.088Z
-- Rebotes y quejas de los mails vuelven al sitio (docs/mails.md, «Rebotes y quejas»). Creada con
-- `npm run db:migrations:new` (salió 0063) y pasada a 0064 porque la 0063 ya la usaba otro PR.
--
-- - `orders.email_id`: el id que devuelve Resend al aceptar el mail de las entradas (el último que
--   salió). Con él, el webhook de Resend encuentra la orden y se puede rastrear un «no me llegó»
--   en Resend.
-- - `orders.email_problem` ('bounced' | 'complained' | 'suppressed') y `email_problem_at`: qué
--   avisó Resend de ese mail y cuándo. Un envío nuevo los limpia.
-- - `resend_webhook_events`: los `svix-id` de los avisos ya procesados, para no procesar dos veces
--   el mismo (se borran solos a los 7 días).
--
-- Solo agrega columnas que pueden quedar vacías, índices parciales y una tabla nueva: anda con el
-- código de `main` (decisión 0028). Nunca guarda direcciones de mail.
ALTER TABLE orders ADD COLUMN email_id TEXT;
ALTER TABLE orders ADD COLUMN email_problem TEXT;
ALTER TABLE orders ADD COLUMN email_problem_at INTEGER;
CREATE INDEX IF NOT EXISTS orders_email_id ON orders (email_id) WHERE email_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_email_problem ON orders (email_problem_at)
	WHERE email_problem IS NOT NULL;
CREATE TABLE IF NOT EXISTS resend_webhook_events (
	svix_id TEXT PRIMARY KEY NOT NULL,
	received_at INTEGER NOT NULL
) WITHOUT ROWID;
