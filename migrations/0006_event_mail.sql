-- "Mail a compradores" de la ficha de un evento (/admin/eventos/<slug>/mail).
-- Un envío = un asunto + un texto para todes les compradores con orden aprobada del evento.
-- El id lo genera la página al abrir el formulario: mandar dos veces el mismo formulario (doble
-- click, reintento) es el mismo envío. Se manda en tandas (el límite de subrequests de un Worker)
-- y cada destinatarie se reclama antes de mandarle (event_mail_recipients), así que nadie recibe
-- el mismo envío dos veces aunque se corte a la mitad y se retome.
CREATE TABLE IF NOT EXISTS event_mail_sends (
	id TEXT PRIMARY KEY,
	event_slug TEXT NOT NULL,
	subject TEXT NOT NULL,
	body TEXT NOT NULL,
	created_by TEXT NOT NULL,
	created_at INTEGER NOT NULL, -- ms desde epoch
	finished_at INTEGER -- cuando ya no quedaba nadie por mandar
);

CREATE INDEX IF NOT EXISTS event_mail_sends_event ON event_mail_sends (event_slug, created_at DESC);

-- Una fila por envío y por email (en minúsculas): una persona con varias órdenes recibe un solo mail.
CREATE TABLE IF NOT EXISTS event_mail_recipients (
	send_id TEXT NOT NULL,
	email TEXT NOT NULL,
	status TEXT NOT NULL, -- 'sending' | 'sent' | 'failed'
	at INTEGER NOT NULL, -- ms desde epoch del último cambio
	PRIMARY KEY (send_id, email)
);
