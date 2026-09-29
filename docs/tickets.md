# Venta de entradas (fase 1, prototipo)

Permite que la gente compre entradas para un evento del calendario desde el sitio, pague con **Mercado Pago (Checkout Pro)** y reciba por email un **QR por entrada**. Les organizadores ven quién compró en `/admin/entradas` y controlan el ingreso en la puerta escaneando el QR con el celu.

> Estado: prototipo probado solo con Mercado Pago y Resend **simulados** (el entorno donde se escribió no tenía acceso a sus APIs). Antes de vender de verdad hay que probarlo con las credenciales de prueba de MP y resolver la lista de [pendientes](#pendientes-antes-de-vender-de-verdad).

## Cómo se activa en un evento

Se agrega `tickets` al frontmatter del evento (`src/lib/posts/calendario/<slug>.md`). Los eventos sin `tickets` siguen igual que siempre (con su `link` externo).

```yaml
tickets:
  - id: general # minúsculas, números, - o _ (va en la base de datos: no cambiarlo después de vender)
    name: General # lo que ve la gente
    price: 8000 # pesos, entero
    capacity: 40 # cupo de este tipo
  - id: reducida
    name: Reducida
    price: 5000
    capacity: 10
tickets_close: 2026-10-16T18:00-03:00 # opcional; si falta, la venta cierra cuando empieza el evento
```

- El precio que se cobra **siempre** sale de este frontmatter, leído en el servidor. El formulario solo manda el tipo y la cantidad.
- `status: cancelado` o `status: agotadas` cierran la venta.
- Se pueden comprar de 1 a 4 entradas por compra. Cada entrada tiene su propio QR.
- Si ya hay un `link` de inscripción, el botón del encabezado pasa a ser "Comprar entradas" (el link sigue en el cuerpo si tiene `link_text`).
- Bajar el `capacity` por debajo de lo vendido no cancela nada: solo frena nuevas ventas.

## Cómo funciona

1. **Compra** (página del evento, bloque "Comprar entradas"): nombre, email, tipo, cantidad y la casilla de +18/condiciones. El servidor valida, **reserva cupo por 20 minutos** creando una orden `pending` y crea una _preferencia_ de Checkout Pro. La persona va al checkout de Mercado Pago.
2. **Cupo sin sobreventa:** la reserva es una única sentencia `INSERT … SELECT … WHERE vendidas + reservadas + cantidad <= cupo`. D1 ejecuta cada sentencia de forma atómica y en serie, así que dos compras simultáneas no pueden pasarse. Cuentan las órdenes aprobadas y las reservas vigentes.
3. **Webhook** `POST /api/mercadopago/webhook`: verifica la firma `x-signature` con `MP_WEBHOOK_SECRET`, y **no confía en el contenido**: pide el pago a la API de MP (`GET /v1/payments/<id>`), busca la orden por `external_reference`, compara monto y moneda (ARS) y actualiza el estado de forma idempotente (las notificaciones se repiten y llegan desordenadas). Al aprobarse se crean las entradas (una por unidad, con un token aleatorio de 256 bits) y se manda el email.
4. **Vuelta de MP** (`/entradas/<orden>/estado`): si el webhook todavía no llegó, vuelve a consultar el pago a la API igual que el webhook. Muestra el estado y, en el mismo navegador de la compra, los links a las entradas.
5. **Email** (Resend): datos del evento y un QR por entrada (imagen GIF servida en `/entradas/t/<token>/qr.gif`, porque Gmail no muestra SVG) con link a `/entradas/t/<token>`.
6. **Entrada** (`/entradas/t/<token>`): QR, nombre, tipo y estado (válida / ya usada / anulada). No muestra datos de otras personas.
7. **Admin** (`/admin/entradas`): vendidas/cupo, reservas y recaudación bruta por tipo; por evento, la lista de órdenes, exportar CSV, reenviar el mail y el **control de ingreso** (`/admin/entradas/<slug>/ingreso`): escanear el QR con la cámara (API `BarcodeDetector`: Chrome en Android, Edge) o buscar por nombre/email/código. Muestra en grande "Adelante", "Ya ingresó (hora y quién)", "Es de otro evento", "Anulada" o "QR inválido". En iPhone (Safari no tiene `BarcodeDetector`) se puede escanear con la cámara del sistema: abre la página de la entrada, que a les admins les muestra el botón "Marcar ingreso".

Estados de una orden: `pending` → `approved` / `rejected` / `cancelled` / `expired`, y `approved` → `refunded`. Un pago aprobado gana siempre (aunque la reserva haya vencido: la plata entró; queda un aviso en el log por posible sobreventa), un rechazo o "pendiente" tardío nunca pisa una aprobación, y una orden aprobada solo pasa a `refunded` por el mismo pago que la aprobó. Un reembolso anula las entradas en el control de ingreso.

### Archivos

| Qué                                              | Dónde                                                      |
| ------------------------------------------------ | ---------------------------------------------------------- |
| Tablas `orders` y `tickets`                      | `migrations/0002_tickets.sql`                              |
| Configuración desde el frontmatter y validación  | `src/lib/server/tickets/config.js`, `events.js`            |
| Órdenes, cupo, estados, check-in (SQL)           | `src/lib/server/tickets/orders.js`                         |
| Cliente de Mercado Pago y firma del webhook      | `src/lib/server/tickets/mercadopago.js`                    |
| Email (Resend) y QR                              | `src/lib/server/tickets/email.js`, `qr.js`                 |
| Variables, mocks y envío del email               | `src/lib/server/tickets/index.js`, `mock.js` (solo dev)    |
| Form action de compra                            | `src/lib/server/tickets/checkout.js`                       |
| Bloque de compra                                 | `src/lib/components/TicketPurchase.svelte`                 |
| Webhook                                          | `src/routes/api/mercadopago/webhook/+server.js`            |
| Páginas públicas (estado, entrada, QR, simulado) | `src/routes/entradas/`                                     |
| Admin y control de ingreso                       | `src/routes/(authed)/admin/entradas/`, `QrScanner.svelte`  |
| Tests                                            | `src/lib/server/tickets/*.test.js`, `tests/tickets/` (E2E) |

## Variables de entorno

En producción van en Cloudflare: **Workers & Pages → (proyecto) → Settings → Variables and Secrets**, como _Secret_ las que lo son. En local, en un archivo `.env` (ignorado por git) o en la línea de comando.

| Variable             | Qué es                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `MP_ACCESS_TOKEN`    | Secret. Access token de la aplicación de Mercado Pago (primero el de la **cuenta de prueba vendedora**).                                   |
| `MP_WEBHOOK_SECRET`  | Secret. "Clave secreta" de la sección Webhooks de la aplicación de MP. Sin ella todos los webhooks se rechazan (503).                      |
| `RESEND_API_KEY`     | Secret. API key de Resend con permiso de envío. Sin ella no se mandan mails (en producción se loguea un error).                            |
| `TICKETS_FROM_EMAIL` | Remitente, p. ej. `KinkyVibe <entradas@kinkyvibe.ar>` (ese es el valor por defecto). El dominio tiene que estar verificado.                |
| `TICKETS_REPLY_TO`   | Opcional. Dirección para las respuestas al mail de entradas.                                                                               |
| `SITE_URL`           | Opcional. Origen público (`https://kinkyvibe.ar`) para los links de mails y las URLs que se le pasan a MP. Si falta, se usa el del pedido. |

Solo en desarrollo (`vite dev`; en el build de producción este código no existe):

| Variable                   | Qué hace                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `MP_MOCK=1`                | Usa el Mercado Pago simulado aunque haya `MP_ACCESS_TOKEN`. Sin `MP_ACCESS_TOKEN` también se simula.                                     |
| `TICKETS_DEV_FIXTURE=slug` | Agrega entradas de prueba (General $8000 cupo 500, Reducida $5000 cupo 3) a esos eventos sin tocar su archivo. Separar varios con comas. |
| `ADMIN_DEV_MOCK=1`         | Sesión de admin falsa (sin GitHub).                                                                                                      |

## Probar en local (sin cuentas de nada)

```sh
npm install
MP_MOCK=1 ADMIN_DEV_MOCK=1 TICKETS_DEV_FIXTURE=<slug-de-un-evento> npm run dev -- --port 5371 --strictPort
```

1. Abrir `http://localhost:5371/calendario/<slug>#entradas`, completar y "Ir a pagar con Mercado Pago".
2. Se abre el **checkout simulado** (`/entradas/simular-pago/<orden>`): aprobar, rechazar, dejar pendiente o "aprobar sin webhook" (para ver que la página de estado re-consulta sola). Cada botón manda una notificación **firmada** al webhook igual que MP.
3. Sin `RESEND_API_KEY` el mail no se manda: se loguea en la consola (con los tokens recortados).
4. Admin: `http://localhost:5371/admin/entradas`.

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
4. En la aplicación: **Webhooks → Configurar notificaciones**: URL `https://<tu-deploy-de-preview>/api/mercadopago/webhook`, evento **Pagos**. Copiar la **clave secreta** que muestra → `MP_WEBHOOK_SECRET`. (Además, cada preferencia manda su propia `notification_url`, que apunta al mismo lugar.)
5. Cargar las variables en un deploy de **Preview** de Cloudflare (con su propia base D1) y comprar con la **cuenta compradora de prueba** usando las tarjetas de prueba de la documentación (titular `APRO` = aprobado, `OTHE` = rechazado).
6. MP no puede llegar a `localhost`: para probar el webhook desde la compu hace falta un túnel (p. ej. `cloudflared tunnel --url http://localhost:5371`) y `SITE_URL` con esa URL. Además MP puede rechazar `auto_return` con `back_urls` que no sean públicas.
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
- **Privacidad:** solo nombre y email. **TODO (no implementado):** anonimizar nombre/email y borrar tokens N días después del evento (p. ej. 90, por contracargos), dejando solo totales.

## Qué no se pudo verificar contra la documentación en vivo

Todo lo de MP y Resend se escribió de memoria de su documentación pública, sin acceso a internet. Revisar:

- **Preferencia** (`POST /checkout/preferences`): `expires`, `expiration_date_from`, `expiration_date_to` (formato `2026-10-01T09:20:00.000-03:00`), `binary_mode`, `payment_methods.excluded_payment_types` con ids `ticket` y `atm`, `payment_methods.installments`, `statement_descriptor`, `payer.name`, y que el header `X-Idempotency-Key` se acepte (o se ignore) en este endpoint. Respuesta: `id` e `init_point`.
- **Pago** (`GET /v1/payments/{id}`): campos `status` (`approved`, `rejected`, `cancelled`, `refunded`, `charged_back`, `pending`, `in_process`, `authorized`, `in_mediation`), `external_reference`, `transaction_amount`, `currency_id`.
- **Búsqueda** (`GET /v1/payments/search?external_reference=…&sort=date_created&criteria=desc`) y su campo `results`.
- **Firma del webhook:** formato `ts=…,v1=…`; manifiesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con `data.id` tomado del **query string** y en minúsculas si es alfanumérico; si `ts` viene en segundos o milisegundos (se aceptan ambos); si los reintentos de MP conservan el `ts` original (si es así, un reintento de más de 15 minutos se rechazaría: el webhook se pierde pero la página de estado re-consulta); y si las notificaciones que llegan por la `notification_url` de la preferencia vienen firmadas con la clave de la sección Webhooks.
- **Parámetros de las back_urls:** `payment_id`, `collection_id`, `status`, `external_reference`, `preference_id` (solo se usa `payment_id`/`collection_id`, y únicamente para saber qué pago consultar).
- **Resend** (`POST https://api.resend.com/emails`): campos `from`, `to`, `subject`, `html`, `text`, `reply_to`, y el header `Idempotency-Key`.

## Pendientes antes de vender de verdad

**Legal y comercial (Argentina)** — consultar con alguien que sepa; esto es una lista, no asesoramiento:

- **Defensa del Consumidor (Ley 24.240):** datos del proveedor visibles (razón social o nombre, CUIT, domicilio), precio final con impuestos, y el **botón de arrepentimiento** (Res. SCI 424/2020) en la home si se vende online, con su procedimiento. Revisar si aplica a entradas para eventos con fecha (hay excepciones discutidas).
- **Términos y condiciones** de compra y **política de reembolsos/cambios** (cancelación del evento, reprogramación, no-show, cambio de titular), enlazados desde el bloque de compra. Las condiciones que muestra hoy son un borrador.
- **Facturación (ARCA, ex AFIP):** quién factura (monotributo/responsable inscripte, la organización o cada productore), y cómo se emite la factura de cada venta (Mercado Pago no factura por vos).
- **Datos personales (Ley 25.326):** aviso de privacidad (qué se guarda, para qué, por cuánto tiempo, cómo pedir la baja) e implementar la retención (TODO de arriba).
- Verificación de edad: la casilla +18 es una declaración; el control real es en la puerta.

**Mercado Pago:**

- Elegir el **plazo de acreditación** (dinero disponible al instante con comisión más alta, o a 14/30 días con comisión menor) en la cuenta. Decidir si la comisión la absorbe la organización o se suma al precio (hoy el precio del frontmatter es lo que paga la persona).
- **Reembolsos:** hoy se hacen a mano desde el panel de MP; el webhook marca la orden `refunded` y anula las entradas. Falta: botón en el admin (vía `POST /v1/payments/{id}/refunds`), política de quién puede reembolsar, y avisar por mail.
- Probar contracargos y pagos aprobados después de vencida la reserva (hoy se aceptan y se loguea un aviso).

**Operación:**

- Una persona "dueña" de las credenciales y de revisar los logs (Cloudflare → Workers & Pages → Logs) durante las ventas.
- Probar el escaneo en la puerta con los celulares reales (Android/Chrome anda con la página; en iPhone, con la cámara del sistema) y con poca señal.

## Fase 2: productores amigues (marketplace)

Idea: que otres productores vendan en el sitio y el dinero vaya directo a su cuenta de MP, con una comisión para KinkyVibe. **Sin verificar contra la documentación actual:** Mercado Pago tiene un modelo _marketplace_ en el que el vendedor vincula su cuenta por **OAuth** (la plataforma obtiene un access token del vendedor), se crean las preferencias con ese token y se indica `marketplace_fee` para la comisión de la plataforma. Habría que confirmar requisitos (aprobación de MP, tipo de cuenta), cómo se renuevan los tokens, cómo se hacen reembolsos y la facturación de cada parte, y guardar los tokens cifrados (no en el repo ni en texto plano).

## Preguntas abiertas para les organizadores

- ¿Qué pasa con las entradas si el evento se reprograma o se cancela? ¿Reembolso automático, crédito, o se decide caso por caso?
- ¿Precio con o sin comisión de MP? ¿Plazo de acreditación?
- ¿Quién factura cada venta?
- ¿Se pide un nombre por entrada (hoy todas van a nombre de quien compra) o alcanza con el de quien compra?
- ¿Cuántas entradas máximo por compra (hoy 4)?
- ¿La venta cierra al empezar el evento o antes? ¿Hay venta en puerta (que habría que restar del cupo)?
- ¿Qué cuenta de email envía y a qué dirección responde la gente?
- ¿Cuántos días después del evento se pueden borrar nombres y emails?
