-- Migration number: 0007 	 Entradas: recordatorios por mail antes del evento.
--
-- Qué recordatorio ya se le mandó a cada orden (uno por compra: el mail lleva todas sus
-- entradas). Se inserta ANTES de mandar (reserva) y se borra si el envío falla, así el cron
-- (POST /api/cron/recordatorios) es idempotente aunque corra dos veces a la vez.
-- `reminder_id` sale de cuándo se manda ("h48" = 48 h antes, "d0-0900" = el mismo día a las 9).
CREATE TABLE IF NOT EXISTS reminder_sends (
	order_id TEXT NOT NULL REFERENCES orders (id),
	reminder_id TEXT NOT NULL,
	sent_at INTEGER NOT NULL,
	PRIMARY KEY (order_id, reminder_id)
);
