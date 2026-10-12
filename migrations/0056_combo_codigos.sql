-- Migration number: 0056 	 Códigos combo: comprar una entrada de un evento trae un código para otro.
--
-- Pedido de gorrite (10/10 y 12/10, versión chica): un admin arma en la ficha del evento A
-- (pestaña Códigos) un combo con el evento B; cada compra online aprobada de A genera un código de
-- descuento para B, de un solo uso y solo para el mail de quien compró, que va en el mail de las
-- entradas. Código: src/lib/server/tickets/combos.js; docs/tickets.md («Códigos combo»).
--
-- Solo agrega una tabla y dos columnas que aceptan NULL (no cambia ninguna fila): el código que ya
-- está en `main` no las lee ni las escribe (decisión 0028). Todo detrás del interruptor
-- `combo_codigos` (tabla feature_flags, migración 0013), apagado por defecto.
--
-- Fechas: milisegundos desde epoch (INTEGER, UTC), como el resto de la base. Mail normalizado
-- (minúsculas, sin espacios), igual que `orders.buyer_email`.

-- El combo de A (`event_slug`) con B (`target_slug`): qué descuento genera cada compra de A.
-- Uno por par de eventos; guardarlo de nuevo cambia el descuento de los códigos que se generen
-- después (los ya generados quedan como estaban).
CREATE TABLE IF NOT EXISTS ticket_combos (
	event_slug TEXT NOT NULL, -- A: el evento cuya compra genera el código
	target_slug TEXT NOT NULL, -- B: el evento donde vale el código
	kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
	value INTEGER NOT NULL CHECK (value > 0 AND (kind = 'fixed' OR value <= 100)),
	ends_at INTEGER, -- NULL = hasta que cierre la venta de B
	active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)), -- 0 = no genera códigos nuevos
	created_at INTEGER NOT NULL,
	created_by TEXT NOT NULL,
	updated_at INTEGER NOT NULL,
	updated_by TEXT NOT NULL,
	PRIMARY KEY (event_slug, target_slug),
	CHECK (event_slug != target_slug)
);

-- Un código de descuento solo para un mail (NULL = para cualquiera, lo de siempre).
ALTER TABLE discount_codes ADD COLUMN buyer_email TEXT;
-- La orden (de A) que generó el código combo (NULL = código común, creado a mano). Mientras esa
-- orden no esté aprobada (p. ej. reembolsada), el código no vale (discountGuardSql).
ALTER TABLE discount_codes ADD COLUMN source_order_id TEXT;

-- Un solo código por orden de A y evento B: dos envíos del mismo mail a la vez no generan dos.
CREATE UNIQUE INDEX IF NOT EXISTS discount_codes_combo_source
	ON discount_codes (source_order_id, event_slug) WHERE source_order_id IS NOT NULL;
