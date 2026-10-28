-- Migration number: 0070 	 Propinas: el origen, la categoría y el destino los valida el código.
--
-- Las columnas `post_category`, `source` y `destination` tenían un CHECK con la lista de valores
-- (0019, 0022, 0052). Cada valor nuevo (por ejemplo las propinas desde la Kinkipedia, categoría
-- `wiki`) pedía reconstruir la tabla, porque SQLite no deja cambiar un CHECK. Desde acá la lista
-- vive solo en el código (`TIP_POST_KINDS`, `TIP_SOURCES` y `TIP_DESTINATIONS` en
-- src/lib/utils/propinas.js), que es el único que escribe en la tabla y ya validaba todo antes de
-- guardar. Sumar una categoría pasa a ser un cambio de código, sin migración.
--
-- Se quedan los CHECK que no son listas de cosas del sitio: el monto, el estado (lo cambia el
-- webhook de MP) y el largo del mensaje.
--
-- Reconstruye la tabla (la forma de SQLite de sacar un CHECK) con las mismas columnas, en el mismo
-- orden, y copia todas las filas tal cual. Al escribirla, producción tenía dos propinas, las dos
-- pendientes. Ninguna otra tabla apunta a `tips`.
CREATE TABLE tips_nueva (
	id TEXT PRIMARY KEY NOT NULL, -- UUID v4 aleatorio (el external_reference de MP es `propina:<id>`)
	-- Lo valida el servidor (mínimo y máximo en src/lib/utils/propinas.js); el CHECK es la red.
	amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 10000000),
	-- Solo lo cambia el webhook de MP (o el re-chequeo de la página de gracias), nunca el navegador.
	status TEXT NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'approved', 'rejected', 'refunded')),
	-- Desde qué publicación se dejó (`material`, `calendario`, `wiki`...: ver TIP_POST_KINDS).
	post_category TEXT NOT NULL,
	post_slug TEXT NOT NULL,
	message TEXT CHECK (message IS NULL OR length(message) <= 280),
	mp_preference_id TEXT,
	mp_payment_id TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	approved_at INTEGER,
	destination TEXT NOT NULL DEFAULT 'kinkyvibe',
	source TEXT NOT NULL DEFAULT 'post'
);

INSERT INTO tips_nueva (id, amount, status, post_category, post_slug, message, mp_preference_id,
	mp_payment_id, created_at, updated_at, approved_at, destination, source)
SELECT id, amount, status, post_category, post_slug, message, mp_preference_id, mp_payment_id,
	created_at, updated_at, approved_at, destination, source
FROM tips;

DROP TABLE tips;
ALTER TABLE tips_nueva RENAME TO tips;

CREATE INDEX IF NOT EXISTS tips_status_approved ON tips (status, approved_at);
CREATE INDEX IF NOT EXISTS tips_post ON tips (post_category, post_slug);
CREATE INDEX IF NOT EXISTS tips_destination_approved ON tips (destination, status, approved_at);
