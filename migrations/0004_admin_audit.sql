-- Registro de actividad del panel de admin: quién cambió qué y cuándo.
-- Lo escribe `logAdminAction` (src/lib/server/admin/audit.js), nunca a mano. No guarda DNI,
-- tokens ni datos de pago: solo un resumen legible y un detalle JSON chico y filtrado.
CREATE TABLE IF NOT EXISTS admin_audit (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	at INTEGER NOT NULL, -- ms desde epoch
	actor_id INTEGER, -- id numérico de GitHub de le admin
	actor_login TEXT NOT NULL,
	action TEXT NOT NULL, -- ej. 'transfer.confirm', 'event.publish'
	target_type TEXT, -- ej. 'order', 'event', 'discount', 'settings'
	target_id TEXT, -- ej. id de la orden, slug del evento, código
	summary TEXT NOT NULL, -- una línea para mostrar ("Confirmó la transferencia KV-…")
	detail TEXT -- JSON opcional
);

CREATE INDEX IF NOT EXISTS admin_audit_at ON admin_audit (at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_target ON admin_audit (target_type, target_id, at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_actor ON admin_audit (actor_login, at DESC);
