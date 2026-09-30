-- Migration number: 0013 	 Cuentas del público ("Ingresar" / "Mi rincón"), parte 1: login.
--
-- Separadas del login de admins (GitHub), que no cambia. Ver docs/cuentas.md y
-- src/lib/server/cuentas/. Todo detrás del interruptor `cuentas` (tabla feature_flags, abajo),
-- apagado por defecto.
--
-- Fechas: milisegundos desde epoch (INTEGER, UTC), como el resto de la base.
-- Secretos: nunca en claro. Los tokens de sesión y los códigos por mail se guardan como hash
-- SHA-256; las contraseñas, con PBKDF2 (formato en src/lib/server/cuentas/password.js).
-- Passkeys (más adelante): van en una tabla propia (account_passkeys) que apunte a accounts.id;
-- nada de acá hay que cambiarlo para sumarlas.

-- Interruptores de funciones nuevas, que se prenden desde el panel (/admin/ajustes/interruptores).
-- Sin fila = apagado. La variable de entorno de cada uno puede forzarlo (ver
-- src/lib/server/flags.js).
CREATE TABLE IF NOT EXISTS feature_flags (
	key TEXT PRIMARY KEY NOT NULL CHECK (key GLOB '[a-z]*' AND key NOT GLOB '*[^a-z0-9_]*'),
	enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
	updated_at INTEGER NOT NULL,
	updated_by TEXT NOT NULL -- login de GitHub de le admin
);

-- Una fila por cuenta. Sin nombre para mostrar (decisión P7.3): los nombres van en los perfiles.
CREATE TABLE IF NOT EXISTS accounts (
	-- UUID v4 al azar (no se puede adivinar ni recorrer).
	id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
	-- Normalizado (sin espacios, minúsculas). NULL solo en una cuenta borrada: así el mail queda
	-- libre y no se guarda de alguien que se fue.
	email TEXT UNIQUE
		CHECK (email IS NULL OR (email = lower(trim(email)) AND length(email) BETWEEN 3 AND 254)),
	-- Cuándo se verificó el mail (con un código). Las cuentas nacen verificadas: se crean en el
	-- primer ingreso con código.
	email_verified_at INTEGER,
	-- Opcional: "pbkdf2-sha256$<iteraciones>$<sal>$<hash>" (base64url). NULL = sin contraseña.
	password_hash TEXT,
	password_updated_at INTEGER,
	-- Preferencias (p. ej. "Recordar mi DNI", más adelante), JSON objeto.
	preferences TEXT NOT NULL DEFAULT '{}'
		CHECK (json_valid(preferences) AND json_type(preferences) = 'object'),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	-- Borrado: la fila queda (el id no se reusa) pero sin ningún dato de la persona.
	deleted_at INTEGER,
	CHECK ((deleted_at IS NULL) = (email IS NOT NULL)),
	CHECK (deleted_at IS NULL OR (password_hash IS NULL AND email_verified_at IS NULL
		AND preferences = '{}'))
);

-- Sesiones: duran hasta que la persona cierra sesión (decisión P7.11). Solo el hash del token.
CREATE TABLE IF NOT EXISTS account_sessions (
	-- SHA-256 (hex) del token de la cookie. El token en sí no se guarda nunca.
	token_hash TEXT PRIMARY KEY NOT NULL CHECK (length(token_hash) = 64),
	account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
	-- Cómo se ingresó ('passkey' queda reservado para cuando se sumen).
	method TEXT NOT NULL CHECK (method IN ('code', 'password', 'passkey')),
	created_at INTEGER NOT NULL,
	-- Se actualiza como mucho una vez por día (ver cuentas/session.js).
	last_seen_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS account_sessions_account ON account_sessions (account_id);

-- Códigos de un solo uso que se mandan por mail para ingresar. Vida corta: se borran solos.
-- No guardan el mail: solo su hash (alcanza para buscar el código cuando la persona lo escribe).
CREATE TABLE IF NOT EXISTS login_codes (
	id TEXT PRIMARY KEY NOT NULL, -- UUID v4; también es la sal del hash del código
	email_hash TEXT NOT NULL,
	code_hash TEXT NOT NULL, -- SHA-256 de "<id>:<código>"
	attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	used_at INTEGER
);

CREATE INDEX IF NOT EXISTS login_codes_email ON login_codes (email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS login_codes_expires ON login_codes (expires_at);

-- Órdenes hechas con una cuenta (lo va a usar la compra con cuenta, más adelante). Al borrar la
-- cuenta la orden queda, desvinculada (decisión P7.6). Las compras viejas, sin cuenta, se
-- muestran por el mail verificado (P7.5): para eso, el índice por mail en minúsculas.
ALTER TABLE orders ADD COLUMN account_id TEXT REFERENCES accounts (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_account ON orders (account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_email_lower ON orders (lower(buyer_email));
