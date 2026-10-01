-- Migration number: 0019 	 Propinas al pie de las publicaciones de KinkyVibe.
--
-- Reemplaza la nota del cafecito cuando el interruptor `propinas` está prendido (Ajustes →
-- Interruptores). Se paga con Mercado Pago, con la misma cuenta y el mismo webhook que las
-- entradas (el `external_reference` de MP es `propina:<id>`). Ver docs/propinas.md.
--
-- Solo agrega una tabla nueva (no toca nada de lo que ya existe).
-- Fechas: milisegundos desde epoch (INTEGER, UTC). Montos: pesos enteros (ARS).
-- Privacidad (minimización): ni nombre, ni email, ni nada de quien deja la propina. Los
-- reembolsos se hacen con el id del pago de MP, así que tampoco hace falta guardar datos para eso.
-- El mensaje es opcional, lo escribe la persona y solo lo ven les admins.
CREATE TABLE IF NOT EXISTS tips (
	id TEXT PRIMARY KEY NOT NULL, -- UUID v4 aleatorio (el external_reference de MP es `propina:<id>`)
	-- Lo valida el servidor (mínimo y máximo en src/lib/utils/propinas.js); el CHECK es la red.
	amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 10000000),
	-- Solo lo cambia el webhook de MP (o el re-chequeo de la página de gracias), nunca el navegador.
	status TEXT NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'approved', 'rejected', 'refunded')),
	-- Desde qué publicación se dejó (para la lista "por publicación" del panel).
	post_category TEXT NOT NULL CHECK (post_category IN ('material', 'calendario')),
	post_slug TEXT NOT NULL,
	message TEXT CHECK (message IS NULL OR length(message) <= 280),
	mp_preference_id TEXT,
	mp_payment_id TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	approved_at INTEGER
);

CREATE INDEX IF NOT EXISTS tips_status_approved ON tips (status, approved_at);
CREATE INDEX IF NOT EXISTS tips_post ON tips (post_category, post_slug);
