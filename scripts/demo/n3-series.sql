-- Datos inventados para probar "Series" (Noche 3 · B) en la base de PREVIEWS/DEMO.
-- NUNCA en la base de producción (`kinkyvibe`). Aplicar con la migración 0020 ya aplicada:
--   npx wrangler d1 execute <base-de-previews> --remote --file scripts/demo/n3-series.sql
-- (el nombre de la base de previews está en el bloque [previews] de wrangler.toml).
-- Idempotente: se puede correr dos veces. Mails @example.com (no existen). Los hashes son
-- los mismos que calcula la app (subscriber_key = "e:" + SHA-256("cuentas:email:" + mail)).

-- Prende el interruptor `series` (en el preview; en producción se prende desde el panel).
INSERT INTO feature_flags (key, enabled, updated_at, updated_by) VALUES ('series', 1, 1790866800000, 'demo')
	ON CONFLICT (key) DO UPDATE SET enabled = 1, updated_at = excluded.updated_at,
		updated_by = excluded.updated_by;

-- Personas que pidieron aviso (confirmadas y una sin confirmar).
INSERT OR IGNORE INTO series_subscriptions (id, series_tag, email, subscriber_key, created_at, confirmed_at)
	VALUES ('2391e459-48d1-4b13-b616-ee1f82410fee', 'Picantearla', 'demo.aviso.uno@example.com', 'e:6c5fa5c06c80b9bf5cc37482374e47308481f5ab7ab71e70d187208b7dcd3947', 1789138800000, 1789138800000);
INSERT OR IGNORE INTO series_subscriptions (id, series_tag, email, subscriber_key, created_at, confirmed_at)
	VALUES ('2728f347-00ab-4920-bebb-145e0e6f5856', 'Picantearla', 'demo.aviso.dos@example.com', 'e:f6aacf261d4de131b6a8208feef6f7fc6582515a5361e953015db3647ee73775', 1790002800000, 1790002800000);
INSERT OR IGNORE INTO series_subscriptions (id, series_tag, email, subscriber_key, confirm_hash, confirm_expires_at, created_at)
	VALUES ('7d7ac55f-3415-4ff4-b799-deb86a839b21', 'Picantearla', 'demo.aviso.tres@example.com', 'e:97bd411063e99a4cc1eccc27387f889408cdc634bd03053b9070ca4b4799102d', '88c1c1502d1add06114e0d3fce0e9e534f11bca0bef9003e5bab381349ff53d8', 1790953200000, 1790780400000);
INSERT OR IGNORE INTO series_subscriptions (id, series_tag, email, subscriber_key, created_at, confirmed_at)
	VALUES ('a0a3a41a-393c-4b1f-a868-b3d08c0182f7', 'Cine para Sucixs', 'demo.aviso.cuatro@example.com', 'e:990559f91ad90b9c67e4bf26e5a9ca3f1d0f15442a4c524077701ba8ee6c004b', 1790434800000, 1790434800000);
