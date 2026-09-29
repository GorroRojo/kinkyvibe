-- Migration number: 0005 	 Entradas v4: pronombres de quien compra, "a la gorra", código corto por
-- entrada, ajustes de venta y link de transmisión de eventos online.
--
-- Cambios:
-- 1. `orders` se reconstruye (SQLite no puede cambiar CHECKs con ALTER TABLE; mismo patrón que
--    0003 y 0004) para:
--    - `buyer_pronouns`: pronombres de quien compra (obligatorios en el formulario desde ahora;
--      NULL en órdenes anteriores);
--    - "a la gorra": `fondo_option = 'gorra'`, con `unit_price` = el monto por entrada que eligió
--      la persona (puede ser 0), sin fondo, sin aporte y sin código de descuento.
-- 2. `tickets.code`: código corto (6 letras/números sin ambiguos) que se muestra grande al lado
--    del QR, para tipearlo en la puerta si el QR no se puede escanear. Único por evento.
-- 3. `ticket_settings`: ajustes de venta que se editan desde /admin/entradas/ajustes (datos
--    para transferir, comisión de Mercado Pago). Clave → valor en texto.
-- 4. `event_ticket_settings`: por evento, el link de la transmisión de los eventos online (NO
--    va en el repo, que es público).
-- 5. `stream_link_sends`: a qué órdenes ya se les mandó cada link (por su hash), para que
--    "Enviar el link a todes" sea idempotente.

PRAGMA defer_foreign_keys = on;

CREATE TABLE orders_v4 (
	id TEXT PRIMARY KEY NOT NULL, -- UUID v4 aleatorio; también es el external_reference de MP
	event_slug TEXT NOT NULL,
	ticket_type TEXT NOT NULL,
	quantity INTEGER NOT NULL CHECK (quantity >= 1),
	-- Precio completo (frontmatter `price`) o, "a la gorra", el monto elegido por entrada.
	unit_price INTEGER NOT NULL CHECK (unit_price > 0 OR (fondo_option = 'gorra' AND unit_price >= 0)),
	fondo_option TEXT NOT NULL DEFAULT 'completo'
		CHECK (fondo_option IN ('fondo', 'completo', 'solidaria', 'muy-solidaria', 'sugar', 'gorra')),
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
	discount_amount INTEGER NOT NULL DEFAULT 0
		CHECK (discount_amount BETWEEN 0 AND subtotal
			AND (fondo_option != 'gorra' OR (discount_amount = 0 AND discount_code IS NULL))),
	-- Recargo por la comisión de Mercado Pago (solo con Mercado Pago).
	surcharge_amount INTEGER NOT NULL DEFAULT 0 CHECK (surcharge_amount >= 0),
	total INTEGER NOT NULL CHECK (total = subtotal - discount_amount + surcharge_amount),
	payment_method TEXT NOT NULL DEFAULT 'mercadopago'
		CHECK (payment_method IN ('mercadopago', 'transferencia', 'gratis')),
	buyer_name TEXT NOT NULL,
	buyer_pronouns TEXT, -- NULL en órdenes anteriores a esta migración
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

INSERT INTO orders_v4 (id, event_slug, ticket_type, quantity, unit_price, fondo_option,
	fondo_amount, fondo_contribution, subtotal, discount_code, discount_amount, surcharge_amount,
	total, payment_method, buyer_name, buyer_pronouns, buyer_email, buyer_dni, holders, status,
	mp_preference_id, mp_payment_id, confirmed_by, email_sent_at, created_at, updated_at,
	expires_at)
SELECT id, event_slug, ticket_type, quantity, unit_price, fondo_option, fondo_amount,
	fondo_contribution, subtotal, discount_code, discount_amount, surcharge_amount, total,
	payment_method, buyer_name, NULL, buyer_email, buyer_dni, holders, status, mp_preference_id,
	mp_payment_id, confirmed_by, email_sent_at, created_at, updated_at, expires_at
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_v4 RENAME TO orders;

PRAGMA defer_foreign_keys = off;

CREATE INDEX IF NOT EXISTS orders_event_type_status ON orders (event_slug, ticket_type, status);
CREATE INDEX IF NOT EXISTS orders_event_created ON orders (event_slug, created_at);
CREATE INDEX IF NOT EXISTS orders_discount_code ON orders (discount_code, status);

-- Código corto de cada entrada. Las entradas ya emitidas reciben uno al azar (hexadecimal en
-- mayúsculas: al buscar, la O se lee como 0 y la I/L como 1, así que también se pueden tipear).
ALTER TABLE tickets ADD COLUMN code TEXT;
UPDATE tickets SET code = substr(upper(hex(randomblob(4))), 1, 6) WHERE code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tickets_event_code ON tickets (event_slug, code);

CREATE TABLE IF NOT EXISTS ticket_settings (
	key TEXT PRIMARY KEY NOT NULL,
	value TEXT NOT NULL,
	updated_at INTEGER NOT NULL,
	updated_by TEXT NOT NULL -- login de GitHub de quien lo cambió
);

CREATE TABLE IF NOT EXISTS event_ticket_settings (
	event_slug TEXT PRIMARY KEY NOT NULL,
	stream_link TEXT, -- link de la transmisión (eventos online); NULL = todavía no hay
	stream_link_updated_at INTEGER,
	updated_by TEXT
);

CREATE TABLE IF NOT EXISTS stream_link_sends (
	order_id TEXT NOT NULL REFERENCES orders (id),
	link_hash TEXT NOT NULL, -- SHA-256 del link enviado (no se repite el link en esta tabla)
	sent_at INTEGER NOT NULL,
	PRIMARY KEY (order_id, link_hash)
);
