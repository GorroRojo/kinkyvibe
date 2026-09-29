# Venta de entradas (fase 1, prototipo)

Permite que la gente compre entradas para un evento del calendario desde el sitio, pague con **Mercado Pago (Checkout Pro)** o **transferencia bancaria**, y reciba por email un **QR por entrada**. Hay **códigos de descuento**, el **Fondo KinkyVibe** (que cubre parte de cada entrada) y un **recargo opcional por la comisión de Mercado Pago**. Les organizadores ven quién compró en `/admin/entradas`, confirman transferencias y controlan el ingreso en la puerta escaneando el QR con el celu.

> Estado: prototipo probado solo con Mercado Pago y Resend **simulados** (el entorno donde se escribió no tenía acceso a sus APIs). Antes de vender de verdad hay que probarlo con las credenciales de prueba de MP y resolver la lista de [pendientes](#pendientes-antes-de-vender-de-verdad).

## Cómo se activa en un evento

Se agrega `tickets` al frontmatter del evento (`src/lib/posts/calendario/<slug>.md`). Los eventos sin `tickets` siguen igual que siempre (con su `link` externo).

```yaml
tickets:
  - id: general # minúsculas, números, - o _ (va en la base de datos: no cambiarlo después de vender)
    name: General # lo que ve la gente
    price: 10000 # pesos, entero: el "Valor" de la planilla
    fondo: 2000 # opcional: el "$ fondo" que cubre el Fondo KinkyVibe; se paga price − fondo
    capacity: 40 # cupo de este tipo
  - id: reducida
    name: Reducida
    price: 5000
    capacity: 10
tickets_close: 2026-10-16T18:00-03:00 # opcional; si falta, la venta cierra cuando empieza el evento
payment_methods: [mercadopago, transferencia] # opcional; por defecto solo mercadopago
mp_fee_percent: 7.73 # opcional; si falta se usa TICKETS_MP_FEE_PERCENT (y si tampoco, sin recargo)
```

- El precio que se cobra **siempre** sale de este frontmatter, leído en el servidor. El formulario solo manda el tipo, la cantidad, el código y el medio de pago.
- `status: cancelado` o `status: agotadas` cierran la venta.
- **No hay máximo fijo por compra:** lo limita el cupo disponible (la reserva atómica sigue igual). El formulario muestra hasta `min(disponibles, 20)` entradas, porque cada una lleva su bloque de datos; para más de 20 dice "escribinos" (con más bloques el formulario se vuelve inmanejable en el celu y un grupo así conviene resolverlo a mano). El servidor rechaza más de 20 con el mismo mensaje. Cada entrada tiene su propio QR.
- `transferencia` solo aparece si además está configurada `TICKETS_TRANSFER_INFO`; `mercadopago`, si hay `MP_ACCESS_TOKEN` (o el mock en dev).
- Si ya hay un `link` de inscripción, el botón del encabezado pasa a ser "Comprar entradas" (el link sigue en el cuerpo si tiene `link_text`).
- Bajar el `capacity` por debajo de lo vendido no cancela nada: solo frena nuevas ventas.

## Cómo funciona

1. **Compra** (página del evento, bloque "Comprar entradas"):
   - **Quien compra** (datos administrativos, uno por compra): nombre, email (ahí van todas las entradas) y **DNI** (7 a 9 dígitos, se aceptan puntos; se guarda solo con dígitos).
   - **Cada entrada** (datos para el evento): nombre (como le conocen, no el del documento) y pronombres (opcionales). La entrada 1 viene con el nombre de quien compra (sin JavaScript, si queda vacía se usa ese nombre).
   - Tipo, cantidad, código de descuento opcional (botón **Aplicar**, que valida en el servidor y muestra el total), medio de pago y la casilla de +18/condiciones.
   - Con **Mercado Pago**: el servidor valida, **reserva cupo por 20 minutos** creando una orden `pending` y crea una _preferencia_ de Checkout Pro. La persona va al checkout de Mercado Pago.
   - Con **transferencia**: ver [Transferencia](#transferencia).
   - Si el **total queda en $ 0** (código de 100 %): no pasa por Mercado Pago; se emiten las entradas en el momento (con los mismos límites de intentos).
2. **Cupo sin sobreventa:** la reserva es una única sentencia `INSERT … SELECT … WHERE vendidas + reservadas + cantidad <= cupo`. D1 ejecuta cada sentencia de forma atómica y en serie, así que dos compras simultáneas no pueden pasarse. Cuentan las órdenes aprobadas y las reservas vigentes.
3. **Webhook** `POST /api/mercadopago/webhook`: verifica la firma `x-signature` con `MP_WEBHOOK_SECRET`, y **no confía en el contenido**: pide el pago a la API de MP (`GET /v1/payments/<id>`), busca la orden por `external_reference`, compara monto y moneda (ARS) y actualiza el estado de forma idempotente (las notificaciones se repiten y llegan desordenadas). Al aprobarse se crean las entradas (una por unidad, con un token aleatorio de 256 bits) y se manda el email.
4. **Vuelta de MP** (`/entradas/<orden>/estado`): si el webhook todavía no llegó, vuelve a consultar el pago a la API igual que el webhook. Muestra el estado y, en el mismo navegador de la compra, los links a las entradas.
5. **Email** (Resend): datos del evento y un QR por entrada (imagen GIF servida en `/entradas/t/<token>/qr.gif`, porque Gmail no muestra SVG) con link a `/entradas/t/<token>`.
6. **Entrada** (`/entradas/t/<token>`): QR, nombre, tipo y estado (válida / ya usada / anulada). No muestra datos de otras personas.
7. **Admin** (`/admin/entradas`): vendidas/cupo, reservas y recaudación bruta por tipo; por evento, la lista de órdenes, exportar CSV, reenviar el mail y el **control de ingreso** (`/admin/entradas/<slug>/ingreso`): escanear el QR con la cámara (API `BarcodeDetector`: Chrome en Android, Edge) o buscar por nombre/email/código. Muestra en grande "Adelante", "Ya ingresó (hora y quién)", "Es de otro evento", "Anulada" o "QR inválido". En iPhone (Safari no tiene `BarcodeDetector`) se puede escanear con la cámara del sistema: abre la página de la entrada, que a les admins les muestra el botón "Marcar ingreso".

Estados de una orden: `pending` / `awaiting_transfer` → `approved` / `rejected` / `cancelled` / `expired`, y `approved` → `refunded`. Un pago aprobado gana siempre (aunque la reserva haya vencido: la plata entró; queda un aviso en el log por posible sobreventa), un rechazo o "pendiente" tardío nunca pisa una aprobación, y una orden aprobada solo pasa a `refunded` por el mismo pago que la aprobó. Un reembolso anula las entradas en el control de ingreso.

### Precio: fondo, código y recargo

El servidor calcula todo (`computePrice` en `src/lib/utils/tickets.js`; el formulario usa la misma función solo para mostrar):

1. **Fondo KinkyVibe:** cada tipo puede tener `fondo`; se paga `price − fondo`. En el formulario se ve el precio tachado, "💜 El Fondo KinkyVibe cubre $F de tu entrada" y el precio a pagar. Vale para todo el mundo (no solo suscriptores). La orden guarda `fondo_amount`; `/admin/entradas` muestra el fondo usado por evento. No hay tope de presupuesto del fondo (pregunta abierta).
2. **Código de descuento** sobre lo que queda: porcentaje (redondeado al peso) o monto fijo en pesos **por compra**; nunca deja el total por debajo de 0.
3. **Recargo de Mercado Pago** (solo si se paga con MP y queda algo por pagar): `bruto = ⌈base / (1 − tasa)⌉` en pesos enteros, para que después de la comisión quede la base. La tasa sale de `mp_fee_percent` del evento o de `TICKETS_MP_FEE_PERCENT` (p. ej. `7.73` = 6,39 % + IVA). **Las tasas no están verificadas: revisarlas contra el plan actual de la cuenta de MP** (dependen del plazo de acreditación y cambian). Sin tasa configurada, no hay recargo. Transferencia paga la base, sin recargo. El formulario muestra "Entradas $X · Código −$D · Recargo Mercado Pago $Y · Total $Z" y cambia en vivo al elegir el medio de pago.

La orden guarda `unit_price` (precio de lista), `fondo_amount`, `subtotal`, `discount_code`, `discount_amount`, `surcharge_amount` y `total`. Con fondo, código o recargo, la preferencia de MP lleva un solo ítem por el total (MP no acepta ítems negativos) y el webhook compara lo pagado con `total`.

### Códigos de descuento

Admin en `/admin/entradas/codigos` (link desde `/admin/entradas` y el panel): lista con usos, crear, activar/desactivar. Cada código: texto (sin distinguir mayúsculas), porcentaje o monto fijo, evento (o todos), vigencia opcional desde/hasta (hora de Argentina), usos máximos opcionales.

- Un **uso** es una compra (no una entrada) aprobada o con la reserva vigente; si la reserva vence o se cancela, el uso se libera.
- "Aplicar" es informativo. Al crear la orden el código se **vuelve a validar dentro del mismo `INSERT`** que reserva el cupo (activo, vigente, del evento, mismo tipo/valor, usos < máximo), así que compras simultáneas no se pasan de `max_uses` (test con 25 compras concurrentes).
- Un código de otro evento responde "Ese código no existe" (no confirma que exista). Los intentos de "Aplicar" tienen límite por IP (anónimo, con hash).

### Transferencia

Opt-in por evento (`payment_methods`) y requiere `TICKETS_TRANSFER_INFO` (alias/CBU/titular, **nunca en el repo**).

1. La orden queda `awaiting_transfer` con una reserva de **48 h** (`TICKETS_TRANSFER_HOLD_HOURS`). Cuenta para el cupo y para los usos de códigos igual que las demás reservas; al vencer se libera.
2. La persona ve (en `/entradas/<orden>/estado`) el monto, los datos para transferir, una **referencia** `KV-XXXXXXXX` para el concepto y cómo mandar el comprobante (respondiendo el mail o escribiendo a `TICKETS_REPLY_TO`/`TICKETS_CONTACT_EMAIL`). Se le manda un mail con lo mismo.
3. En `/admin/entradas/<slug>`, **Transferencias pendientes**: **Confirmar pago** aprueba, emite las entradas y las manda por mail, en una transacción idempotente (dos clicks o dos pestañas: se emite una vez). **Cancelar** libera el cupo. Se siguen mostrando 7 días las reservas vencidas: confirmar una vencida solo funciona si todavía hay cupo (comprobado en la misma sentencia); en ese caso no se vuelve a mirar el máximo de usos del código.
4. **No hay verificación automática:** no existe una API confiable y accesible para enterarse de transferencias entrantes a una cuenta bancaria o CVU común (los bancos no ofrecen webhooks a particulares/pequeñas organizaciones, y leer extractos o mails del banco sería frágil e inseguro). Alguien tiene que mirar la cuenta y confirmar a mano.

### Política de devoluciones

Se muestra en "Condiciones de compra y devoluciones" del formulario y al pie de los mails (la dirección es `TICKETS_CONTACT_EMAIL`, por defecto `kinkyvibe.talleres@gmail.com`):

> ↩️ DEVOLUCIONES ↩️
> En caso de sacar entrada y no poder asistir, tienen tiempo hasta 5 días hábiles previos al evento para avisarnos y así gestionar la devolución del dinero. También podemos ofrecerte a cambio algún taller grabado que tengamos disponible en la tienda en ese momento.
>
> Si pasás tu entrada a alguien más, por favor envianos un mail a kinkyvibe.talleres@gmail.com avisándonos esto y aclarando la siguiente información sobre la persona que va a ocupar tu entrada: nombre, pronombre y mail.

### Evento de prueba

`src/lib/posts/calendario/prueba-entradas-2026-12.md` es un evento **oculto** (`force_unlisted`) con entradas, fondo y los dos medios de pago, y en el cuerpo las instrucciones paso a paso para probar todo. **Hay que borrarlo antes de vender de verdad.**

### Archivos

| Qué                                              | Dónde                                                           |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Tablas `orders`, `tickets` y `discount_codes`    | `migrations/0002_tickets.sql`, `0003_tickets_v2.sql`            |
| Cálculo de precio, DNI, política (compartido)    | `src/lib/utils/tickets.js`                                      |
| Códigos de descuento                             | `src/lib/server/tickets/discounts.js`, `admin/entradas/codigos` |
| Configuración desde el frontmatter y validación  | `src/lib/server/tickets/config.js`, `events.js`                 |
| Órdenes, cupo, estados, check-in (SQL)           | `src/lib/server/tickets/orders.js`                              |
| Cliente de Mercado Pago y firma del webhook      | `src/lib/server/tickets/mercadopago.js`                         |
| Email (Resend) y QR                              | `src/lib/server/tickets/email.js`, `qr.js`                      |
| Variables, mocks y envío del email               | `src/lib/server/tickets/index.js`, `mock.js` (solo dev)         |
| Form action de compra                            | `src/lib/server/tickets/checkout.js`                            |
| Bloque de compra                                 | `src/lib/components/TicketPurchase.svelte`                      |
| Webhook                                          | `src/routes/api/mercadopago/webhook/+server.js`                 |
| Páginas públicas (estado, entrada, QR, simulado) | `src/routes/entradas/`                                          |
| Admin y control de ingreso                       | `src/routes/(authed)/admin/entradas/`, `QrScanner.svelte`       |
| Tests                                            | `src/lib/server/tickets/*.test.js`, `tests/tickets/` (E2E)      |

## Variables de entorno

En producción van en Cloudflare: **Workers & Pages → (proyecto) → Settings → Variables and Secrets**, como _Secret_ las que lo son. En local, en un archivo `.env` (ignorado por git) o en la línea de comando.

| Variable                      | Qué es                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MP_ACCESS_TOKEN`             | Secret. Access token de la aplicación de Mercado Pago (primero el de la **cuenta de prueba vendedora**).                                                     |
| `MP_WEBHOOK_SECRET`           | Secret. "Clave secreta" de la sección Webhooks de la aplicación de MP. Sin ella todos los webhooks se rechazan (503).                                        |
| `RESEND_API_KEY`              | Secret. API key de Resend con permiso de envío. Sin ella no se mandan mails (en producción se loguea un error).                                              |
| `TICKETS_FROM_EMAIL`          | Remitente, p. ej. `KinkyVibe <entradas@kinkyvibe.ar>` (ese es el valor por defecto). El dominio tiene que estar verificado.                                  |
| `TICKETS_REPLY_TO`            | Opcional. Dirección para las respuestas a los mails (y los comprobantes). Por defecto, `TICKETS_CONTACT_EMAIL`.                                              |
| `TICKETS_CONTACT_EMAIL`       | Opcional. Contacto público de la política de devoluciones y cambios de titular. Por defecto `kinkyvibe.talleres@gmail.com`.                                  |
| `TICKETS_TRANSFER_INFO`       | Datos para transferir (alias, CBU/CVU, titular), texto libre; saltos de línea reales o escritos `\n`. Sin esto no se ofrece transferencia. **No commitear.** |
| `TICKETS_TRANSFER_HOLD_HOURS` | Opcional. Horas de reserva esperando una transferencia (1 a 240; por defecto 48).                                                                            |
| `TICKETS_MP_FEE_PERCENT`      | Opcional. Comisión de MP que se suma como recargo, p. ej. `7.73`. Sin ella, no hay recargo. Verificarla contra el plan de la cuenta.                         |
| `SITE_URL`                    | Opcional. Origen público (`https://kinkyvibe.ar`) para los links de mails y las URLs que se le pasan a MP. Si falta, se usa el del pedido.                   |

Solo en desarrollo (`vite dev`; en el build de producción este código no existe):

| Variable                   | Qué hace                                                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MP_MOCK=1`                | Usa el Mercado Pago simulado aunque haya `MP_ACCESS_TOKEN`. Sin `MP_ACCESS_TOKEN` también se simula.                                                                                            |
| `TICKETS_DEV_FIXTURE=slug` | Agrega entradas de prueba (General $8000 cupo 500, Reducida $5000 cupo 3, Con fondo $10000 − $2000 cupo 500; MP y transferencia) a esos eventos sin tocar su archivo. Separar varios con comas. |
| `ADMIN_DEV_MOCK=1`         | Sesión de admin falsa (sin GitHub).                                                                                                                                                             |

## Probar en local (sin cuentas de nada)

```sh
npm install
MP_MOCK=1 ADMIN_DEV_MOCK=1 TICKETS_MP_FEE_PERCENT=7.73 \
  TICKETS_TRANSFER_INFO='Alias: EJEMPLO.ALIAS.PRUEBA\nTitular: Nombre de ejemplo' \
  npm run dev -- --port 5371 --strictPort
```

Con eso ya funciona el evento de prueba `http://localhost:5371/calendario/prueba-entradas-2026-12` (su página tiene la guía paso a paso). Para probar con otro evento sin tocar su archivo, agregar `TICKETS_DEV_FIXTURE=<slug>`.

1. Abrir la página del evento en `#entradas`, completar y "Ir a pagar con Mercado Pago" (o "Reservar y ver los datos para transferir").
2. Se abre el **checkout simulado** (`/entradas/simular-pago/<orden>`): aprobar, rechazar, dejar pendiente o "aprobar sin webhook" (para ver que la página de estado re-consulta sola). Cada botón manda una notificación **firmada** al webhook igual que MP.
3. Sin `RESEND_API_KEY` el mail no se manda: se loguea en la consola (con los tokens recortados).
4. Admin: `http://localhost:5371/admin/entradas` (transferencias pendientes en la página de cada evento) y `http://localhost:5371/admin/entradas/codigos`.

Tests:

```sh
npx vitest run src/lib/server/tickets                  # unitarios (D1 real en memoria)
npx playwright test -c playwright.tickets.config.js    # E2E: levanta vite dev en el puerto 5371 con los mocks
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
6. MP no puede llegar a `localhost`: para probar el webhook desde la compu hace falta un túnel (p. ej. `cloudflared tunnel --url http://localhost:5371`), cargar esa URL en **Webhooks → Configurar notificaciones** y `SITE_URL` con esa URL (para las `back_urls`: la doc pide no usar `localhost` ni `127.0.0.1` ahí, o el checkout termina en "Algo ha salido mal").
7. Recién cuando todo eso funcione: credenciales de la cuenta real, en Production.

## Resend

1. Crear cuenta en <https://resend.com>, **Domains → Add domain** `kinkyvibe.ar` y cargar los registros DNS (SPF/DKIM) que indica en Cloudflare DNS.
2. **API Keys → Create** con permiso _Sending access_ (idealmente limitada al dominio) → `RESEND_API_KEY`.
3. `TICKETS_FROM_EMAIL` con una dirección de ese dominio (por defecto `KinkyVibe <entradas@kinkyvibe.ar>`).

## Producción: base de datos

Requiere tener D1 activado (ver la sección "Base de datos" del README). Antes de deployar este código:

```sh
npm run db:migrate:remote        # = npx wrangler d1 migrations apply kinkyvibe --remote
```

(y lo mismo contra la base de preview si se usa otra). Consultas útiles:

```sh
npx wrangler d1 execute kinkyvibe --remote --command "SELECT event_slug, status, COUNT(*) FROM orders GROUP BY 1, 2"
```

## Seguridad (resumen)

- **Precio:** solo desde el frontmatter en el servidor; el webhook además compara el monto y la moneda del pago con el total guardado en la orden.
- **Webhook:** firma HMAC-SHA256 con comparación de tiempo constante y `ts` de hasta 15 minutos; aun con firma válida, el estado se toma de la API de MP con nuestro token, nunca del body. Las notificaciones IPN viejas (`?topic=…`, sin firma) se ignoran.
- **Sobreventa:** reserva atómica (ver arriba); test con 30 compras concurrentes.
- **Tokens:** 256 bits aleatorios (`crypto.getRandomValues`), únicos; el check-in es un único `UPDATE` condicional (dos escaneos simultáneos: gana uno). Las páginas con tokens o ids de orden mandan `Referrer-Policy: no-referrer`, `noindex` y `no-store`.
- **Admin:** cada `load`, cada form action y el CSV llaman a `requireAdmin` en el servidor (las form actions y los `+server.js` no pasan por el layout).
- **Mocks:** detrás de `dev` de `$app/environment`, que es `false` en el build: el módulo del mock, la sesión falsa y el fixture no llegan al worker de producción.
- **CSV:** celdas que empiezan con `= + - @` se escapan (inyección de fórmulas).
- **Privacidad:** de quien compra, nombre, email y DNI; de cada entrada, nombre y pronombres. El DNI nunca va en mails, logs, URLs ni en la página pública de la entrada (que muestra nombre y pronombres); solo lo ven les admins en las órdenes, el CSV y el control de ingreso. Los datos por entrada viajan en la orden hasta que se emiten las entradas y ahí se borran de la orden.
- **Códigos:** revalidados en la misma sentencia atómica que el cupo; límite de intentos de "Aplicar".
- **Transferencias:** confirmación solo de admins, idempotente, sin sobreventa al confirmar reservas vencidas.

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

- Elegir el **plazo de acreditación** (dinero disponible al instante con comisión más alta, o a 14/30 días con comisión menor) en la cuenta, y **cargar esa tasa en `TICKETS_MP_FEE_PERCENT`** (recargo por la comisión, ya implementado; el valor `7.73` de los ejemplos no está verificado). Si la comisión real es distinta, la organización recibe un poco más o menos que la base.
- Monto mínimo de un pago en MP: no verificado (afecta compras con descuentos grandes que dejan un total muy chico).
- **Reembolsos:** hoy se hacen a mano desde el panel de MP; el webhook marca la orden `refunded` y anula las entradas. Falta: botón en el admin (vía `POST /v1/payments/{id}/refunds`), política de quién puede reembolsar, y avisar por mail.
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
- ¿El Fondo KinkyVibe tiene un tope por evento? (hoy no hay tope: cubre todas las entradas vendidas).
- ¿La venta cierra al empezar el evento o antes? ¿Hay venta en puerta (que habría que restar del cupo)?
- ¿Qué cuenta de email envía? (las respuestas van a `TICKETS_CONTACT_EMAIL` salvo que se configure `TICKETS_REPLY_TO`).
