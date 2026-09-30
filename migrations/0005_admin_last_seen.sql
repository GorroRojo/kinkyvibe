-- Migration number: 0005 	 Panel de admin: "Desde tu última visita" en el Inicio.
--
-- Una fila por admin (id numérico de GitHub). `seen_at` es desde cuándo se muestran las
-- novedades; `last_at` es la última vez que abrió el Inicio. Una visita nueva (más de 30 minutos
-- después de `last_at`) corre `seen_at` a `last_at`; "Marcar como visto" lo pone en ahora.
-- Lo maneja src/lib/server/admin/lastSeen.js.
CREATE TABLE IF NOT EXISTS admin_last_seen (
	admin_id INTEGER PRIMARY KEY NOT NULL,
	seen_at INTEGER NOT NULL, -- ms desde epoch
	last_at INTEGER NOT NULL -- ms desde epoch
);
