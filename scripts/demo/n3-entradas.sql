-- Datos de prueba INVENTADOS para la demo (base de preview, `kinkyvibe-preview`): preventas
-- escalonadas, un tipo encadenado y un evento «Solo anticipadas». NUNCA cargar en la base de
-- producción (`kinkyvibe`). Ver docs/demo.md.
--
--   npx wrangler d1 execute kinkyvibe-preview --remote --file scripts/demo/n3-entradas.sql
--   (o --local para probar en la compu)
--
-- Qué carga:
-- 1. `demo_files`: dos eventos que solo existen en la demo (el panel y la venta leen su
--    configuración de entradas de ahí; ver docs/demo.md: las páginas públicas siguen leyendo
--    el contenido del deploy, así que la página pública de estos dos eventos no existe):
--    - `demo-preventas-2026-12`: «General» con tres tramos (5 a $ 8.000, 10 a $ 9.000 y el
--      resto a $ 10.000, cupo 25) y «Última tanda» ($ 12.000), que se habilita cuando se agota
--      General; con «Hay entradas en la puerta» y precio en la puerta.
--    - `demo-solo-anticipadas-2026-12`: un tipo con preventa por fecha y `puerta: false`.
-- 2. Órdenes aprobadas (con sus entradas) que llenan «Preventa 1» (5) y ocupan 4 de
--    «Preventa 2»: en la demo se ve «Preventa 2 · $ 9.000».
--
-- Se puede correr más de una vez: reemplaza lo suyo (ids fijos, `INSERT OR REPLACE`).
-- Requiere las migraciones hasta la 0016 (`orders.ticket_tier`).

