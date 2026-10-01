-- Migration number: 0017 	 Amigues como perfiles, lugares y su privacidad (noche 3, bloque A).
--
-- Las fichas de amigues (.md) pasan a ser objetos `perfil` (persona, grupo o lugar) en la base,
-- con las mismas direcciones (/amigues/<slug>). Los perfiles se siguen escribiendo SOLO con
-- saveObject() (src/lib/server/objects/save.js); estas son tablas de apoyo que se escriben en la
-- misma tanda (opción `also`) o desde el panel. Ver docs/amigues.md.
--
-- Todo esto se usa recién con el interruptor `perfiles_publicos` prendido (apagado por defecto).
-- Solo agrega tablas: no toca nada de lo que ya existe.

-- De qué archivo .md salió cada perfil importado. La dirección vieja (`legacy_slug`, por ejemplo
-- "Gorro_Rojo" o "la.colectiver") no entra en `objects.slug` (solo minúsculas y guiones): esta
-- tabla es la que hace que /amigues/<slug viejo> siga andando igual.
-- - `source_hash`: SHA-256 del .md tal como se importó; si el archivo no cambió, reimportar no
--   hace nada.
-- - `imported_version`: la `version` del objeto justo después de importar. Si el objeto tiene
--   otra, alguien lo editó en el panel y la importación no lo pisa.
-- - `suggested_kind` y `kind_reason`: lo que propuso la clasificación automática; queda "a
--   confirmar" hasta que une admin la confirma (`kind_confirmed_at`/`_by`).
CREATE TABLE IF NOT EXISTS profile_sources (
	profile_id INTEGER PRIMARY KEY REFERENCES objects (id) ON DELETE CASCADE,
	legacy_slug TEXT NOT NULL UNIQUE CHECK (length(legacy_slug) BETWEEN 1 AND 100),
	source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
	imported_version INTEGER NOT NULL CHECK (imported_version >= 1),
	suggested_kind TEXT NOT NULL CHECK (suggested_kind IN ('persona', 'grupo', 'lugar')),
	kind_reason TEXT NOT NULL DEFAULT '',
	kind_confirmed_at INTEGER, -- ms desde epoch; NULL = "a confirmar"
	kind_confirmed_by TEXT, -- login de GitHub de le admin
	imported_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

-- Perfiles aprobados para aparecer en /amigues. Un perfil sin fila acá no se ve en público
-- (aunque sea `public`): lo ven solo quienes lo gestionan y les admins. Los importados y los que
-- crea une admin nacen aprobados; los que crea una cuenta esperan a que une admin los apruebe.
CREATE TABLE IF NOT EXISTS profile_approvals (
	profile_id INTEGER PRIMARY KEY REFERENCES objects (id) ON DELETE CASCADE,
	approved_at INTEGER NOT NULL,
	approved_by TEXT NOT NULL -- login de GitHub de le admin, o 'importacion'
) WITHOUT ROWID;

-- "Es mi perfil": una cuenta pide hacerse cargo de un perfil que ya existe (por ejemplo, una
-- ficha importada). Le admin lo aprueba (la cuenta pasa a ser dueñe, en profile_managers) o lo
-- rechaza. Una cuenta solo ve sus propios pedidos; nunca los de otras.
CREATE TABLE IF NOT EXISTS profile_claims (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	profile_id INTEGER NOT NULL REFERENCES objects (id) ON DELETE CASCADE,
	account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
	-- Lo que la persona cuenta para que le admin pueda confirmarlo (opcional, lo ven solo admins).
	message TEXT NOT NULL DEFAULT '' CHECK (length(message) <= 500),
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
	created_at INTEGER NOT NULL,
	decided_at INTEGER,
	decided_by TEXT, -- login de GitHub de le admin
	CHECK ((status = 'pending') = (decided_at IS NULL))
);
-- Un solo pedido pendiente por cuenta y perfil.
CREATE UNIQUE INDEX IF NOT EXISTS profile_claims_one_pending ON profile_claims (profile_id, account_id)
	WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS profile_claims_status ON profile_claims (status, created_at);
CREATE INDEX IF NOT EXISTS profile_claims_account ON profile_claims (account_id);

-- "Sucede en": el lugar de cada evento, mientras los eventos sigan siendo archivos .md. Es un
-- vínculo PROVISORIO por la dirección del evento (`event_slug`); cuando los eventos pasen a la
-- base, cada fila se convierte en un edge `lugar` (evento → perfil de lugar) con saveObject() y
-- `privacy` pasa a `edges.data` (ver docs/amigues.md, «Del vínculo provisorio al edge»).
-- Va en la base y no en el frontmatter para que la dirección de un lugar privado nunca quede
-- escrita en el repo (que es público).
-- `privacy`: la del evento, que manda sobre la del lugar; NULL = la del lugar.
--   public: nombre y dirección · name: solo el nombre · area: solo el barrio · hidden: nada.
CREATE TABLE IF NOT EXISTS event_venues (
	event_slug TEXT PRIMARY KEY CHECK (length(event_slug) BETWEEN 1 AND 100),
	venue_id INTEGER NOT NULL REFERENCES objects (id) ON DELETE CASCADE,
	privacy TEXT CHECK (privacy IS NULL OR privacy IN ('public', 'name', 'area', 'hidden')),
	created_at INTEGER NOT NULL,
	created_by TEXT NOT NULL,
	updated_at INTEGER NOT NULL,
	updated_by TEXT NOT NULL
) WITHOUT ROWID;
-- "Los eventos de este lugar".
CREATE INDEX IF NOT EXISTS event_venues_venue ON event_venues (venue_id);
