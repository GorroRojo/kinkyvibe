-- Migration number: 0005 	 Venta en la puerta: pago en efectivo y canal de venta.
--
-- "Vender en puerta" (modo puerta del panel) crea órdenes ya aprobadas, cobradas en efectivo o
-- por transferencia en el momento. Hace falta:
-- - `payment_method = 'efectivo'` (el CHECK de 0002 no lo permite);
-- - `channel`: 'online' (la compra de la página, lo de siempre) o 'puerta' (vendida en la
--   puerta por une admin, que queda en `confirmed_by`).
--
-- SQLite no deja cambiar un CHECK con ALTER TABLE: se reconstruye la tabla `orders` (crear la
-- nueva, copiar, borrar la vieja, renombrar). `tickets`, `stream_link_sends` y `reminder_sends`
-- apuntan a `orders (id)`: D1 aplica las foreign keys siempre, así que se difieren hasta el final
-- de la migración (al renombrar, las referencias vuelven a ser válidas). Mismas columnas, CHECK
-- e índices que 0002 + 0003, más lo nuevo.

PRAGMA defer_foreign_keys = on;

CREATE TABLE orders_new (
	id TEXT PRIMARY KEY NOT NULL,
	event_slug TEXT NOT NULL,
	ticket_type TEXT NOT NULL,
	quantity INTEGER NOT NULL CHECK (quantity >= 1),
	unit_price INTEGER NOT NULL CHECK (unit_price > 0 OR (fondo_option = 'gorra' AND unit_price >= 0)),
	fondo_option TEXT NOT NULL DEFAULT 'completo'
		CHECK (fondo_option IN ('fondo', 'completo', 'solidaria', 'muy-solidaria', 'sugar', 'gorra')),
	fondo_percent INTEGER CHECK (fondo_percent IS NULL OR fondo_percent BETWEEN 0 AND 100),
	fondo_amount INTEGER NOT NULL DEFAULT 0
		CHECK (fondo_amount >= 0 AND (fondo_option = 'fondo' OR fondo_amount = 0)),
	fondo_contribution INTEGER NOT NULL DEFAULT 0
		CHECK (fondo_contribution >= 0
			AND (fondo_option IN ('solidaria', 'muy-solidaria', 'sugar') OR fondo_contribution = 0)),
	subtotal INTEGER NOT NULL
		CHECK (subtotal = unit_price * quantity - fondo_amount + fondo_contribution AND subtotal >= 0),
	discount_code TEXT,
	discount_amount INTEGER NOT NULL DEFAULT 0
		CHECK (discount_amount BETWEEN 0 AND subtotal
			AND (fondo_option != 'gorra' OR (discount_amount = 0 AND discount_code IS NULL))),
	surcharge_amount INTEGER NOT NULL DEFAULT 0 CHECK (surcharge_amount >= 0),
	total INTEGER NOT NULL CHECK (total = subtotal - discount_amount + surcharge_amount),
	payment_method TEXT NOT NULL DEFAULT 'mercadopago'
		CHECK (payment_method IN ('mercadopago', 'transferencia', 'gratis', 'efectivo')),
	buyer_name TEXT NOT NULL,
	buyer_pronouns TEXT,
	buyer_email TEXT NOT NULL,
	buyer_dni TEXT,
	holders TEXT,
	status TEXT NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'awaiting_transfer', 'approved', 'rejected', 'cancelled',
			'refunded', 'expired')),
	mp_preference_id TEXT,
	mp_payment_id TEXT,
	confirmed_by TEXT,
	refunded_at INTEGER,
	refunded_by TEXT,
	email_sent_at INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	client_hash TEXT,
	needs_review TEXT
		CHECK (needs_review IS NULL OR needs_review IN ('late_payment', 'duplicate_payment')),
	review_detail TEXT,
	-- Nuevo: dónde se vendió. El efectivo solo existe en la puerta.
	channel TEXT NOT NULL DEFAULT 'online' CHECK (channel IN ('online', 'puerta')),
	CHECK (payment_method != 'efectivo' OR channel = 'puerta')
);

INSERT INTO orders_new (id, event_slug, ticket_type, quantity, unit_price, fondo_option,
	fondo_percent, fondo_amount, fondo_contribution, subtotal, discount_code, discount_amount,
	surcharge_amount, total, payment_method, buyer_name, buyer_pronouns, buyer_email, buyer_dni,
	holders, status, mp_preference_id, mp_payment_id, confirmed_by, refunded_at, refunded_by,
	email_sent_at, created_at, updated_at, expires_at, client_hash, needs_review, review_detail,
	channel)
SELECT id, event_slug, ticket_type, quantity, unit_price, fondo_option,
	fondo_percent, fondo_amount, fondo_contribution, subtotal, discount_code, discount_amount,
	surcharge_amount, total, payment_method, buyer_name, buyer_pronouns, buyer_email, buyer_dni,
	holders, status, mp_preference_id, mp_payment_id, confirmed_by, refunded_at, refunded_by,
	email_sent_at, created_at, updated_at, expires_at, client_hash, needs_review, review_detail,
	'online'
FROM orders;

DROP TABLE orders;

ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX IF NOT EXISTS orders_event_type_status ON orders (event_slug, ticket_type, status);
CREATE INDEX IF NOT EXISTS orders_event_created ON orders (event_slug, created_at);
CREATE INDEX IF NOT EXISTS orders_discount_code ON orders (discount_code, status);
CREATE INDEX IF NOT EXISTS orders_event_client ON orders (event_slug, client_hash, status);
CREATE INDEX IF NOT EXISTS orders_event_email ON orders (event_slug, buyer_email, status);
CREATE INDEX IF NOT EXISTS orders_needs_review ON orders (needs_review) WHERE needs_review IS NOT NULL;
-- Nuevo: "¿primera vez en la serie?" busca compras anteriores por email en todos los eventos.
CREATE INDEX IF NOT EXISTS orders_email_status ON orders (buyer_email, status);

PRAGMA defer_foreign_keys = off;
