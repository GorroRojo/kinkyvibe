# Analíticas anónimas (visitas y embudo de compra)

Qué páginas se visitan, de dónde llega la gente, desde qué países y dispositivos, y por evento
cuántas visitas terminan en una compra. Se ve en **Panel → Estadísticas → Visitas al sitio**.

Usa **Workers Analytics Engine** de Cloudflare y nada más. Es **anónimo**: no hay personas, IPs,
cookies ni cuentas. El beacon de **Cloudflare Web Analytics** (`src/app.html`) sigue como estaba y
no tiene nada que ver con esto.

## Qué se guarda (y qué nunca)

Cada visita o paso es un "punto" con estas columnas, y nada más:

| Columna | Qué                                                           | Ejemplo                   |
| ------- | ------------------------------------------------------------- | ------------------------- |
| tipo    | `view` (visita) o `funnel` (paso de la compra)                | `view`                    |
| ruta    | la página, sin query string, en minúsculas                    | `/calendario/fiesta-rara` |
| origen  | **solo el dominio** de donde vino; vacío = directo o interno  | `instagram.com`           |
| país    | el que da Cloudflare (dos letras)                             | `AR`                      |
| disp.   | `phone`, `tablet` o `desktop` (sale del User-Agent)           | `phone`                   |
| evento  | el slug, si la página es de un evento                         | `fiesta-rara`             |
| paso    | `evento`, `abrio`, `datos`, `pagar`, `orden`, `aprobada`      | `abrio`                   |
| medio   | solo en `orden` y `aprobada`: `mercadopago`, `transferencia`… | `mercadopago`             |

**Nunca** se guarda: la IP, el User-Agent (solo se usa en el momento para decir «bot o no» y
«celu / tablet / compu»), cookies, la cuenta o la sesión, el mail, el id de la orden, la query
string (UTM, `fbclid`, tokens…), la ruta del Referer ni la ciudad. Las visitas del panel, la API,
los login, «Mi rincón» y las rutas con tokens (`/entradas/…`, `/avisos/confirmar|baja|sigo/…`,
`/propinas/<id>`) no se cuentan.

### Qué cuenta como visita

- Una página HTML pública que respondió 200 a un `GET`.
- Una navegación dentro del sitio (SvelteKit pide `<página>/__data.json`): cuenta como visita de esa
  página, una vez. Si el `__data.json` es de la misma página en la que ya está (recarga de datos
  después de un formulario), no cuenta.
- No cuentan: `HEAD`, `POST`, errores, archivos (imágenes, JS, CSS, RSS, `.ics`), prefetch del
  navegador y **bots conocidos** (lista conservadora en `src/lib/server/analytics/classify.js`:
  buscadores, previsualizadores de links de WhatsApp/Telegram/Facebook…, `curl`, navegadores
  automatizados, bots de IA; ante la duda, no cuenta).

### Embudo de compra, por evento

| Paso       | Qué es                                       | Dónde se anota                                  |
| ---------- | -------------------------------------------- | ----------------------------------------------- |
| `evento`   | visita a la página del evento                | visitas (worker)                                |
| `abrio`    | visita a la página de compra                 | visitas (worker)                                |
| `datos`    | llegó al paso «Tus datos»                    | navegador → `POST /api/visto`                   |
| `pagar`    | llegó al paso «Pagar»                        | navegador → `POST /api/visto`                   |
| `orden`    | se creó la orden (con el medio de pago)      | `buyAction` (checkout.js)                       |
| `aprobada` | se aprobó (Mercado Pago, gratis o transfer.) | `processPayment`, `buyAction`, confirmar trans. |

`/api/visto` acepta **solo** `{ "step": "datos" | "pagar", "slug": "<slug>" }` (cualquier otra
clave o valor da 400), solo desde el mismo sitio, sin cookies, y tiene un límite de 300 avisos por
minuto por isolate. Cada paso cuenta visitas, no personas: si alguien recarga, cuenta otra vez.

## Cómo está armado (para quien programa)

- `src/lib/server/analytics/classify.js`: bot, dispositivo, ruta, origen, país, evento (puras).
- `src/lib/server/analytics/track.js`: forma del punto, `pageViewPoint`, `trackPageView`,
  `trackFunnel`. Sin el binding `ANALYTICS` todo es un no-op (dev, tests, Previews).
- `worker/index.js`: anota la visita **después** de responder (sincrónico, no lee el cuerpo). Va
  acá y no en `hooks.server.js` porque el adapter sirve algunas páginas desde su caché sin pasar
  por los hooks.
- `src/routes/api/visto/+server.js` y `src/lib/utils/funnelBeacon.js`: los pasos 2 y 3.
- `src/lib/server/analytics/sql.js`: la API de SQL de Analytics Engine (con caché de 5 minutos).
- `src/lib/server/analytics/report.js`: lo que muestra el panel y el resumen mensual.
- `migrations/0038_analiticas_mensuales.sql`: tabla `analytics_monthly`.
- Panel: `src/lib/components/admin/stats/Visits.svelte` en
  `src/routes/(authed)/admin/estadisticas/`.

