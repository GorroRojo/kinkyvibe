-- Migration number: 0025 	 Lugares rechazados: quedan para quien los cargó, con el motivo.
--
-- Hasta ahora, rechazar un lugar que cargó una cuenta (Panel → Eventos → Lugares, "Para aprobar")
-- lo borraba (suave) y desaparecía también del Mi rincón de quien lo cargó. Decisión de gorrite:
-- el lugar sigue existiendo (sin aparecer en el sitio) y quien lo cargó lo ve como «Rechazado»,
-- con el motivo si le admin escribió uno. Editarlo no cambia eso: vuelve a esperar aprobación
-- cuando toca «Volver a mandar» (se borra la fila). Aprobarlo también la borra.
--
-- - Una fila por perfil: el último rechazo. Sin fila = no está rechazado.
-- - Solo agrega una tabla: no toca nada de lo que ya existe. El código que está en `main` no la
--   usa, así que se puede aplicar antes del merge (docs/decisiones/0028-migraciones-antes-del-merge.md).
CREATE TABLE IF NOT EXISTS profile_rejections (
	profile_id INTEGER PRIMARY KEY REFERENCES objects (id) ON DELETE CASCADE,
	rejected_at INTEGER NOT NULL, -- ms desde epoch
	rejected_by TEXT NOT NULL, -- login de GitHub de le admin
	-- Lo que le admin le explica a quien lo cargó (opcional; lo ven esa cuenta y les admins).
	reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 300)
) WITHOUT ROWID;
