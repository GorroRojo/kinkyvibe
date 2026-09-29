---
#published_date: 2026-09-29Z-03:00
title: 'Evento de prueba: entradas'
summary: 'NO ES UN EVENTO REAL. Página oculta para probar la venta de entradas antes de usarla de verdad. Borrarla antes de vender.'
tags:
  - español
  - KinkyVibe # etiqueta especial #
  - pago # pago | gratis | a la gorra #
  - AMBA # online | AMBA | Córdoba | Santa Cruz #
layout: calendario
category: calendario
authors:
  - KinkyVibe
#featured: 1
#logo: 2
force_unlisted: true
#force_unpublished: false
status: abierto # anunciado | abierto | agotadas | cancelado #
start: 2026-12-12T21:00-03:00
end: 2026-12-13T02:00-03:00
location: Dirección de ejemplo 123, Ciudad de Buenos Aires
location_name: Lugar de prueba
tickets:
  - id: general
    name: General
    price: 10000
    fondo: 2000 # el Fondo KinkyVibe cubre $ 2.000: se paga $ 8.000
    capacity: 30
  - id: reducida
    name: Reducida
    price: 5000
    capacity: 3
payment_methods: [mercadopago, transferencia]
---

> **⚠️ PÁGINA DE PRUEBA: BORRAR ANTES DE VENDER DE VERDAD.**
> Este evento no existe. Sirve solo para probar la venta de entradas. Antes de publicar la venta real hay que borrar este archivo (`src/lib/posts/calendario/prueba-entradas-2026-12.md`) y, si se probó contra la base de producción, borrar también sus órdenes.

## Cómo probar la venta de entradas (paso a paso)

Todo esto se hace en tu compu, sin cuentas reales de Mercado Pago ni de mail: el pago y los emails son **simulados**.

### 1. Levantar el sitio en modo prueba

En la carpeta del repo, en una terminal:

```sh
npm install
MP_MOCK=1 ADMIN_DEV_MOCK=1 TICKETS_MP_FEE_PERCENT=7.73 TICKETS_TRANSFER_INFO='Alias: EJEMPLO.ALIAS.PRUEBA\nCBU: 0000000000000000000000\nTitular: Nombre de ejemplo' npm run dev -- --port 5371
```

- `MP_MOCK=1`: Mercado Pago simulado (no se cobra nada).
- `ADMIN_DEV_MOCK=1`: entrás al admin sin GitHub.
- `TICKETS_TRANSFER_INFO`: los datos de transferencia que se muestran (acá, inventados). Sin esta variable no aparece la opción "Transferencia".
- `TICKETS_MP_FEE_PERCENT`: la comisión de Mercado Pago que se suma como recargo al pagar con MP (7,73 es un ejemplo: hay que confirmar la tasa real de la cuenta).
- Los mails no se mandan: aparecen resumidos en la terminal.

Abrí `http://localhost:5371/calendario/prueba-entradas-2026-12#entradas`.

### 2. Comprar con Mercado Pago (simulado)

1. Elegí **General**: tiene que verse el precio $ 10.000 tachado, $ 8.000 y "💜 El Fondo KinkyVibe cubre $ 2.000 de tu entrada". Cantidad **3**.
2. En **Tus datos** poné un nombre, un email de prueba (por ejemplo `prueba@example.com`) y un DNI inventado, con o sin puntos (`11.111.111`).
3. En **Las entradas**, la entrada 1 ya tiene tu nombre; completá el nombre (como le conocen, no hace falta que sea el del documento) y los pronombres (opcionales) de las otras.
4. Probá errores: un DNI con 5 números, un nombre de una letra. Tienen que aparecer marcados.
5. Mirá el total: con **Mercado Pago** aparece la línea "Recargo Mercado Pago"; con **Transferencia** desaparece y el total baja. Elegí **Mercado Pago**, marcá la casilla de +18 y tocá **Ir a pagar con Mercado Pago**.
6. En el checkout simulado tocá **Aprobar pago**. Tenés que ver "¡Listo, ya tenés tus entradas!" y un link por entrada. Abrí una: muestra nombre y pronombres de esa entrada, **no** el DNI.
7. Repetí y tocá **Rechazar pago**: tiene que decir que el pago fue rechazado y no emitir entradas.

### 3. Comprar con transferencia

1. Comprá 2 entradas **Reducida** eligiendo **Transferencia bancaria** (sin recargo) y tocá **Reservar y ver los datos para transferir**.
2. Tiene que aparecer el monto, los datos inventados de la cuenta, una **referencia** (tipo `KV-1A2B3C4D`) y los pasos para mandar el comprobante. En la terminal aparece el mail simulado.
3. Andá a `http://localhost:5371/admin/entradas/prueba-entradas-2026-12`. En **Transferencias pendientes** está la compra con su referencia.
4. Tocá **Confirmar pago**: se emiten las entradas (la página de estado de la compra ahora muestra los links). Tocá **Confirmar pago** otra vez en otra pestaña vieja: tiene que decir que ya estaba confirmada, sin emitir de nuevo.
5. Probá **Cancelar** con otra compra por transferencia: el lugar se libera (Reducida tiene cupo 3).

### 4. Códigos de descuento

1. Andá a `http://localhost:5371/admin/entradas/codigos`.
2. Creá un código **GRATIS100**: porcentaje, valor 100, para este evento.
3. Creá un código **VEINTE**: porcentaje, valor 20, usos máximos **1**.
4. En la página del evento, escribí `veinte` en **Código de descuento** y tocá **Aplicar**: el total tiene que bajar un 20% (el descuento se aplica sobre el precio con el fondo ya descontado, y el recargo de MP va después). Comprá con Mercado Pago simulado.
5. Intentá usar **VEINTE** otra vez: tiene que decir que ya se usó todas las veces posibles.
6. Comprá con **GRATIS100**: el botón dice **Confirmar entradas sin cargo** y las entradas se emiten sin pasar por Mercado Pago.
7. En la lista de códigos se ven los usos. Probá **Desactivar** y volver a aplicar el código.

### 5. Control de ingreso

1. En el admin del evento tocá **Control de ingreso**.
2. Con el celu (Chrome en Android) escaneá el QR de una entrada, o pegá el link de la entrada en el campo y tocá **Validar**: tiene que decir **Adelante**, con el nombre y los pronombres de la entrada, y quién la compró con su DNI.
3. Validá la misma entrada otra vez: **Ya ingresó**.
4. Buscá por nombre, email o DNI de quien compró en **Buscar**.
5. En `http://localhost:5371/admin/entradas` se ve lo cobrado y el **Fondo KinkyVibe usado** del evento.

### 6. Planilla

En el admin del evento tocá **Exportar CSV**: una fila por entrada, con nombre y pronombres, quién compró con su email y DNI, estado, medio de pago, fondo, código, recargo y montos. Abrila en una planilla y revisá que se lean bien las tildes.

### Si algo sale mal

Anotá qué hiciste, qué esperabas y qué pasó (con una captura), y pasáselo a quien mantiene el sitio. La explicación técnica completa está en `docs/tickets.md`.
