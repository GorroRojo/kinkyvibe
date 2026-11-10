# PayPal

Pagar con PayPal, en dólares, en todo lo que cobra el sitio: **las propinas** (el formulario de
siempre, también `/propinas?de=fondo`) y **la compra de entradas** (con extras, Fondo, códigos de
descuento y los links de la lista de espera). No es para la puerta (efectivo o MP en la puerta,
como siempre) ni para las suscripciones al Fondo (las cobra fondo.kinkyvibe.ar).

Decisiones: [0054](decisiones/0054-paypal-en-las-propinas.md) (la app compartida, la cotización
propia, lo neto) y [0059](decisiones/0059-paypal-en-todo-lo-que-se-cobra.md) (entradas, cómo se
convierte, qué pasa al cancelar). La cotización, el ajuste y los retiros:
[propinas.md](propinas.md), «PayPal: cotización, ajuste y retiros».

## Lo que falta para prenderlo (la lista del martes)

Todo el código está listo y probado con el PayPal simulado. Falta solo lo que pide las cuentas.

### 1. Migraciones

**Hecho el 10/11** en `kinkyvibe-preview` y en `kinkyvibe` (mismas filas antes y después, sin
foreign keys rotas): **0082** (`0082_paypal_entradas.sql`). La 0071 ya estaba aplicada (vino con
`paypal-base`).

La 0082 **reconstruye la tabla `orders`** (para aceptar `payment_method = 'paypal'`), como la 0005
y la 0010. Copia antes y vuelve a cargar después lo que el `DROP TABLE` borraría en cascada
(`order_answers`, `free_order_choices`); está probado en `migration0082.test.js`. Igual:

Ojo en D1 remoto: `wrangler d1 execute --file` (la importación) **no** respeta
`PRAGMA defer_foreign_keys` y falla con «FOREIGN KEY constraint failed» (D1 vuelve todo atrás). Por
`--command` (una sola tanda) sí anda; y la tabla nueva se crea ya con el nombre `orders` para que
las filas que se vuelven a cargar cierren las foreign keys de `tickets`, `order_extras`, etc. Así se
aplicó:

```sh
npx wrangler d1 time-travel info kinkyvibe   # anotar el marcador de antes, por las dudas
npx wrangler d1 execute kinkyvibe --remote -y --command "$(grep -v '^--' migrations/0082_paypal_entradas.sql)"
npx wrangler d1 execute kinkyvibe --remote --command "PRAGMA foreign_key_check"   # tiene que dar vacío
# y anotarla: INSERT INTO d1_migrations (name) VALUES ('0082_paypal_entradas.sql')
```

### 2. La app de PayPal (sandbox primero)

1. Entrar a <https://developer.paypal.com> con la cuenta de PayPal de Kinky Vibe → **Apps &
   Credentials** → pestaña **Sandbox** → **Create App** (tipo «Merchant»). Es **la misma app** que
   va a usar fondo.kinkyvibe.ar (decisión 0054): si el Fondo ya la creó, usar esa.
2. De la app: **Client ID** y **Secret** (sandbox).
3. En la app, **Add Webhook**:
   - URL: `https://kinkyvibe.ar/api/paypal/webhook` (para probar en un preview, la URL del preview
     - `/api/paypal/webhook`).
   - Eventos (solo estos; el Fondo suscribe su propio webhook con los suyos):
     `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`,
     `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`
     (`WEBHOOK_EVENTS` en `src/lib/server/paypal/payments.js`).
   - Copiar el **Webhook ID** que muestra.

### 3. Secretos en Cloudflare

En el Worker `kinkyvibe` (Settings → Variables and Secrets), como **Secret** (nunca en el repo):

| Nombre                 | Qué                                                 |
| ---------------------- | --------------------------------------------------- |
| `PAYPAL_CLIENT_ID`     | el Client ID de la app                              |
| `PAYPAL_CLIENT_SECRET` | el Secret de la app                                 |
| `PAYPAL_WEBHOOK_ID`    | el id del webhook de kinkyvibe (no el del Fondo)    |
| `PAYPAL_ENV`           | `sandbox` para probar; `live` para cobrar de verdad |

