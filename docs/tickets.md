# Venta de entradas (fase 1, prototipo)

Permite que la gente compre entradas para un evento del calendario desde el sitio, pague con **Mercado Pago (Checkout Pro)** o **transferencia bancaria**, y reciba por email un **QR por entrada**. Hay **códigos de descuento**, el **Fondo KinkyVibe** (que cubre parte de cada entrada, y al que se puede aportar pagando una entrada solidaria), un **recargo por la comisión de Mercado Pago** y entradas **"a la gorra"** (cada quien elige cuánto paga; en eventos online, con el link de la transmisión en lugar de QR). Les organizadores ven quién compró en `/admin/entradas`, confirman transferencias, cargan el alias para transferir y la comisión en **Ajustes de venta** y controlan el ingreso en la puerta escaneando el QR (o tipeando el código corto de la entrada) con el celu.

> Estado: prototipo probado solo con Mercado Pago y Resend **simulados** (el entorno donde se escribió no tenía acceso a sus APIs). Antes de vender de verdad hay que probarlo con las credenciales de prueba de MP y resolver la lista de [pendientes](#pendientes-antes-de-vender-de-verdad).

## Cómo se activa en un evento

Se agrega `tickets` al frontmatter del evento (`src/lib/posts/calendario/<slug>.md`). Los eventos sin `tickets` siguen igual que siempre (con su `link` externo).

**Desde el panel (lo normal):** la sección **🎟️ Entradas** del editor de eventos, al crear o duplicar (`/admin/eventos/nuevo`) y al editar (`/edit/calendario/<slug>`). Tiene:

- el interruptor "Vender entradas por el sitio" (apagado = sin `tickets`, se usa el `link` del evento);
- los tipos de entrada: nombre, cupo y **precio fijo** o **a la gorra** (mínimo y sugerido, con los botones rápidos que va a ver quien compra), para agregar, quitar y reordenar. El `id` de cada tipo sale del nombre al crearlo y **no cambia nunca** (las órdenes lo guardan), aunque se cambie el nombre;
- medios de pago, **horario de la venta** (apertura y cierre opcionales, con fecha y hora de Argentina; por defecto se puede comprar desde que se publica y hasta que empieza el evento) y el **cierre propio** opcional de cada tipo, modalidad (automática, presencial u online), recordatorios por mail y, en "Avanzado", la comisión de Mercado Pago del evento;
- **nada del Fondo**: es automático. Un aviso dice si el evento lo usa, según la etiqueta KinkyVibe, y cambia en vivo al prender o apagar "Lo organiza KinkyVibe".

Se valida en el navegador y otra vez en el servidor con las mismas reglas (`validateTicketsForm` en `src/lib/utils/ticketsEditor.js`, más `parseTicketConfig` sobre el archivo final): pesos enteros, precio > 0, mínimo ≤ sugerido, cupo entero, al menos un tipo y un medio de pago. **Al editar un evento que ya vendió** (se consultan las ventas en D1): no deja borrar un tipo con entradas vendidas o reservadas, bajar el cupo por debajo de eso ni apagar la venta (para cortarla: estado "Agotadas" o una fecha de cierre); cambiar un precio solo avisa que las compras hechas mantienen el suyo. Si la base no responde, lo dice y el servidor vuelve a revisar al guardar. Solo se reescribe lo que cambió: comentarios, orden y claves que el editor no conoce se conservan (también dentro de cada tipo).

**A mano**, en el archivo:

```yaml
tags:
  - KinkyVibe # el Fondo KinkyVibe solo aplica a eventos con esta etiqueta (ver abajo)
tickets:
  - id: general # minúsculas, números, - o _ (va en la base de datos: no cambiarlo después de vender)
    name: General # lo que ve la gente
    price: 10000 # pesos, entero: el "Valor" de la planilla (precio COMPLETO, sin fondo)
    capacity: 40 # cupo de este tipo
  - id: anticipada
    name: Anticipada
    price: 8000 # el fondo aplica también acá
    capacity: 10
    close: 2026-10-09T23:59-03:00 # opcional: este tipo deja de venderse antes que el resto
  - id: gorra
    name: A la gorra
    a_la_gorra: { minimo: 0, sugerido: 5000 } # en lugar de `price` (ver "A la gorra")
    capacity: 100
tickets_open: 2026-10-01T12:00-03:00 # opcional; antes de eso: "Abre el jueves 1/10 a las 12:00"
tickets_close: 2026-10-16T18:00-03:00 # opcional; si falta, la venta cierra cuando empieza el evento
payment_methods: [mercadopago, transferencia] # opcional; por defecto solo mercadopago
mp_fee_percent: 2 # opcional; si falta: Ajustes de venta, TICKETS_MP_FEE_PERCENT o 2 %
modalidad: online # opcional: online | presencial (ver "Eventos online")
```

- El precio que se cobra **siempre** sale de este frontmatter, leído en el servidor. El formulario solo manda el tipo, la cantidad, cómo quiere pagar (opción del fondo), el código y el medio de pago.
- **El Fondo KinkyVibe solo aplica a eventos con la etiqueta `KinkyVibe`** (decisión de la organización; también cuentan sus alias `Kinkyvibe` y `kinkyvibe`, que se resuelven con el tag manager de `src/lib/utils/hardcodedTags.js`, no comparando texto: `isKinkyVibeEvent` en `config.js`). En un evento **sin** la etiqueta: precio de lista y nada más: no se muestra "¿Cómo querés pagar tu entrada?" (ni descuento del fondo ni solidaria / muy solidaria / Sugar), ni textos del Fondo, no se guarda fondo usado ni aportes (y el admin no muestra las columnas del fondo para ese evento, salvo que tenga órdenes viejas con montos del fondo). El servidor lo hace cumplir: `validatePurchase` ignora cualquier `option` que llegue en el POST y la orden queda `completo`, con `fondo_percent` NULL (hay tests unitarios y E2E con un POST armado). Las órdenes ya hechas no cambian.
- En los eventos KinkyVibe, **el fondo aplica a todos los tipos de entrada** y **es automático**: el porcentaje del mes sale de fondo.kinkyvibe.ar (ver [Descuento automático del Fondo](#descuento-automático-del-fondo)) y se aplica a todos los tipos con precio, redondeado al peso. **No hay fondo fijo por evento ni por tipo**: `fondo_percent` en el evento y `fondo` (pesos) en un tipo ya no existen y, si quedan en un frontmatter, se ignoran sin error. Los precios siguen a fondo.kinkyvibe.ar también durante una venta; cada orden guarda el porcentaje y los montos con los que se compró (las órdenes ya hechas no cambian). Los tipos **a la gorra** no tienen fondo (quien paga elige el monto). Se eligió así porque el Fondo KinkyVibe funciona como **un porcentaje de descuento sobre todo** (ver [El Fondo KinkyVibe](#el-fondo-kinkyvibe)). Con 100 % la entrada "con el descuento del fondo" queda gratis.
- `status: cancelado` o `status: agotadas` cierran la venta.
- **Cantidad:** un campo numérico con botones **−** y **+** (grandes, para el dedo; también se puede tipear), de 1 a `min(disponibles, 20)`: cada entrada lleva su bloque de datos y con más el formulario se vuelve inmanejable en el celu. El servidor rechaza más de 20. Cada entrada tiene su propio QR y su código corto.
- `transferencia` solo aparece si además hay datos para transferir (en **Ajustes de venta** o, si ahí está vacío, en `TICKETS_TRANSFER_INFO`); `mercadopago`, si hay `MP_ACCESS_TOKEN` (o el mock en dev).
- En la página del evento, un evento con `tickets` no muestra el `link` de inscripción en el encabezado (sigue en el cuerpo si tiene `link_text`): debajo del encabezado hay un botón grande **Comprar entradas** con el precio "desde" (con el fondo aplicado; "a la gorra" si hay tipos a la gorra) y "¡Quedan N!" si quedan 10 o menos, que lleva a la página de compra.
- Bajar el `capacity` por debajo de lo vendido no cancela nada: solo frena nuevas ventas.

## Cómo funciona

1. **Compra** (página propia: **`/calendario/<slug>/entradas`**, separada de la del evento para que el formulario no empuje hacia abajo el texto del evento; arriba, un encabezado compacto con título, fecha, lugar e imagen):
   - **Quien compra** (uno por compra): nombre, **pronombres (obligatorios**, se guardan en la orden, `buyer_pronouns`), email (ahí van todas las entradas) y **DNI** (7 a 9 dígitos, se aceptan puntos; se guarda solo con dígitos).
   - **Cada entrada** (datos para el evento): nombre (como le conocen, no el del documento) y **pronombres (obligatorios**, hasta 40 letras; el servidor también lo exige). Al lado de "Pronombres" hay un **?** chiquito y gris (está por las dudas) que abre <https://pronombr.es> en **otra pestaña** (`target="_blank" rel="noopener"`), para no perder lo escrito. La entrada 1 copia el nombre y los pronombres de quien compra hasta que se editen ahí (sin JavaScript, si quedan vacíos se usan los de quien compra).
   - Tipo, **¿Cómo querés pagar tu entrada?** (ver [Precio](#precio-fondo-código-y-recargo)) o, en un tipo a la gorra, **¿Cuánto querés pagar por entrada?**, cantidad, código de descuento opcional (botón **Aplicar**, que valida en el servidor y muestra el total; no aparece con un tipo a la gorra), medio de pago y la casilla de +18/condiciones.
   - **Medio de pago:** dos tarjetas del mismo alto, una al lado de la otra, y la explicación de cada medio debajo, en un lugar reservado (las dos explicaciones ocupan la misma celda y solo se ve la elegida): elegir uno no mueve nada (la línea del recargo también reserva su lugar). Hay un test E2E que mide que no cambie ninguna posición.
   - **Condiciones:** una sola lista con el mismo formato (`purchaseConditions` en `src/lib/utils/tickets.js`): +18, una entrada por persona, cuándo llegan las entradas, cuánto se reserva el lugar y la política de devoluciones.
   - **Borrador en `sessionStorage`:** lo que se va completando (tipo, opción, cantidad, datos de quien compra —DNI incluido—, cada entrada, código, medio de pago) se guarda en `sessionStorage` y se restaura si la página se recarga; se borra cuando la compra sale bien (redirección a MP, a la transferencia o a las entradas). Se incluye el DNI porque `sessionStorage` es solo de esa pestaña, no se comparte con otras ni sobrevive a cerrarla, y no guarda nada que la persona no haya escrito ya en esa misma página; perder el DNI en una recarga era justamente lo molesto. **Nunca `localStorage`** (quedaría en la compu después de cerrar). La casilla de +18 no se guarda. Si el servidor devuelve el formulario con errores, mandan esos valores.
   - Con **Mercado Pago**: el servidor valida, **reserva cupo por 20 minutos** creando una orden `pending` y crea una _preferencia_ de Checkout Pro. La persona va al checkout de Mercado Pago.
   - Con **transferencia**: ver [Transferencia](#transferencia).
   - Si el **total queda en $ 0** (código de 100 %, o $ 0 a la gorra con mínimo 0): no pasa por Mercado Pago; se emiten las entradas en el momento (con los mismos límites de intentos).
2. **Cupo sin sobreventa:** la reserva es una única sentencia `INSERT … SELECT … WHERE vendidas + reservadas + cantidad <= cupo`. D1 ejecuta cada sentencia de forma atómica y en serie, así que dos compras simultáneas no pueden pasarse. Cuentan las órdenes aprobadas y las reservas vigentes.
3. **Webhook** `POST /api/mercadopago/webhook`: verifica la firma `x-signature` con `MP_WEBHOOK_SECRET`, y **no confía en el contenido**: pide el pago a la API de MP (`GET /v1/payments/<id>`), busca la orden por `external_reference`, compara monto y moneda (ARS) y actualiza el estado de forma idempotente (las notificaciones se repiten y llegan desordenadas). Al aprobarse se crean las entradas (una por unidad, con un token aleatorio de 256 bits) y se manda el email.
4. **Vuelta de MP** (`/entradas/<orden>/estado`): si el webhook todavía no llegó, vuelve a consultar el pago a la API igual que el webhook. Muestra el estado y, en el mismo navegador de la compra, los links a las entradas.
5. **Email** (Resend): datos del evento y un QR por entrada (imagen GIF servida en `/entradas/t/<token>/qr.gif`, porque Gmail no muestra SVG) con su **código corto en grande al lado**, y link a `/entradas/t/<token>`. En eventos online, en lugar de QR: el link de la transmisión si ya está cargado, o el aviso de que llega antes del evento.
6. **Entrada** (`/entradas/t/<token>`): QR con el **código corto** al lado, en grande (ver abajo), nombre, pronombres, tipo y estado (válida / ya usada / anulada). No muestra datos de otras personas. En eventos online muestra el link de la transmisión cuando está (solo con la compra aprobada).
7. **Código corto de cada entrada** (`tickets.code`): 6 caracteres de un alfabeto sin ambiguos (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`: sin 0/O, 1/I/L), único por evento (índice único en la base), al azar (31⁶ ≈ 887 millones). Se elige dentro del mismo `INSERT` que emite la entrada entre tres candidatos al azar no usados en el evento, así que un choque nunca hace fallar la aprobación de un pago. Sirve para tipearlo en la puerta si el QR no se puede escanear: el control de ingreso lo acepta con o sin "KV-", espacios o guiones, y lee O como 0 e I/L como 1 (letras que los códigos no usan). No reemplaza al token del QR para ver la entrada: solo lo usan les admins en el control de ingreso.
8. **Admin** (`/admin/entradas`): vendidas/cupo, reservas y recaudación bruta por tipo, y por evento **Fondo usado**, **Aportes al fondo** y **Neto del fondo**; por evento, la lista de órdenes, exportar CSV, reenviar el mail y el **control de ingreso** (`/admin/entradas/<slug>/ingreso`): escanear el QR con la cámara (API `BarcodeDetector`: Chrome en Android, Edge), tipear el **código corto** o buscar. Muestra en grande "Adelante", "Ya ingresó (hora y quién)", "Es de otro evento", "Anulada" o "QR inválido". En iPhone (Safari no tiene `BarcodeDetector`) se puede escanear con la cámara del sistema: abre la página de la entrada, que a les admins les muestra el botón "Marcar ingreso" (a quien no es admin no: el form action llama a `requireAdmin`, hay tests).
   - **Buscador con sugerencias:** mientras se escribe (desde 2 letras), sugiere entradas por nombre y pronombres de la entrada, nombre, email y DNI de quien compró y código; sin distinguir tildes ni mayúsculas, y cada sugerencia dice con qué campo coincidió. Es un combobox accesible (flechas, Enter, Escape). Las sugerencias vienen de `GET /admin/entradas/<slug>/ingreso/buscar?q=` (con `requireAdmin`), con los mismos datos que une admin ya ve; el filtro se hace en el servidor en JS porque SQLite no ignora tildes (un evento tiene a lo sumo unos miles de entradas).

Estados de una orden: `pending` / `awaiting_transfer` → `approved` / `rejected` / `cancelled` / `expired`, y `approved` → `refunded`. Un pago aprobado gana siempre (aunque la reserva haya vencido: la plata entró; queda un aviso en el log por posible sobreventa), un rechazo o "pendiente" tardío nunca pisa una aprobación, y una orden aprobada solo pasa a `refunded` por el mismo pago que la aprobó. Un reembolso anula las entradas en el control de ingreso.

### Precio: fondo, código y recargo

Todos los precios que se ven normalmente (tarjetas de tipo, lista cuando la venta está cerrada) son **con el fondo ya aplicado**; en las tarjetas el precio completo aparece chiquito y tachado. Después del tipo, el formulario pregunta **"¿Cómo querés pagar tu entrada?"** (`FONDO_OPTIONS` en `src/lib/utils/tickets.js`), con el precio por entrada de cada opción:

| Opción (`fondo_option`)                     | Precio por entrada       | Se guarda                      |
| ------------------------------------------- | ------------------------ | ------------------------------ |
| **Con el descuento del fondo** (`fondo`)    | precio − fondo           | `fondo_amount` = fondo × cant. |
| **Precio completo** (`completo`)            | precio                   | —                              |
| **Entrada solidaria** (`solidaria`)         | precio + 10 % del precio | `fondo_contribution`           |
| **Entrada muy solidaria** (`muy-solidaria`) | precio + 30 % del precio | `fondo_contribution`           |
| **Entrada Sugar** (`sugar`)                 | precio + 50 % del precio | `fondo_contribution`           |

- Por defecto está marcada la primera. Si el fondo es 0 (porcentaje 0 %), la primera **no aparece** y la marcada es **Precio completo** (el servidor también: una opción `fondo` sin fondo se guarda como `completo`).
- Los porcentajes son sobre el **precio completo**, redondeados al peso **por entrada** (0,5 hacia arriba) y multiplicados por la cantidad. El formulario aclara que lo que se paga de más va entero al Fondo KinkyVibe. "Sugar" coincide con el nombre de un nivel de Mecenas del fondo.

El servidor calcula todo (`computePrice`; el formulario usa la misma función solo para mostrar). Orden:

1. **Opción del fondo** por entrada × cantidad: `subtotal = precio × cant. − fondo usado + aporte`.
2. **Código de descuento** sobre ese subtotal: porcentaje (redondeado al peso) o monto fijo en pesos **por compra**; nunca deja el total por debajo de 0.
3. **Recargo de Mercado Pago** (solo si se paga con MP y queda algo por pagar): `bruto = ⌈base / (1 − tasa)⌉` en pesos enteros, para que después de la comisión quede la base. La tasa sale, en orden, de `mp_fee_percent` del evento, de **Ajustes → Cobros** (`/admin/ajustes/cobros`), de `TICKETS_MP_FEE_PERCENT` o, si no hay ninguna, **2 %** (valor por defecto que eligió la organización). **La comisión real varía** (depende del plan y del plazo de acreditación de la cuenta de MP): les organizadores la ajustan en Ajustes de venta; con `0`, sin recargo. Transferencia paga la base, sin recargo.
4. `total = subtotal − descuento + recargo`.

Ejemplo: $ 10.000 con 20 % de fondo, 2 entradas solidarias, código 20 %, Mercado Pago 2 %: 2 × $ 11.000 = $ 22.000 (aporte $ 2.000) → −$ 4.400 = $ 17.600 → recargo $ 360 → **$ 17.960**.

El formulario muestra "Entradas (n × $X) · 💜 Ya descontado: el Fondo cubre $F / 💜 Incluye $A de aporte al Fondo KinkyVibe · Código −$D · Recargo Mercado Pago $Y · Total $Z" y cambia en vivo.

La orden guarda `unit_price` (precio completo), `fondo_option`, `fondo_amount` (fondo usado, ≥ 0, solo con `fondo`), `fondo_contribution` (aporte, ≥ 0, solo con las solidarias), `subtotal`, `discount_code`, `discount_amount`, `surcharge_amount` y `total` (con `CHECK` en la base que obligan a que cierren las cuentas: `migrations/0002_tickets.sql`). `/admin/entradas` muestra por evento **Fondo usado**, **Aportes al fondo** y **Neto del fondo** = aportes − fondo usado (solo órdenes aprobadas; con signo: verde "+" si entró más de lo que cubrió el fondo, rojo "−" si el fondo puso más); la página de cada evento, las tres columnas por tipo y en el total; el CSV, `opcion_fondo`, `fondo` y `aporte_fondo`. Si una compra solidaria usa además un código, el aporte guardado es el nominal (el código lo pone la organización: lo tomamos como un costo de la organización, no del fondo; ver preguntas abiertas). Con fondo, aporte, código o recargo, la preferencia de MP lleva un solo ítem por el total (MP no acepta ítems negativos) y el webhook compara lo pagado con `total`.

### Horario de la venta

- `tickets_open` (opcional): antes de ese momento la venta no abrió; la página del evento y la de compra dicen "Abre el jueves 1/10 a las 12:00".
- `tickets_close` (opcional; si falta, el inicio del evento): desde ese instante no se puede comprar. Mientras tanto se muestra "La venta cierra el viernes 2/10 a las 20:00"; después, "Venta cerrada".
- `close` en un tipo (opcional): ese tipo deja de venderse antes (por ejemplo, la anticipada); nunca después del cierre del evento. Si todos los tipos cerraron, la venta está cerrada.
- Formato: con zona (`2026-10-02T20:00-03:00`, lo que escribe el editor) o sin zona (se toma la hora de Argentina, `America/Argentina/Buenos_Aires`, UTC−3 sin horario de verano). **Una fecha sola** (`2026-10-02`, como se usaba antes) en un cierre significa **hasta el fin de ese día** en Argentina; en la apertura, desde el principio del día. Un valor que no se entiende deja al evento sin venta (y se loguea).
- El servidor lo controla en cada compra (`salesState`, `typeOpen` y `validatePurchase` en `config.js`). Lo que ya estaba en curso al cerrar se completa: un pago de Mercado Pago que llega después, una transferencia reservada antes que se confirma o la confirmación de la reserva desde el mail.

### A la gorra

Un tipo de entrada con `a_la_gorra: { minimo, sugerido }` en lugar de `price`:

- `minimo` (entero, puede ser 0) es un mínimo duro; `sugerido` (entero, desde el mínimo) se muestra y es el valor por defecto (campo vacío = sugerido). Botones rápidos (`gorraQuickAmounts`): el mínimo (solo si es mayor a 0), el sugerido, 1,5 × el sugerido (redondeado a los $ 100) y el doble, sin repetidos.
- **No hay monto máximo** (decisión de la organización: a la gorra cada quien paga lo que quiera). Solo hay un tope técnico contra errores de tipeo y números absurdos: el total de la orden (monto × cantidad) no puede pasar de `ORDER_MAX_TOTAL` = $ 100.000.000; si pasa, el formulario y el servidor dicen "Ese monto parece un error de tipeo…". La documentación de Mercado Pago consultada no indica un monto máximo por pago (puede depender de la cuenta y del medio de pago).
- La persona escribe el monto **por entrada** (se aceptan `5000`, `5.000`, `$ 5.000`). El servidor lo vuelve a validar (`validatePurchase`: entero, ≥ mínimo, total de la orden ≤ tope técnico) y es lo único del formulario que usa para el precio; `computePrice` recibe `option: 'gorra'` y ese monto como precio unitario.
- **No aplican** las opciones del Fondo (no se muestra "¿Cómo querés pagar tu entrada?") ni los **códigos de descuento** (no se muestra el campo, y el formulario explica por qué: pagás el monto que elijas; el servidor ignora un código que llegue igual). El **recargo de MP sí** se suma al pagar con Mercado Pago. Monto 0 (con mínimo 0) = camino sin pago ("Confirmar entradas sin cargo").
- La orden guarda `fondo_option = 'gorra'` y `unit_price` = el monto elegido (la base permite `unit_price = 0` solo en ese caso, y un `CHECK` impide código de descuento en órdenes a la gorra).

### Eventos online

Un evento es online si tiene `modalidad: online` en el frontmatter o, si no tiene `modalidad`, la etiqueta **Online** (la que ya usan los eventos del calendario) y no tiene `location`. En esos eventos:

- Las entradas llevan **el link de la transmisión en lugar de un QR**, y no hay control de ingreso.
- El link **no va en el repo** (es público): une admin lo carga en `/admin/entradas/<slug>` → **Link de la transmisión** (se guarda en D1, `event_ticket_settings`; tiene que ser `https://`).
- Si el link ya está al aprobarse una compra, va en el mail de las entradas. Si se carga o cambia después, el botón **Enviar el link a todes (N personas)** lo manda por mail a cada compra aprobada que todavía no recibió **ese** link. Es idempotente por valor del link (`stream_link_sends`: orden + SHA-256 del link, reservado antes de mandar, así dos clicks o dos admins no duplican; si un envío falla se libera para reintentar). Si el link cambia, se puede mandar el nuevo a todes.
- La página de la entrada muestra el link cuando existe (solo si la compra está aprobada).

### El Fondo KinkyVibe

Resumen de lo que explica <https://fondo.kinkyvibe.ar> (consultado el 2026-09-29):

- Es un fondo de **Mecenas** (aportes mensuales o de una vez) para que KinkyVibe pueda sostener su trabajo (talleres de sexualidad, kink/BDSM, géneros, reducción de riesgos e historia cuir; fanzines y material digital; eventos con sesiones en vivo, performance, poesía, ferias y cine porno cuir; la comunidad ¡AUCH! con grupos de apoyo y equipo de moderación/monitores; y la tienda y ferias de emprendimientos disidentes) sin cobrarle todo a quien participa.
- **Cómo baja los precios:** tiene un objetivo mensual (a diciembre de 2025, **$ 4.000.000 por mes**, que se actualiza cada 6 meses por inflación). **Por cada 10 % del objetivo que se recauda, baja un 10 % el precio de todos los talleres, eventos y materiales, para todo el mundo** (no solo para Mecenas). Con el 100 %, todo es gratis. Por eso el descuento del fondo es un porcentaje parejo sobre todo (el mismo para todos los eventos KinkyVibe).
- **Niveles de Mecenas** (mensual): Visitante $ 1.500, Casual $ 3.000, Regular $ 7.500 (nombre en el sitio), Sugar $ 15.000, Estrella $ 30.000 y Leyenda $ 45.000 (nombre con link); hay "Super Mecenas" y donaciones mayores aparte.
- El sitio no habla de entradas solidarias: los aportes de las opciones solidaria / muy solidaria / Sugar son una forma más de sumar al fondo desde la compra (el nombre "Sugar" coincide con un nivel). Cómo se refleja ese aporte en el porcentaje del mes es una pregunta abierta.

### Códigos de descuento

Admin en `/admin/entradas/codigos` (link desde `/admin/entradas` y el panel): lista con usos, crear, activar/desactivar. Cada código: texto (sin distinguir mayúsculas), porcentaje o monto fijo, evento (o todos), vigencia opcional desde/hasta (hora de Argentina), usos máximos opcionales.

- Un **uso** es una compra (no una entrada) aprobada o con la reserva vigente; si la reserva vence o se cancela, el uso se libera.
- "Aplicar" es informativo. Al crear la orden el código se **vuelve a validar dentro del mismo `INSERT`** que reserva el cupo (activo, vigente, del evento, mismo tipo/valor, usos < máximo), así que compras simultáneas no se pasan de `max_uses` (test con 25 compras concurrentes).
- Un código de otro evento responde "Ese código no existe" (no confirma que exista). Los intentos de "Aplicar" tienen límite por IP (anónimo, con hash).

### Descuento automático del Fondo

El porcentaje del Fondo KinkyVibe se lee de `GET https://fondo.kinkyvibe.ar/api/porcentaje` (`{ percent, collected, goal, step, updatedAt }`, `percent` de 0 a 100 en pasos de 10; la URL se puede cambiar con `FONDO_PERCENT_URL`) en `src/lib/server/tickets/fondo.js`, con 3 s de timeout y memoria de 10 minutos en el isolate (un fallo se recuerda 1 minuto, para no insistir). Orden de precedencia:

1. el porcentaje fijado a mano en **Ajustes de venta** ("vacío = automático"): es el recurso de emergencia si fondo.kinkyvibe.ar no anda;
2. solo en `vite dev`: `FONDO_PERCENT_OVERRIDE` (en `.env.tickets`, 20), para probar sin red;
3. el de la API (en vivo: si cambia durante una venta, cambian los precios);
4. si la API no responde (o devuelve algo raro): el último valor que se obtuvo bien, guardado en D1 (`ticket_settings`, clave `fondo_percent_last`), con un aviso en el log;
5. 0 (sin descuento). **Nunca frena la venta.**

No hay porcentaje por evento ni monto por tipo (`fondo_percent` y `fondo` en el frontmatter se ignoran): siempre es este porcentaje. Solo aplica a eventos con la etiqueta KinkyVibe.

`fondo = round(precio × porcentaje / 100)` por entrada, en todos los tipos con precio (no en los a la gorra) de los eventos KinkyVibe. El precio que se muestra y el que se cobra se calculan en el servidor; el que se cobra, al crear la orden, que guarda el porcentaje usado en `orders.fondo_percent` (columna `orders.fondo_percent`; también en el CSV, `porcentaje_fondo`). Ajustes de venta muestra "Descuento del Fondo ahora: X %", de dónde sale y cuándo se actualizó.

### Reembolsos

En `/admin/entradas/<slug>`, cada orden aprobada tiene **Reembolsar…**, que abre un paso de confirmación con el monto, quién compró y sus entradas:

- **Mercado Pago:** pide el reembolso **total** del pago con `POST /v1/payments/{id}/refunds` y el body vacío (doc de Checkout Pro "Configurar reembolsos y cancelaciones", consultada con la búsqueda de documentación de MP el 2026-09-29), con `X-Idempotency-Key: refund-<orden>` (doble click = el mismo reembolso). MP pide saldo suficiente en la cuenta y como máximo 180 días desde la aprobación; si lo rechaza, no se cambia nada y se muestra el aviso. En modo simulado, el mock marca el pago como reembolsado.
- **Transferencia:** "Marcar como reembolsada (transferencia devuelta a mano)" hace la misma contabilidad sin llamar a MP. **Sin cargo:** "Anular las entradas".
- Después, `refundOrder` (un único `UPDATE … WHERE status = 'approved'`) pasa la orden a `refunded` y guarda quién y cuándo (`refunded_by`, `refunded_at`). Una orden reembolsada no cuenta para el cupo, los usos de códigos ni los totales (cobrado, fondo usado, aportes); sus entradas quedan anuladas (el control de ingreso dice "Entrada anulada" y la página de la entrada, "Reembolsada"). Se le manda un mail corto a quien compró.
- **Idempotente:** un segundo click (o una pestaña vieja) responde "ya estaba reembolsada". Si el reembolso se hace desde el panel de MP, llega por el webhook (`refunded` / `charged_back`), la orden pasa a `refunded` (sin `refunded_by`) y se manda el mismo mail; si el webhook llega después de un reembolso hecho desde el admin, no cambia nada.
- No hay reembolsos parciales (por entrada) todavía: para eso, hacerlo desde el panel de MP y anotar a mano.

### Mails y recordatorios

- **Remitente y respuesta:** por defecto `KinkyVibe <entradas@kinkyvibe.ar>` y `entradas@kinkyvibe.ar` (la organización redirige esa dirección a su Gmail con Cloudflare Email Routing). Se cambian en Ajustes de venta; si ahí están vacíos, `TICKETS_FROM_EMAIL` / `TICKETS_REPLY_TO`. El contacto de la política de devoluciones sigue siendo `TICKETS_CONTACT_EMAIL` (kinkyvibe.talleres@gmail.com). Los mails se mandan con Resend (`RESEND_API_KEY`).
- **Recordatorios** (`src/lib/server/tickets/reminders.js`): lista configurable en Ajustes de venta (activado + cuándo: "N horas antes" del inicio, o "N días antes a las HH:MM" en hora de Argentina, UTC−3 fijo). Por defecto: **2 días antes** (48 h) y **el mismo día a las 9:00**. Un evento no los manda con `recordatorios: false` en el frontmatter. El mail lleva cuándo y dónde, el link y el código de cada entrada o, en eventos online, el link de la transmisión si ya está.
- **Quién los manda:** `POST /api/cron/recordatorios` con el header `x-cron-secret` = `CRON_SECRET` (comparado en tiempo constante; sin `CRON_SECRET` responde 503). Lo llama cada 15 minutos un Worker aparte que está en `workers/cron/` (ver su README para deployarlo: `npx wrangler deploy` y `npx wrangler secret put CRON_SECRET` en esa carpeta). Es idempotente: `reminder_sends` (orden + id del recordatorio) se reserva antes de mandar y se libera si falla. Solo a órdenes aprobadas (no canceladas ni reembolsadas), de eventos que no empezaron ni se cancelaron, y compradas antes de la hora del recordatorio.

### Ajustes de venta

Tres páginas del panel (menú **Ajustes**; `requireAdmin` en cada `load` y action) sobre la misma tabla de D1 (`ticket_settings`). Cada una guarda solo sus campos (no borra los de las otras):

- **Cobros** (`/admin/ajustes/cobros`):
  - **Datos para transferir:** Alias, CBU/CVU, Titular y Banco (texto libre; se muestran los campos completos, como "Alias: …" en líneas). Si están todos vacíos se usa `TICKETS_TRANSFER_INFO`; si tampoco hay, no se ofrece transferencia.
  - **Comisión de Mercado Pago** (%): vacío = `TICKETS_MP_FEE_PERCENT` o 2 %. El campo viene completo con el valor que se está usando.
- **Fondo** (`/admin/ajustes/fondo`): el porcentaje de ahora y un campo para fijarlo a mano (vacío = automático).
- **Mails** (`/admin/ajustes/mails`): remitente, dirección de respuesta y los **recordatorios** (ver arriba).

Además, **Admins** (`/admin/ajustes/admins`) muestra quién puede entrar al panel (la lista de `src/lib/server/auth.js`; por ahora solo lectura).

### Transferencia

Opt-in por evento (`payment_methods`) y requiere datos para transferir (Ajustes de venta o `TICKETS_TRANSFER_INFO`; **nunca en el repo**).

1. La orden queda `awaiting_transfer` con una **reserva inicial de 2 h**. El mail trae un link **"Confirmar mi reserva"** (`/entradas/<orden>/confirmar?k=…`, firmado con una clave al azar guardada en D1; abrirlo solo muestra el botón, confirmar es un POST) que la extiende a la reserva completa, **48 h** desde que se hizo (`TICKETS_TRANSFER_HOLD_HOURS`). Sin confirmar, se libera a las 2 h. El formulario, la página de estado y el mail lo explican. Cuenta para el cupo y para los usos de códigos igual que las demás reservas; al vencer se libera.
2. La persona ve (en `/entradas/<orden>/estado`) el monto, los datos para transferir, una **referencia** `KV-XXXXXXXX` para el concepto y cómo mandar el comprobante (respondiendo el mail o escribiendo a `TICKETS_REPLY_TO`/`TICKETS_CONTACT_EMAIL`). Se le manda un mail con lo mismo.
3. En la bandeja **Entradas → Transferencias** (`/admin/entradas/transferencias`, las de todos los eventos, la que vence antes arriba, con filtro por evento) o en `/admin/entradas/<slug>`, **Transferencias pendientes**: **Confirmar pago** aprueba, emite las entradas y las manda por mail, en una transacción idempotente (dos clicks o dos pestañas: se emite una vez). **Cancelar** libera el cupo. Se siguen mostrando 7 días las reservas vencidas: confirmar una vencida solo funciona si todavía hay cupo (comprobado en la misma sentencia); en ese caso no se vuelve a mirar el máximo de usos del código.
4. **No hay verificación automática:** no existe una API confiable y accesible para enterarse de transferencias entrantes a una cuenta bancaria o CVU común (los bancos no ofrecen webhooks a particulares/pequeñas organizaciones, y leer extractos o mails del banco sería frágil e inseguro). Alguien tiene que mirar la cuenta y confirmar a mano.

### Política de devoluciones

Se muestra en "Condiciones de compra y devoluciones" del formulario y al pie de los mails (la dirección es `TICKETS_CONTACT_EMAIL`, por defecto `kinkyvibe.talleres@gmail.com`):

> **Devoluciones y cambios**
> Si no podés venir, avisanos hasta 5 días hábiles antes del evento y te devolvemos lo que pagaste. Si preferís, en lugar de la devolución te ofrecemos un taller grabado de los que haya en la tienda en ese momento.
>
> Si le pasás tu entrada a otra persona, escribinos a kinkyvibe.talleres@gmail.com con su nombre, sus pronombres y su email.

(Reescrita para que se lea más clara, con el mismo sentido que el texto original de la organización. En el formulario va dentro de la misma lista que las demás condiciones.)

### Evento de prueba

`src/lib/posts/calendario/prueba-entradas-2026-12.md` es un evento **oculto** (`force_unlisted`) con entradas (General y Anticipada, con fondo en las dos), los dos medios de pago, y en el cuerpo las instrucciones paso a paso para probar todo. `prueba-entradas-gorra-2026-12.md` es otro, online y a la gorra. **Hay que borrarlos antes de vender de verdad.**

### Archivos

| Qué                                              | Dónde                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Tablas de entradas (y resguardos)                | `migrations/0002_tickets.sql`, `0003_ticket_safeguards.sql`                                        |
| Ajustes de venta                                 | `src/lib/server/tickets/settings.js`, `admin/ajustes/*`                                            |
| Link de la transmisión (online)                  | `src/lib/server/tickets/stream.js`                                                                 |
| Control de ingreso: código y sugerencias         | `src/lib/server/tickets/checkin.js`, `ingreso/buscar`                                              |
| Cálculo de precio, DNI, política (compartido)    | `src/lib/utils/tickets.js`                                                                         |
| Códigos de descuento                             | `src/lib/server/tickets/discounts.js`, `admin/entradas/codigos`                                    |
| Configuración desde el frontmatter y validación  | `src/lib/server/tickets/config.js`, `events.js`                                                    |
| Editor de eventos: sección Entradas              | `src/lib/utils/ticketsEditor.js`, `admin/TicketsEditor.svelte`, `src/lib/server/tickets/editor.js` |
| Órdenes, cupo, estados, check-in (SQL)           | `src/lib/server/tickets/orders.js`                                                                 |
| Cliente de Mercado Pago y firma del webhook      | `src/lib/server/tickets/mercadopago.js`                                                            |
| Email (Resend) y QR                              | `src/lib/server/tickets/email.js`, `qr.js`                                                         |
| Variables, mocks y envío del email               | `src/lib/server/tickets/index.js`, `mock.js` (solo dev)                                            |
| Form action de compra                            | `src/lib/server/tickets/checkout.js`                                                               |
| Página y formulario de compra                    | `(content)/calendario/[event]/entradas/`, `TicketPurchase.svelte`                                  |
| Webhook                                          | `src/routes/api/mercadopago/webhook/+server.js`                                                    |
| Páginas públicas (estado, entrada, QR, simulado) | `src/routes/entradas/`                                                                             |
| Admin y control de ingreso                       | `src/routes/(authed)/admin/entradas/`, `QrScanner.svelte`                                          |
| Tests                                            | `src/lib/server/tickets/*.test.js`, `tests/tickets/` (E2E)                                         |

## Variables de entorno

En producción van en Cloudflare: **Workers & Pages → (proyecto) → Settings → Variables and Secrets**, como _Secret_ las que lo son. En local, en un archivo `.env` (ignorado por git). Para probar entradas está `npm run dev:tickets` (ver abajo), que además lee `.env.tickets`.

| Variable                      | Qué es                                                                                                                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MP_ACCESS_TOKEN`             | Secret. Access token de la aplicación de Mercado Pago (primero el de la **cuenta de prueba vendedora**).                                                                                                                                                                    |
| `MP_WEBHOOK_SECRET`           | Secret. "Clave secreta" de la sección Webhooks de la aplicación de MP. Sin ella todos los webhooks se rechazan (503).                                                                                                                                                       |
| `RESEND_API_KEY`              | Secret. API key de Resend con permiso de envío. Sin ella no se mandan mails (en producción se loguea un error).                                                                                                                                                             |
| `EMAIL_ALLOWLIST`             | Solo previews. Direcciones (separadas por comas) que pueden recibir mails reales desde un preview; cualquier otra se desvía a la primera, con `[DEMO]` en el asunto. Sin ella, un preview no manda mails. Estado del entorno: `GET /api/preview-status` (solo en previews). |
| `TICKETS_FROM_EMAIL`          | Respaldo del remitente si en Ajustes de venta está vacío (por defecto `KinkyVibe <entradas@kinkyvibe.ar>`). El dominio tiene que estar verificado en Resend.                                                                                                                |
| `CRON_SECRET`                 | Secret. Clave compartida con el Worker `workers/cron/` para `POST /api/cron/recordatorios` (16 caracteres o más). Sin ella no se mandan recordatorios.                                                                                                                      |
| `TICKETS_REPLY_TO`            | Opcional. Respaldo de la dirección de respuesta si en Ajustes de venta está vacía (por defecto `entradas@kinkyvibe.ar`).                                                                                                                                                    |
| `TICKETS_CONTACT_EMAIL`       | Opcional. Contacto público de la política de devoluciones y cambios de titular. Por defecto `kinkyvibe.talleres@gmail.com`.                                                                                                                                                 |
| `TICKETS_TRANSFER_INFO`       | Respaldo de los datos para transferir si en Ajustes de venta están vacíos; texto libre, saltos de línea reales o escritos `\n`. **No commitear.**                                                                                                                           |
| `TICKETS_TRANSFER_HOLD_HOURS` | Opcional. Horas de reserva esperando una transferencia (1 a 240; por defecto 48).                                                                                                                                                                                           |
| `TICKETS_MP_FEE_PERCENT`      | Opcional. Respaldo de la comisión de MP si en Ajustes de venta está vacía (sin ninguna: 2 %). `0` = sin recargo.                                                                                                                                                            |
| `FONDO_PERCENT_URL`           | Opcional. De dónde se lee el porcentaje del Fondo (por defecto `https://fondo.kinkyvibe.ar/api/porcentaje`).                                                                                                                                                                |
| `SITE_URL`                    | Opcional. Origen público (`https://kinkyvibe.ar`) para los links de mails y las URLs que se le pasan a MP. Si falta, se usa el del pedido.                                                                                                                                  |
| `TICKETS_CLIENT_SALT`         | Opcional, Secret. Sal del hash de cliente de los límites anti-abuso (sin ella se usa una fija que igual rota cada día). Cualquier texto largo al azar.                                                                                                                      |

Solo en desarrollo (`vite dev`; en el build de producción este código no existe):

| Variable                         | Qué hace                                                                                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MP_MOCK=1`                      | Usa el Mercado Pago simulado aunque haya `MP_ACCESS_TOKEN`. Sin `MP_ACCESS_TOKEN` también se simula.                                                                                           |
| `TICKETS_DEV_FIXTURE=slug`       | Agrega entradas de prueba (fondo 20 % en todos los tipos: General $10000 cupo 500, Anticipada $8000 cupo 3; MP y transferencia) a esos eventos sin tocar su archivo. Separar varios con comas. |
| `TICKETS_DEV_FIXTURE_GORRA=slug` | Lo mismo con un evento online a la gorra (A la gorra: mínimo $1000, sugerido $5000; Libre: mínimo $0, sugerido $3000).                                                                         |
| `FONDO_PERCENT_OVERRIDE=20`      | Porcentaje del Fondo fijo, sin pedirlo a fondo.kinkyvibe.ar (está en `.env.tickets`).                                                                                                          |
| `ADMIN_DEV_MOCK=1`               | Sesión de admin falsa (sin GitHub).                                                                                                                                                            |

## Probar en local (sin cuentas de nada)

```sh
npm install
npm run dev:tickets
```

`dev:tickets` es `vite dev --mode tickets`: Vite y SvelteKit (`$env/dynamic/private`) leen además el archivo **`.env.tickets`**, que está en el repo y tiene solo flags de desarrollo, nada secreto: `MP_MOCK=1`, `ADMIN_DEV_MOCK=1`, `TICKETS_MP_FEE_PERCENT=2`, `FONDO_PERCENT_OVERRIDE=20` y un `TICKETS_TRANSFER_INFO` con un alias inventado. Funciona igual en Windows, Mac y Linux (no hace falta escribir variables delante del comando). Para cambiar algo solo en tu compu, creá `.env.tickets.local` (lo ignora git); las variables del entorno de la terminal pisan a las de los archivos. Como siempre en dev, antes aplica las migraciones locales de D1.

Con eso ya funciona el evento de prueba `http://localhost:5173/calendario/prueba-entradas-2026-12` (el puerto lo muestra la terminal; su página tiene la guía paso a paso). Para probar con otro evento sin tocar su archivo, agregar `TICKETS_DEV_FIXTURE=<slug>` a `.env.tickets.local`.

1. Abrir la página del evento, tocar **Comprar entradas** (lleva a `/calendario/<slug>/entradas`), completar e "Ir a pagar con Mercado Pago" (o "Reservar y ver cómo transferir").
2. Se abre el **checkout simulado** (`/entradas/simular-pago/<orden>`): aprobar, rechazar, dejar pendiente o "aprobar sin webhook" (para ver que la página de estado re-consulta sola). Cada botón manda una notificación **firmada** al webhook igual que MP.
3. Sin `RESEND_API_KEY` el mail no se manda: se loguea en la consola (con los tokens recortados).
4. Admin: `http://localhost:5173/admin/entradas` (ventas de todos los eventos), `http://localhost:5173/admin/entradas/transferencias` (transferencias pendientes de todos los eventos), `http://localhost:5173/admin/entradas/codigos` y `http://localhost:5173/admin/ajustes/cobros` (y `/fondo`, `/mails`).

Tests:

```sh
npx vitest run src/lib/server/tickets                  # unitarios (D1 real en memoria)
npx playwright test -c playwright.tickets.config.js    # E2E: levanta `npm run dev:tickets` en el puerto 5371
# opcional: PW_CHROMIUM=/ruta/a/chrome  TICKETS_SHOTS_DIR=/carpeta/para/capturas
```

Para mirar la base local: `npx wrangler d1 execute kinkyvibe --local --command "SELECT id, status, buyer_email FROM orders"`.

## Probar con Mercado Pago de verdad (credenciales de prueba primero)

> Pasos según la documentación de Mercado Pago Developers tal como la conocemos; los nombres de las pantallas cambian seguido. Verificarlos en <https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/landing>.

1. Con la cuenta de MP de la organización, entrar a **Tus integraciones** en Mercado Pago Developers y **crear una aplicación** (producto: Checkout Pro / pagos online).
2. En la aplicación, **Cuentas de prueba → crear** una cuenta **vendedora** y una **compradora** (país Argentina). Anotar usuarios y contraseñas en un gestor de contraseñas, no en el repo.
3. Iniciar sesión (en una ventana de incógnito) con la **cuenta de prueba vendedora**, crear ahí una aplicación y copiar sus **credenciales de producción** (así las llama MP aunque sean de una cuenta de prueba): ese Access Token es el `MP_ACCESS_TOKEN` de prueba.
4. En la aplicación: **Webhooks → Configurar notificaciones**: URL `https://<tu-deploy-de-preview>/api/mercadopago/webhook`, evento **Pagos**. Copiar la **clave secreta** que muestra → `MP_WEBHOOK_SECRET`. Esta URL es **la única** vía de notificaciones: las preferencias no mandan `notification_url` (tendría prioridad sobre esta URL, la doc no dice que venga firmada y con credenciales de prueba no envía nada). Con el botón **Simular** de esa pantalla se puede mandar una notificación de prueba firmada.
5. Cargar las variables en un deploy de **Preview** de Cloudflare (con su propia base D1) y comprar con la **cuenta compradora de prueba** usando las tarjetas de prueba de la documentación (titular `APRO` = aprobado, `OTHE` = rechazado).
6. MP no puede llegar a `localhost`: para probar el webhook desde la compu hace falta un túnel (p. ej. `cloudflared tunnel --url http://localhost:5173`), cargar esa URL en **Webhooks → Configurar notificaciones** y `SITE_URL` con esa URL (para las `back_urls`: la doc pide no usar `localhost` ni `127.0.0.1` ahí, o el checkout termina en "Algo ha salido mal").
7. Recién cuando todo eso funcione: credenciales de la cuenta real, en Production.

## Resend

1. Crear cuenta en <https://resend.com>, **Domains → Add domain** `kinkyvibe.ar` y cargar los registros DNS (SPF/DKIM) que indica en Cloudflare DNS.
2. **API Keys → Create** con permiso _Sending access_ (idealmente limitada al dominio) → `RESEND_API_KEY`.
3. `TICKETS_FROM_EMAIL` con una dirección de ese dominio (por defecto `KinkyVibe <entradas@kinkyvibe.ar>`).

## Producción: base de datos

Requiere tener D1 activado (ver la sección "Base de datos" del README). Antes de deployar este código, correr **una vez**:

```sh
npm run db:migrate:remote        # = npx wrangler d1 migrations apply kinkyvibe --remote
```

Aplica las migraciones que falten: `0001_rate_limits.sql` (de la base), `0002_tickets.sql` (todas las tablas de entradas en un solo archivo) y `0003_ticket_safeguards.sql` (columnas para los límites por cliente y las órdenes para revisar). Se puede correr cuantas veces se quiera. De acá en adelante, cada cambio de esquema va en una migración nueva.

(y lo mismo contra la base de preview si se usa otra). Consultas útiles:

```sh
npx wrangler d1 execute kinkyvibe --remote --command "SELECT event_slug, status, COUNT(*) FROM orders GROUP BY 1, 2"
```

## Seguridad (resumen)

- **Precio:** solo desde el frontmatter en el servidor; el webhook además compara el monto y la moneda del pago con el total guardado en la orden.
- **Webhook:** firma HMAC-SHA256 con comparación de tiempo constante y `ts` de hasta 15 minutos; aun con firma válida, el estado se toma de la API de MP con nuestro token, nunca del body. Las notificaciones IPN viejas (`?topic=…`, sin firma) se ignoran.
- **Sobreventa:** reserva atómica (ver arriba); test con 30 compras concurrentes. Un pago de Mercado Pago aprobado después de vencida la reserva se acepta (la plata entró), pero si con eso el tipo pasa su cupo la orden queda **para revisar** (`needs_review = 'late_payment'`); otro pago aprobado para una orden ya pagada queda como `duplicate_payment` (posible cobro doble). Las dos se ven en `/admin/entradas` y en la página del evento ("⚠️ Para revisar", con "Marcar como revisada").
- **Reservas y abuso:** límites en capas en `?/buy` (`CHECKOUT_RATE_LIMITS` en `checkout.js`): primero por cliente (hash con sal de la conexión que rota cada día, `safeguards.js`; la IP no se guarda), un techo general holgado por evento y por email. Topes de reservas abiertas a la vez por evento (`HOLD_LIMITS` en `orders.js`, en la misma sentencia atómica que el cupo): por email (2 reservas y 20 entradas) y por cliente (40 entradas). Las transferencias arrancan con una reserva corta que se extiende al confirmarla desde el mail. Como mucho 3 mails de reserva o de entradas gratis por hora a una misma dirección. Los nombres no aceptan links ni caracteres de control. `TICKETS_CLIENT_SALT` (opcional, secreto) hace secreta la sal del hash de cliente.
- **Eventos de prueba:** los `prueba-entradas-*` del repo solo venden en `vite dev` (`isTestEventSlug` en `events.js`); en el sitio publicado no tienen venta.
- **Tokens:** 256 bits aleatorios (`crypto.getRandomValues`), únicos; el check-in es un único `UPDATE` condicional (dos escaneos simultáneos: gana uno). Las páginas con tokens o ids de orden mandan `Referrer-Policy: no-referrer`, `noindex` y `no-store`.
- **Admin:** cada `load`, cada form action y el CSV llaman a `requireAdmin` en el servidor (las form actions y los `+server.js` no pasan por el layout).
- **Mocks:** detrás de `dev` de `$app/environment`, que es `false` en el build: el módulo del mock, la sesión falsa y el fixture no llegan al worker de producción.
- **CSV:** celdas que empiezan con `= + - @` se escapan (inyección de fórmulas).
- **Privacidad:** de quien compra, nombre, pronombres, email y DNI; de cada entrada, nombre y pronombres. En el navegador, el borrador del formulario (DNI incluido) vive solo en `sessionStorage` de esa pestaña y se borra al comprar; nunca en `localStorage`. El DNI nunca va en mails, logs, URLs ni en la página pública de la entrada (que muestra nombre y pronombres); solo lo ven les admins en las órdenes, el CSV y el control de ingreso. Los datos por entrada viajan en la orden hasta que se emiten las entradas y ahí se borran de la orden.
- **Códigos:** revalidados en la misma sentencia atómica que el cupo; límite de intentos por cliente y evento, el mismo contador para "Aplicar" y para comprar con un código.
- **Transferencias:** confirmación solo de admins, idempotente, sin sobreventa al confirmar reservas vencidas.
- **Entradas:** quien tiene el link de una entrada no puede marcarse el ingreso (el form action `?/checkin` llama a `requireAdmin`: sin sesión redirige a `/login`, con sesión no admin a `/`; y la página no muestra el botón): tests en `src/routes/entradas/t/[token]/security.test.js`. El checkout simulado responde 404 fuera de `vite dev` con el mock (test en `simular-pago/[order]/gate.test.js`).
- **Link de transmisión:** solo en D1, nunca en el repo; se muestra solo en entradas de compras aprobadas.

## Verificación contra la documentación de Mercado Pago

Contrastado el 2026-09-29 con la documentación oficial de Mercado Pago Developers (español, Argentina), vía su buscador de documentación. Páginas (todas bajo `https://www.mercadopago.com/developers/es/docs/`):

- **[N]** `checkout-pro-preferences/payment-notifications` (Configurar notificaciones de pago)
- **[V]** `checkout-pro-preferences/additional-settings/term-of-preference` (Definir vigencia de preferencia)
- **[P]** `checkout-bricks/wallet-brick/advanced-features/preferences` (Configuraciones de preferencia: ejemplo completo, modo binario, vigencia, `statement_descriptor`, medios de pago)
- **[C]** `checkout-pro-preferences/create-payment-preference` (Crear y configurar una preferencia de pago)
- **[R]** `checkout-pro-preferences/configure-back-urls` (Configurar URLs de retorno)
- **[A]** `checkout-pro-preferences/additional-settings/opening-schema` (redirección con `init_point`)
- **[M]** `[[EXTEND]]/configure-payment-methods/checkout-pro` (tipos de pago en Argentina: `ticket` = Rapipago/Pago Fácil)
- **[S]** `checkout-api-payments/response-handling/query-results` (valores de `status` y `status_detail`)
- **[G]** `subscriptions/additional-content/payment-management` (`GET /v1/payments/{id}` y `/v1/payments/search`)
- **[I]** `checkout-bricks/payment-brick/payment-submission/cards` (header `X-Idempotency-Key`)

**Verificado (coincide con el código):**

- **Firma del webhook [N]:** header `x-signature` con formato `ts=…,v1=…` (se separa por `,` y cada parte por `=`); manifiesto `id:[data.id_url];request-id:[x-request-id_header];ts:[ts_header];`, con `data.id` tomado de los **query params** de la URL; si `data.id` es alfanumérico en mayúsculas va en minúsculas; si falta `data.id` o `x-request-id` se quita esa parte del manifiesto; HMAC-SHA256 con la clave secreta, en hex. Query params de la notificación: `data.id` y `type` (`type=payment`); el body trae `action`, `data.id`, `type`, etc. Hay que responder 200/201 en menos de 22 s.
- **`ts` [N]:** la doc dice "en milisegundos" y su ejemplo principal es `ts=1742505638683`, aunque otros ejemplos de la misma doc muestran `ts` en segundos (`1781009491`). El código acepta los dos; el checkout simulado ahora firma en milisegundos.
- **Canal firmado [N]:** la firma se documenta para la URL configurada en **Tus integraciones → Webhooks** (la clave secreta sale de ahí). La `notification_url` de la preferencia "tiene prioridad" sobre esa URL, la doc no dice que venga firmada, y "los pagos de prueba, creados con credenciales de prueba, no enviarán notificaciones" por esa vía. **Corregido:** la preferencia ya no manda `notification_url`.
- **Preferencia [P][C][V]:** `items[].id/title/quantity/unit_price/currency_id`; `payer.name` y `payer.email`; `external_reference`; `back_urls.success/failure/pending`; `auto_return: "approved"`; `expires: true` con `expiration_date_from`/`expiration_date_to` en ISO 8601 con milisegundos y huso (`2017-02-01T12:00:00.000-04:00`; usamos `-03:00`); `binary_mode: true` (solo aprobado o rechazado); `payment_methods.excluded_payment_types: [{ id: "ticket" }]` e `installments` (cuotas máximas); `statement_descriptor`. Para MLC la doc pide `unit_price` entero; nuestros precios ya son enteros.
- **Respuesta de la preferencia [C][A]:** `id` (p. ej. `787997534-6dad21a1-…`) e `init_point`, que es la URL a la que se redirige al comprador.
- **Pago [G][S]:** `GET /v1/payments/{id}` devuelve `status`, `status_detail`, `currency_id`, etc. Valores de `status`: `approved`, `authorized`, `in_process`, `pending`, `rejected`, `cancelled`, `refunded`, `charged_back`, `in_mediation` (todos mapeados en `mapPaymentStatus`).
- **Búsqueda [G]:** `GET /v1/payments/search` con `external_reference`, `sort`, `criteria` (`asc`/`desc`) y `limit` (máx. 50); la respuesta trae `paging` y `results`.
- **Parámetros de las back_urls [R]:** llegan por GET `collection_id`, `collection_status`, `payment_id`, `status`, `external_reference`, `payment_type`, `merchant_order_id`, `preference_id`, `site_id`… Usamos `payment_id` (o `collection_id`) solo para saber qué pago consultar, y comprobamos su `external_reference`.
- **Idempotencia [I]:** el header se llama `X-Idempotency-Key` (documentado para `POST /v1/payments`).

**Sigue sin verificar** (la doc consultada no lo dice):

- Si `POST /checkout/preferences` usa o ignora `X-Idempotency-Key` (solo está documentado para pagos; mandarlo no hace daño).
- Si `/v1/payments/search` acepta `sort=date_created` (la doc muestra `date_last_updated`, `id` y `external_reference`; igual se prioriza el pago aprobado entre los resultados).
- El id de tipo de pago `atm` en Argentina (la doc lo muestra solo para México y Perú; en Argentina el efectivo es `ticket`). El largo máximo de `statement_descriptor`.
- `sandbox_init_point`: la doc actual de Checkout Pro no lo menciona; se prueba con credenciales de producción de la cuenta de prueba vendedora y se usa `init_point`.
- Si los reintentos de un webhook (a los 15 min, 30 min, 6 h…, según [N]) conservan el `ts` original. Si lo conservan, un reintento posterior a 15 minutos se rechaza por viejo: el webhook se pierde, pero la página de estado vuelve a consultar el pago. Revisarlo en el historial de notificaciones de la aplicación cuando se pruebe.
- La API de pago en sí no se probó en vivo: los nombres de campos `external_reference` y `transaction_amount` en la respuesta de `GET /v1/payments/{id}` no aparecen en el extracto de la doc consultado (sí en la referencia de la API, que no se pudo abrir).
- **Resend** (`POST https://api.resend.com/emails`): campos `from`, `to`, `subject`, `html`, `text`, `reply_to`, y el header `Idempotency-Key`.

## Pendientes antes de vender de verdad

**Legal y comercial (Argentina)** — consultar con alguien que sepa; esto es una lista, no asesoramiento:

- **Defensa del Consumidor (Ley 24.240):** datos del proveedor visibles (razón social o nombre, CUIT, domicilio), precio final con impuestos, y el **botón de arrepentimiento** (Res. SCI 424/2020) en la home si se vende online, con su procedimiento. Revisar si aplica a entradas para eventos con fecha (hay excepciones discutidas).
- **Términos y condiciones** de compra y **política de reembolsos/cambios** (cancelación del evento, reprogramación, no-show, cambio de titular), enlazados desde el bloque de compra. Las condiciones que muestra hoy son un borrador.
- **Facturas:** facturas individuales solo a pedido, fuera del sitio (el sitio no emite ni promete facturas).
- **Datos personales (Ley 25.326):** aviso de privacidad (qué se guarda, para qué, cómo pedir la baja). Ahora también se guarda el DNI de quien compra.
- Verificación de edad: la casilla +18 es una declaración; el control real es en la puerta.

**Mercado Pago:**

- Elegir el **plazo de acreditación** (dinero disponible al instante con comisión más alta, o a 14/30 días con comisión menor) en la cuenta, y **cargar esa tasa en Ajustes de venta** (por defecto 2 %). Si la comisión real es distinta, la organización recibe un poco más o menos que la base.
- Monto mínimo de un pago en MP: no verificado (afecta compras con descuentos grandes que dejan un total muy chico).
- **Reembolsos:** hay botón en el admin (reembolso total). Falta decidir quién puede reembolsar (hoy, cualquier admin) y si hacen falta reembolsos parciales.
- Probar contracargos y pagos aprobados después de vencida la reserva (hoy se aceptan y se loguea un aviso).

**Operación:**

- **Transferencias:** alguien tiene que revisar la cuenta y confirmar a mano (no hay verificación automática). Una reserva por transferencia bloquea cupo 48 h: con muchos mails distintos alguien podría bloquear el cupo; si pasa, cancelar desde el admin y bajar `TICKETS_TRANSFER_HOLD_HOURS`.
- **Borrar el evento de prueba** (`prueba-entradas-2026-12.md`) antes de vender de verdad.

- Una persona "dueña" de las credenciales y de revisar los logs (Cloudflare → Workers & Pages → Logs) durante las ventas.
- Probar el escaneo en la puerta con los celulares reales (Android/Chrome anda con la página; en iPhone, con la cámara del sistema) y con poca señal.

## Fase 2: productores amigues (marketplace)

Idea: que otres productores vendan en el sitio y el dinero vaya directo a su cuenta de MP, con una comisión para KinkyVibe. **Sin verificar contra la documentación actual:** Mercado Pago tiene un modelo _marketplace_ en el que el vendedor vincula su cuenta por **OAuth** (la plataforma obtiene un access token del vendedor), se crean las preferencias con ese token y se indica `marketplace_fee` para la comisión de la plataforma. Habría que confirmar requisitos (aprobación de MP, tipo de cuenta), cómo se renuevan los tokens, cómo se hacen reembolsos y la facturación de cada parte, y guardar los tokens cifrados (no en el repo ni en texto plano).

## Preguntas abiertas para les organizadores

- ¿Qué pasa con las entradas si el evento se reprograma o se cancela? ¿Reembolso automático, crédito, o se decide caso por caso?
- ¿Plazo de acreditación de MP (define la tasa del recargo)?
- ¿El Fondo KinkyVibe tiene un tope por evento? (hoy no hay tope: cubre todas las entradas vendidas que elijan "con el descuento del fondo").
- ¿Los aportes de las entradas solidarias / Sugar cuentan para el objetivo mensual del fondo (y para el % de descuento)? ¿Hay que mostrarlos en fondo.kinkyvibe.ar o registrar a esas personas como Mecenas?
- Si alguien paga una entrada solidaria con un código de descuento, ¿el aporte al fondo es el nominal (lo que se guarda hoy: el código es un costo de la organización) o se reduce en proporción?
- ¿La venta cierra al empezar el evento o antes? ¿Hay venta en puerta (que habría que restar del cupo)?
