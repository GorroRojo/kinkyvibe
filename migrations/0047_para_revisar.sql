-- Migration number: 0047 	 «Para revisar»: la última revisión de lo que no se puede contar barato.
--
-- El botón «Para revisar» del panel cuenta las mismas filas que la tarjeta del Inicio (decisión
-- 0030, docs/panel.md). Casi todas salen de consultas chicas, pero una no: la lista para revisar
-- del importador de contenido (Contenido → En la base) compara cada .md del deploy con la base, y
-- eso es demasiado para cada página del panel. Esa página guarda acá lo que encontró la última vez
-- que se abrió (o después de importar), y la fila de «Para revisar» muestra eso, con «revisado
-- hace…», como el chequeo nocturno (`integrity_runs`).
--
-- - Una fila por fuente (`source`: hoy solo 'importacion').
-- - `count`: cuántas cosas para revisar encontró; `detail`: el detalle por categoría, en JSON
--   (solo números: sin datos de personas).
-- - Sin fila (o sin la tabla) = la fila de «Para revisar» no aparece.
-- - Solo agrega una tabla: no toca nada de lo que ya existe. El código que está en `main` no la
--   usa, así que se puede aplicar antes del merge (docs/decisiones/0028-migraciones-antes-del-merge.md).
CREATE TABLE IF NOT EXISTS review_snapshots (
	source TEXT PRIMARY KEY CHECK (length(source) BETWEEN 1 AND 40),
	count INTEGER NOT NULL CHECK (count >= 0),
	detail TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail)),
	computed_at INTEGER NOT NULL, -- ms desde epoch
	computed_by TEXT NOT NULL -- login de quien abrió la página (o 'importacion')
);
