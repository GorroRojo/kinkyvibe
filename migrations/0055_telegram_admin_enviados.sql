-- Migration number: 0055 	 2026-10-12T04:06:43.000Z
-- Avisos para admins por Telegram, PR 2 (decisión 0041, docs/telegram.md «Estado y avisos para
-- admins»): qué aviso ya se le mandó a cada admin, para no mandar nada dos veces (el resumen
-- diario, que el cron revisa cada 15 minutos, y los avisos de cada venta y cada transferencia).
--
-- Solo agrega una tabla; no toca ninguna que ya exista, así que anda con el código de `main`
-- (decisión 0028). La fila se toma **antes** de mandar (INSERT … ON CONFLICT DO NOTHING: solo
-- una corrida o un pedido la consigue) y se suelta si Telegram falla.
--
-- `notice_key` dice qué se mandó, sin ningún dato de quien compra:
--   `resumen:<AAAA-MM-DD>:<evento>`  el resumen diario de un evento, ese día (hora de Argentina);
--   `venta:<orden>`                  el aviso de una venta (el id de la orden, un UUID);
--   `transferencia:<orden>`          el aviso de una transferencia que llegó.
-- El cron borra las filas de más de 30 días (adminNotify.js, SENT_KEEP_MS).
-- Fechas: milisegundos desde epoch (INTEGER, UTC), como el resto de la base.

CREATE TABLE IF NOT EXISTS telegram_admin_sent (
	-- El id numérico de GitHub de le admin (como telegram_admin_notices).
	github_id INTEGER NOT NULL,
	notice_key TEXT NOT NULL CHECK (length(notice_key) BETWEEN 1 AND 300),
	sent_at INTEGER NOT NULL,
	PRIMARY KEY (github_id, notice_key)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS telegram_admin_sent_at ON telegram_admin_sent (sent_at);
