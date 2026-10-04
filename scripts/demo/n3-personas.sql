-- Datos de prueba INVENTADOS para la demo (base de preview, `kinkyvibe-preview`): personas con
-- rol en eventos y preguntas de inscripción. NUNCA cargar en la base de producción
-- (`kinkyvibe`). Ver docs/demo.md y docs/personas-eventos.md.
--
--   npx wrangler d1 execute kinkyvibe-preview --remote --file scripts/demo/n3-personas.sql
--   (o --local para probar en la compu)
--
-- Qué carga:
-- 1. Tres perfiles de ejemplo (objetos `perfil`, creados "por une admin" y aprobados para
--    /amigues en `profile_approvals`, como los que carga une admin): «Colectivo de Prueba»
--    (proyecto), «Persona de Prueba» (persona) y «Perfil Oculto de Prueba» (oculto: no tiene que
--    aparecer en ningún lado público).
-- 2. Un rol agregado desde el panel: «Cuida la puerta».
-- 3. Un evento que solo existe en la demo, `demo-personas-2026-12` (objeto `evento` en la base
--    del preview, no listado), con sus personas (los tres perfiles) y venta de entradas por
--    transferencia. El sitio, el editor y el panel lo leen de la base (docs/demo.md).
-- 4. Preguntas: una general («¿Cómo te enteraste?», elegida por el evento) y una propia del
--    evento («¿Alguna restricción alimentaria?»), y una orden aprobada con sus respuestas, para
--    ver la pestaña Órdenes y su CSV.
--
-- Para verlo: Ajustes → Interruptores → prender «Personas en eventos…» y «Perfiles públicos»
-- (los links de las personas llevan a su página en /amigues).
--
-- Se puede correr más de una vez (ids fijos e `INSERT OR IGNORE` / `INSERT OR REPLACE` en lo
-- que es solo de la demo). Requiere las migraciones hasta la 0031. Escribe `objects` con SQL
-- solo porque es una demo: en el código, el único camino es saveObject().

INSERT OR IGNORE INTO object_types (type, origin, created_at) VALUES ('perfil', 'core', 1790000000000);

INSERT OR IGNORE INTO objects (type, slug, title, data, visibility, created_at, created_by, updated_at, updated_by)
VALUES
	('perfil', 'colectivo-de-prueba', 'Colectivo de Prueba', '{"kind":"proyecto","bio":"Proyecto inventado para la demo."}', 'public', 1790000000000, 'demo', 1790000000000, 'demo'),
	('perfil', 'persona-de-prueba', 'Persona de Prueba', '{"kind":"persona","pronouns":"elle"}', 'public', 1790000000000, 'demo', 1790000000000, 'demo'),
	('perfil', 'perfil-oculto-de-prueba', 'Perfil Oculto de Prueba', '{"kind":"persona"}', 'hidden', 1790000000000, 'demo', 1790000000000, 'demo');

INSERT OR IGNORE INTO profile_approvals (profile_id, approved_at, approved_by)
SELECT id, 1790000000000, 'demo' FROM objects
WHERE type = 'perfil' AND slug IN ('colectivo-de-prueba', 'persona-de-prueba', 'perfil-oculto-de-prueba');

INSERT OR IGNORE INTO persona_roles (name, created_at, created_by) VALUES ('Cuida la puerta', 1790000000000, 'demo');

-- Los eventos van a la base como objetos `evento` (el sitio y el panel leen los eventos solo de
-- la base). Antes iban como .md en `demo_files`: esas filas viejas se borran.
CREATE TABLE IF NOT EXISTS demo_files (
	path TEXT PRIMARY KEY,
	content TEXT,
	encoding TEXT NOT NULL DEFAULT 'utf-8' CHECK (encoding IN ('utf-8', 'binary', 'ref')),
	deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
	author TEXT NOT NULL,
	message TEXT,
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
DELETE FROM demo_files WHERE path = 'src/lib/posts/calendario/demo-personas-2026-12.md';

INSERT OR IGNORE INTO object_types (type, origin, created_at) VALUES ('evento', 'core', 1790000000000);

INSERT INTO objects (type, slug, title, data, search_text, visibility, created_at, created_by, updated_at, updated_by)
VALUES ('evento', 'demo-personas-2026-12', 'Demo: taller con personas y preguntas',
	'{"summary":"Evento inventado para la demo: quién organiza y facilita, y preguntas al inscribirse.","status":"abierto","start":"2026-12-12T19:00-03:00","end":"2026-12-12T22:00-03:00","body":"Taller inventado para probar las personas con rol y las preguntas de inscripción.","tags":["español","pago","AMBA"],"personas":[{"profile":"colectivo-de-prueba","role":"Organiza"},{"profile":"persona-de-prueba","role":"Facilita"},{"profile":"perfil-oculto-de-prueba","role":"Cuida la puerta"}],"location":"Calle Inventada 123, CABA","location_name":"Lugar de Prueba","published_date":"2026-10-01","unlisted":true,"extra":{"payment_methods":["transferencia"],"tickets":[{"id":"general","name":"General","price":9000,"capacity":30}]}}',
	'Evento inventado para la demo: quién organiza y facilita, y preguntas al inscribirse.
Taller inventado para probar las personas con rol y las preguntas de inscripción.', 'public', 1790000000000, 'demo', 1790000000000, 'demo')
ON CONFLICT (type, slug) DO UPDATE SET title = excluded.title, data = excluded.data,
	search_text = excluded.search_text, visibility = excluded.visibility, deleted_at = NULL,
	updated_at = excluded.updated_at, updated_by = excluded.updated_by, version = objects.version + 1;

INSERT OR REPLACE INTO signup_fields (id, event_slug, label, kind, required, options, position, created_at, updated_at, updated_by)
VALUES
	(910001, NULL, '¿Cómo te enteraste?', 'choice', 1, '["Instagram","Una amistad","Otro"]', 0, 1790000000000, 1790000000000, 'demo'),
	(910002, 'demo-personas-2026-12', '¿Alguna restricción alimentaria?', 'text', 0, '[]', 0, 1790000000000, 1790000000000, 'demo');

INSERT OR REPLACE INTO event_signup_general (event_slug, field_id, position) VALUES ('demo-personas-2026-12', 910001, 0);

INSERT OR REPLACE INTO orders (id, event_slug, ticket_type, quantity, unit_price, fondo_option, subtotal, total,
	payment_method, buyer_name, buyer_pronouns, buyer_email, buyer_dni, holders, status, created_at, updated_at, expires_at)
VALUES ('00000000-0000-4000-8000-0000000d3001', 'demo-personas-2026-12', 'general', 1, 9000, 'completo', 9000, 9000,
	'transferencia', 'Compradore de Prueba', 'elle', 'compradore@example.com', '30000000',
	'[{"name":"Compradore de Prueba","pronouns":"elle"}]', 'approved', 1790000000000, 1790000000000, 1790000000000);

INSERT OR REPLACE INTO order_answers (order_id, answers, created_at) VALUES (
	'00000000-0000-4000-8000-0000000d3001',
	'[{"id":910001,"label":"¿Cómo te enteraste?","value":"Una amistad"},{"id":910002,"label":"¿Alguna restricción alimentaria?","value":"Sin gluten"}]',
	1790000000000
);
