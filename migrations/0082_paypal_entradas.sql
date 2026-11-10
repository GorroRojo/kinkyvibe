-- Migration number: 0082 	 PayPal en la compra de entradas (docs/paypal.md, decisión 0059).
--
-- - `payment_method = 'paypal'`: el CHECK de 0010 no lo permite y SQLite no deja cambiar un CHECK
--   con ALTER TABLE, así que se reconstruye `orders` como en 0005 y 0010 (foreign keys diferidas
--   hasta el final). Mismas columnas, CHECK e índices que hoy (0010 + las columnas sumadas
--   después: 0013, 0016, 0051, 0063, 0064, 0069, 0076, 0077), más lo nuevo.
-- - Columnas nuevas, solo para las órdenes de PayPal (las demás las dejan vacías):
--   `paypal_order_id` (la orden en PayPal), `paypal_capture_id` (el cobro: lo que en MP es
--   `mp_payment_id`), `usd_amount_cents` (los dólares a cobrar, calculados al reservar),
--   `usd_fee_cents` (la comisión que informó PayPal), `rate_base` (la cotización base del día con
--   la que se calculó) y `rate_adjustment_pct` (el ajuste de ese momento). La comisión en pesos
--   estimada va en `mp_fee_amount`, como la de MP, para que los reportes la sumen igual.
-- - OJO: `DROP TABLE` borra en cascada las filas de las tablas con `ON DELETE CASCADE` hacia
--   `orders` (`order_answers`, 0018, y `free_order_choices`, 0061), aun con las foreign keys
--   diferidas. Por eso se copian antes a tablas temporales y se vuelven a cargar después.
--   Las demás tablas que apuntan a `orders` (`tickets`, `order_extras`, la lista de espera…) no
--   tienen acciones: con las foreign keys diferidas, quedan bien al renombrar.
--
-- - El orden importa en D1 remoto: copiar a `orders_new` y renombrarla no anda, porque el DROP
--   deja contadas como rotas las foreign keys de `tickets`, `order_extras`, etc. y el RENAME no las
--   descuenta (el commit falla con «FOREIGN KEY constraint failed»). Por eso se copia `orders` a
--   `kv_bak_orders`, se borra, se crea la nueva con el mismo nombre y se vuelve a cargar: las filas
--   que entran a `orders` sí cierran esas foreign keys.
--
-- Anda con el código de `main` (decisión 0028): solo agrega un valor posible y columnas vacías.
-- Antes de aplicarla en producción: un marcador de Time Travel (`wrangler d1 time-travel info`).

PRAGMA defer_foreign_keys = on;

CREATE TABLE IF NOT EXISTS kv_bak_orders AS SELECT * FROM orders;
CREATE TABLE IF NOT EXISTS kv_bak_order_answers AS SELECT * FROM order_answers;
CREATE TABLE IF NOT EXISTS kv_bak_free_order_choices AS SELECT * FROM free_order_choices;

DROP TABLE orders;

CREATE TABLE orders (
	id TEXT PRIMARY KEY NOT NULL,
	event_slug TEXT NOT NULL,
	ticket_type TEXT NOT NULL,
	quantity INTEGER NOT NULL CHECK (quantity >= 1),
	unit_price INTEGER NOT NULL
		CHECK (unit_price > 0 OR (unit_price = 0 AND (fondo_option = 'gorra' OR channel = 'manual'))),
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
		CHECK (payment_method IN ('mercadopago', 'transferencia', 'gratis', 'efectivo', 'otro',
			'paypal')),
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
	channel TEXT NOT NULL DEFAULT 'online' CHECK (channel IN ('online', 'puerta', 'manual')),
	admin_note TEXT,
	account_id TEXT REFERENCES accounts (id) ON DELETE SET NULL,
	ticket_tier TEXT,
	client_sale_id TEXT
		CHECK (client_sale_id IS NULL OR length(client_sale_id) BETWEEN 8 AND 64),
	offline_review TEXT CHECK (offline_review IS NULL OR json_valid(offline_review)),
	door_list_price INTEGER CHECK (door_list_price IS NULL OR door_list_price >= 0),
	email_id TEXT,
	email_problem TEXT,
	email_problem_at INTEGER,
	mp_fee_amount INTEGER CHECK (mp_fee_amount IS NULL OR mp_fee_amount >= 0),
	refunded_amount INTEGER CHECK (refunded_amount IS NULL OR refunded_amount >= 0),
	invoiced_at INTEGER CHECK (invoiced_at IS NULL OR invoiced_at > 0),
	invoiced_by TEXT,
	extras_amount INTEGER NOT NULL DEFAULT 0 CHECK (extras_amount >= 0),
	-- Nuevo: PayPal (solo en las órdenes con `payment_method = 'paypal'`).
	paypal_order_id TEXT,
	paypal_capture_id TEXT,
	usd_amount_cents INTEGER CHECK (usd_amount_cents IS NULL OR usd_amount_cents > 0),
	usd_fee_cents INTEGER CHECK (usd_fee_cents IS NULL OR usd_fee_cents >= 0),
	rate_base REAL CHECK (rate_base IS NULL OR rate_base > 0),
	rate_adjustment_pct REAL,
	CHECK (payment_method NOT IN ('efectivo', 'otro') OR channel IN ('puerta', 'manual')),
	CHECK (payment_method != 'paypal' OR channel = 'online')
);

INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, fondo_option,
	fondo_percent, fondo_amount, fondo_contribution, subtotal, discount_code, discount_amount,
	surcharge_amount, total, payment_method, buyer_name, buyer_pronouns, buyer_email, buyer_dni,
	holders, status, mp_preference_id, mp_payment_id, confirmed_by, refunded_at, refunded_by,
	email_sent_at, created_at, updated_at, expires_at, client_hash, needs_review, review_detail,
	channel, admin_note, account_id, ticket_tier, client_sale_id, offline_review, door_list_price,
	email_id, email_problem, email_problem_at, mp_fee_amount, refunded_amount, invoiced_at,
	invoiced_by, extras_amount)
SELECT id, event_slug, ticket_type, quantity, unit_price, fondo_option,
	fondo_percent, fondo_amount, fondo_contribution, subtotal, discount_code, discount_amount,
	surcharge_amount, total, payment_method, buyer_name, buyer_pronouns, buyer_email, buyer_dni,
	holders, status, mp_preference_id, mp_payment_id, confirmed_by, refunded_at, refunded_by,
	email_sent_at, created_at, updated_at, expires_at, client_hash, needs_review, review_detail,
	channel, admin_note, account_id, ticket_tier, client_sale_id, offline_review, door_list_price,
	email_id, email_problem, email_problem_at, mp_fee_amount, refunded_amount, invoiced_at,
	invoiced_by, extras_amount
FROM kv_bak_orders;


-- Lo que borró la cascada del DROP, de vuelta.
INSERT OR IGNORE INTO order_answers SELECT * FROM kv_bak_order_answers;
INSERT OR IGNORE INTO free_order_choices SELECT * FROM kv_bak_free_order_choices;
DROP TABLE kv_bak_orders;
DROP TABLE kv_bak_order_answers;
DROP TABLE kv_bak_free_order_choices;

CREATE INDEX IF NOT EXISTS orders_event_type_status ON orders (event_slug, ticket_type, status);
CREATE INDEX IF NOT EXISTS orders_event_created ON orders (event_slug, created_at);
CREATE INDEX IF NOT EXISTS orders_discount_code ON orders (discount_code, status);
CREATE INDEX IF NOT EXISTS orders_event_client ON orders (event_slug, client_hash, status);
CREATE INDEX IF NOT EXISTS orders_event_email ON orders (event_slug, buyer_email, status);
CREATE INDEX IF NOT EXISTS orders_needs_review ON orders (needs_review) WHERE needs_review IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_email_status ON orders (buyer_email, status);
CREATE INDEX IF NOT EXISTS orders_account ON orders (account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_email_lower ON orders (lower(buyer_email));
CREATE INDEX IF NOT EXISTS orders_event_type_tier ON orders (event_slug, ticket_type, ticket_tier)
	WHERE ticket_tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_status_created ON orders (status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS orders_client_sale_id ON orders (client_sale_id)
	WHERE client_sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_offline_review ON orders (offline_review)
	WHERE offline_review IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_email_id ON orders (email_id) WHERE email_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_email_problem ON orders (email_problem_at)
	WHERE email_problem IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_to_invoice ON orders (created_at)
	WHERE status = 'approved' AND total > 0 AND invoiced_at IS NULL;
-- Nuevo: buscar la orden de una orden de PayPal (la vuelta y el webhook).
CREATE UNIQUE INDEX IF NOT EXISTS orders_paypal_order ON orders (paypal_order_id)
	WHERE paypal_order_id IS NOT NULL;

PRAGMA defer_foreign_keys = off;
