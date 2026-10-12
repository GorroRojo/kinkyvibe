-- Migration number: 0053 	 Lista de espera de las entradas (por evento o por tipo de entrada).
--
-- Solo agrega tablas (no toca ninguna existente): anda con el código que ya está en `main`, que no
-- las lee ni las escribe (decisión 0028). Todo detrás del interruptor `lista_espera` (tabla
-- feature_flags, migración 0013), apagado por defecto. Código: src/lib/server/tickets/waitlist.js;
-- reglas de cuánto dura una reserva: src/lib/utils/waitlistHold.js; docs/tickets.md.
--
-- Fechas: milisegundos desde epoch (INTEGER, UTC), como el resto de la base. Tokens (confirmar,
-- oferta) solo como hash SHA-256. Mail normalizado (minúsculas, sin espacios). Mismo trato que
-- `orders`: sin purga (salvo las anotaciones sin confirmar, que se borran a las 48 h), solo
-- admins, y el mail nunca va a admin_audit.
--
-- Alcance de cada fila: `ticket_type` NULL = la lista de todo el evento (`alcance: evento`); con
-- valor = la lista de ese tipo de entrada (`alcance: tipo`, un tipo con cupo). Un evento usa un
-- solo alcance a la vez (el editor no deja cambiarlo con anotaciones vivas).
--
-- Cómo cuenta cada alcance contra el cupo (lo hace el código, no esta tabla):
--   - Por tipo: las personas esperando ese tipo se restan del lugar libre de ese tipo.
--   - Por evento: las personas esperando se restan del lugar libre TOTAL del evento (la suma de lo
--     que queda en sus tipos con cupo), no del de cada tipo. Así una persona en la fila guarda un
--     solo lugar, no uno en cada tipo. Cada compra sigue respetando además el cupo de su tipo.
--
-- Estados (ver docs/tickets.md, «Lista de espera»):
--   pending_confirmation → waiting (confirmó el mail; con cuenta verificada se entra directo)
--   waiting → offered (se le guarda un lugar hasta `hold_until`, o NULL = aviso a toda la lista)
--   offered → purchased (compró con su oferta) | expired (venció, cerró la lista) | cancelled
--   purchased → offered (la orden quedó sin pagar y su plazo no venció)
-- Una anotación sin confirmar que se cancela o vence se borra (nunca dio su consentimiento).
CREATE TABLE IF NOT EXISTS waitlist_entries (
	-- UUID v4 al azar.
	id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
	event_slug TEXT NOT NULL CHECK (length(event_slug) BETWEEN 1 AND 200),
	-- NULL = todo el evento; si no, el id del tipo de entrada.
	ticket_type TEXT CHECK (ticket_type IS NULL OR length(ticket_type) BETWEEN 1 AND 60),
	email TEXT NOT NULL CHECK (email = lower(trim(email)) AND length(email) BETWEEN 3 AND 254),
	status TEXT NOT NULL CHECK (status IN
		('pending_confirmation','waiting','offered','purchased','expired','cancelled')),
	-- Doble confirmación: hash del token del link (vale 48 h); NULL una vez confirmada.
	confirm_hash TEXT CHECK (confirm_hash IS NULL OR length(confirm_hash) = 64),
	confirm_expires_at INTEGER,
	-- Cuándo entró a la fila: es el orden de la fila.
	confirmed_at INTEGER,
	-- Hash del token del link de la oferta. Queda en `purchased` (si la orden no se paga, la oferta
	-- vuelve con el mismo link); se borra al terminar (expired, cancelled).
	offer_token_hash TEXT CHECK (offer_token_hash IS NULL OR length(offer_token_hash) = 64),
	-- Cuántas ofertas tuvo (la ronda: va en la clave de los mails).
	offer_count INTEGER NOT NULL DEFAULT 0 CHECK (offer_count >= 0),
	offered_at INTEGER,
	-- Hasta cuándo se le guarda el lugar. NULL con 'offered' = aviso a todes (sin lugar guardado).
	hold_until INTEGER,
	-- La orden que hizo con su oferta.
	order_id TEXT REFERENCES orders (id),
	ended_at INTEGER,
	end_reason TEXT CHECK (end_reason IS NULL OR end_reason IN
		('hold_expired','left','admin','closed','event_cancelled','type_removed')),
	-- Login de le admin, si se terminó desde el panel.
	ended_by TEXT CHECK (ended_by IS NULL OR length(ended_by) BETWEEN 1 AND 200),
	-- Como orders.client_hash (sin IP): para los límites por conexión.
	client_hash TEXT CHECK (client_hash IS NULL OR length(client_hash) <= 128),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	CHECK (status <> 'pending_confirmation'
		OR (confirm_hash IS NOT NULL AND confirm_expires_at IS NOT NULL)),
	CHECK (status = 'pending_confirmation' OR confirmed_at IS NOT NULL),
	CHECK (status <> 'offered' OR (offer_token_hash IS NOT NULL AND offered_at IS NOT NULL)),
	CHECK (status <> 'purchased' OR order_id IS NOT NULL),
	CHECK (hold_until IS NULL OR offered_at IS NOT NULL),
	-- Terminada (expired, cancelled) ⇔ tiene motivo y fecha.
	CHECK ((status IN ('expired','cancelled')) = (end_reason IS NOT NULL)),
	CHECK ((end_reason IS NULL) = (ended_at IS NULL)),
	CHECK (end_reason IS NULL OR end_reason <> 'left' OR status = 'cancelled')
);
-- Una sola anotación viva por mail y alcance (puede volver a anotarse después de vencer o salir).
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_active_email
	ON waitlist_entries (event_slug, COALESCE(ticket_type, ''), email)
	WHERE status IN ('pending_confirmation','waiting','offered');
