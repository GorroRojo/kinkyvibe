-- Migration number: 0061 	 2026-10-25T01:10:46.644Z
-- «No fui yo», parte 2 (docs/mails.md, docs/cuentas.md): una orden gratis hecha sin la sesión de
-- la cuenta de ese mail no aparece en Mi rincón ni en «Mis entradas» del bot hasta que la cuenta
-- dice «Sí, son mías». Con «No es mía» deja de mostrarse para esa cuenta. Cualquiera puede escribir
-- un mail ajeno en el formulario de entradas gratis; las compras pagas se ven siempre.
--
-- Una fila por cuenta y orden: `mine` = 1 («Sí, son mías», o la pidió con la sesión de esa
-- cuenta) o 0 («No es mía»). No se modifica ninguna orden.
--
-- Solo agrega una tabla; no toca ninguna que ya exista, así que anda con el código de `main`
-- (decisión 0028).
CREATE TABLE IF NOT EXISTS free_order_choices (
	account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
	order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
	mine INTEGER NOT NULL CHECK (mine IN (0, 1)),
	created_at INTEGER NOT NULL,
	PRIMARY KEY (account_id, order_id)
) WITHOUT ROWID;
