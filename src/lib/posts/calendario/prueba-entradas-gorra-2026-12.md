---
#published_date: 2026-09-29Z-03:00
title: 'Evento de prueba: entradas a la gorra (online)'
summary: 'NO ES UN EVENTO REAL. Página oculta para probar las entradas "a la gorra" de un evento online. Borrarla antes de vender.'
tags:
  - español
  - KinkyVibe # etiqueta especial #
  - a la gorra # pago | gratis | a la gorra #
  - Online # online | AMBA | Córdoba | Santa Cruz #
layout: calendario
category: calendario
authors:
  - KinkyVibe
force_unlisted: true
status: abierto # anunciado | abierto | agotadas | cancelado #
start: 2026-12-19T19:00-03:00
end: 2026-12-19T21:00-03:00
modalidad: online # las entradas llevan el link de la transmisión en lugar de un QR
tickets:
  - id: gorra
    name: A la gorra
    a_la_gorra: { minimo: 1000, sugerido: 5000 } # en lugar de `price`: cada quien elige cuánto paga
    capacity: 200
  - id: libre
    name: Libre
    a_la_gorra: { minimo: 0, sugerido: 3000 } # mínimo 0: se puede entrar sin pagar
    capacity: 100
payment_methods: [mercadopago, transferencia]
---

> **⚠️ PÁGINA DE PRUEBA: BORRAR ANTES DE VENDER DE VERDAD.**
> Este evento no existe. Sirve solo para probar las entradas "a la gorra" de un evento online. Antes de publicar la venta real hay que borrar este archivo (`src/lib/posts/calendario/prueba-entradas-gorra-2026-12.md`).

## Cómo probar las entradas a la gorra (paso a paso)

Primero levantá el sitio en modo prueba como dice el paso 1 del [evento de prueba de entradas](/calendario/prueba-entradas-2026-12) (`npm run dev:tickets`).

1. Tocá **Comprar entradas** (dice "a la gorra"). En la página de compra, **A la gorra** muestra "Pagás lo que quieras: sugerido $ 5.000, mínimo $ 1.000".
2. Abajo aparece **¿Cuánto querés pagar por entrada?** con **$ 5.000** propuesto y botones rápidos. No aparecen las opciones del Fondo KinkyVibe ni el código de descuento: el texto explica que en la gorra no se aplican.
3. Escribí **500**: se marca que el mínimo es $ 1.000 y no deja comprar. Escribí **7.000**, cantidad 2: el total es 2 × $ 7.000 (con Mercado Pago, más el recargo).
4. Completá tus datos, pagá con Mercado Pago simulado y aprobá. La entrada **no tiene QR**: dice que el link de la transmisión llega por mail antes del evento.
5. Elegí **Libre** y poné **0** (o tocá "Sin cargo"): el botón dice **Confirmar entradas sin cargo** y se emite sin pagar.
6. En `http://localhost:5173/admin/entradas/prueba-entradas-gorra-2026-12` (no tiene "Control de ingreso": es online) pegá un link de prueba en **Link de la transmisión** (por ejemplo `https://meet.example.com/prueba`) y guardá. El botón dice **Enviar el link a todes (N personas)**: tocalo; en la terminal aparecen los mails simulados. Tocalo otra vez: dice que todes ya lo tenían, no manda nada.
7. Abrí una entrada: ahora muestra el link. Comprá otra entrada: el mail de las entradas ya trae el link.
8. Cambiá el link y guardá: el botón vuelve a ofrecer mandárselo a todes.

El link **nunca** va en este archivo ni en el repo (es público): se carga solo en el admin.
