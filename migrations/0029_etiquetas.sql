-- Migration number: 0029 	 Etiquetas como objetos (paso 3 de la decisión 0026).
--
-- Las etiquetas pasan a ser objetos `etiqueta` (src/lib/server/objects/types/etiqueta.js), que se
-- escriben SOLO con saveObject(). Esto agrega dos cosas de apoyo y no toca nada de lo que existe.
-- Todo se usa recién con el interruptor `etiquetas_db` prendido o al importar desde el panel.
-- Ver docs/etiquetas.md.
--
-- (0026 y 0027 están en PRs abiertos y 0028 queda para otro PR de la misma noche: por eso 0029.)

-- El nombre con el que los posts nombran una etiqueta (`data.key`, «Rancheadita Kinky») es único
-- entre las etiquetas vivas. Una borrada (suave) no lo ocupa: se puede crear otra con ese nombre.
CREATE UNIQUE INDEX IF NOT EXISTS objects_etiqueta_key
	ON objects (json_extract(data, '$.key'))
	WHERE type = 'etiqueta' AND deleted_at IS NULL;

-- De qué entrada del archivo de etiquetas (src/lib/utils/hardcodedTags.js) y de qué texto de la
-- wiki (src/lib/posts/wiki/*.md) salió cada etiqueta importada, como `profile_sources` (0017):
-- - `source_key`: el nombre de la etiqueta en el archivo;
-- - `source_hash`: SHA-256 de lo importado; si no cambió, reimportar no hace nada;
-- - `imported_version`: la `version` del objeto justo después de importar. Si el objeto tiene
--   otra, alguien lo editó en el panel y la importación no lo pisa.
CREATE TABLE IF NOT EXISTS tag_sources (
	tag_id INTEGER PRIMARY KEY REFERENCES objects (id) ON DELETE CASCADE,
	source_key TEXT NOT NULL UNIQUE CHECK (length(source_key) BETWEEN 1 AND 100),
	source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
	imported_version INTEGER NOT NULL CHECK (imported_version >= 1),
	imported_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