CREATE TABLE IF NOT EXISTS demo_files (
	path TEXT PRIMARY KEY,
	content TEXT,
	encoding TEXT NOT NULL DEFAULT 'utf-8' CHECK (encoding IN ('utf-8', 'binary', 'ref')),
	deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
	author TEXT NOT NULL,
	message TEXT,
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR REPLACE INTO demo_files (path, content, author, message) VALUES (
	'src/lib/posts/calendario/demo-preventas-2026-12.md',
	'---
title: ''Demo: fiesta con preventas''
summary: ''Evento inventado para la demo: preventas escalonadas y una última tanda.''
tags:
  - español
  - pago
  - AMBA
layout: calendario
category: calendario
authors:
  - KinkyVibe
force_unlisted: true
status: abierto
start: 2026-12-19T22:00-03:00
end: 2026-12-20T04:00-03:00
location: Calle Inventada 123, Ciudad de Buenos Aires
location_name: Lugar de prueba
modalidad: presencial
tickets:
  - id: general
    name: General
    capacity: 25
    tiers:
      - id: preventa-1
        name: Preventa 1
        price: 8000
        quantity: 5
      - id: preventa-2
        name: Preventa 2
        price: 9000
        quantity: 10
      - id: general
        name: General
        price: 10000
  - id: ultima-tanda
    name: Última tanda
    price: 12000
    capacity: 10
    after: general
payment_methods: [mercadopago, transferencia]
puerta: true
puerta_precio: $ 13.000, solo efectivo
---

Evento inventado para probar las preventas escalonadas en la demo.
',
	'demo',
	'Noche 3 · C: evento de prueba con preventas'
);

INSERT OR REPLACE INTO demo_files (path, content, author, message) VALUES (
	'src/lib/posts/calendario/demo-solo-anticipadas-2026-12.md',
	'---
title: ''Demo: taller solo con anticipadas''
summary: ''Evento inventado para la demo: preventa por fecha y sin entradas en la puerta.''
tags:
  - español
  - pago
  - AMBA
layout: calendario
category: calendario
authors:
  - KinkyVibe
force_unlisted: true
status: abierto
start: 2026-12-05T18:00-03:00
end: 2026-12-05T21:00-03:00
location: Calle Inventada 456, Ciudad de Buenos Aires
location_name: Otro lugar de prueba
modalidad: presencial
tickets:
  - id: entrada
    name: Entrada
    capacity: 15
    tiers:
      - id: anticipada
        name: Anticipada
        price: 6000
        until: 2026-11-25T23:59-03:00
      - id: entrada
        name: Entrada
        price: 7500
payment_methods: [transferencia]
puerta: false
---

Evento inventado: solo entradas anticipadas.
',
	'demo',
	'Noche 3 · C: evento de prueba solo anticipadas'
);

-- Órdenes aprobadas inventadas (personas de mentira, emails @example.com).
DELETE FROM tickets WHERE event_slug = 'demo-preventas-2026-12';
DELETE FROM orders WHERE event_slug = 'demo-preventas-2026-12';

INSERT INTO orders (id, event_slug, ticket_type, ticket_tier, quantity, unit_price, fondo_option,
	subtotal, total, payment_method, buyer_name, buyer_pronouns, buyer_email, buyer_dni, status,
	confirmed_by, created_at, updated_at, expires_at, channel)
VALUES
	('0d3e0000-0000-4000-8000-000000000001', 'demo-preventas-2026-12', 'general', 'preventa-1', 2,
		8000, 'completo', 16000, 16000, 'transferencia', 'Persona Demo Uno', 'elle',
		'demo1@example.com', '30000001', 'approved', 'demo',
		CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 86400000 * 5,
		CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 86400000 * 5,
		CAST(strftime('%s', 'now') AS INTEGER) * 1000, 'online'),
	('0d3e0000-0000-4000-8000-000000000002', 'demo-preventas-2026-12', 'general', 'preventa-1', 2,
		8000, 'completo', 16000, 16000, 'transferencia', 'Persona Demo Dos', 'ella',
		'demo2@example.com', '30000002', 'approved', 'demo',
		CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 86400000 * 4,
		CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 86400000 * 4,
		CAST(strftime('%s', 'now') AS INTEGER) * 1000, 'online'),
	('0d3e0000-0000-4000-8000-000000000003', 'demo-preventas-2026-12', 'general', 'preventa-1', 1,
		8000, 'completo', 8000, 8000, 'transferencia', 'Persona Demo Tres', 'él',
		'demo3@example.com', '30000003', 'approved', 'demo',
		CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 86400000 * 3,
		CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 86400000 * 3,
		CAST(strftime('%s', 'now') AS INTEGER) * 1000, 'online'),
	('0d3e0000-0000-4000-8000-000000000004', 'demo-preventas-2026-12', 'general', 'preventa-2', 2,
		9000, 'completo', 18000, 18000, 'transferencia', 'Persona Demo Cuatro', 'elle',
		'demo4@example.com', '30000004', 'approved', 'demo',
		CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 86400000 * 2,
		CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 86400000 * 2,
		CAST(strftime('%s', 'now') AS INTEGER) * 1000, 'online'),
	('0d3e0000-0000-4000-8000-000000000005', 'demo-preventas-2026-12', 'general', 'preventa-2', 2,
		9000, 'completo', 18000, 18000, 'transferencia', 'Persona Demo Cinco', 'ella',
		'demo5@example.com', '30000005', 'approved', 'demo',
		CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 86400000,
		CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 86400000,
		CAST(strftime('%s', 'now') AS INTEGER) * 1000, 'online');

-- Una entrada por persona (token al azar de 43 caracteres; código corto fijo, sin 0/O/1/I/L).
INSERT INTO tickets (id, order_id, event_slug, ticket_type, holder_name, holder_pronouns, token, code)
VALUES
	('0d3e0000-0000-4000-9000-000000000011', '0d3e0000-0000-4000-8000-000000000001',
		'demo-preventas-2026-12', 'general', 'Persona Demo Uno', 'elle',
		substr(lower(hex(randomblob(24))), 1, 43), 'DMA2B3'),
	('0d3e0000-0000-4000-9000-000000000012', '0d3e0000-0000-4000-8000-000000000001',
		'demo-preventas-2026-12', 'general', 'Acompañante Demo', 'elle',
		substr(lower(hex(randomblob(24))), 1, 43), 'DMA2B4'),
	('0d3e0000-0000-4000-9000-000000000021', '0d3e0000-0000-4000-8000-000000000002',
		'demo-preventas-2026-12', 'general', 'Persona Demo Dos', 'ella',
		substr(lower(hex(randomblob(24))), 1, 43), 'DMA2B5'),
	('0d3e0000-0000-4000-9000-000000000022', '0d3e0000-0000-4000-8000-000000000002',
		'demo-preventas-2026-12', 'general', 'Otra Persona Demo', 'ella',
		substr(lower(hex(randomblob(24))), 1, 43), 'DMA2B6'),
	('0d3e0000-0000-4000-9000-000000000031', '0d3e0000-0000-4000-8000-000000000003',
		'demo-preventas-2026-12', 'general', 'Persona Demo Tres', 'él',
		substr(lower(hex(randomblob(24))), 1, 43), 'DMA2B7'),
	('0d3e0000-0000-4000-9000-000000000041', '0d3e0000-0000-4000-8000-000000000004',
		'demo-preventas-2026-12', 'general', 'Persona Demo Cuatro', 'elle',
		substr(lower(hex(randomblob(24))), 1, 43), 'DMA2B8'),
	('0d3e0000-0000-4000-9000-000000000042', '0d3e0000-0000-4000-8000-000000000004',
		'demo-preventas-2026-12', 'general', 'Amigue Demo', 'elle',
		substr(lower(hex(randomblob(24))), 1, 43), 'DMA2B9'),
	('0d3e0000-0000-4000-9000-000000000051', '0d3e0000-0000-4000-8000-000000000005',
		'demo-preventas-2026-12', 'general', 'Persona Demo Cinco', 'ella',
		substr(lower(hex(randomblob(24))), 1, 43), 'DMA2C3'),
	('0d3e0000-0000-4000-9000-000000000052', '0d3e0000-0000-4000-8000-000000000005',
		'demo-preventas-2026-12', 'general', 'Pareja Demo', 'él',
		substr(lower(hex(randomblob(24))), 1, 43), 'DMA2C4');