Con cualquier valor de `PAYPAL_ENV` que no sea exactamente `live` se usa sandbox (un error de
tipeo nunca cobra de verdad). Sin los tres primeros, PayPal no se ofrece en ningún lado.

### 4. Prender y probar en sandbox

1. Ajustes → PayPal: que haya **cotización de hoy** (la trae el cron diario; sin una cotización de
   los últimos 5 días, PayPal no se ofrece), revisar el **ajuste en %** y la **comisión** (5,4 % +
   US$ 0,30 por defecto: compararla con la de la cuenta de PayPal, ver «El recargo»).
2. Panel → Interruptores → **PayPal** prendido.
3. En developer.paypal.com → **Sandbox accounts**: hay una cuenta «Personal» de prueba (o crear
   una, de país US o ES, con saldo). Con esa se paga.
4. Probar:
   - una **propina** desde una publicación y desde `/propinas?de=fondo` (elegir «PayPal», ver los
     dólares, pagar con la cuenta de prueba, volver al «¡Gracias!»);
   - una **compra de entradas** (elegir «PayPal», ver los dólares en «Pagar», pagar, llegar a la
     página de la compra aprobada y recibir el mail con las entradas); con un **extra**, con un
     **código** y con la opción **solidaria** del Fondo;
   - **cancelar** en PayPal: la compra queda cancelada y el lugar se libera;
   - **reembolsar** desde Ventas › Órdenes («Reembolsar…»): pide el reembolso a PayPal y avisa
     por mail;
   - el **webhook**: en developer.paypal.com → Webhooks → **Event logs**, que los eventos
     salgan con 200 (un 401 es firma: revisar `PAYPAL_WEBHOOK_ID`).
5. En el panel: la orden dice «PayPal», el cobro y los dólares (con la comisión); Estadísticas ›
   Propinas cuenta lo de PayPal en el reparto por mes del Fondo.

### 5. Live

Repetir el paso 2 en la pestaña **Live** de la misma app (Client ID, Secret y otro webhook con la
misma URL y los mismos eventos), cambiar los tres secretos y poner `PAYPAL_ENV=live`. Una compra
chica de verdad y su reembolso. Avisar en #265 (las credenciales se rotan junto con el Fondo).

## Cómo funciona

### Cuándo se ofrece

`paypalOffer` (`src/lib/server/paypal/payments.js`): el interruptor `paypal` prendido, las tres
credenciales y una cotización de hace 5 días o menos (fines de semana y feriados). Si algo falta,
no aparece la opción y todo sigue con Mercado Pago. En las entradas, además, **es una opción por
evento**, como la transferencia: casilla «PayPal» en Medios de pago de la sección Entradas del
editor, **prendida por defecto** (en el evento solo se guarda `paypal: false` si se apaga).

**Sin cotización reciente** (más de 5 días: el cron de la cotización falló varios días), PayPal no
se ofrece en ningún lado, Ajustes › PayPal lo marca como dato viejo y la vigilancia
(`/api/cron/vigilancia`, la corrida de las 10, hora de Argentina) avisa una vez por día por
Telegram a les admins con «Fallas en compras» prendido (`paypal_cotizacion`).

### Cuánto se cobra

Lo que se paga en pesos (entradas + extras, con el Fondo y el código ya aplicados; sin el recargo
de MP, que es solo de MP) pasado a dólares con la cotización base del día y el ajuste, **redondeado
para arriba** al centavo (`usdCentsForArs` en `$lib/utils/paypal.js`):

    dólares = ceil(pesos / (base × (1 + ajuste / 100)))

Así, lo cobrado pasado a pesos con la misma cuenta (`estimateArs`) alcanza el precio. Quien paga ve
los dólares **antes** de ir a PayPal: en «Pagar» de la compra (en la nota del medio de pago, corta: los
dólares, que los $ son pesos argentinos y la cotización como «a $ X por dólar»; y al lado del
total del resumen) y en el
formulario de propina (que pide la cotización a `GET /api/paypal/oferta`, porque está también en
páginas sin servidor). La cuenta del navegador es la misma función que la del servidor. Después,
la página de la compra y el mail muestran el total en pesos y, entre paréntesis, los dólares que
se cobraron.

