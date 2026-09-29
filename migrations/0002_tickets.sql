-- Migration number: 0002 	 Venta de entradas: órdenes (compras) y entradas individuales.
--
-- Privacidad (minimización): de quien compra se guarda nombre y email, lo necesario para
-- mandar las entradas y reconocer a la persona en la puerta (0003 agrega el DNI de quien
-- compra y los pronombres). Nada de teléfono, dirección ni datos de pago (esos quedan en
-- Mercado Pago; acá solo el id del pago).
--
-- Fechas: milisegundos desde epoch (INTEGER, UTC). Montos: pesos enteros (ARS).

CREATE TABLE IF NOT EXISTS orders (
	id TEXT PRIMARY KEY NOT NULL, -- UUID v4 aleatorio; también es el external_reference de MP
	event_slug TEXT NOT NULL,
	ticket_type TEXT NOT NULL,
	quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
	unit_price INTEGER NOT NULL CHECK (unit_price > 0),
	total INTEGER NOT NULL CHECK (total = unit_price * quantity),
	buyer_name TEXT NOT NULL,
	buyer_email TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'refunded', 'expired')),
	mp_preference_id TEXT,
	mp_payment_id TEXT,
	email_sent_at INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL -- fin de la reserva de cupo mientras se paga
);

-- Conteo de cupo por evento y tipo (la consulta más caliente: se hace en cada compra).
CREATE INDEX IF NOT EXISTS orders_event_type_status ON orders (event_slug, ticket_type, status);
CREATE INDEX IF NOT EXISTS orders_event_created ON orders (event_slug, created_at);

CREATE TABLE IF NOT EXISTS tickets (
	id TEXT PRIMARY KEY NOT NULL,
	order_id TEXT NOT NULL REFERENCES orders (id),
	event_slug TEXT NOT NULL,
	ticket_type TEXT NOT NULL,
	holder_name TEXT NOT NULL,
	token TEXT NOT NULL UNIQUE, -- 32 bytes aleatorios en base64url; va en el QR
	checked_in_at INTEGER,
	checked_in_by TEXT -- login de GitHub de quien marcó el ingreso
);

CREATE INDEX IF NOT EXISTS tickets_order ON tickets (order_id);
CREATE INDEX IF NOT EXISTS tickets_event ON tickets (event_slug);
