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
# Con la etiqueta KinkyVibe: el descuento del Fondo KinkyVibe es el automático del mes (de
# fondo.kinkyvibe.ar; en `npm run dev:tickets`, el 20 % de FONDO_PERCENT_OVERRIDE), en todos los tipos.
tickets:
  - id: general
    name: General
    price: 10000 # con el fondo se paga $ 8.000
    capacity: 30
  - id: anticipada
    name: Anticipada
    price: 8000 # con el fondo se paga $ 6.400
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
npm run dev:tickets
```

Eso levanta el sitio con la configuración de prueba del archivo `.env.tickets` (está en el repo y no tiene nada secreto):

- `MP_MOCK=1`: Mercado Pago simulado (no se cobra nada).
- `ADMIN_DEV_MOCK=1`: entrás al admin sin GitHub.
- `TICKETS_TRANSFER_INFO`: datos de transferencia de ejemplo (inventados). Se usan mientras no cargues otros en **Ajustes de venta** (paso 8). Sin datos de transferencia no aparece la opción "Transferencia".
- `FONDO_PERCENT_OVERRIDE=20`: el porcentaje del Fondo KinkyVibe que se usa en la prueba. En el sitio de verdad sale solo de fondo.kinkyvibe.ar (el porcentaje del mes); se puede fijar a mano en **Ajustes de venta**.
- `TICKETS_MP_FEE_PERCENT=2`: la comisión de Mercado Pago que se suma como recargo al pagar con MP (2 % es el valor por defecto que eligió la organización; la real varía según la cuenta y se ajusta en **Ajustes de venta**, paso 8).
- Los mails no se mandan: aparecen resumidos en la terminal.

La terminal muestra la dirección (normalmente `http://localhost:5173`). Abrí `http://localhost:5173/calendario/prueba-entradas-2026-12` (si la terminal muestra otro puerto, usá ese en todos los links de esta guía).

### 2. Comprar con Mercado Pago (simulado)

1. En la página del evento hay un botón grande **Comprar entradas** que dice "desde $ 6.400" y, como Anticipada tiene cupo 3, "¡Quedan …!". Tocalo: te lleva a `…/prueba-entradas-2026-12/entradas`, con el título, la fecha y el lugar arriba y el formulario abajo. (El texto del evento queda en su página, sin el formulario en el medio.)
2. Mirá los tipos de entrada: **General** muestra **$ 8.000** (el precio con el descuento del Fondo KinkyVibe) y, chiquito y tachado, $ 10.000. **Anticipada** muestra $ 6.400 y $ 8.000 tachado: el fondo aplica a todos los tipos.
3. Elegí **General**. Abajo aparece **¿Cómo querés pagar tu entrada?** con cinco opciones y el precio de cada una: **Con el descuento del fondo** ($ 8.000, ya marcada), **Precio completo** ($ 10.000), **Entrada solidaria** (+10 %, $ 11.000), **Entrada muy solidaria** (+30 %, $ 13.000) y **Entrada Sugar** (+50 %, $ 15.000). Lo que se paga de más va al Fondo KinkyVibe.
4. **Cantidad**: tocá **+** hasta 3 (o escribí el número). Con **−** baja; no baja de 1 ni pasa de las disponibles (en Anticipada, 3).
5. En **Tus datos** poné un nombre, tus **pronombres** (obligatorios), un email de prueba (por ejemplo `prueba@example.com`) y un DNI inventado, con o sin puntos (`11.111.111`).
6. En **Las entradas**, la entrada 1 ya tiene tu nombre y tus pronombres (si los cambiás ahí, dejan de copiarse); completá el nombre (como le conocen, no hace falta que sea el del documento) y los pronombres de las otras. El **?** chiquito al lado de "Pronombres" abre pronombr.es en **otra pestaña** y lo que escribiste sigue acá.
7. **Recargá la página** (F5) a mitad de camino: lo que completaste tiene que seguir ahí (se guarda solo en esta pestaña hasta que termines la compra; la casilla de +18 hay que volver a marcarla).
8. Probá errores: un DNI con 5 números, un nombre de una letra, pronombres vacíos. Tienen que aparecer marcados.
9. **Medio de pago**: tocá **Transferencia** y después **Mercado Pago** varias veces: las tarjetas y el texto de abajo no se tienen que mover. Con Mercado Pago aparece la línea "Recargo Mercado Pago"; con Transferencia desaparece y el total baja. Elegí **Mercado Pago**.
10. Abrí **Condiciones de compra y devoluciones**: es una sola lista (+18, una entrada por persona, reservas, devoluciones hasta 5 días hábiles antes, cambio de titular). Marcá la casilla de +18 y tocá **Ir a pagar con Mercado Pago**.
11. En el checkout simulado tocá **Aprobar pago**. Tenés que ver "¡Listo, ya tenés tus entradas!" y un link por entrada. Abrí una: muestra el QR y, al lado, en grande, un **código de 6 letras y números** (por ejemplo `7HQ 4XM`), el nombre y los pronombres de esa entrada, **no** el DNI.
12. Repetí y tocá **Rechazar pago**: tiene que decir que el pago fue rechazado y no emitir entradas.

### 3. Entrada solidaria