### El recargo

Como con Mercado Pago, **quien compra entradas paga la comisión de PayPal** como recargo
(`paypalSurcharge` en `$lib/utils/paypal.js`, el mismo cálculo en el navegador y en el servidor):

    total = ceil((pesos + fijo_en_pesos) / (1 − porcentaje)),  recargo = total − pesos

con el fijo (en dólares) pasado a pesos con la misma cotización. Así, cobrado en dólares y
descontada la comisión, queda el precio. Se ve como «Recargo PayPal» en el resumen de la compra,
la página de la compra, el mail y el panel, y se guarda en `surcharge_amount` como el de MP: entra
en `total`, los reportes lo cuentan como comisión del medio de pago hasta que PayPal informa la
real (`mp_fee_amount`) y Gastos y reparto lo descuenta igual que el de MP (no se cuenta dos veces).
Las **propinas con PayPal también llevan el recargo** (`paypalCharge`, la misma cuenta en el
formulario y en el servidor): se cobra `usdCentsForArs(monto + recargo)`, el formulario lo muestra
(solo «Con PayPal pagás US$ 1,17.», sin desglose) y
`tips.amount` sigue siendo el monto elegido. Lo que cuenta para el Fondo y las estadísticas son
los dólares **netos** pasados a pesos (`usd_net_cents`), así que el recargo (que se lleva la
comisión) no se cuenta como propina ni dos veces.

La comisión se cambia en **Ajustes › PayPal › Comisión de PayPal** (queda en Actividad). Por
defecto **5,4 % + US$ 0,30**: la de PayPal Argentina para «recibir pagos de ventas
internacionales» (<https://www.paypal.com/ar/webapps/mpp/merchant-fees>, consultada el
6/11/2026). **A CONFIRMAR** contra la cuenta de verdad antes de cobrar: la tarifa puede depender
del país de quien paga y de la cuenta.

Se guarda en la orden lo que se cobra y con qué (`usd_amount_cents`, `rate_base`,
`rate_adjustment_pct`, migración 0082); en la propina, `usd_gross_cents` y `rate_base` (0071). El
total de la orden sigue en pesos (`total`), así los reportes, el reparto y el Fondo no cambian.

### El pago

Orders v2 por REST con `fetch` (`src/lib/server/paypal/client.js`, sin SDK): token por client
credentials guardado en memoria hasta un minuto antes de vencer; cada pedido con
`PayPal-Request-Id` (crear: `order-<id>` / `tip-<id>`; capturar: `capture-<orden de PayPal>`;
reembolsar: `refund-<id>`), así un reintento no cobra ni devuelve dos veces.

1. **Crear**: se reserva la orden (como con MP, 20 minutos) o se crea la propina, y se crea la orden
   de PayPal (`intent: CAPTURE`, un ítem en USD, sin envío, «Pagar ahora») con `custom_id`
   `kv-entrada:<orden>` o `kv-propina:<propina>`. Se manda a la persona al link `payer-action`.
2. **Volver**: PayPal vuelve a `/paypal/vuelta?token=<orden de PayPal>`. El token solo dice qué
   orden mirar: se pide a la API y, si está aprobada, **se captura** (se cobra) ahí mismo y se
   aplica. Después, a la página de la compra o al «¡Gracias!» de la propina.
3. **Respaldo**: el webhook (`/api/paypal/webhook`) verifica la firma con la API de PayPal
   (`verify-webhook-signature` con `PAYPAL_WEBHOOK_ID`), saca del cuerpo **solo** qué orden es, la
   pide a la API, la captura si hace falta y la aplica. Las páginas de la compra y de gracias
   también vuelven a mirar si siguen pendientes.
4. **Aplicar**: lo mismo para los tres caminos, idempotente. Las entradas van por el mismo
   `processPayment` que Mercado Pago (entradas, mail, «Cada venta», lista de espera, embudo,
   pagos tardíos y cobros dobles para revisar): el cobro se guarda en `paypal_capture_id` (lo que
   en MP es `mp_payment_id`) y se compara en dólares contra `usd_amount_cents`. Las propinas, con
   `applyPaypalTipPayment` (lo neto en `usd_net_cents`).
