-- Migration number: 0065 	 2026-10-27T00:20:31.912Z
-- «Dónde tenés la sesión abierta» en Mi rincón (docs/cuentas.md, «Sesiones»).
--
-- `account_sessions.device`: un nombre corto del navegador y el dispositivo, sacado del user agent
-- al entrar («Firefox en Android», «Safari en iPhone»; `deviceLabel()` en
-- src/lib/utils/userAgent.js). Nunca el user agent entero, ni la IP, ni un lugar. Las sesiones de
-- antes quedan en NULL y se muestran como «Navegador sin identificar».
--
-- Solo agrega una columna que puede quedar vacía: anda con el código de `main` (decisión 0028).
ALTER TABLE account_sessions ADD COLUMN device TEXT
	CHECK (device IS NULL OR length(device) BETWEEN 1 AND 60);
