-- Migration number: 0061 	 2026-10-25T01:10:46.644Z
-- «No fui yo», parte 2 (docs/mails.md, docs/cuentas.md): una orden gratis hecha sin la sesión de
-- la cuenta de ese mail no aparece en Mi rincón ni en «Mis entradas» del bot hasta que la cuenta
-- dice «Sí, son mías». Con «No es mía» deja de mostrarse para esa cuenta. Cualquiera puede escribir
-- un mail ajeno en el formulario de entradas gratis; las compras pagas se ven siempre.
--
-- Solo se pregunta por las gratis del formulario público (`channel = 'online'`; las de la puerta
-- y las cargadas a mano se ven siempre) creadas desde que se aplica esta migración: las de antes
-- se ven como siempre. El corte queda en `ticket_settings` (abajo): 1 ms después de la orden más
-- nueva que haya al aplicarse (sale de la base, no de una fecha escrita a mano, y da lo mismo en
-- cada base de prueba); sin esa fila, el código no pregunta por ninguna.
--
-- Una fila por cuenta y orden: `mine` = 1 («Sí, son mías», o la pidió con la sesión de esa
-- cuenta) o 0 («No es mía»). No se modifica ninguna orden.
--
-- Agrega una tabla y una fila de ajustes que el código de `main` no lee, así que anda con ese
-- código (decisión 0028).
CREATE TABLE IF NOT EXISTS free_order_choices (
	account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
	order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
	mine INTEGER NOT NULL CHECK (mine IN (0, 1)),
	created_at INTEGER NOT NULL,
	PRIMARY KEY (account_id, order_id)
) WITHOUT ROWID;

INSERT OR IGNORE INTO ticket_settings (key, value, updated_at, updated_by)
SELECT 'free_order_choices_since', CAST(since AS TEXT), since, 'migracion-0061'
FROM (SELECT COALESCE(MAX(created_at), 0) + 1 AS since FROM orders);
