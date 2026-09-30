-- inicio-search (agente A): la tabla nueva `admin_last_seen` (migración 0005) NO necesita filas
-- de demo: se llena sola la primera vez que une admin abre /admin (primera visita = últimos 7 días).
-- Opcional, para que "Actividad" y "Desde tu última visita" no se vean vacíos en el preview:
-- unas entradas inventadas del registro de actividad (tiempos relativos a cuando se corre).
INSERT INTO admin_audit (at, actor_id, actor_login, action, target_type, target_id, summary)
VALUES
	(CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 3600000, NULL, 'demo', 'discount.create', 'discount', 'DEMO20', 'Creó el código DEMO20 (20 %)'),
	(CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 7200000, NULL, 'demo', 'settings.save', 'settings', 'ventas', 'Guardó los ajustes de venta');