-- La fila de cada alcance, en orden.
CREATE INDEX IF NOT EXISTS waitlist_entries_queue
	ON waitlist_entries (event_slug, ticket_type, status, confirmed_at);
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_confirm
	ON waitlist_entries (confirm_hash) WHERE confirm_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_offer
	ON waitlist_entries (offer_token_hash) WHERE offer_token_hash IS NOT NULL;
-- Reservas que vencen (la barrida del cron).
CREATE INDEX IF NOT EXISTS waitlist_entries_holds
	ON waitlist_entries (hold_until) WHERE status = 'offered';
-- Anotaciones sin confirmar que vencen (se borran).
CREATE INDEX IF NOT EXISTS waitlist_entries_unconfirmed
	ON waitlist_entries (confirm_expires_at) WHERE status = 'pending_confirmation';
CREATE INDEX IF NOT EXISTS waitlist_entries_email ON waitlist_entries (email);
CREATE INDEX IF NOT EXISTS waitlist_entries_order
	ON waitlist_entries (order_id) WHERE order_id IS NOT NULL;

-- Mails de la lista que van por el cron (el de confirmar sale en el momento, como en las series).
-- Una fila por anotación, tipo de mail y ronda: así cada mail sale una sola vez.
CREATE TABLE IF NOT EXISTS waitlist_sends (
	entry_id TEXT NOT NULL REFERENCES waitlist_entries (id) ON DELETE CASCADE,
	kind TEXT NOT NULL CHECK (kind IN ('offer','reminder','expired','closed')),
	-- `offer_count` de esa oferta (0 para 'closed').
	round INTEGER NOT NULL CHECK (round >= 0),
	status TEXT NOT NULL CHECK (status IN ('sending','sent','retry','failed')),
	attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts >= 0),
	-- Último cambio de estado (como reminder_sends).
	sent_at INTEGER NOT NULL,
	PRIMARY KEY (entry_id, kind, round)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS waitlist_sends_unsent ON waitlist_sends (status) WHERE status != 'sent';
