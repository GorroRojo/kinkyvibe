-- Migration number: 0004 	 Entradas: cómo paga cada persona respecto del Fondo KinkyVibe.
--
-- "¿Cómo querés pagar tu entrada?": con el descuento del fondo (por defecto), precio completo, o
-- precio completo + 10 / 30 / 50 % de aporte al fondo (entrada solidaria / muy solidaria /
-- Sugar). Cada orden guarda:
--   - `fondo_option`: la opción elegida;
--   - `fondo_amount` (ya existía): lo que cubrió el fondo (solo con la opción `fondo`);
--   - `fondo_contribution`: lo que la persona aportó al fondo (solo con las opciones solidarias).
-- El subtotal pasa a ser precio × cantidad − fondo + aporte. Como SQLite no puede cambiar los
-- CHECK con ALTER TABLE, `orders` se reconstruye (mismo patrón que 0003).

PRAGMA defer_foreign_keys = on;

CREATE TABLE orders_v3 (
	id TEXT PRIMARY KEY NOT NULL, -- UUID v4 aleatorio; también es el external_reference de MP
	event_slug TEXT NOT NULL,
	ticket_type TEXT NOT NULL,
	quantity INTEGER NOT NULL CHECK (quantity >= 1),
	unit_price INTEGER NOT NULL CHECK (unit_price > 0), -- precio completo (frontmatter `price`)
	fondo_option TEXT NOT NULL DEFAULT 'completo'
		CHECK (fondo_option IN ('fondo', 'completo', 'solidaria', 'muy-solidaria', 'sugar')),
	-- Lo que cubrió el Fondo KinkyVibe (solo con `fondo`).
	fondo_amount INTEGER NOT NULL DEFAULT 0
		CHECK (fondo_amount >= 0 AND (fondo_option = 'fondo' OR fondo_amount = 0)),
	-- Aporte al Fondo KinkyVibe (solo con las opciones solidarias).
	fondo_contribution INTEGER NOT NULL DEFAULT 0
		CHECK (fondo_contribution >= 0
			AND (fondo_option IN ('solidaria', 'muy-solidaria', 'sugar') OR fondo_contribution = 0)),
	subtotal INTEGER NOT NULL
		CHECK (subtotal = unit_price * quantity - fondo_amount + fondo_contribution AND subtotal >= 0),
	discount_code TEXT, -- código tal como está en discount_codes.code (mayúsculas)
	discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount BETWEEN 0 AND subtotal),
	-- Recargo por la comisión de Mercado Pago (solo con Mercado Pago).
	surcharge_amount INTEGER NOT NULL DEFAULT 0 CHECK (surcharge_amount >= 0),
	total INTEGER NOT NULL CHECK (total = subtotal - discount_amount + surcharge_amount),
	payment_method TEXT NOT NULL DEFAULT 'mercadopago'
		CHECK (payment_method IN ('mercadopago', 'transferencia', 'gratis')),
	buyer_name TEXT NOT NULL,
	buyer_email TEXT NOT NULL,
	buyer_dni TEXT, -- solo dígitos; NULL en órdenes anteriores a 0003
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

-- Las órdenes anteriores: con fondo si el fondo cubrió algo, si no precio completo; sin aporte.
INSERT INTO orders_v3 (id, event_slug, ticket_type, quantity, unit_price, fondo_option,
	fondo_amount, fondo_contribution, subtotal, discount_code, discount_amount, surcharge_amount,
	total, payment_method, buyer_name, buyer_email, buyer_dni, holders, status, mp_preference_id,
	mp_payment_id, confirmed_by, email_sent_at, created_at, updated_at, expires_at)
SELECT id, event_slug, ticket_type, quantity, unit_price,
	CASE WHEN fondo_amount > 0 THEN 'fondo' ELSE 'completo' END,
	fondo_amount, 0, subtotal, discount_code, discount_amount, surcharge_amount, total,
	payment_method, buyer_name, buyer_email, buyer_dni, holders, status, mp_preference_id,
	mp_payment_id, confirmed_by, email_sent_at, created_at, updated_at, expires_at
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_v3 RENAME TO orders;

PRAGMA defer_foreign_keys = off;

CREATE INDEX IF NOT EXISTS orders_event_type_status ON orders (event_slug, ticket_type, status);
CREATE INDEX IF NOT EXISTS orders_event_created ON orders (event_slug, created_at);
CREATE INDEX IF NOT EXISTS orders_discount_code ON orders (discount_code, status);
