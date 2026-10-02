# Release 1: preparación y rendimiento

Dos partes: (1) qué tiene que estar prendido, importado o verificado **antes** de la revisión
grande de la interfaz, y (2) cómo rinden los endpoints que dejaron de prerenderizarse, con
recomendaciones chicas. Relevado el 2/10/2026 sobre `main` (después de #169). Nada de esto
cambia código: son tareas y propuestas para que gorrite decida.

## 1. Checklist de Release 1

### Orden

1. Backup manual y migraciones al día (abajo).
2. Variables y secretos de producción completos.
3. Mails, Mercado Pago y crons andando.
4. Interruptores, **siempre primero en un preview** y después en producción, en este orden:
   `cuentas` → `propinas` → `series` → `borrar_desde_panel` → `perfiles_publicos` →
   `personas_eventos` → `etiquetas_db` → `contenido_db`.
   - `personas_eventos` necesita `perfiles_publicos` (para que se vean los roles) y `cuentas` (para
     que les organizadores vean las respuestas).
   - `etiquetas_db` va **antes** que `contenido_db` (orden de 0026; los eventos de la base se
     limpian con el árbol en uso).
   - «Lo que sigo» (0025) **todavía no existe en `main`**: cuando llegue, va después de `cuentas`
     (lo necesita) y reemplaza el «Avisame si se repite» de `series`.

Cada interruptor tarda hasta 30 s en verse en todo el sitio (cada isolate recuerda el valor,
`FLAG_CACHE_MS`). La variable `<NOMBRE>_ENABLED` del panel de Cloudflare manda sobre el botón:
`1` lo fuerza prendido, `0` apagado.

### Antes de empezar

| Qué                                          | Cómo verificarlo                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Backup manual de la base                     | `POST /api/cron/backup` con `x-cron-secret` ([workers-migracion.md](workers-migracion.md), paso 6). Responde `d1/manual/…` y cuántas filas |
| Backup nocturno de anoche                    | R2 → `kinkyvibe-backups` → `d1/AAAA-MM-DD.sql.gz` de hoy. Worker → Settings → Trigger Events: corrida de las 06:00 UTC OK                  |
| Simulacro de restauración (de vez en cuando) | `npm run db:restore -- AAAA-MM-DD --local` (no toca Cloudflare)                                                                            |
| Time Travel disponible                       | `npx wrangler d1 time-travel info kinkyvibe` (anotar el bookmark antes de prender algo grande)                                             |
| Ningún interruptor forzado sin querer        | `/admin/ajustes/interruptores`: ninguna etiqueta «prendido por …=1» o «apagado por …=0» que no esperes                                     |

### Migraciones

El código de `main` espera **todas** las migraciones de `migrations/`: `0001` a `0031`. **No hay
`0028`, a propósito** (el número quedó para otro PR; lo explica `0029_etiquetas.sql`), así que no
falta nada. Las migraciones se aplican a producción **antes** del merge (decisión 0028), así que
deberían estar todas; esto es para confirmarlo.

| Qué                           | Comando                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| Pendientes en producción      | `npx wrangler d1 migrations list kinkyvibe --remote` → tiene que decir que no hay ninguna            |
| Pendientes en preview         | `npx wrangler d1 migrations list kinkyvibe-preview --remote` (aplicar: `npm run db:migrate:preview`) |
| Si falta alguna en producción | `npm run db:migrate:remote` (aplica solo las que faltan; gorrite)                                    |

Qué migración necesita cada interruptor:

| Interruptor          | Migraciones                            |
| -------------------- | -------------------------------------- |
| (la base misma)      | `0013` (`feature_flags`)               |
| `cuentas`            | `0013`, `0014`, `0015`                 |
| `perfiles_publicos`  | `0017`, `0023`, `0024`, `0025`, `0027` |
| `personas_eventos`   | `0018`, `0026`                         |
| `propinas`           | `0019`, `0022`                         |
| `series`             | `0020`                                 |
| `borrar_desde_panel` | `0021`                                 |
| `etiquetas_db`       | `0012`, `0029`                         |
| `contenido_db`       | `0012`, `0031`                         |

### Interruptores

Estado en producción visto desde afuera el 2/10 (solo `GET`): `/ingresar` y `/propinas` dan 200,
así que **`cuentas` y `propinas` parecen prendidos**. El resto, confirmarlo en
`/admin/ajustes/interruptores`.

| Interruptor          | Qué hace                                                                                         | Antes de prenderlo                                                                                                                                      | Cómo verificarlo                                                                                    | Volver atrás (apagarlo)                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `cuentas`            | «Ingresar» y «Mi rincón»: código por mail o contraseña, compras de cada mail                     | `RESEND_API_KEY`; en preview, tu mail en `EMAIL_ALLOWLIST`                                                                                              | `/ingresar` → pedir código → llega el mail → `/mi-rincon`                                           | `/ingresar` y `/mi-rincon` dan 404. Las cuentas y sesiones quedan en la base                                                |
| `propinas`           | Bloque de propina con MP al pie de lo de KinkyVibe; «Dejá una propina» en el pie                 | MP andando (abajo)                                                                                                                                      | Una publicación con la etiqueta KinkyVibe → propina de prueba en preview; `/admin/ajustes/propinas` | Vuelve la nota del cafecito y `/propinas` da 404. Las propinas quedan                                                       |
| `series`             | «Edición N de…», páginas de serie, «Avisame si se repite», `.ics` por etiqueta, Eventos → Series | Mails andando (doble confirmación) y el cron de recordatorios (manda los avisos)                                                                        | `/wiki/<serie>` muestra ediciones; `/ics/etiqueta/<serie>.ics` da 200; `/admin/eventos/series`      | Todo eso desaparece y las direcciones nuevas dan 404. Las suscripciones quedan                                              |
| `borrar_desde_panel` | Botón «Borrar» con confirmación, «Deshacer» y «Recuperar» en Actividad                           | Nada más                                                                                                                                                | Borrar y deshacer un evento de prueba en preview                                                    | El botón desaparece. **Lo ya borrado sigue borrado**: para recuperarlo, prenderlo de nuevo un momento                       |
| `perfiles_publicos`  | `/amigues` y los lugares desde la base, «Es mi perfil», privacidad de las direcciones en eventos | **Importar**: Perfiles → Importar y clasificar (`/admin/comunidad/perfiles/importar`); revisar «a confirmar»; cargar lugares (`/admin/eventos/lugares`) | `/amigues` igual que antes; un evento con lugar muestra lo que corresponde a su nivel               | `/amigues` y los eventos vuelven a los `.md`. Lo editado en perfiles queda en la base pero no se ve                         |
| `personas_eventos`   | Roles (Organiza, Facilita…) en eventos y material, y preguntas extra al comprar                  | `perfiles_publicos` y `cuentas` prendidos; roles y preguntas cargados (`/admin/eventos/roles`)                                                          | Un evento con rol muestra el perfil; una compra de prueba pide la pregunta                          | Las páginas y la compra vuelven a como eran. Las respuestas quedan en la base                                               |
| `etiquetas_db`       | El árbol de etiquetas sale de la base (todo el sitio y el panel); el editor guarda en la base    | **Importar**: Etiquetas → Importar a la base (`/admin/etiquetas/importar`, muestra antes qué va a pasar)                                                | `/wiki`, `/todo` y el buscador iguales que antes; editar una etiqueta en preview se ve enseguida    | Vuelve `hardcodedTags.js`. **Lo editado en la base no está en el archivo** (los renombres en los posts sí: hicieron commit) |
| `contenido_db`       | Eventos y material desde la base (páginas, `.ics`, búsqueda, RSS, sitemap, entradas, panel)      | `etiquetas_db` prendido; **importar** (Contenido → En la base, `/admin/contenido/base`); «Para revisar» vacío o entendido                               | La página cuenta cuántos coinciden con su `.md`; editar un evento en preview se ve sin deploy       | Vuelven los `.md`. **Lo editado en la base no está en los `.md`**: bajarlo antes con «Descargar todo» (`descargar.tar`)     |

Para cortar de golpe sin entrar al panel: la variable `<NOMBRE>_ENABLED=0` en Cloudflare (Worker →
Settings → Variables and Secrets). Después, borrarla para que vuelva a mandar el panel.

### Importadores

Todos son idempotentes (lo que no cambió no se toca; lo editado en el panel tampoco) y andan con
el interruptor apagado. **Primero en preview, después en producción**: cada entorno tiene su base.

| Qué                     | Dónde                                                                    | Local                             |
| ----------------------- | ------------------------------------------------------------------------ | --------------------------------- |
| Fichas de amigues       | `/admin/comunidad/perfiles/importar` (+ CSV de clasificación)            | `npm run amigues:import -- --dry` |
| Etiquetas y textos wiki | `/admin/etiquetas/importar`                                              | `npm run tags:import -- --dry`    |
| Eventos y material      | `/admin/contenido/base` → Importar (de a 40 por pedido, sigue sola; CSV) | —                                 |

Volver a importar después de cada deploy que cambie `.md` mientras el interruptor siga apagado.

### Variables y secretos (panel de Cloudflare)

Solo nombres; los valores nunca van al repo. Sacados del código (`$env/dynamic/private`,
`platform.env`). Detalle de cada una en [tickets.md](tickets.md) y
[workers-migracion.md](workers-migracion.md).

| Nombre                                                                                                                                                                                         | Tipo          | Producción                               | Previews              | Sin ella                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------- | --------------------- | --------------------------------------------- |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`                                                                                                                                                     | Text / Secret | Sí                                       | No hace falta (demo)  | No hay login de admin                         |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`                                                                                                                                                         | Secret        | Sí (cuenta real)                         | Sí (cuenta de prueba) | No se cobra; todos los webhooks dan 503       |
| `RESEND_API_KEY`                                                                                                                                                                               | Secret        | Sí                                       | Sí                    | No sale ningún mail (ni códigos de `cuentas`) |
| `CRON_SECRET`                                                                                                                                                                                  | Secret        | Sí                                       | Opcional              | No hay recordatorios ni backup manual         |
| `SITE_URL`                                                                                                                                                                                     | Text          | Sí                                       | **No**                | Se usa el origen del pedido                   |
| `EMAIL_ALLOWLIST`                                                                                                                                                                              | Secret        | **No**                                   | Sí                    | El preview no manda mails                     |
| `TICKETS_CLIENT_SALT`, `TICKETS_TRANSFER_INFO`                                                                                                                                                 | Secret        | Si se usan                               | Opcional              | Sal fija / datos de Ajustes de venta          |
| `TICKETS_FROM_EMAIL`, `TICKETS_REPLY_TO`, `TICKETS_CONTACT_EMAIL`, `TICKETS_TRANSFER_HOLD_HOURS`, `TICKETS_MP_FEE_PERCENT`, `FONDO_PERCENT_URL`                                                | Text          | Opcionales                               | Opcionales            | Valores por defecto                           |
| `CUENTAS_ENABLED`, `SERIES_ENABLED`, `BORRAR_DESDE_PANEL_ENABLED`, `PERFILES_PUBLICOS_ENABLED`, `PERSONAS_EVENTOS_ENABLED`, `PROPINAS_ENABLED`, `ETIQUETAS_DB_ENABLED`, `CONTENIDO_DB_ENABLED` | Text          | **Ausentes** (solo para cortar de golpe) | Ausentes              | Manda el panel                                |

Bindings (vienen de `wrangler.toml`, no del panel): `DB` (D1) y `BACKUPS` (R2, solo producción).
`WORKERS_CI_BRANCH` la pone Workers Builds sola. En un preview, `GET /api/preview-status` dice qué
está configurado.

### Mails, Mercado Pago y crons

| Qué                                | Qué tiene que estar                                                                                                                   | Cómo verificarlo                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Resend                             | Dominio `kinkyvibe.ar` verificado (SPF/DKIM en Cloudflare DNS); remitente en Ajustes de venta                                         | `/admin/ajustes/mails` → «Mandarme una prueba»; Resend → Logs                                                        |
| Mercado Pago (entradas y propinas) | Credenciales de la cuenta real en producción; webhook de la aplicación a `https://kinkyvibe.ar/api/mercadopago/webhook`, evento Pagos | MP → Webhooks → «Simular» → 200; `/admin/ajustes/cobros`; una compra chica real o en preview con la cuenta de prueba |
| Cron de recordatorios              | `*/15 * * * *` en `wrangler.toml`, `CRON_SECRET` cargado                                                                              | Worker → Settings → Trigger Events: corridas OK cada 15 min                                                          |
| Cron de backup e integridad        | `0 6 * * *` (03:00 en Argentina)                                                                                                      | Archivo del día en R2; «Para revisar» del Inicio del panel muestra el chequeo de objetos                             |
| Worker viejo del cron              | `kinkyvibe-cron` borrado (paso 10 de [workers-migracion.md](workers-migracion.md))                                                    | Workers & Pages: no aparece                                                                                          |

### Backups y vuelta atrás

- **Base entera**: backup nocturno en R2 (30 días, mensual 12 meses, anual para siempre) y Time
  Travel de D1 (30 días). Restaurar: [workers-migracion.md](workers-migracion.md#restaurar-un-backup).
- **Contenido de la base** (con `contenido_db`): «Descargar todo» en `/admin/contenido/base` baja
  eventos y material como `.md` en un `.tar`. Bajarlo **antes de apagar** el interruptor y cada
  tanto mientras esté prendido.
- **Etiquetas de la base** (con `etiquetas_db`): no hay «Descargar». Lo que cubre es el backup de
  la base. Si se apaga, conviene pasar a mano al archivo los cambios hechos en la base.
- **CSV** que sirven de respaldo: actividad, propinas, clasificación de perfiles, órdenes de cada
  evento, ediciones de series, importación de contenido.

## 2. Rendimiento de los endpoints dinámicos

### Cuáles son

`/calendario.ics`, `/api/posts` y `/api/search-index.json` tienen `prerender = false`; `/rss` y
`/sitemap.xml` también se arman en cada pedido (dejaron de prerenderizarse con `contenido_db`). Otros
públicos dinámicos con el mismo costo: `/ics/etiqueta/<etiqueta>.ics` (con `series`) y
`/api/series/<etiqueta>` (`private, no-store`). Las páginas HTML ya eran dinámicas (no hay
`prerender` global; solo `/wiki/<término>` es `'auto'`).

### Medición (producción, 2/10/2026, solo `GET`)

Medido con `curl -s -o /dev/null -w '%{size_download} %{time_total}'`, 3 pedidos sin comprimir y 1
pidiendo `gzip, br`. Ojo: las mediciones pasan por un proxy; un archivo estático (`/robots.txt`)
tardó 0,37 s, así que los tiempos sirven para comparar entre sí, no como números absolutos.

| Endpoint                 | Tamaño     | Comprimido         | Tiempo hasta el primer byte | `cache-control`                     | `etag` | ¿Lo guarda la CDN? |
| ------------------------ | ---------- | ------------------ | --------------------------- | ----------------------------------- | ------ | ------------------ |
| `/calendario.ics`        | **509 KB** | **no se comprime** | 0,38–1,31 s                 | `public, max-age=300, s-maxage=300` | no     | no                 |
| `/api/posts`             | 476 KB     | 55 KB              | 0,19–1,01 s                 | `public, max-age=300, s-maxage=300` | no     | no                 |
| `/api/search-index.json` | 522 KB     | 88 KB              | 0,16–0,82 s                 | `public, max-age=300, s-maxage=300` | no     | no                 |
| `/rss`                   | 19 KB      | 2,6 KB             | 0,15–0,78 s                 | `max-age=0, s-maxage=3600`          | no     | no                 |
| `/sitemap.xml`           | 98 KB      | 6,6 KB             | 0,16–0,85 s                 | `max-age=0, s-maxage=3600`          | no     | no                 |

- `/calendario.ics` trae **481 eventos** (desde junio de 2023) y sale **sin comprimir** aunque el
  cliente lo pida: Cloudflare no comprime `text/calendar` por defecto. Los JSON y XML sí salen
  comprimidos.
- Ninguna respuesta trae `cf-cache-status`: **`s-maxage` no hace nada acá**. El sitio es un Worker
  en un Custom Domain y la CDN no guarda lo que responde un Worker; para eso hay que usar la Cache
  API (`caches.default`) desde el Worker. Hoy cada pedido lo arma el Worker de cero (salvo lo que
  recuerda el isolate, abajo).
- Los tiempos más altos (≈1 s) coinciden con el primer pedido: probablemente un isolate nuevo, que
  tiene que cargar y procesar ~600 `.md` compilados (`fetchMarkdownPosts`, en serie) antes de
  responder.

### Qué lee cada uno

Lo común a todo pedido (`hooks.server.js`): el interruptor `etiquetas_db` y, si está prendido, el
árbol de la base. Los interruptores y el árbol se recuerdan 30 s por isolate, así que cuestan
**1 consulta cada 30 s para todos los interruptores juntos** (antes, una por interruptor), no por
pedido. Sin cookie no se consulta nada más.

| Endpoint                 | Del bundle                                                         | D1 con todo apagado    | Con `perfiles_publicos`                                           | Con `contenido_db`                                                             | Qué se recuerda en el isolate                                                |
| ------------------------ | ------------------------------------------------------------------ | ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `/calendario.ics`        | glob de `calendario`, `amigues`, `material` (`fetchMarkdownPosts`) | 0                      | **+1 + hasta 3 por evento con lugar, en serie** (N+1)             | +1 por pedido (la «marca» de la base); +2 cuando cambió algo, y reprocesa todo | La lista de posts. El `.ics` se arma cada vez                                |
| `/api/posts`             | igual                                                              | 0                      | igual que el `.ics` (`withVenuePlaces`)                           | igual                                                                          | La lista. El JSON se serializa cada vez                                      |
| `/api/search-index.json` | igual + wiki + **el texto crudo de cada `.md`** (`?raw`)           | 0                      | +1 por pedido (la «marca» de los perfiles); +2 cuando cambió algo | +1 por pedido (la «marca» de la base); +1 (los cuerpos) cuando cambió algo     | El índice ya como JSON, por (árbol, marcas de la base, interruptor `series`) |
| `/rss`                   | glob de posts                                                      | 0                      | —                                                                 | +1                                                                             | La lista. El XML se arma cada vez                                            |
| `/sitemap.xml`           | glob de posts + wiki                                               | 0                      | —                                                                 | +1                                                                             | La lista. El XML se arma cada vez                                            |
| `/ics/etiqueta/…`        | glob de posts                                                      | 1 cada 30 s (`series`) | igual que el `.ics`, solo para los eventos de la etiqueta         | +1                                                                             | La lista                                                                     |

El N+1 está en `feedVenues` (`src/lib/server/amigues/venues.js`): lee **todas** las filas de
`event_venues` y, por cada evento con lugar, hace en serie `eventVenue` (1 consulta), `getObject`
(1) e `isApproved` (1). Con 30 eventos con lugar son ~91 consultas una detrás de otra en cada
pedido a `/calendario.ics` y a `/api/posts`.

**Arreglado** (PR «Sitio público rápido con contenido en la base»): `feedVenues` lee los vínculos
de los eventos pedidos y sus lugares en un solo `batch` (una vuelta a la base, con 5 o con 500
eventos) y decide igual que la página del evento (`linkedVenueView`). Arregla también la página de
cada lugar (~240 consultas con ~80 eventos), las listas, los relacionados y `/api/posts`.

### Recomendaciones (de más a menos impacto)

No están implementadas. Cada una es un PR chico aparte.

| #   | Qué                                                                                                                                                                                                                                                      | Por qué                                                                                                                                                                         | Esfuerzo                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | **Comprimir `/calendario.ics`**: una Compression Rule en la zona (Rules → Compression Rules) que sume `text/calendar`, o comprimirlo en el Worker (`CompressionStream` + `content-encoding`)                                                             | 509 KB a ~50–60 KB (los otros comprimen 8–15 veces). Lo piden los calendarios suscriptos una y otra vez                                                                         | XS (regla: 10 min, sin código) |
| 2   | **Cache API** para los 5 endpoints públicos: un helper que busque en `caches.default`, y si no está, arme la respuesta y la guarde con `ctx.waitUntil` (clave = URL; con `contenido_db`, sumar la «marca» de la base para que un cambio se vea al toque) | Hoy el Worker arma todo en cada pedido y `s-maxage` no sirve. Saca CPU y consultas a D1 de casi todos los pedidos                                                               | S (medio día, con pruebas)     |
| 3   | **`stale-while-revalidate`** y algo de caché en el navegador para RSS y sitemap: `public, max-age=900, stale-while-revalidate=86400` (hoy `max-age=0`); sumar `stale-while-revalidate` a `TAGGED_CACHE`                                                  | Los lectores de RSS y los buscadores vuelven a pedir; con SWR nadie espera mientras se rearma (sirve con la nº 2)                                                               | XS                             |
| 4   | **(Hecho)** **Sacar el N+1 de `feedVenues`**: una sola consulta con `JOIN` (`event_venues`, `objects`, `profile_sources`, `profile_approvals`) filtrando por los slugs pedidos, y aplicar `effectivePrivacy`/`venueView` en memoria                      | Con `perfiles_publicos` prendido, `.ics` y `/api/posts` pasan de 1 + 3·N consultas en serie a 1. Código de privacidad: la prueba de filtraciones tiene que seguir pasando igual | S–M                            |
| 5   | **(Hecho)** **Recordar el índice de búsqueda con `contenido_db`**: guardarlo por (árbol, «marca» de la base) en vez de rearmarlo en cada pedido                                                                                                          | Hoy, prendido, cada apertura del buscador rearma ~600 textos                                                                                                                    | S                              |
| 6   | **Recordar el cuerpo armado** (`.ics`, RSS, sitemap, JSON de `/api/posts`) por (árbol, «marca», lugares) en el isolate                                                                                                                                   | Evita rearmar 500 KB de texto por pedido si la nº 2 no alcanza (la Cache API es por ciudad de Cloudflare)                                                                       | S                              |
| 7   | **`ETag` débil** (hash del cuerpo) y `304` con `If-None-Match`                                                                                                                                                                                           | Ahorra la descarga a quien vuelve a pedir lo mismo (calendarios, buscador)                                                                                                      | S                              |
| 8   | **Acortar `/calendario.ics`** (por ejemplo, los últimos 12 meses y todo lo que viene)                                                                                                                                                                    | 481 eventos desde 2023; los calendarios casi nunca miran tan atrás. **Decisión de gorrite**: cambia lo que ve quien está suscripte                                              | XS de código                   |

### Arreglos chicos propuestos (PRs aparte)

- **`/calendario.ics` sin `charset`**: manda `Content-Type: text/calendar`, mientras
  `/ics/etiqueta/…` usa `icsResponse` con `text/calendar; charset=utf-8`. Algún cliente puede
  mostrar mal las tildes. Arreglo de una línea (mantener `TAGGED_CACHE`).
- **Docs desactualizadas**: [etiquetas.md](etiquetas.md) dice que RSS y sitemap «siguen
  prerenderizados» (ya no); [mails.md](mails.md) y [tickets.md](tickets.md) todavía hablan del
  Worker aparte `kinkyvibe-cron` (ahora los crons son del propio Worker); el comentario de
  `src/lib/server/etiquetas/cache.js` dice «en la CDN», y la CDN no guarda respuestas del Worker.
- **Recordatorio**: el ítem de disculpas del RSS (`FEED_ONLY_ITEMS`) sale solo el 27/10, pero el
  código queda; borrarlo después.
