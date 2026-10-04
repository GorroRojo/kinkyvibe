-- Migration number: 0045 	 Notas internas atadas a una cuenta (para las cuentas borradas).
--
-- Las notas de la ficha de una persona (0009) se agrupan por el mail. Una cuenta borrada ya no
-- tiene mail (0013: `accounts.email` queda NULL), así que su ficha no podía tener notas. Ahora una
-- nota puede ir atada al id de la cuenta: `account_id` con el id y `email` vacío (''), porque
-- `email` es NOT NULL y SQLite no deja cambiarlo sin rehacer la tabla. Las notas por mail siguen
-- como estaban (`account_id` NULL).
--
-- Sin foreign key: las cuentas borradas se quedan en `accounts` (borrado suave); si algún día se
-- purgan, sus notas se borran en esa misma purga.
ALTER TABLE person_notes ADD COLUMN account_id TEXT;
CREATE INDEX IF NOT EXISTS person_notes_account ON person_notes (account_id, created_at DESC)
	WHERE account_id IS NOT NULL;
