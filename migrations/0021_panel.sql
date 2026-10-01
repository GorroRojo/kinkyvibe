-- Migration number: 0021 	 Panel: borrar desde el panel (con deshacer) y gráficos de Estadísticas.
--
-- Solo agrega (no cambia ni borra nada). Los números 0016–0020 los usan otros PRs abiertos.
--
-- panel_deletions: cada publicación (evento, material, amigues) borrada desde el panel. Guarda
--   lo necesario para recuperarla aunque el borrado ya se haya publicado: el texto del .md, su
--   sha de git y la lista de archivos de su carpeta de imágenes con sus shas (los blobs siguen en
--   el historial del repo, así que restaurar no necesita volver a subirlos). Lo escribe
--   src/lib/server/admin/deletions.js, nunca a mano. Sin datos de personas: solo contenido que
--   ya era público en el repo.
CREATE TABLE IF NOT EXISTS panel_deletions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	kind TEXT NOT NULL CHECK (kind IN ('calendario', 'material', 'amigues')),
	slug TEXT NOT NULL,
	title TEXT NOT NULL,
	path TEXT NOT NULL, -- src/lib/posts/<kind>/<slug>.md
	content TEXT NOT NULL, -- el .md tal como estaba
	content_sha TEXT NOT NULL, -- sha de git del .md (blob)
	media TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(media)), -- [{path, sha}]
	-- borrado: el PR que borra (puede estar abierto todavía); deshecho: se cerró el PR antes de
	-- publicarse; recuperado: se publicó y después se restauró con otro PR.
	status TEXT NOT NULL DEFAULT 'borrado' CHECK (status IN ('borrado', 'deshecho', 'recuperado')),
	pr_number INTEGER, -- NULL en el mock y en el modo demo (no hay PR)
	pr_branch TEXT,
	deleted_at INTEGER NOT NULL, -- ms desde epoch
	deleted_by TEXT NOT NULL, -- login de quien borró
	restored_at INTEGER,
	restored_by TEXT,
	restore_pr INTEGER
);
-- «Recuperables» en Actividad y «¿hay un borrado de esto?» en la página de borrar.
CREATE INDEX IF NOT EXISTS panel_deletions_status ON panel_deletions (status, deleted_at DESC);
CREATE INDEX IF NOT EXISTS panel_deletions_post ON panel_deletions (kind, slug, deleted_at DESC);

-- Estadísticas lee todas las órdenes aprobadas y reembolsadas (loadPeopleOrders). Sin índice por
-- estado, D1 recorre también las reservas vencidas y los pagos rechazados, que son la mayoría de
-- las filas con el tiempo; con este índice solo lee las que cuentan, ya ordenadas por fecha.
CREATE INDEX IF NOT EXISTS orders_status_created ON orders (status, created_at);
