# Incorporación

Para une desarrolladore que llega al proyecto. Leé esto, después [pruebas-y-ci.md](pruebas-y-ci.md)
y la guía del área que vayas a tocar (índice en [README.md](README.md)).

## Qué es kinkyvibe

El sitio de KinkyVibe (kinkyvibe.ar): calendario de eventos, material, perfiles de amigues y una
wiki, más venta de entradas con Mercado Pago o transferencia y un panel de admin para la
organización. Lo mantienen tres personas (gorrite, Mel y Pau, les tres superadmins) y buena parte
del código lo escriben agentes de Claude en paralelo, así que el orden importa más que la
velocidad.

## Armar el entorno

1. Node: la versión de `.node-version` (con `nvm`, `fnm` o similar).
2. `npm ci` (no `npm install`: respeta el `package-lock.json`).
3. Elegí un modo:

   | Comando               | Para qué                                                                                 |
   | --------------------- | ---------------------------------------------------------------------------------------- |
   | `npm run dev`         | el sitio tal cual, con la base local                                                     |
   | `npm run dev:admin`   | + admin falso (`.env.admin`); los "commits" del panel van a una carpeta temporal         |
   | `npm run dev:tickets` | + Mercado Pago simulado, datos de transferencia inventados y Fondo fijo (`.env.tickets`) |

   Los tres aplican antes las migraciones a la **base D1 local** (`.wrangler/state/`, simulada con
   miniflare; no toca Cloudflare). Para empezar de cero, borrá esa carpeta.

4. Para cambiar algo solo en tu compu, creá `.env.admin.local` / `.env.tickets.local` (git los
   ignora). Los `.env.*` del repo son solo flags de desarrollo: **nunca** un secreto.
5. Para los tests en navegador: `npx playwright install --with-deps chromium`.

## La arquitectura en una página

- **SvelteKit 2 + Svelte 5 en modo legacy** (sin runes: `export let`, `$:`, stores). JavaScript
  con tipos en JSDoc (solo `src/app.d.ts` es TypeScript). mdsvex para los `.md`.
- **Cloudflare Workers** (con Workers Builds) y `adapter-cloudflare`; la base es **D1** (`DB`),
  con backups nocturnos a R2. Cada rama tiene su preview con modo demo
  ([workers-migracion.md](workers-migracion.md)).
- **Rutas** (`src/routes/`):
  - `(content)/`: páginas públicas (calendario y su página de compra, material, amigues, wiki,
    sitemap, `.ics`). La home es `src/routes/+page.svelte`; `rss/` y `auch/` están sueltas.
  - `(authed)/`: el panel `/admin` y el editor genérico `/edit`.
  - `entradas/`: estado de una compra, la entrada con su QR, confirmar reserva, checkout simulado.
  - `api/`: webhook de Mercado Pago, cron de recordatorios, `preview-status`, índice de búsqueda.
  - `login`, `callback`, `logout`: login de admins con GitHub OAuth. `(custom)/cdh`: página propia.
- **Servidor** (`src/lib/server/`): `auth.js` (quién es admin, `requireAdmin`), `session.js`,
  `db/` (acceso a D1 y herramientas de prueba), `tickets/` (toda la venta de entradas),
  `admin/` (lógica del panel), `eventos/` (commits a GitHub y editor de eventos), `demo/` (modo
  demo de los previews). Compartido cliente/servidor: `src/lib/utils/`.
- **Datos**:
  - Contenido: archivos `.md` en `src/lib/posts/` (ver [contenido.md](contenido.md)). El panel
    los edita haciendo commits en `main`. **Plan decidido (0004):** pasarlo a D1 como objetos
    con tipos, campos, relaciones e historial, empezando por los eventos.
  - Todo lo demás, en D1: órdenes y entradas, códigos, ajustes, plantillas de mails, notas de
    personas, registro de actividad (tablas y quién las usa en [datos.md](datos.md)).
- **Servicios externos**: Mercado Pago (cobros), Resend (mails), GitHub (login de admins y
  commits de contenido), fondo.kinkyvibe.ar (porcentaje del Fondo). Los crons
  (recordatorios y backup) son del propio Worker (`src/lib/server/scheduled.js`). Los secretos viven en el panel de Cloudflare, nunca en el repo.

## Convenciones

- **Textos para el público en español rioplatense, con voseo** ("podés", "elegí", "tu
  entrada") y **lenguaje inclusivo** como ya usa el sitio ("amigues", "les organizadores",
  "todes"). gorrite, siempre en minúscula.
- Identificadores en inglés; comentarios en inglés o español, según el archivo.
- **Migraciones solo para agregar**: nunca se edita una que pudo haberse aplicado.
- Consultas SQL siempre preparadas. Nada de datos de personas, secretos ni detalles de
  vulnerabilidades en commits, PRs, fixtures o capturas: **el repo es público**.
- IDs, tokens y SHAs nunca se tipean a mano: se copian de la salida de un comando.
- Lo nuevo sale **detrás de un interruptor, apagado** (decisión 0001).
- Pruebas al lado del código; nunca se saltea ni afloja una para que dé verde.
- Los `.md` de `src/lib/posts` no se reformatean (los editan personas desde el panel).
- Antes de tocar un área, leé sus decisiones en `docs/decisiones/`. Contradecir una necesita una
  decisión nueva, no un cambio silencioso.

## Cómo se trabaja con PRs

- Rama desde `origin/main` actualizado. **Un tema por PR**, chico.
- **Arreglos chicos**: su propio PR.
- **Bloques grandes** (decisión 0001): una rama por parte → se integran y se prueban juntas en
  una **rama de integración** → entran a `main` como **un solo PR**. No se apilan muchos PRs para
  mergear de a uno. Se trabaja un bloque grande a la vez.
- Cambios transversales (renombrar etiquetas, rutas, constantes compartidas, columnas) van en su
  propio PR y se mergean primero.
- En la descripción del PR: el resultado de `npm run lint`, `npx vitest run`, `npm run build` y
  el trinquete de tipos (ver [pruebas-y-ci.md](pruebas-y-ci.md)). Si trae migración, decilo.
- **Nunca se mergea sin la aprobación explícita de gorrite** para ese PR, con `ci-ok` en verde y
  base `main`. Nada de `--admin` ni de reescribir la historia de `main` o de ramas ajenas.

## Por dónde empezar a leer

1. `CLAUDE.md` (reglas cortas, valen para humanes también) y `docs/decisiones/README.md`.
2. `src/hooks.server.js` y `src/lib/server/auth.js`: cómo entra cada pedido y quién es admin.
3. Una publicación en `src/lib/posts/calendario/` y `src/routes/(content)/calendario/[event]/`:
   cómo se arma una página pública.
4. `src/lib/server/tickets/orders.js` (la reserva atómica) y `checkout.js`: el corazón de la venta.
5. `src/lib/admin/nav.js` y `src/routes/(authed)/admin/+page.server.js`: el mapa del panel.
6. `src/lib/server/db/testing.js` y cualquier `*.test.js` de `tickets/`: cómo se prueba.
