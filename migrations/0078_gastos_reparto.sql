-- Migration number: 0078 	 Gastos y reparto: la cuenta de cada evento que vende entradas.
--
-- Decisiones de gorrite en la Mesa (3 y 4/11) sobre el prototipo #549: lo que se carga en Ventas ›
-- Gastos y reparto (lugar, contrataciones, otros gastos, otros ingresos, facilitadores y regla del
-- reparto) se guarda en la base; «Cerrar la cuenta» congela los números y guarda un renglón de
-- resumen por evento (las columnas de las planillas) para el resumen del año. Código:
-- src/lib/server/tickets/cuentas.js y src/lib/admin/reparto.js; docs/tickets.md («Gastos y
-- reparto»).
--
-- Solo agrega tablas nuevas (no cambia ninguna fila): el código que ya está en `main` no las lee
-- (decisión 0028). Todo detrás del interruptor `gastos_reparto`, apagado por defecto.
--
-- Nunca se guardan alias, CBU ni CVU: «quién pagó» y «quién la tiene» son nombres. Fechas en
-- milisegundos desde epoch (INTEGER, UTC); montos en pesos enteros.

-- Lo cargado a mano de la cuenta de un evento, como un JSON (`AccountData` de reparto.js): la
-- regla del lugar y su pago, contrataciones, otros gastos, otros ingresos, facilitadores, la regla
-- del reparto y quién tiene cada plata. `version` para no pisar lo que guardó otre admin.
CREATE TABLE IF NOT EXISTS event_accounts (
	event_slug TEXT PRIMARY KEY,
	data TEXT NOT NULL CHECK (json_valid(data)),
	version INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL,
	created_by TEXT NOT NULL,
	updated_at INTEGER NOT NULL,
	updated_by TEXT NOT NULL
);

-- El cierre de la cuenta de un evento: el resumen con las columnas de las planillas y la foto
-- entera de la cuenta (`snapshot`: lo que entró y la cuenta, para mostrarla congelada). Uno por
-- evento; reabrir la cuenta borra el renglón (queda en Actividad).
CREATE TABLE IF NOT EXISTS event_account_closings (
	event_slug TEXT PRIMARY KEY,
	event_title TEXT NOT NULL,
	event_date TEXT NOT NULL, -- AAAA-MM-DD, el día del evento (para el resumen por mes)
	tickets INTEGER NOT NULL, -- cantidades: entradas de las órdenes aprobadas
	presale INTEGER NOT NULL, -- preventa: online y a mano, sin recargo de MP ni aportes al Fondo
	door INTEGER NOT NULL, -- puerta, igual
	fondo_net INTEGER NOT NULL, -- lo que cubrió el Fondo − lo que recibió (positivo: lo pone el Fondo)
	other_income INTEGER NOT NULL,
	income_total INTEGER NOT NULL,
	venue INTEGER NOT NULL, -- lugar
	fees INTEGER NOT NULL, -- contrataciones
	other_expenses INTEGER NOT NULL,
	expenses_total INTEGER NOT NULL, -- gastos: lugar + contrataciones + otros gastos
	caja INTEGER NOT NULL, -- lo que va a la Caja KV
	profit INTEGER NOT NULL, -- ganancia: ingresos − gastos
	snapshot TEXT NOT NULL CHECK (json_valid(snapshot)),
	closed_at INTEGER NOT NULL,
	closed_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS event_account_closings_date ON event_account_closings (event_date);

-- Cómo cobra cada lugar por defecto (la regla de reparto.js: fijo, por hora, porcentaje o
-- porcentaje con mínimo), para precargar la cuenta de sus eventos. Va aparte de `objects` y no
-- en los datos del perfil: los datos del perfil se ven en su página y los edita quien lo
-- gestiona; esto es solo del panel.
CREATE TABLE IF NOT EXISTS venue_cost_rules (
	venue_id INTEGER PRIMARY KEY REFERENCES objects (id),
	rule TEXT NOT NULL CHECK (json_valid(rule)),
	updated_at INTEGER NOT NULL,
	updated_by TEXT NOT NULL
);
