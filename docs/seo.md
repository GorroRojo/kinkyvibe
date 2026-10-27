# SEO, datos estructurados y estándares web

Qué le cuenta el sitio a buscadores, asistentes y lectores de feeds, además de lo que ve la gente:
datos estructurados (JSON-LD), microformats, `rel="me"`, feeds, `security.txt`, tarjetas de
contacto, `robots.txt` y el sitemap. Al final, la auditoría de octubre de 2026 con los números.

La vista previa al compartir (Open Graph, Twitter, títulos y descripciones, canónicas) es de otra
guía: `compartir.md` (llega con el PR #257).

## Lo que nunca se rompe

- **Solo lo que la página ya muestra.** Ningún dato estructurado, microformat ni vCard agrega
  algo que la página no le muestre a cualquiera: el lugar llega filtrado por su nivel de
  privacidad ([amigues.md](amigues.md)) y del perfil sale solo el contacto público (decisión
  0023). Un lugar oculto no tiene dirección en ningún lado (un evento suyo puede decir la
  ciudad de su etiqueta de región, que la página ya muestra; nunca la del lugar).
- **Bots de IA: los que entrenan modelos no entran; los de búsqueda y respuesta, sí** (decisión de
  gorrite, octubre de 2026). Ver «robots.txt y bots de IA» abajo.
- `security.txt` y los datos estructurados usan el contacto general de la organización (`ORG_CONTACT_EMAIL`, `src/lib/utils/organization.js`), nunca uno
  personal.

## Dónde está

| Qué                                    | Dónde                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| JSON-LD (todos los tipos)              | `src/lib/utils/jsonLd.js`; cada página lo pone con `<LDTag>`                    |
| Redes oficiales (`sameAs`, `rel="me"`) | `OFFICIAL_PROFILES` en `jsonLd.js` y el pie (`Footer.svelte`)                   |
| vCard de perfiles                      | `src/lib/utils/vcard.js`, `/amigues/<perfil>/contacto.vcf`                      |
| `security.txt`                         | `src/lib/utils/securityTxt.js`, `/.well-known/security.txt`                     |
| `robots.txt`                           | `static/robots.txt` (lo cuida `src/lib/utils/robots.test.js`)                   |
| Feeds Atom y JSON Feed                 | `src/lib/utils/feeds.js` (el texto), `src/lib/server/feeds.js` (las respuestas) |
| Sitemap                                | `src/routes/(content)/sitemap.xml/` (sin `redirect` ni perfiles `noindex`)      |
| La dirección del sitio                 | `SITE_URL` y `siteOriginFrom` en `src/lib/utils/site.js` (un solo lugar)        |
| Un evento en una línea                 | `eventLead` en `src/lib/utils/eventText.js` (vista previa y feeds)              |
| «Próximo» (empieza después de ahora)   | `startsAfter` en `src/lib/utils/dates.js`                                       |

### JSON-LD por página

| Página             | Tipo                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Inicio             | `WebSite` (nombre y `alternateName`) y `Organization` (logo, contacto público, redes)    |
| Evento             | `Event`: estado, modo (presencial u online), lugar según privacidad, `offers`, organizer |
| Material           | `Article` (+ `DigitalDocument` si es descargable); `CreativeWork` si es interactivo      |
| `/wiki`            | `DefinedTermSet` (la Kinkipedia)                                                         |
| Entrada de la wiki | `DefinedTerm` con `inDefinedTermSet` (también una etiqueta sin entrada con descripción)  |
| Serie              | `EventSeries` con `subEvent` (sin lugar); cada edición la nombra en `superEvent`         |
| Perfil             | `ProfilePage` con `Person` (persona), `Organization` (proyecto) o `Place` (lugar)        |

El perfil de KinkyVibe (`/amigues/KinkyVibe`, por su dirección) lleva el `@id` de la organización
de la portada (`ORGANIZATION_ID`): es la misma entidad. Todas las páginas dicen `inLanguage`
`es-AR`, como `<html lang>`.

Les autores (`organizer` de un evento, `author` del material): KinkyVibe es la organización; quien
tiene un perfil **listado y público** lleva su `url` (y el `@id` de su perfil; un lugar va como
`Organization` sin `@id`). La lista sale de `sitePosts` (lo que ve cualquiera sin sesión,
`authorLinksFrom` en `jsonLd.js`), nunca de lo que ve quien mira con sesión: un perfil oculto o no
listado queda solo con el nombre.

`offers` de un evento: con venta en el sitio, el precio «desde» en ARS, la disponibilidad
(`InStock`, `SoldOut`, `PreOrder` con `validFrom`) y el link a `/entradas`; sin venta, el link de
inscripción (precio 0 si tiene la etiqueta `gratis`; disponibilidad según el «Estado»: abierto →
`InStock`, agotadas → `SoldOut`, anunciado o sin estado → no se dice). Cancelado o pasado: sin
oferta.

`location` de un evento presencial: un `Place` con la dirección estructurada
(`venuePostalAddress`, la misma del perfil del lugar) solo en los niveles que la muestran, y el
link al lugar (`url`, `@id`) solo en «Nombre + dirección» y «Sólo Nombre». Si falta la dirección,
la ciudad o el país de la etiqueta de región (`regionAddress`: AMBA → Buenos Aires, Córdoba,
Rosario, La Plata, Montevideo…), para que Google Eventos lo pueda ubicar; con el lugar oculto, el
`Place` va sin nombre. El nombre del lugar nunca es el título del evento. Detalle y pruebas por
nivel: [amigues.md](amigues.md).

### Fechas legibles por máquina

Las fechas de publicación se guardan como `2024-12-06Z-03:00`, que **no es ISO 8601** (mezcla `Z`
y un desfase, y no todos los motores de JS la leen). Nunca se imprimen tal cual en un atributo: los helpers
de `src/lib/utils/dates.js` las convierten.

| Dónde                                                       | Helper        | Ejemplo                     |
| ----------------------------------------------------------- | ------------- | --------------------------- |
| `article:published_time` / `article:modified_time` (OG)     | `isoDateTime` | `2024-12-06T00:00:00-03:00` |
| JSON-LD (`datePublished`, `startDate`, `endDate`...)        | `isoDate`     | `2024-12-06T00:00:00-03:00` |
| `<time datetime>` de una fecha de publicación (solo el día) | `isoDay`      | `2024-12-06`                |
| `<time datetime>` de un evento (ya viene con hora y zona)   | tal cual      | `2026-10-02T22:00-03:00`    |
| Sitemap y feeds (`lastmod`, `published`, `updated`)         | `Date`        | `2024-12-06T03:00:00.000Z`  |

Para leer una fecha del sitio igual en cualquier motor de JS: `parseSiteDate`. Lee cada forma
guardada campo por campo, sin pasar por `Date.parse` (V8 entiende `2024-12-06Z-03:00`, Safari no):
`2024-12-06Z-03:00`, `2024-12-06`, `2026-10-02T22:00-03:00` (con o sin segundos, con espacio en vez
de `T`, hora de un dígito, `Z` o `-0300`). Sin desfase, es hora de Argentina. Todos los formateadores
de `dates.js` (`toArgentina`, `argDate*`, `eventEnd`) leen con él; en el resto del código, una fecha
guardada (`start`, `end`, `published_date`, `updated_date`, `opening_date`) se lee con
`parseSiteDate`, nunca con `new Date(texto)`.

### Feeds

| Feed                       | Atom                         | JSON Feed                    |
| -------------------------- | ---------------------------- | ---------------------------- |
| Eventos                    | `/calendario/feed.atom`      | `/calendario/feed.json`      |
| Material                   | `/material/feed.atom`        | `/material/feed.json`        |
| Una etiqueta (y sus hijas) | `/wiki/<etiqueta>/feed.atom` | `/wiki/<etiqueta>/feed.json` |

Las 50 publicaciones más nuevas (por fecha de publicación), sin las que redirigen a otro sitio.
Del evento va la fecha en el resumen (y «Cancelado» si lo está), **nunca el lugar**: así no hay
que repetir las reglas de privacidad. Cada página los anuncia con `<link rel="alternate">`
(`FeedLinks.svelte`); el feed de una etiqueta sin eventos ni material da 404. El inicio también
anuncia los del calendario, y `/calendario` además su `.ics` (`type="text/calendar"`, prop `ics`).

**El RSS de siempre** (`/rss`, anunciado en `app.html`; `src/routes/rss/rss.js`) usa los mismos
helpers (`feedEntry`, `feedPosts`, `escapeXml`): los 30 eventos y los 20 materiales más nuevos (así
los eventos cargados en tanda no tapan el material), con la descripción del Atom (del evento, la
fecha adelante; nunca el lugar), `dc:creator`, `category`, `language` y `lastBuildDate` (la fecha
de la entrada más nueva, no «ahora»). Sin redirecciones ni imagen. El aviso temporal
(`FEED_ONLY_ITEMS`) se va el 27/10 (ítem `rss-aviso-sacar`).

**Los calendarios `.ics` públicos** (`/calendario.ics` y `/ics/etiqueta/<etiqueta>.ics`) llevan de
los pasados solo los que terminaron en los últimos 90 días (`publicIcsSince` en
`src/lib/utils/icsFeed.js`; antes eran ~500 eventos desde 2023, más de 500 KB que cada calendario
suscripto baja cada hora). **Cambia lo que ve quien está suscripte**: los calendarios suscriptos
copian el archivo, así que los eventos de hace más de 90 días dejan de verse ahí (siguen en el
sitio). Para cambiar el plazo: `PUBLIC_ICS_PAST_DAYS`. El personal (`/ics/mio/…`) sigue con todo.
Todos dicen cada cuánto volver a bajarlos: `X-PUBLISHED-TTL` (Outlook) y `REFRESH-INTERVAL` (RFC
7986), una hora. El `ORGANIZER` lleva el mail del perfil de quien organiza si lo tiene y si no (los
de Kinky Vibe siempre) el contacto público `kinkyvibe.talleres@gmail.com` (`DEFAULT_CONTACT_EMAIL`
de `src/lib/utils/tickets.js`; gorrite, 26/10). Antes caía a otra casilla.

### Sitemap

`/sitemap.xml` (`src/routes/(content)/sitemap.xml/`): la raíz una sola vez (`/`), las listas
`/calendario`, `/material`, `/amigues` y `/wiki`, las publicaciones listadas (sin las que
redirigen ni los perfiles de persona con «No aparecer en buscadores»: `inSitemap`, ver
[amigues.md](amigues.md)) y las entradas de la wiki. Sin `<priority>` (Google la ignora). `lastmod` solo cuando
se conoce: el de una publicación es su `updated_date` o `published_date`; el de una lista, la fecha
más nueva de lo que lista; `/` y `/wiki` van sin. Nunca la hora del pedido: si el `lastmod`
cambia en cada visita, Google deja de creerle.

- **`/todo` no está y lleva `noindex`** (sin `nofollow`): junta las otras tres listas y competía con ellas;
  los buscadores siguen sus links pero no la guardan.
- **`/login` lleva `noindex`** (meta y cabecera `X-Robots-Tag`): está enlazada desde el pie. No
  va en `robots.txt` con `Disallow`, porque así el buscador no podría leer el `noindex`.

### Migas de pan

«Inicio › sección» y su `BreadcrumbList` salen en las páginas de una publicación (evento,
material, perfil, entrada o etiqueta de la Kinkipedia). La sección sale de la ruta
(`sectionFromRouteId($page.route.id)` en `src/lib/utils/navigation.js`, que usa
`(content)/+layout.svelte`), así ya están en el HTML del servidor. Antes las ponía un store que la
página llenaba después de que el layout se armaba: en el servidor no salían, y el store era estado
compartido entre pedidos. Los stores de `src/lib/utils/stores.js` son de módulo: un componente no
los escribe al armarse (`src/lib/utils/stores-ssr.test.js` lo cuida, con la lista de los que ya
estaban).

### robots.txt y bots de IA

`static/robots.txt` tiene dos grupos. El de todos (`*`) deja afuera solo `/auch`. El segundo pone
`Disallow: /` para los bots que juntan textos para entrenar modelos de IA: `GPTBot` (OpenAI),
`ClaudeBot` (Anthropic), `Google-Extended` (Gemini; no toca Google Search), `Applebot-Extended`,
`CCBot` (Common Crawl), `Bytespider` (ByteDance), `meta-externalagent` (Meta) y
`cohere-training-data-crawler`. Los que buscan o responden en el momento siguen entrando como
todos, sin grupo propio: `Googlebot`, `Bingbot`, `OAI-SearchBot` y `ChatGPT-User` (ChatGPT),
`PerplexityBot` y `Perplexity-User`, `Claude-SearchBot` y `Claude-User`. Así el sitio puede
aparecer (con link) en las respuestas de ChatGPT, Perplexity, Claude y Google sin que sus textos
entren a un entrenamiento. Lo cuida `robots.test.js`; para sumar uno nuevo, a las dos listas.

`robots.txt` es un pedido, no una barrera: algunos bots (Bytespider, por ejemplo) no le hacen caso.
**Paso opcional en el panel de Cloudflare (gorrite)**: el ajuste para bloquear bots de IA
(«Block AI bots», en Security › Bots o en AI Crawl Control, según cómo lo muestre el panel)
los frena en la red, también a los que no leen `robots.txt`. Antes de prenderlo, revisar en esa
pantalla que deje pasar a los de búsqueda y respuesta de arriba; si no se puede elegir, dejarlo
apagado (alcanza `robots.txt`). La misma pantalla muestra qué bots de IA pasan.

### Chips de etiqueta

En las páginas de detalle (evento, material, perfil), el chip de una etiqueta que tiene página de
la wiki o descripción lleva a su página de la Kinkipedia (`/wiki/<etiqueta>`, `tagPagePath`); los
demás siguen filtrando `/todo?tags=` (su página de la wiki sería genérica, y la canónica de
`/todo?tags=…` es `/todo`). El chip se ve igual; solo cambia adónde lleva. Cuáles se decide en el
servidor (`wikiLinkedTags` en `src/lib/server/wiki/site.js`, prop `wikiTags` de `Tags.svelte`):
el árbol que llega al navegador no trae las descripciones y el link no puede cambiar al hidratar.
Las tarjetas de las listas y el editor no pasan `wikiTags`: sus chips no cambian (adentro de una
tarjeta, que ya es un link, no van links nuevos).

### Autoría y contacto

- El pie de todas las páginas públicas, en «Sobre nosotres», lleva «Quiénes somos» (el perfil de
  Kinky Vibe, `ORG_PROFILE_PATH` en `src/lib/utils/organization.js`) y «Contacto» (un mail a la
  casilla pública, `DEFAULT_CONTACT_EMAIL` de `src/lib/utils/tickets.js`; `contactLink` en
  `src/lib/utils/footer.js`).
- Material: «· actualizado el <fecha>» (`<time class="dt-updated">`) junto a la fecha de
  publicación, solo si la actualización es de un día posterior (`updatedDay`,
  `src/lib/utils/autoria.js`). `article:author` va una vez por autore: la dirección de su perfil
  si la página lo enlaza (los perfiles que quien mira puede ver), si no su nombre
  (`articleAuthors`).

### Microformats

`h-event` en eventos, `h-entry` en material y wiki, `h-card` en el encabezado de cada perfil (con
`u-url`, `p-note`, `u-email`, `p-tel` en elementos `<data hidden>`), `h-card` de Kinky Vibe en el
inicio y en las tarjetas de las listas.

La `h-card` del inicio es la que lee Bridgy Fed (el puente a Mastodon y Bluesky) para el perfil
de kinkyvibe.ar: su foto (`u-photo`) es `/android-chrome-512x512.png`, una dirección que no
cambia con cada deploy (antes era el logo del build, con un hash que cambiaba y daba 404).
Después de cambiarla, alguien con acceso tiene que tocar «Update profile» en fed.brid.gy.

### Manifest y perfiles

- `static/site.webmanifest`: nombre «Kinky Vibe», descripción (`SITE_TAGLINE`), `lang` `es-AR`,
  `id` `/` y `theme_color` igual al `theme-color` de las páginas, en hex (lo cuida
  `webmanifest.test.js`).
- Íconos: los dos de siempre (`android-chrome-192x192.png` y `-512x512.png`, sin `purpose`, o sea
  `any`) y uno aparte con `"purpose": "maskable"`: `static/maskable-512x512.png`. Android recorta
  los `maskable` con la forma que elige cada teléfono y lo único que nunca corta es el círculo
  central de 80 % del lado; el de siempre (un círculo con las esquinas transparentes) quedaba
  recortado o sobre un fondo blanco. Es el mismo ícono achicado al 80 %, sobre un cuadrado lleno
  del rosa de su círculo (`#ff48c4`, leído del ícono), sin transparencia. Se hace con
  `node scripts/icono-maskable.js` (sharp; da siempre el mismo PNG y falla si las letras salen de
  la zona segura) y se commitea. Si cambia el logo, se regeneran los dos.
- Un perfil es `og:type` `profile`: sin etiquetas `article:*`. En el material,
  `article:modified_time` va solo si tiene fecha de actualización.
- La foto del encabezado de un perfil dice «Foto de perfil de X» (los nombres de archivo son
  hashes: el texto alternativo es lo único que lee Google Imágenes).

### Kinkipedia: 404 y canónica

- `/wiki/<término>` da **404** (la página de error, con `noindex` y su `<h1>`) cuando el término no
  es ninguna etiqueta del árbol ni una página de la wiki. Antes era una página casi vacía con 200,
  que los buscadores marcan como «soft 404». Solo con el árbol leído de la base: sin base (o si
  falla la lectura) el árbol de respaldo está vacío y la wiki no se vuelve 404 entera.
- Una etiqueta que existe sigue teniendo su página aunque no tenga texto ni descripción.
- **Canónica**: la forma slug de la etiqueta (`tagPagePath`, la misma que el sitemap y los links),
  igual para todas las formas que llevan a ella: `/wiki/bdsm`, `/wiki/Bdsm` y `/wiki/BDSM` →
  `/wiki/BDSM`; un alias → la de su etiqueta. Código: `siteWikiEntry` en
  `src/lib/server/wiki/site.js` (`known`, `fromDb`, `canonicalPath`).

### Un solo host: www → apex

`www.kinkyvibe.ar` redirige a `https://kinkyvibe.ar` con el mismo camino y la misma query (301
para GET y HEAD, 308 para lo demás). La capa que importa es la regla de Cloudflare (Rules →
Redirect Rules, plantilla «Redirect from WWW to Root»; la carga gorrite en el panel). Como red, el
primer paso de `handle` (`src/hooks.server.js`) hace lo mismo con `wwwRedirectResponse`
(`src/lib/server/canonicalHost.js`): solo con el host `www.` exacto, así que el apex, los Previews
y localhost no cambian y no hay bucles. Las canónicas siguen saliendo del origen del pedido (los
Previews y `seo.test.js` lo esperan).

### IndexNow

Cada 15 minutos, el cron de recordatorios (`/api/cron/recordatorios`) avisa por IndexNow
(`api.indexnow.org`: Bing, Yandex, Seznam y los que lo usan) las páginas públicas que cambiaron en
los últimos 30 minutos (`src/lib/server/seo/indexnow.js`). Repetir una URL no hace daño; si una
corrida falla, la siguiente la cubre.

- **Apagado hasta que esté la clave**: el secret `INDEXNOW_KEY` del Worker (8 a 128 letras, números
  o guiones; inventarla con `openssl rand -hex 16`). Sin clave válida no hace nada y
  `/indexnow-key.txt` da 404; con clave, esa dirección la sirve (IndexNow la lee para confirmar que
  el aviso es del sitio; es pública por diseño). Tampoco avisa fuera de producción (origen distinto
  de `https://kinkyvibe.ar`).
- **Privacidad**: de la base salen solo candidatos (objetos con `updated_at` reciente); se avisan
  únicamente los que están en la lista pública del sitemap (`sitePosts` y la Kinkipedia, sin los
  que redirigen ni los perfiles con «No aparecer en buscadores», la misma regla `inSitemap`). Lo oculto, lo de miembres, lo no listado y lo borrado no está en esa lista, así
  que nunca se avisa, tampoco al pasar algo a oculto.
- Dónde verlo: el resultado sale en la respuesta del cron (`indexNow: { sent, status }`, en
  Observability → Logs, `recordatorios:`) y en Bing Webmaster Tools → IndexNow.

## Velocidad (PageSpeed, 12/10/2026)

La línea de base, medida por gorrite con [PageSpeed Insights](https://pagespeed.web.dev/) en el
inicio (una sola corrida de Lighthouse; varía ±5–10 puntos: para comparar, tres corridas y la
mediana). No hay datos de personas reales (el sitio tiene poco tráfico para el informe de Chrome).

| Inicio     | Puntaje | FCP   | LCP   | TBT    | CLS   | Peso     |
| ---------- | ------- | ----- | ----- | ------ | ----- | -------- |
| Celu       | 81      | 2,0 s | 4,1 s | 80 ms  | 0,002 | 3907 KiB |
| Computador | 88      | 0,4 s | 1,4 s | 170 ms | 0,001 | —        |

- **El LCP es la imagen de la primera tarjeta de eventos**, y arrancaba a bajarse ~2 s tarde
  porque todas las tarjetas tenían `loading="lazy"` (el navegador espera al layout). Ahora la
  primera fila del inicio carga sus primeras 4 imágenes enseguida y la primera con
  `fetchpriority="high"` (`eager` en `CardRow.svelte` y `Card.svelte`); las demás siguen `lazy`.
- **Las imágenes de las tarjetas eran de tamaño completo** (hasta 2000 px; una de 1,6 MB) para
  tarjetas de 420 × 420: ~3,1 MB de los 3,9 MB. Ahora (`tarjetas-imagen-chica`) cada imagen tiene
  dos copias WEBP chicas (lado corto de 360 y 720 px) hechas **al subirla** (en el navegador, como
  la de 2000 px) y una pasada única por las que ya están (`scripts/copias-chicas.js`, la corre
  gorrite); las tarjetas, las listas y el encabezado de un perfil las piden con `srcset`
  ([imagenes.md](imagenes.md), «Copias chicas para las tarjetas»). No usa el cupo de
  transformaciones de Cloudflare (5000 por mes; ver «Imágenes y WhatsApp» en
  [compartir.md](compartir.md)). Cuentas con las imágenes reales (25/10, todas las imágenes de
  tarjetas y listas de la página, como si se vieran todas; copias hechas con el mismo script):
  inicio 6159 KiB → 688 KiB (1×) / 1166 KiB (2× y 3×); `/calendario` 4019 KiB → 194 / 379 KiB; la
  imagen de la primera tarjeta, 128 KiB → 21 / 57 KiB. Hasta que corra la pasada, las imágenes
  viejas se ven igual (la copia que falta redirige al original).
- **En `/calendario`** la imagen de la primera tarjeta también es el LCP: sus dos primeras tarjetas
  cargan enseguida (`eager={2}`) y la prioridad va a la primera tarjeta **con** imagen (en todas
  las filas con `eager`, también la del inicio).
- **En la página de un evento** el LCP es el afiche: lleva `fetchpriority="high"` y, si es una
  portada de la biblioteca, su `width`/`height` (de `data.cover`, sin otra consulta; el tamaño en
  pantalla lo sigue mandando el CSS). **En la página de un perfil**, la primera imagen de su texto
  (la primera que queda con `src`) no es `lazy` y lleva `fetchpriority="high"`; las demás siguen
  `lazy` (`rehypeProfileLinks` con `firstImageEager`, src/lib/server/amigues/sanitize.js). En los
  textos de eventos, material y wiki todas siguen `lazy` (en un evento manda el afiche). Medido en
  local (25/10, Lighthouse celu, 15 corridas alternadas): el pedido de la imagen arranca antes
  (afiche ~243 → ~97 ms; imagen del perfil ~383 → ~78 ms), pero el LCP simulado no cambió
  (evento ~6,3 s, perfil ~4,6 s, dentro del ruido): lo domina la descarga de la imagen.
- El tiempo del servidor no apareció como problema (TTFB 10 ms en esa corrida).
- Los errores de consola que marca son del script de Cloudflare Web Analytics, no del sitio.
- Para ver que sigue andando: `curl -s https://kinkyvibe.ar/ | grep -o '<img[^>]*card-img[^>]*>' | head -5`
  muestra las primeras con `loading="eager"` y la primera con `fetchpriority="high"`.

## Qué mirar en los paneles

Lo que no se ve desde el repo: lo hace gorrite en cada panel. Lo que se copie de acá a un PR, sin
URLs de eventos ocultos ni datos de personas. Los pasos que dependen de un cambio del sitio dicen de
cuál; si ese PR todavía no está en `main`, el paso espera.

**Para hacer una vez**

- [ ] **Cloudflare → kinkyvibe.ar → Rules → Redirect Rules**: plantilla «Redirect from WWW to
      Root» (301, conserva camino y query). Probar con `curl -sI https://www.kinkyvibe.ar/calendario`
      → 301 a `https://kinkyvibe.ar/calendario`. El sitio también lo hace como red (PR #484, «Un
      solo host» arriba).
- [ ] **IndexNow** (PR #484): Worker `kinkyvibe` → Settings → Variables and Secrets → Secret
      `INDEXNOW_KEY` (generarla con `openssl rand -hex 16`, nunca a mano). Después,
      `https://kinkyvibe.ar/indexnow-key.txt` muestra la clave.
- [ ] **Bing Webmaster Tools**: agregar el sitio (se puede importar de Search Console) y mandar
      `https://kinkyvibe.ar/sitemap.xml`. Con IndexNow prendido, sus envíos se ven en «IndexNow».
- [ ] **Search Console**: que esté verificada la propiedad de dominio `kinkyvibe.ar` (cubre www y
      http) y mandado el sitemap.
- [ ] **fed.brid.gy/web/kinkyvibe.ar** → «Update profile», después de que esté el avatar estable
      de la h-card (PR #476).
- [ ] **Panel del sitio**: Ajustes → Vistas previas, los títulos y descripciones de cada sección
      (que digan qué es: «BDSM», «Buenos Aires», «cuir/queer»; title hasta 70 caracteres,
      description hasta 200), y la biblioteca: el texto alternativo de las portadas que se reusan
      entre ediciones.

**Para mirar de vez en cuando**

- [ ] **Search Console → Páginas**: URLs de `www.` indexadas (tienen que ir bajando con la
      redirección), «Soft 404» en `/wiki`, «Descubierta, actualmente sin indexar» en eventos
      viejos.
- [ ] **Search Console → Mejoras → Eventos**: avisos de `location` o `address` faltantes e
      `image` chica. **Si marca `address` faltante, no se completa con la dirección de un lugar
      cuyo nivel de privacidad la oculta**: el evento queda sin ese resultado enriquecido y está
      bien (ver «Lo que nunca se rompe»).
- [ ] **Search Console → Rendimiento**: qué consultas ya traen gente y qué páginas; antes de
      decidir algo sobre los eventos viejos, mirar sus clics.
- [ ] **Core Web Vitals de campo**: Search Console → Experiencia → Core Web Vitals, y Cloudflare →
      Web Analytics → Core Web Vitals. La única medición de visitas reales es el beacon de
      Cloudflare Web Analytics de `src/app.html`; si no hay datos suficientes, Google no los usa.
- [ ] **Cloudflare → Security → Bots**: qué bots de IA llegan y cuántos. La política de
      `robots.txt` y la de ese panel tienen que decir lo mismo.

**Para tener en cuenta**

- **SafeSearch**: el aviso de mayores de 18 es solo del navegador (Google ve la página igual) y
  el sitio **no** lleva `<meta name="rating" content="adult">` global: con eso Google lo saca
  entero de las búsquedas con SafeSearch, y la mayoría del contenido es educativo. Para revisar:
  buscar `site:kinkyvibe.ar` con SafeSearch en «Filtrar»; si desaparece todo, pedir revisión desde
  el formulario de SafeSearch de Google.
- **Eventos online**: Google Eventos solo muestra eventos presenciales (o mixtos); los que son
  solo online no salen ahí aunque su JSON-LD sea válido. No es un error.
- **Telegram guarda la vista previa de cada link**: si se cambia la imagen o el texto de una
  página después de compartirla, Telegram sigue mostrando la vieja. Para refrescarla, mandarle el
  link a [@WebpageBot](https://t.me/WebpageBot) (de Telegram) y después volver a compartirlo.

## Cómo probarlo

- `npx vitest run src/lib/utils/jsonLd.test.js src/lib/utils/vcard.test.js src/lib/utils/securityTxt.test.js src/lib/utils/robots.test.js src/lib/utils/feeds.test.js src/lib/server/feeds.test.js src/routes/rss/rss.test.js src/lib/utils/icsFeed.test.js`
- Feeds: <https://validator.w3.org/feed/> (Atom y `/rss`) y <https://validator.jsonfeed.org/> con
  la URL del preview.
- A mano, en el preview de la rama: abrir un evento, un material, una entrada de la wiki y un
  perfil, copiar la URL en <https://validator.schema.org/> y revisar que no haya errores. Para un
  lugar con la dirección oculta, el `Place` no tiene que tener `address` ni `geo`.
- Microformats: <https://pin13.net/mf2/?url=…> con la URL del preview.

## Auditoría (11/10/2026)

Páginas de producción bajadas una vez (GET, sin tocar nada). Tamaño del HTML y, entre paréntesis,
comprimido con gzip (lo que viaja es parecido: Cloudflare manda brotli, `/calendario` = 47 KB).

| Página        | HTML antes   | HTML después | Datos antes | Datos después |
| ------------- | ------------ | ------------ | ----------- | ------------- |
| `/calendario` | 310,0 (44,1) | 70,1 (17,9)  | 225,6       | 34,4          |

- **`/calendario`, los pasados de a un mes.** Viajan los próximos enteros y, de los pasados, solo
  los del mes que se abre (con los campos de la grilla, sin el lugar). Al ir a otro mes, la página
  pide sus pasados a `/api/calendario/pasados?mes=yyyy-MM` (5 minutos de caché, como
  `/api/posts`) y aparecen en la grilla al llegar. «Mostrar eventos pasados» también va de a un
  mes: trae enteros solo los pasados del mes que se ve (`/api/calendario/pasados?mes=yyyy-MM&enteros=1`,
  con el lugar vinculado como `/api/posts`) y, al cambiar de mes, los de ese mes; antes bajaba
  `/api/posts` entero. Abajo de la lista, «Mostrar el mes anterior» sigue con el mes de antes (la
  dirección de siempre, `?viewdate=yyyy-MM`, como las flechas) hasta el del evento más viejo
  (`firstMonth` de la carga). Solo aparece con los pasados a la vista, así que el HTML del servidor
  (lo que leen los buscadores) no cambia. Código: `src/lib/server/eventos/pasados.js`.

- **`/calendario`, las flechas de mes son links.** «Mes anterior» y «Mes siguiente» son
  `<a href="/calendario?viewdate=yyyy-MM">` (antes, botones con `goto()`): así los buscadores llegan
  a cada mes y, desde ahí, a los eventos pasados, sin tocar el sitemap ni la canónica. Solo entre
  el mes del evento más viejo y el del más nuevo (`firstMonth` y `lastMonth` de la carga; siempre
  hasta el mes con el que abre la página): fuera de ese rango siguen siendo botones, para no
  enlazar infinitos meses vacíos. Se ven igual que antes; «Hoy» sigue siendo un botón. Código:
  `src/lib/components/CalendarHeader.svelte`, `calendarMonthHref` e `isLinkedCalendarMonth` en
  `src/lib/utils/allPosts.js`.

- **`/todo`, `/material` y `/amigues`, de a 24 tarjetas.** Mostraban todas juntas (85, 55 y 30
  en la base local, con unas 620, 435 y 220 etiquetas) y la página tardaba en responder al
  cargar. Ahora, como el inicio (`limit` de `PostList`), 24 y «Ver más (N)», también con
  etiquetas elegidas (también desde `?tags=`; cambiar las etiquetas vuelve a las primeras 24);
  con texto en la búsqueda se ve todo lo que encontró. En `/amigues` los perfiles fijados siguen
  primero. HTML en la base local: `/todo` 376,7 → 201,1 KB (53,2 → 39,8 gz), `/material` 278,9 →
  185,9 KB (40,8 → 34,5), `/amigues` 170,8 → 156,0 KB (29,6 → 28,6).
  Los datos de la página no cambian (siguen viajando todas, para buscar sin pedir nada).

### Para hacer después (ahorro estimado, sin comprimir)

- `siteTags` y la wiki del layout raíz como un JSON aparte: **no ahorra en la primera visita** si
  se hace con un `fetch` en un `load`, porque SvelteKit mete en el HTML lo que se pidió durante el
  render del servidor, y las etiquetas hacen falta para armar la página (colores, madres). Al
  navegar dentro del sitio el layout raíz no se vuelve a pedir, así que tampoco ahorra ahí. Solo
  serviría con las etiquetas en un archivo estático que el navegador guarde (por ejemplo, armado
  al guardar etiquetas en el panel) y la página esperándolo antes de hidratar. Mucho riesgo para
  −30 KB; queda en espera.
- ~~Hasta 5 etiquetas por tarjeta~~ **Hecho, opción (b)** (gorrite eligió 1b). Las opciones eran:
  (a) 5 y un «+N» que no hace nada (la tarjeta entera ya es un link); (b) 5 y «+N» que despliega
  el resto en la tarjeta; (c) solo en las listas largas (`/material`, `/wiki/<etiqueta>`), no en
  el inicio; (d) dejarlo así. Ver «Hasta 5 etiquetas y relacionadas de a 20», abajo.
- ~~`/wiki/<término>`: las publicaciones relacionadas de a 20~~ **Hecho, opción (a)** (gorrite
  eligió 2a). Las opciones eran: (a) `limit={20}` en la lista con «Ver más», como el inicio
  (ahorra tarjetas, no datos); (b) además, el servidor manda 20 y «Ver más» pide las siguientes
  (ahorra las dos cosas, pero los filtros por etiqueta tendrían que pedir al servidor); (c)
  dejarlo así.
- El panel de etiquetas armado recién al abrirlo en celu (en compu sigue visible): −20 a −41 KB.
- Íconos de las tarjetas con un sprite SVG (`<use href>`) o una máscara CSS: −15 a −45 KB en las
  listas (comprimido casi no cambia: gzip ya comprime lo repetido; ganaría un DOM más chico).
  Se probó en #334 y gorrite decidió no hacerlo por ahora.

### Hasta 5 etiquetas y relacionadas de a 20

- **Tarjetas** (`PostListItem` y `Card`, por `CardTags.svelte` y `cardTags.js`): hasta 5 chips y
  un «+N» que despliega el resto en la tarjeta. Es un `<button>` de verdad adentro del link de la
  tarjeta: cancela el click (no navega), se usa con Tab y Enter/Espacio, dice `aria-expanded` y
  se lee «+N etiquetas más»; desplegado muestra «−» («Ver menos etiquetas»). Mide lo que un chip
  y tiene `.tap-target` (44px para el dedo), como los chips. En la lista, desplegada, la fila de
  chips pasa a varias líneas; en la grilla sigue en una fila que se desliza.
- **`/wiki/<término>`**: `PostList` con `limit={20}` y «Ver más (N)», como el inicio. Los datos
  llegan enteros del servidor.
- **La búsqueda y los filtros no dependen de lo que se ve**: `filterPosts` (postSearch.js), el
  árbol, los chips de la barra y el buscador leen `post.meta.tags` enteras, nunca los chips de la
  tarjeta: una publicación con la etiqueta buscada detrás del «+N» aparece igual (lo prueban
  `PostList.test.js` y `relacionadas-render.test.js`). Los filtros miran la lista entera: con
  etiquetas elegidas se ven de a 20 entre las que coinciden, y con texto en la búsqueda, todo lo
  que encontró (como en `/material`). Si una tarjeta todavía no tiene sus etiquetas, la fila queda
  vacía sin romperse (`cardTags`).
- Los chips siguen como antes: links recién después de hidratar. El «+N» no suma links.

Medido con la semilla pública (`npm run db:semilla`, `npm run build` + `vite preview`, HTML del
servidor; entre paréntesis, con gzip; en KB). Los datos de la página no cambian (la opción 2b no
se hizo):

| Página          | Tarjetas antes → después | HTML antes   | HTML después |
| --------------- | ------------------------ | ------------ | ------------ |
| `/material`     | 24 → 24                  | 183,7 (34,6) | 179,6 (34,3) |
| `/wiki/BDSM`    | 53 → 20                  | 290,7 (44,5) | 186,8 (36,6) |
| `/wiki/español` | 81 → 20                  | 363,0 (53,4) | 185,7 (39,2) |
| `/` (el inicio) | 20 → 20                  | 202,9 (36,7) | 196,8 (36,0) |

En `/material` el ahorro es chico (−4 KB y no −20 a −35 como se estimó): ya va de a 24 tarjetas y,
en la semilla, la mayor parte del material tiene 6 o 7 etiquetas (sin contar KinkyVibe), así que
cada tarjeta esconde 1 o 2 chips.

### Lo demás

- **Títulos repetidos**: los eventos que se repiten tenían el mismo título en cada edición
  («Jamarada Kinky · Kinky Vibe») y muchas veces la misma descripción. Ahora el `<title>` de todo
  evento con fecha suma el día de esa edición, en hora de Argentina («Jamarada Kinky · 24 de
  febrero de 2026 · Kinky Vibe»; `eventPageTitle` en `eventPage.js`), sea o no de una serie y
  aunque haya varias ediciones en el mes, salvo que el título ya diga ese día. Sale solo del
  evento, sin mirar la serie. El `h1` y la vista previa al compartir quedan con el título solo.
  Los perfiles no dicen «· Kinky Vibe» («Mem | él»).
- **Títulos de las listas**: el `<title>` del inicio es `home.title` y el de cada lista es su
  título del panel más « · Kinky Vibe» (`<lista>.heading`, `wiki.title`; Ajustes › Vistas
  previas, [compartir.md](compartir.md)), el mismo que `og:title`: así gorrite prueba títulos sin
  deploy. `/todo` tiene su propio título y un `h1` solo para lectores de pantalla.
- **Etiquetas con descripción y sin entrada**: la `description` (y `og:description`) es la
  descripción de la etiqueta en texto (`plainTagDescription` en `jsonLd.js`, sin los `[[ ]]`), y
  el nombre va con mayúscula inicial, igual en `<title>`, `og:title`, el `h1` y el `DefinedTerm`.
- **Descripciones**: faltaban en `/calendario`, `/material`, `/amigues` y `/wiki`, y las
  canónicas solo estaban en el inicio y en los perfiles (relativas). Las arregla el PR de vista
  previa al compartir (#257).
- **Encabezados**: un solo `h1` por página, bien. En las listas se saltaba de `h1` a `h3` (las
  tarjetas son `h3` sin `h2` en el medio): `PostList` lleva un `h2` solo para lectores de
  pantalla (`heading`) en el inicio, `/calendario`, `/material`, `/amigues` y `/todo`. En los
  perfiles y el material, «Contacto», «Integrantes», «Eventos en…» y «Más cosas de…» son `h2`
  con la clase `like-h3` (style.scss): se ven igual que antes, sin saltar de `h1` a `h3`.
- **Textos alternativos**: todas las imágenes tienen `alt`. Las de las tarjetas van vacías (son
  decorativas: el título está al lado); el afiche del evento dice «Afiche de …». Bien.
- **Sitemap**: 614 direcciones; 36 eran publicaciones con `redirect` (contestan 307 a un
  formulario o a la tienda) y ya no están. Las etiquetas sin entrada de la wiki no están (bien:
  son listas). Las series sí (`/wiki/<serie>`, con la fecha más nueva de sus ediciones), solo si
  tienen alguna edición que ve cualquiera (`sitemap.xml/series.js`).
- **Series**: la página de una serie (`/wiki/<serie>`) tiene siempre un `h1` (si la etiqueta no
  tiene descripción, solo para lectores de pantalla: `GlosarioItem`), la descripción «Ediciones de
  «X» en Kinky Vibe: N fechas, la próxima el …» (`seriesDescription` en `seo.js`; si la etiqueta
  tiene descripción propia, va esa, como en cualquier etiqueta sin entrada) y un
  `EventSeries` con sus ediciones (`seriesSchema` en `jsonLd.js`: nombre, página, fecha y estado;
  nunca el lugar). Cada edición dice de qué serie es (`superEvent`); la serie no es la canónica de
  las ediciones: cada fecha sigue siendo su propio `Event`.
- **`robots.txt`**: tenía reglas para `/_template`, `/_tags` y `/_glossary`, que ya no existen;
  ahora tiene la línea del sitemap.
- **Respuestas (AEO)**: las 12 entradas de la wiki arrancan con una definición de una oración
  («Una conjunción de bondage y disciplina…»), que ahora también va como `DefinedTerm`. Las
  etiquetas con descripción pero sin entrada también: su descripción, en texto, va como
  `DefinedTerm` (`tagTermSchema` en `jsonLd.js`).
- **`security.txt`**: el contacto es un mail. GitHub tiene apagado el aviso privado de
  vulnerabilidades del repo; si se prende, se puede sumar como otro `Contact`.