### Historia: resumen mensual en D1

Analytics Engine guarda el detalle unos **3 meses**. El cron nocturno (06:00 UTC, después del
backup y del chequeo de integridad) escribe en `analytics_monthly` el mes anterior y el mes en
curso: total de visitas, top 50 de páginas, orígenes y países, dispositivos y el embudo por evento.
Si falla o falta el token, lo escribe en el log y **nunca** hace fallar el backup.

El panel lee de Analytics Engine desde el **primer día del mes anterior** y de D1 los meses de
antes (sin superponerse). Si Analytics Engine no está configurado o falla, muestra lo que haya
en D1. Los días y meses son en **UTC** (una visita a las 22 h de Argentina cae en el día siguiente).

## Puesta en marcha (gorrite, en el panel de Cloudflare)

1. **Nada que crear para escribir.** El binding `ANALYTICS` (dataset `kinkyvibe_visitas`) está en
   `wrangler.toml`; el dataset se crea solo con la primera visita después del deploy de `main`.
   Los Previews no tienen el binding (no anotan nada).
2. **Migración**: `npm run db:migrate:remote` (aplica la 0038; también la de Previews con
   `npm run db:migrate:preview` si querés probar el panel ahí).
3. **Token para leer** (para el panel y el resumen mensual):
   - <https://dash.cloudflare.com/profile/api-tokens> → **Create Token** → **Create Custom Token**.
   - Nombre: por ejemplo `kinkyvibe-analiticas-lectura`.
   - Permisos: **Account** → **Account Analytics** → **Read**. Nada más.
   - Account Resources: solo la cuenta de kinkyvibe. Sin vencimiento o con uno largo (anotalo).
4. **Workers & Pages → kinkyvibe → Settings → Variables and Secrets**, en **Production**:
   - `CF_ANALYTICS_TOKEN` → **Secret** → el token del paso 3.
   - `CF_ACCOUNT_ID` → **Text** → el id de la cuenta (32 caracteres; está en la página de inicio de
     la cuenta, o con `npx wrangler whoami`). Copialo con el botón de copiar, no a mano.
5. Abrí **Panel → Estadísticas**: abajo aparece **Visitas al sitio**. Hasta que cargues el paso 4
   dice **«Falta configurar las visitas»** con lo que falta. Las visitas se anotan igual desde el
   deploy: no se pierde nada mientras tanto.

Si el panel dice que Cloudflare rechazó el token: revisá el permiso (Account Analytics: Read) y que
`CF_ACCOUNT_ID` sea el de la misma cuenta.

## Costos y límites (lo que se sabe)

Según la documentación de Cloudflare al escribir esto (verificalo en
<https://developers.cloudflare.com/analytics/analytics-engine/pricing/>):

- **Workers Free**: 100.000 puntos escritos por día y 10.000 consultas de lectura por día.
- **Workers Paid**: 10 millones de puntos por mes incluidos (después, unos US$ 0,25 por millón) y
  1 millón de consultas por mes incluidas (después, unos US$ 1 por millón).
- Retención: unos 3 meses (por eso el resumen mensual en D1).
- Con muchísimo tráfico, Analytics Engine **muestrea**; las consultas usan `SUM(_sample_interval)`
  para que los números sigan siendo estimaciones correctas.

Para kinkyvibe es un punto por visita más unos pocos por compra: muy lejos de los límites. El panel
hace 6 consultas cada vez que se abre (con caché de 5 minutos) y el cron, 12 por noche.

## Límites conocidos

- **Preload al pasar el mouse**: `src/app.html` tiene `data-sveltekit-preload-data="hover"`, así que
  pasar el mouse por un link en la compu ya pide el `__data.json`; si después no se hace clic,
  igual cuenta como visita. Puede inflar un poco las visitas desde compu. Si molesta, cambiar a
  `"tap"` (precarga al tocar o al apretar el botón del mouse) lo resuelve.
- Las páginas prerenderizadas de la wiki (`prerender = 'auto'`) se sirven como archivos estáticos y
  no pasan por el Worker: esas visitas no se cuentan.
- El iPad con iPadOS se presenta como una Mac: cuenta como compu.
- Se cuentan visitas, no personas (no hay forma de saber quién es quién, a propósito).

## Cómo apagarlo

- **Dejar de anotar**: borrar el bloque `[[analytics_engine_datasets]]` de `wrangler.toml` y
  deployar. El código sin el binding no hace nada.
- **Dejar de leer**: borrar `CF_ANALYTICS_TOKEN` (y revocar el token en Cloudflare). El panel vuelve
  a «Falta configurar» y el cron deja de escribir el resumen.
- **Borrar la historia**: `DELETE FROM analytics_monthly` en D1. Lo de Analytics Engine se borra
  solo a los ~3 meses.
