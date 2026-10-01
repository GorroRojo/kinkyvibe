-- Migration number: 0023 	 El tipo de perfil «grupo» pasa a llamarse «proyecto».
--
-- Decisión de gorrite: lo que no es una persona (marcas, productoras, emprendimientos, colectivos,
-- fiestas, con une o varies integrantes) es un **proyecto**. `kind` vive en el JSON `data` de los
-- objetos `perfil` (migración 0012), validado en código (src/lib/server/objects/types/perfil.js):
-- no hay CHECK ni tabla de valores en la base, así que alcanza con actualizar las filas.
--
-- - Solo toca perfiles con `kind` = 'grupo' (vivos o borrados). Se puede correr de nuevo: la
--   segunda vez no encuentra nada.
-- - `version` sube de a 1 porque lo exige el trigger `objects_version_check` (0012); de paso, un
--   formulario abierto con la versión vieja avisa del cambio en vez de pisarlo.
-- - No cambia `updated_at` ni `updated_by` (no lo editó nadie) ni `search_text` (no incluye el
--   tipo), así que no hace falta tocar `objects_fts`.
-- - El código igual lee `grupo` como `proyecto` si quedara alguna fila (normalizeProfileKind).
-- - El purpose 'grupo' de `login_codes` (0013) es otra cosa (el código por mail de las acciones de
--   dueñes) y no se toca.
UPDATE objects
SET data = json_set(data, '$.kind', 'proyecto'), version = version + 1
WHERE type = 'perfil' AND json_extract(data, '$.kind') = 'grupo';
