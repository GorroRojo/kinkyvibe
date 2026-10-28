-- Migration number: 0059 	 Las páginas de la wiki que ya están guardan «HTML libre» explícito.
--
-- `wiki_body_html` (en el JSON `data` de los objetos `etiqueta`, src/lib/server/objects/types/
-- etiqueta.js) dice cómo se muestra el texto de la wiki: `libre` o `corta` (la lista corta de HTML,
-- decisión 0004). Hasta ahora, sin valor se mostraba como `libre` (lo importado de los .md); desde
-- este cambio, sin valor es `corta`, como `body_html` de los eventos y el material. Para que las
-- páginas que ya están se sigan viendo igual, esta migración les escribe `libre` a las que tienen
-- texto y ningún valor.
--
-- - Solo toca etiquetas (vivas o borradas) con `body` y sin `wiki_body_html`. Se puede correr de
--   nuevo: la segunda vez no encuentra nada.
-- - Anda con el código de `main` de antes del cambio (decisión 0028): ahí `libre` y sin valor se
--   muestran igual.
-- - `version` sube de a 1 porque lo exige el trigger `objects_version_check` (0012). No cambia
--   `updated_at` ni `updated_by` (no lo editó nadie) ni `search_text` (no incluye este campo), así
--   que no hace falta tocar `objects_fts`.
UPDATE objects
SET data = json_set(data, '$.wiki_body_html', 'libre'), version = version + 1
WHERE type = 'etiqueta'
	AND json_extract(data, '$.body') IS NOT NULL
	AND json_extract(data, '$.wiki_body_html') IS NULL;
