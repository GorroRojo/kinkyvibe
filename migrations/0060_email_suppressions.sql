-- Migration number: 0060 	 2026-10-24T19:08:40.564Z
-- «No fui yo»: direcciones que pidieron no recibir más mails de Kinky Vibe (docs/mails.md, «No
-- fui yo»). Varios formularios públicos mandan un mail a la dirección que escribe quien lo llena
-- (entradas gratis, reservas por transferencia, lista de espera, «Avisame si se repite»); el pie de
-- esos mails lleva un link firmado para cortarlos. Los mails de una compra pagada salen igual.
--
-- Solo agrega una tabla; no toca ninguna que ya exista, así que anda con el código de `main`
-- (decisión 0028).
--
-- Nunca se guarda el mail: la clave es el mismo hash que usan los límites y los códigos de las
-- cuentas (`emailHash` de src/lib/server/cuentas/accounts.js: SHA-256 en hex de
-- `cuentas:email:<mail en minúsculas, sin espacios>`).
CREATE TABLE IF NOT EXISTS email_suppressions (
	email_hash TEXT PRIMARY KEY NOT NULL CHECK (length(email_hash) = 64),
	created_at INTEGER NOT NULL
) WITHOUT ROWID;
