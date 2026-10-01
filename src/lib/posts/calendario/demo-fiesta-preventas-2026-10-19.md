---
# generado por scripts/demo/seed.js (datos de prueba, no es un evento real)
published_date: 2026-09-19Z-03:00
title: 'Fiesta con preventas (demo)'
summary: 'EVENTO INVENTADO para probar las preventas escalonadas y la «Última tanda».'
tags:
  - español
  - KinkyVibe
  - pago
  - AMBA
  - evento
  - queer
layout: calendario
category: calendario
authors:
  - KinkyVibe
status: abierto
start: 2026-10-19T22:00-03:00
end: 2026-10-20T04:00-03:00
location: Calle Inventada 400, Ciudad de Buenos Aires
location_name: Lugar de Prueba
tickets:
  - id: general
    name: General
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
    capacity: 25
  - id: ultima-tanda
    name: Última tanda
    price: 12000
    capacity: 10
    after: general
puerta: true
puerta_precio: $ 13.000, solo efectivo
payment_methods: [mercadopago, transferencia]
---
> **⚠️ Evento inventado (datos de prueba del modo demo).** No existe.

Fiesta **inventada**: los primeros 5 a $ 8.000, los 10 siguientes a $ 9.000 y el resto a $ 10.000. Cuando se agota General, se habilita la Última tanda.
