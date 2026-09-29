-- Migration number: 0003 	 Entradas v2: datos por persona, fondo, recargo MP, códigos y transferencia.
--
-- Cambios:
-- 1. `tickets`: pronombres de cada persona (además del nombre que ya estaba).
-- 2. `orders` se reconstruye (SQLite no puede cambiar CHECKs con ALTER TABLE) para:
--    - el DNI de quien compra (dato administrativo, uno por compra);
--    - sacar el máximo fijo de entradas por compra (lo limita el cupo);
--    - el desglose del precio: precio de lista × cantidad − fondo = subtotal;
--      subtotal − descuento + recargo de Mercado Pago = total;
--    - el medio de pago (`mercadopago`, `transferencia` o `gratis` si el total es 0);
--    - el estado `awaiting_transfer` (reserva mientras se espera la transferencia);
--    - `holders`: JSON con nombre/pronombres de cada entrada mientras la orden no se aprueba;
--      al emitir las entradas se copia a `tickets` y se borra de acá.
-- 3. Tabla nueva `discount_codes`.
--
-- Privacidad: el DNI nunca va en emails, logs, URLs ni en la página pública de la entrada; solo
-- lo ven les admins (órdenes, CSV y control de ingreso).

ALTER TABLE tickets ADD COLUMN holder_pronouns TEXT;

-- Reconstrucción de `orders` (patrón recomendado por D1: diferir las foreign keys de `tickets`).
PRAGMA defer_foreign_keys = on;

CREATE TABLE orders_v2 (
	id TEXT PRIMARY KEY NOT NULL, -- UUID v4 aleatorio; también es el external_reference de MP
	event_slug TEXT NOT NULL,
	ticket_type TEXT NOT NULL,
	quantity INTEGER NOT NULL CHECK (quantity >= 1),
	unit_price INTEGER NOT NULL CHECK (unit_price > 0), -- precio de lista (frontmatter `price`)
	-- Parte que cubre el Fondo KinkyVibe (frontmatter `fondo` × cantidad).
	fondo_amount INTEGER NOT NULL DEFAULT 0 CHECK (fondo_amount >= 0),
	subtotal INTEGER NOT NULL CHECK (subtotal = unit_price * quantity - fondo_amount AND subtotal >= 0),
	discount_code TEXT, -- código tal como está en discount_codes.code (mayúsculas)
	discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount BETWEEN 0 AND subtotal),
	-- Recargo por la comisión de Mercado Pago (solo con Mercado Pago).
	surcharge_amount INTEGER NOT NULL DEFAULT 0 CHECK (surcharge_amount >= 0),
	total INTEGER NOT NULL CHECK (total = subtotal - discount_amount + surcharge_amount),
	payment_method TEXT NOT NULL DEFAULT 'mercadopago'
		CHECK (payment_method IN ('mercadopago', 'transferencia', 'gratis')),
	buyer_name TEXT NOT NULL,
	buyer_email TEXT NOT NULL,
	buyer_dni TEXT, -- solo dígitos; NULL en órdenes anteriores a esta migración
	holders TEXT, -- JSON [{name, pronouns}] hasta que se emiten las entradas
	status TEXT NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'awaiting_transfer', 'approved', 'rejected', 'cancelled',
			'refunded', 'expired')),
	mp_preference_id TEXT,
	mp_payment_id TEXT,
	confirmed_by TEXT, -- login de quien confirmó una transferencia (o canceló)
	email_sent_at INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL -- fin de la reserva de cupo mientras se paga
);

INSERT INTO orders_v2 (id, event_slug, ticket_type, quantity, unit_price, fondo_amount, subtotal,
	discount_code, discount_amount, surcharge_amount, total, payment_method, buyer_name,
	buyer_email, buyer_dni, holders, status, mp_preference_id, mp_payment_id, confirmed_by,
	email_sent_at, created_at, updated_at, expires_at)
SELECT id, event_slug, ticket_type, quantity, unit_price, 0, total, NULL, 0, 0, total,
	'mercadopago', buyer_name, buyer_email, NULL, NULL, status, mp_preference_id, mp_payment_id,
	NULL, email_sent_at, created_at, updated_at, expires_at
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_v2 RENAME TO orders;

PRAGMA defer_foreign_keys = off;

CREATE INDEX IF NOT EXISTS orders_event_type_status ON orders (event_slug, ticket_type, status);
CREATE INDEX IF NOT EXISTS orders_event_created ON orders (event_slug, created_at);
CREATE INDEX IF NOT EXISTS orders_discount_code ON orders (discount_code, status);

CREATE TABLE IF NOT EXISTS discount_codes (
	code TEXT PRIMARY KEY NOT NULL COLLATE NOCASE, -- se guarda en mayúsculas
	kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
	value INTEGER NOT NULL CHECK (value > 0 AND (kind = 'fixed' OR value <= 100)),
	event_slug TEXT, -- NULL = vale para todos los eventos
	starts_at INTEGER, -- ms; NULL = desde ya
	ends_at INTEGER, -- ms; NULL = sin vencimiento
	max_uses INTEGER CHECK (max_uses IS NULL OR max_uses >= 1),
	active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
	created_at INTEGER NOT NULL,
	created_by TEXT NOT NULL
);
