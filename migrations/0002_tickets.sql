-- Migration number: 0002 	 Venta de entradas (esquema completo).
--
-- Una sola migración con el esquema final de la venta de entradas (la base de producción nunca
-- tuvo tablas, así que no hace falta historial). La tabla rate_limits es de 0001_rate_limits.sql.
-- Ver docs/tickets.md.
--
-- Fechas: milisegundos desde epoch (INTEGER, UTC). Montos: pesos enteros (ARS).
-- Privacidad (minimización): de quien compra, nombre, pronombres, email y DNI (el DNI nunca va en
-- mails, logs, URLs ni en la página pública de la entrada); de cada entrada, nombre y pronombres.
-- Nada de teléfono, dirección ni datos de pago (quedan en Mercado Pago; acá solo el id del pago).

-- Compras. El precio lo calcula el servidor y los CHECK obligan a que cierren las cuentas:
-- subtotal = precio × cantidad − fondo + aporte; total = subtotal − descuento + recargo MP.
CREATE TABLE IF NOT EXISTS orders (
	id TEXT PRIMARY KEY NOT NULL, -- UUID v4 aleatorio; también es el external_reference de MP
	event_slug TEXT NOT NULL,
	ticket_type TEXT NOT NULL,
	quantity INTEGER NOT NULL CHECK (quantity >= 1),
	-- Precio completo (frontmatter `price`) o, "a la gorra", el monto elegido por entrada.
	unit_price INTEGER NOT NULL CHECK (unit_price > 0 OR (fondo_option = 'gorra' AND unit_price >= 0)),
	-- Cómo paga respecto del Fondo KinkyVibe (o `gorra`: sin fondo, sin aporte, sin código).
	fondo_option TEXT NOT NULL DEFAULT 'completo'
		CHECK (fondo_option IN ('fondo', 'completo', 'solidaria', 'muy-solidaria', 'sugar', 'gorra')),
	-- Porcentaje del Fondo vigente al comprar (frontmatter o automático); NULL a la gorra.
	fondo_percent INTEGER CHECK (fondo_percent IS NULL OR fondo_percent BETWEEN 0 AND 100),
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
	buyer_pronouns TEXT,
	buyer_email TEXT NOT NULL,
	buyer_dni TEXT, -- solo dígitos
	holders TEXT, -- JSON [{name, pronouns}] hasta que se emiten las entradas (después, NULL)
	status TEXT NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'awaiting_transfer', 'approved', 'rejected', 'cancelled',
			'refunded', 'expired')),
	mp_preference_id TEXT,
	mp_payment_id TEXT,
	confirmed_by TEXT, -- login de quien confirmó (o canceló) una transferencia
	refunded_at INTEGER, -- reembolso: cuándo y quién (NULL = desde Mercado Pago, por webhook)
	refunded_by TEXT,
	email_sent_at INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL -- fin de la reserva de cupo mientras se paga
);

-- Conteo de cupo por evento y tipo (la consulta más caliente: se hace en cada compra).
CREATE INDEX IF NOT EXISTS orders_event_type_status ON orders (event_slug, ticket_type, status);
CREATE INDEX IF NOT EXISTS orders_event_created ON orders (event_slug, created_at);
CREATE INDEX IF NOT EXISTS orders_discount_code ON orders (discount_code, status);

-- Una fila por entrada (persona).
CREATE TABLE IF NOT EXISTS tickets (
	id TEXT PRIMARY KEY NOT NULL,
	order_id TEXT NOT NULL REFERENCES orders (id),
	event_slug TEXT NOT NULL,
	ticket_type TEXT NOT NULL,
	holder_name TEXT NOT NULL,
	holder_pronouns TEXT,
	token TEXT NOT NULL UNIQUE, -- 32 bytes aleatorios en base64url; va en el QR
	-- Código corto (6 caracteres sin 0/O/1/I/L) para tipear en la puerta; único por evento.
	code TEXT,
	checked_in_at INTEGER,
	checked_in_by TEXT -- login de GitHub de quien marcó el ingreso
);

CREATE INDEX IF NOT EXISTS tickets_order ON tickets (order_id);
CREATE INDEX IF NOT EXISTS tickets_event ON tickets (event_slug);
CREATE UNIQUE INDEX IF NOT EXISTS tickets_event_code ON tickets (event_slug, code);

CREATE TABLE IF NOT EXISTS discount_codes (
	code TEXT PRIMARY KEY NOT NULL COLLATE NOCASE, -- se guarda en mayúsculas
	kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
	value INTEGER NOT NULL CHECK (value > 0 AND (kind = 'fixed' OR value <= 100)),
	event_slug TEXT, -- NULL = vale para todos los eventos
	starts_at INTEGER, -- NULL = desde ya
	ends_at INTEGER, -- NULL = sin vencimiento
	max_uses INTEGER CHECK (max_uses IS NULL OR max_uses >= 1),
	active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
	created_at INTEGER NOT NULL,
	created_by TEXT NOT NULL
);

-- Ajustes de venta editables desde /admin/entradas/ajustes (clave → valor en texto): datos para
-- transferir, comisión de MP, porcentaje del Fondo, mails, recordatorios; y el último
-- porcentaje del Fondo leído de fondo.kinkyvibe.ar (`fondo_percent_last`).
CREATE TABLE IF NOT EXISTS ticket_settings (
	key TEXT PRIMARY KEY NOT NULL,
	value TEXT NOT NULL,
	updated_at INTEGER NOT NULL,
	updated_by TEXT NOT NULL
);

-- Por evento: el link de la transmisión de los eventos online (nunca en el repo, que es público).
CREATE TABLE IF NOT EXISTS event_ticket_settings (
	event_slug TEXT PRIMARY KEY NOT NULL,
	stream_link TEXT,
	stream_link_updated_at INTEGER,
	updated_by TEXT
);

-- A qué orden ya se le mandó cada link de transmisión (SHA-256 del link): "Enviar el link a
-- todes" es idempotente.
CREATE TABLE IF NOT EXISTS stream_link_sends (
	order_id TEXT NOT NULL REFERENCES orders (id),
	link_hash TEXT NOT NULL,
	sent_at INTEGER NOT NULL,
	PRIMARY KEY (order_id, link_hash)
);

-- Qué recordatorio ya se le mandó a cada orden ("h48", "d0-0900"); se reserva antes de mandar.
CREATE TABLE IF NOT EXISTS reminder_sends (
	order_id TEXT NOT NULL REFERENCES orders (id),
	reminder_id TEXT NOT NULL,
	sent_at INTEGER NOT NULL,
	PRIMARY KEY (order_id, reminder_id)
);
