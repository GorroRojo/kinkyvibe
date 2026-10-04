-- Cuentas del público INVENTADAS para «Entrar como persona de prueba» (base de preview,
-- `kinkyvibe-preview`). NUNCA cargar en la base de producción (`kinkyvibe`). Ver docs/demo.md y
-- src/lib/server/demo/personas.js (los ids y mails tienen que ser los mismos que ahí).
--
--   npx wrangler d1 execute kinkyvibe-preview --remote --file scripts/demo/n3-personas.sql
--   npx wrangler d1 execute kinkyvibe-preview --remote --file scripts/demo/n3-cuentas.sql
--   (o --local para probar en la compu)
--
-- Qué carga:
-- 1. Tres cuentas, mails `@example.invalid` (no existen), con la marca
--    `preferences.datos_de_prueba`: solo a cuentas así deja entrar «Entrar como persona de prueba».
--    - demo.entradas: una entrada aprobada para el evento de n3-personas.sql y cosas seguidas
--      (dos etiquetas y el perfil «Persona de Prueba»).
--    - demo.gestiona: puede tener perfiles y es dueñe de «Persona de Prueba».
--    - demo.nueva: nada (como alguien que recién creó su cuenta).
--
-- Va después de n3-personas.sql (el evento y el perfil son de ahí; sin ellos, lo que depende de
-- eso no se carga). Se puede correr más de una vez (ids fijos e `INSERT OR IGNORE`). Requiere
-- las migraciones hasta la 0032.

INSERT OR IGNORE INTO accounts (id, email, email_verified_at, preferences, created_at, updated_at, can_have_profiles)
VALUES
	('5eed0000-0000-4000-8000-0000000000a1', 'demo.entradas@example.invalid', 1790000000000, '{"datos_de_prueba":true}', 1790000000000, 1790000000000, 0),
	('5eed0000-0000-4000-8000-0000000000a2', 'demo.gestiona@example.invalid', 1790000000000, '{"datos_de_prueba":true}', 1790000000000, 1790000000000, 1),
	('5eed0000-0000-4000-8000-0000000000a3', 'demo.nueva@example.invalid', 1790000000000, '{"datos_de_prueba":true}', 1790000000000, 1790000000000, 0);

-- Por si la fila ya estaba sin la marca (solo estas tres: mismo id y mismo mail).
UPDATE accounts SET preferences = json_set(preferences, '$.datos_de_prueba', json('true'))
WHERE (id, email) IN (
	VALUES ('5eed0000-0000-4000-8000-0000000000a1', 'demo.entradas@example.invalid'),
		('5eed0000-0000-4000-8000-0000000000a2', 'demo.gestiona@example.invalid'),
		('5eed0000-0000-4000-8000-0000000000a3', 'demo.nueva@example.invalid')
) AND deleted_at IS NULL;

-- demo.entradas: una entrada aprobada (vinculada a la cuenta y con su mail).
INSERT OR IGNORE INTO orders (id, event_slug, ticket_type, quantity, unit_price, fondo_option, subtotal, total,
	payment_method, buyer_name, buyer_pronouns, buyer_email, buyer_dni, holders, status, created_at, updated_at, expires_at,
	account_id)
VALUES ('00000000-0000-4000-8000-0000000d3101', 'demo-personas-2026-12', 'general', 1, 9000, 'completo', 9000, 9000,
	'transferencia', 'Persona con Entradas', 'elle', 'demo.entradas@example.invalid', '30000101',
	'[{"name":"Persona con Entradas","pronouns":"elle"}]', 'approved', 1790000000000, 1790000000000, 1790000000000,
	'5eed0000-0000-4000-8000-0000000000a1');

-- demo.entradas: lo que sigue.
INSERT OR IGNORE INTO follows (account_id, target_kind, target_key, in_calendar, mail_new, mail_reminder, created_at, updated_at)
VALUES
	('5eed0000-0000-4000-8000-0000000000a1', 'etiqueta', 'Picantearla', 1, 1, 0, 1790000000000, 1790000000000),
	('5eed0000-0000-4000-8000-0000000000a1', 'etiqueta', 'taller', 1, 0, 1, 1790000000000, 1790000000000);

INSERT OR IGNORE INTO follows (account_id, target_kind, target_key, in_calendar, mail_new, mail_reminder, created_at, updated_at)
SELECT '5eed0000-0000-4000-8000-0000000000a1', 'perfil', CAST(id AS TEXT), 1, 1, 1, 1790000000000, 1790000000000
FROM objects WHERE type = 'perfil' AND slug = 'persona-de-prueba';

-- demo.gestiona: dueñe de «Persona de Prueba».
INSERT OR IGNORE INTO profile_managers (profile_id, account_id, role, created_at)
SELECT id, '5eed0000-0000-4000-8000-0000000000a2', 'owner', 1790000000000
FROM objects WHERE type = 'perfil' AND slug = 'persona-de-prueba';
