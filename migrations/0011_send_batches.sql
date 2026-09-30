-- Migration number: 0011 	 Recordatorios y link de la transmisión en tandas, con reintentos.
--
-- Antes, el cron mandaba todos los recordatorios que tocaban en un solo pedido, y "Enviar el
-- link a todes" mandaba a todes en el pedido del botón: en un evento grande el Worker se podía
-- cortar a la mitad. Ahora cada corrida manda como mucho una tanda (Ajustes → Mails, "de a
-- cuántos") y la próxima sigue. Cada fila de `reminder_sends` / `stream_link_sends` pasa a tener
-- un estado:
-- - 'sending': reservada, mandando (si queda así más de 10 minutos, el Worker se cortó y se
--   reintenta);
-- - 'sent': salió (las filas que ya existían: antes solo se guardaban las que salían);
-- - 'retry': falló, se reintenta en la próxima tanda;
-- - 'failed': falló `attempts` veces (el máximo): no se reintenta solo; aparece en "Para revisar".
-- `sent_at` pasa a ser el momento del último cambio de estado.
ALTER TABLE reminder_sends ADD COLUMN status TEXT NOT NULL DEFAULT 'sent'
	CHECK (status IN ('sending', 'sent', 'retry', 'failed'));
ALTER TABLE reminder_sends ADD COLUMN attempts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE stream_link_sends ADD COLUMN status TEXT NOT NULL DEFAULT 'sent'
	CHECK (status IN ('sending', 'sent', 'retry', 'failed'));
ALTER TABLE stream_link_sends ADD COLUMN attempts INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS reminder_sends_unsent ON reminder_sends (status) WHERE status != 'sent';
CREATE INDEX IF NOT EXISTS stream_link_sends_unsent ON stream_link_sends (status)
	WHERE status != 'sent';

-- "Enviar el link a todes" pedido y todavía no terminado: el SHA-256 del link que hay que mandar
-- (si el link cambia, el pedido viejo no sigue) y cuándo se pidió. El cron sigue mandando tandas
-- hasta que no queda nadie y entonces lo vuelve a NULL.
ALTER TABLE event_ticket_settings ADD COLUMN stream_send_hash TEXT;
ALTER TABLE event_ticket_settings ADD COLUMN stream_send_requested_at INTEGER;