5. **Comisión**: la que informa PayPal en la captura va en `usd_fee_cents` y, pasada a pesos con
   la cotización de la orden, en `mp_fee_amount`, que los reportes suman como comisión del medio
   de pago (`MP_FEE_SQL`).

Lo que no es de kinkyvibe (un `custom_id` sin `kv-`, p. ej. una suscripción del Fondo) se ignora
con un 200.

### Cancelar, reembolsar, contracargos

- **Cancelar en PayPal** (`?cancelado=1`): si la orden de PayPal no se aprobó, la compra se cancela
  y libera el lugar (la lista de espera sigue); la propina queda «no se completó». La página
  dice «Cancelaste el pago en PayPal: no se cobró nada.» con «Volver a comprar» (entradas) o
  «Volver a dejar la propina» (al formulario; una cancelación del panel, con `confirmed_by`, sigue
  con el texto de siempre). Un pago que llegue después igual se acepta (como con MP).
- **Reembolsar** desde Ventas › Órdenes: reembolso TOTAL de la captura por la API. Si PayPal da
  error pero la captura figura reembolsada, se marca igual. «Reembolsar todas» de un evento
  cancelado también las devuelve por la API, junto con las de Mercado Pago. El recargo se
  devuelve entero (es un reembolso total); la comisión de PayPal de ese cobro puede no volver.
- **Reembolso hecho en PayPal** o **contracargo** (`PAYMENT.CAPTURE.REFUNDED` / `REVERSED`): el
  webhook pasa la orden a reembolsada, como con MP (con el contracargo, sin mail).
- Las propinas no tienen «reembolsar» en el panel (tampoco las de MP): se devuelven desde PayPal y
  el webhook las marca.

### Desarrollo y pruebas

`npm run dev:tickets` usa el PayPal simulado (`PAYPAL_MOCK=1` y `PAYPAL_ENABLED=1` en
`.env.tickets`; solo en `vite dev`, nunca en el build). La pantalla de PayPal es
`/paypal/simular/<id>` («Aprobar pago» o «Cancelar y volver»), con una comisión simulada de
5,4 % + US$ 0,30. Necesita una cotización en la base local: el cron la trae (`/api/cron/...` con
`CRON_SECRET`) o se carga a mano en `mep_rates`.

Pruebas: `src/lib/server/paypal/*.test.js` (cliente, conversión, verificación del webhook, lectura
de órdenes, cobro e idempotencia contra la base) y `migration0082.test.js`.

## Variables

| Variable               | Dónde                                     | Qué                                         |
| ---------------------- | ----------------------------------------- | ------------------------------------------- |
| `PAYPAL_CLIENT_ID`     | Secret de Cloudflare                      | credencial de la app                        |
| `PAYPAL_CLIENT_SECRET` | Secret de Cloudflare                      | credencial de la app                        |
| `PAYPAL_WEBHOOK_ID`    | Secret de Cloudflare                      | id del webhook de kinkyvibe (para la firma) |
| `PAYPAL_ENV`           | variable de Cloudflare                    | `live` cobra de verdad; otra cosa, sandbox  |
| `PAYPAL_ENABLED`       | (opcional) fuerza el interruptor `paypal` | `1` / `0`                                   |
| `PAYPAL_MOCK`          | solo `.env.tickets` (dev)                 | `1`: PayPal simulado                        |

## Decidido con gorrite (7/11)

- PayPal es **una opción por evento**, prendida por defecto.
- **Con recargo**: quien compra paga la comisión de PayPal (configurable; la tarifa por defecto es
  A CONFIRMAR, ver «El recargo»). La conversión usa el ajuste en % y redondea para arriba.
- **Propinas en pesos convertidos** (los mismos montos de siempre), con el mismo recargo.
- **Cancelar en PayPal cancela la compra** enseguida.
- **«Reembolsar todas» devuelve también las de PayPal** por la API.
- **Cotización de hasta 5 días**; con una más vieja PayPal no se ofrece y se avisa a les admins.
