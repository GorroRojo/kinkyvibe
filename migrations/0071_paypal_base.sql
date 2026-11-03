-- Migration number: 0071 	 Base para PayPal en las propinas: cotización MEP, retiros y columnas de PayPal.
--
-- PayPal va a ser una segunda forma de pagar una propina (issue #265, docs/propinas.md, decisión
-- 0054). Esta migración no cobra nada: deja lo que necesita el cobro, que llega después.
--
-- - `mep_rates`: el dólar MEP («bolsa») de cada día de Argentina, que guarda el cron diario
--   (src/lib/server/paypal/rates.js): `compra` es la cotización base con la que se estima cuántos
--   pesos es un pago en dólares; `venta`, solo de referencia. `source` es de dónde salió
--   (`dolarapi` para el día, `argentinadatos` para los días que faltaban). Un día guardado no se
--   pisa. Los fines de semana y feriados tienen el valor del último día hábil.
-- - `paypal_withdrawals`: los retiros de la plata de PayPal que carga une admin (fecha, dólares que
--   salieron y pesos que llegaron de verdad), para comparar la conversión real con la estimada.
-- - `tips`: de qué medio es cada propina (`provider`, `mp` las que ya existen) y, para las de
--   PayPal, la moneda, lo bruto y lo neto en centavos de dólar (neto = después de la comisión de
--   PayPal), la cotización base del día del pago (`rate_base`, nunca cambia) y los ids de PayPal.
--   Las de Mercado Pago no las usan. El ajuste en % que fija gorrite no se guarda en cada pago: se
--   aplica al leer (`ticket_settings`, clave `paypal_rate_adjustment_pct`, sin migración).
--
-- Solo agrega tablas nuevas y columnas con valor por defecto o que pueden quedar vacías: anda con
-- el código de `main` (decisión 0028). Nada de datos de quien paga.
-- Numerada 0071: 0065–0069 las usan PRs abiertos y 0070 ya está en `main`.
CREATE TABLE IF NOT EXISTS mep_rates (
	day TEXT PRIMARY KEY NOT NULL, -- AAAA-MM-DD, día de Argentina
	compra REAL NOT NULL CHECK (compra > 0),
	venta REAL NOT NULL CHECK (venta > 0),
	source TEXT NOT NULL,
	fetched_at INTEGER NOT NULL -- ms
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS paypal_withdrawals (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	day TEXT NOT NULL, -- AAAA-MM-DD, día de Argentina en que llegaron los pesos
	usd_cents INTEGER NOT NULL CHECK (usd_cents > 0),
	ars INTEGER NOT NULL CHECK (ars > 0),
	note TEXT CHECK (note IS NULL OR length(note) <= 200),
	created_at INTEGER NOT NULL,
	created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS paypal_withdrawals_day ON paypal_withdrawals (day);

ALTER TABLE tips ADD COLUMN provider TEXT NOT NULL DEFAULT 'mp';
ALTER TABLE tips ADD COLUMN currency TEXT NOT NULL DEFAULT 'ARS';
ALTER TABLE tips ADD COLUMN usd_gross_cents INTEGER;
ALTER TABLE tips ADD COLUMN usd_net_cents INTEGER;
ALTER TABLE tips ADD COLUMN rate_base REAL;
ALTER TABLE tips ADD COLUMN paypal_order_id TEXT;
ALTER TABLE tips ADD COLUMN paypal_capture_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS tips_paypal_order ON tips (paypal_order_id)
	WHERE paypal_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tips_provider_approved ON tips (provider, destination, status, approved_at);
