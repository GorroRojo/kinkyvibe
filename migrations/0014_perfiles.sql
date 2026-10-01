-- Migration number: 0014 	 Perfiles (cuentas parte 2): qué cuentas gestionan qué perfil.
--
-- Los perfiles son objetos de tipo `perfil` (src/lib/server/objects/types/perfil.js), guardados
-- con saveObject() como cualquier objeto. Lo que NO es un objeto son las cuentas (`accounts`,
-- migración 0013): por eso "esta cuenta gestiona este perfil" no puede ser un edge (los edges
-- unen objetos con objetos) y va en una tabla propia. Ver docs/cuentas.md («Perfiles»).
--
-- Privacidad (decisión A2): quienes gestionan un perfil NUNCA se muestran en público ni a otras
-- cuentas. Estas tablas solo las leen las pantallas de Mi rincón de quien gestiona y les admins.
--
-- Solo las escribe src/lib/server/cuentas/perfiles.js; crear un perfil con su dueñe entra en la
-- misma tanda que saveObject() (opción `also`).

CREATE TABLE IF NOT EXISTS profile_managers (
	profile_id INTEGER NOT NULL REFERENCES objects (id) ON DELETE CASCADE,
	account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
	-- owner: todo, incluso sumar y sacar gente, pasar la propiedad y borrar el perfil.
	-- manager: edita el perfil y sus integrantes.
	-- Un perfil de persona tiene una sola fila (su dueñe); uno de grupo, las que haga falta, con
	-- al menos une owner (lo controla el código con sentencias condicionales).
	role TEXT NOT NULL CHECK (role IN ('owner', 'manager')),
	created_at INTEGER NOT NULL, -- ms desde epoch
	PRIMARY KEY (profile_id, account_id)
) WITHOUT ROWID;

-- "Mis perfiles".
CREATE INDEX IF NOT EXISTS profile_managers_account ON profile_managers (account_id);

-- Invitaciones a gestionar un grupo, por mail. No se guarda el mail: solo su hash (el mismo de
-- login_codes). Quien invita nunca sabe si ese mail tiene cuenta; la cuenta que entra con ese
-- mail verificado ve la invitación en Mi rincón y la acepta o la rechaza.
CREATE TABLE IF NOT EXISTS profile_invites (
	id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36), -- UUID v4
	profile_id INTEGER NOT NULL REFERENCES objects (id) ON DELETE CASCADE,
	email_hash TEXT NOT NULL CHECK (length(email_hash) = 64),
	invited_by TEXT REFERENCES accounts (id) ON DELETE SET NULL,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	UNIQUE (profile_id, email_hash)
);

CREATE INDEX IF NOT EXISTS profile_invites_email ON profile_invites (email_hash, expires_at);

-- Integrantes: un grupo invita a una persona (profile_member_invites, abajo) y, si ella acepta,
-- queda el edge `es_integrante_de` (persona → grupo). La persona se puede ir cuando quiera. Si
-- rechaza o se va, ESE grupo no la puede volver a invitar por 30 días. Esta tabla guarda solo
-- eso: qué grupo, qué perfil de persona y hasta cuándo.
-- Va acá y no en otro lado porque:
-- - no puede ser un edge: los edges se leen con getEdges() y cualquiera que vea los dos perfiles
--   vería que esa persona estuvo en el grupo;
-- - no entra en rate_limits: esa tabla guarda como mucho 24 horas.
-- No dice cuándo se fue ni nada de la cuenta; solo la lee y escribe perfiles.js, nunca se
-- muestra, y las filas vencidas se borran al invitar a alguien desde ese grupo.
CREATE TABLE IF NOT EXISTS profile_member_blocks (
	group_id INTEGER NOT NULL REFERENCES objects (id) ON DELETE CASCADE,
	persona_id INTEGER NOT NULL REFERENCES objects (id) ON DELETE CASCADE,
	until INTEGER NOT NULL, -- ms desde epoch: hasta acá el grupo no la puede volver a sumar
	PRIMARY KEY (group_id, persona_id)
) WITHOUT ROWID;

-- Invitaciones a ser integrante de un grupo, hasta que la persona acepta (entonces pasa a ser el
-- edge) o rechaza. No es un edge ni va en el objeto de la persona: así la ven solo ella y quienes
-- gestionan el grupo, e invitar o retirar no le cambia la `version` al perfil de la persona.
-- `silenced` = 1 si la cuenta de la persona eligió no recibir invitaciones de grupos: ella no la
-- ve nunca, y para quienes invitan se ve igual que cualquier pendiente (vence sola).
CREATE TABLE IF NOT EXISTS profile_member_invites (
	group_id INTEGER NOT NULL REFERENCES objects (id) ON DELETE CASCADE,
	persona_id INTEGER NOT NULL REFERENCES objects (id) ON DELETE CASCADE,
	silenced INTEGER NOT NULL DEFAULT 0 CHECK (silenced IN (0, 1)),
	created_at INTEGER NOT NULL, -- ms desde epoch
	expires_at INTEGER NOT NULL,
	PRIMARY KEY (group_id, persona_id)
) WITHOUT ROWID;

-- "Te invitaron a sumarte" de una persona.
CREATE INDEX IF NOT EXISTS profile_member_invites_persona ON profile_member_invites (persona_id);
