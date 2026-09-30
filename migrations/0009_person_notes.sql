-- Migration number: 0009 	 Notas internas sobre personas (base de clientes del panel).
--
-- Solo las ven y escriben les admins en /admin/personas/<id>. Se agrupan por el email de las
-- órdenes, normalizado (sin espacios y en minúsculas). Quién y cuándo, y cada alta o baja queda
-- en admin_audit. No es para datos sensibles (DNI, salud, etc.).
CREATE TABLE IF NOT EXISTS person_notes (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT NOT NULL,
	body TEXT NOT NULL,
	created_at INTEGER NOT NULL, -- ms desde epoch
	created_by TEXT NOT NULL -- login de GitHub de le admin
);
CREATE INDEX IF NOT EXISTS person_notes_email ON person_notes (email, created_at DESC);
