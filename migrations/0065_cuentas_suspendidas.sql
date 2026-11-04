-- Migration number: 0065 	 2026-10-26T23:35:22.719Z
-- Suspender una cuenta del público desde el panel (docs/cuentas.md, «Suspender una cuenta»).
--
-- - `accounts.suspended_at`: cuándo la suspendió une admin; `NULL` = no está suspendida. Con un
--   valor, la cuenta no puede entrar (ni con código ni con contraseña), sus sesiones no valen y el
--   bot no la reconoce.
-- - `accounts.suspended_by`: el login de GitHub de le admin que la suspendió.
-- - `accounts.suspended_reason`: el motivo, opcional y privado: lo ven solo les admins en la ficha
--   de la cuenta. Nunca va a Actividad, a la persona ni a ninguna página pública.
--
-- Solo agrega columnas que pueden quedar vacías: anda con el código de `main` (decisión 0028).
ALTER TABLE accounts ADD COLUMN suspended_at INTEGER;
ALTER TABLE accounts ADD COLUMN suspended_by TEXT;
ALTER TABLE accounts ADD COLUMN suspended_reason TEXT;
