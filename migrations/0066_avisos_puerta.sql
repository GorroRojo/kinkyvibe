-- Migration number: 0066 	 2026-10-26T23:47:30.590Z
-- Avisos de puerta (decisión 0053, docs/tickets.md «Avisos de puerta»): personas que la
-- organización no admite en los eventos que organiza Kinky Vibe. En la puerta, si una entrada
-- coincide, se ve solo «Avisá a la organización antes de dejar pasar»; nunca frena el ingreso.
-- Creada con `npm run db:migrations:new` (salió 0065) y pasada a 0066 porque la 0065 ya la usa otra
-- rama en curso.
--
-- - Un aviso es de una cuenta (`account_id`) o de un mail (`email_hash`), nunca de un nombre.
-- - Nunca se guarda el mail: solo SHA-256 en hex de `puerta:aviso:<mail en minúsculas, sin
--   espacios>` (`noticeEmailHash`, src/lib/server/tickets/doorNotices.js). Con un prefijo propio
--   para que no se pueda cruzar con otros hashes de mail de la base (códigos, «No fui yo»).
-- - `reason`: el motivo, opcional, solo para admins en el panel. Nunca va a la puerta, al registro
--   de actividad, a los mails ni a la entrada de la persona.
-- - `expires_at` es obligatorio (6 meses, 1 año o una fecha de hasta 2 años): el cron de los
--   recordatorios borra los vencidos y avisa por mail 14 días antes (`reminded_at`: ya se avisó).
--
-- Solo agrega una tabla nueva: anda con el código de `main` (decisión 0028).
CREATE TABLE IF NOT EXISTS door_notices (
	-- UUID v4 al azar.
	id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
	account_id TEXT REFERENCES accounts (id) ON DELETE CASCADE,
	email_hash TEXT CHECK (email_hash IS NULL OR length(email_hash) = 64),
	reason TEXT CHECK (reason IS NULL OR length(reason) <= 500),
	created_at INTEGER NOT NULL,
	-- Login de GitHub de le admin que lo cargó.
	created_by TEXT NOT NULL,
	expires_at INTEGER NOT NULL,
	reminded_at INTEGER,
	updated_at INTEGER NOT NULL,
	-- Exactamente una de las dos: cuenta o mail.
	CHECK ((account_id IS NULL) <> (email_hash IS NULL)),
	CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS door_notices_account ON door_notices (account_id)
	WHERE account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS door_notices_email ON door_notices (email_hash)
	WHERE email_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS door_notices_expires ON door_notices (expires_at);