1. Comprá 1 **General** eligiendo **Entrada solidaria**: por transferencia el total es $ 11.000 (con Mercado Pago se suma el recargo) y el desglose dice "Incluye $ 1.000 de aporte al Fondo KinkyVibe".
2. Pagala con Mercado Pago simulado (o por transferencia, y confirmala en el admin).
3. En `http://localhost:5173/admin/entradas` el evento muestra **Fondo usado** (lo que cubrió el fondo en las compras "con el descuento del fondo"), **Aportes al fondo** (lo que se pagó de más en las entradas solidarias y Sugar) y **Neto del fondo** = aportes − fondo usado, en verde con + o en rojo con −. En la página del evento del admin está lo mismo por tipo de entrada.

### 4. Comprar con transferencia

1. Comprá 2 entradas **Anticipada** eligiendo **Transferencia**: abajo dice "Sin recargo. Confirmando la reserva desde el mail, te guardamos el lugar 48 horas mientras mandás el comprobante por mail". Tocá **Reservar y ver cómo transferir**.
2. Tiene que aparecer el monto, que te reservamos el lugar 2 horas y que la confirmes desde el mail para guardarla 48 (en la terminal está el link "confirmar" del mail simulado), los datos de la cuenta, una **referencia** (tipo `KV-1A2B3C4D`) y los pasos para mandar el comprobante. En la terminal aparece el mail simulado.
3. Andá a `http://localhost:5173/admin/entradas/prueba-entradas-2026-12`. En **Transferencias pendientes** está la compra con su referencia.
4. Tocá **Confirmar pago**: se emiten las entradas (la página de estado de la compra ahora muestra los links). Tocá **Confirmar pago** otra vez en otra pestaña vieja: tiene que decir que ya estaba confirmada, sin emitir de nuevo.
5. Probá **Cancelar** con otra compra por transferencia: el lugar se libera (Anticipada tiene cupo 3).

### 5. Códigos de descuento

1. Andá a `http://localhost:5173/admin/entradas/codigos`.
2. Creá un código **GRATIS100**: porcentaje, valor 100, para este evento.
3. Creá un código **VEINTE**: porcentaje, valor 20, usos máximos **1**.
4. En la página de compra, escribí `veinte` en **Código de descuento** y tocá **Aplicar**: el total tiene que bajar un 20 % (el código se aplica sobre el precio que quedó después de elegir cómo pagar —con fondo, completo o solidario— y el recargo de MP va al final). Comprá con Mercado Pago simulado.
5. Intentá usar **VEINTE** otra vez: tiene que decir que ya se usó todas las veces posibles.
6. Comprá con **GRATIS100**: el botón dice **Confirmar entradas sin cargo** y las entradas se emiten sin pasar por Mercado Pago.
7. En la lista de códigos se ven los usos. Probá **Desactivar** y volver a aplicar el código.

### 6. Control de ingreso

1. En el admin del evento tocá **Control de ingreso**.
2. Con el celu (Chrome en Android) escaneá el QR de una entrada, o pegá el link de la entrada en el campo y tocá **Validar**: tiene que decir **Adelante**, con el nombre y los pronombres de la entrada, y quién la compró con su DNI.
3. Validá la misma entrada otra vez: **Ya ingresó**.
4. Escribí el **código de 6 caracteres** de otra entrada (el de al lado del QR; da igual mayúsculas, espacios o un "KV-" adelante) y tocá **Validar**: también tiene que decir **Adelante**.
5. En **Buscar** empezá a escribir un nombre sin tildes (por ejemplo "jose" para "José"), unos pronombres, un email, un DNI o un código: aparecen sugerencias mientras escribís, cada una dice con qué campo coincidió. Con las flechas elegís una y con Enter se abre esa entrada con el botón **Marcar ingreso**.

### 7. Planilla

En el admin del evento tocá **Exportar CSV**: una fila por entrada, con su código, nombre y pronombres, quién compró (con sus pronombres, email y DNI), estado, medio de pago, cómo eligió pagar (`opcion_fondo`), fondo usado, aporte al fondo, código de descuento, recargo y montos. Abrila en una planilla y revisá que se lean bien las tildes.

### 8. Ajustes de venta (alias para transferir y comisión)

1. Andá a `http://localhost:5173/admin/entradas/ajustes` (también está el link en `/admin/entradas` y en el panel `/admin`).
2. Completá **Alias**, **CBU/CVU**, **Titular** y **Banco** con datos **inventados** (por ejemplo `OTRO.ALIAS.PRUEBA`) y la **comisión** (por ejemplo `6,5`). Guardá.
3. Hacé una compra por transferencia: los datos que aparecen son los que cargaste (ya no los de `.env.tickets`). Con Mercado Pago, el recargo usa la comisión nueva.
4. Borrá todos los campos de transferencia y guardá: se vuelve a usar `TICKETS_TRANSFER_INFO`. (En un sitio sin esa variable, con los campos vacíos no se ofrece transferencia.)

### 9. Evento online "a la gorra"

Está en otro evento de prueba: `http://localhost:5173/calendario/prueba-entradas-gorra-2026-12` (sus instrucciones están en su página).

### Si algo sale mal

Anotá qué hiciste, qué esperabas y qué pasó (con una captura), y pasáselo a quien mantiene el sitio. La explicación técnica completa está en `docs/tickets.md`.
