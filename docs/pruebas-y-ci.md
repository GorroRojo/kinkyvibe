# Pruebas y CI

## En pocas palabras

Cada vez que alguien abre o actualiza un pull request (y en cada push a `main`), GitHub corre
solo una serie de chequeos, en paralelo y cada uno en su propia máquina: revisa el estilo del
código y corre más de tres mil pruebas automáticas; compila el sitio, arma el Worker y lo recorre con
un navegador de verdad; y revisa los tipos. Al mismo tiempo, Cloudflare publica una copia de
prueba del sitio (un "preview") con su propio link. Si todo da verde aparece el tilde ✅
**`ci-ok`**, que es la única condición que GitHub exige para poder mergear. Si algo da rojo ❌, el
PR no entra hasta arreglarlo. Y además, nadie mergea sin que gorrite lo apruebe.

## Qué corre en cada PR

Todo lo de GitHub Actions está en un solo archivo, `.github/workflows/ci.yml` (no hay otros
workflows). Corre en cada pull request y en cada push a `main`, con permiso de solo lectura sobre
el repo (`permissions: contents: read`). Si pusheás de nuevo a la misma rama, la corrida anterior
se cancela (`concurrency`). Los tres primeros jobs corren en paralelo, usan Ubuntu 22.04 y la
versión de Node de `.node-version` (con caché de npm), y arrancan con `npm ci`. Tienen un límite
de tiempo: 15 minutos `unit` y `e2e`, 10 `typecheck`.

| Job (nombre en GitHub) | Pasos, en orden                                                                                                                                                                                                                                          | Cómo reproducirlo en tu compu                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `unit`                 | **Lint** (`npm run lint`) → **Unit + content tests** (`npx vitest run`)                                                                                                                                                                                  | `npm run lint && npx vitest run`                                                                 |
| `e2e`                  | **Build** (`npm run build`) → **Worker bundle** (`npx wrangler deploy --dry-run --outdir .wrangler/dry-run`) → instala Chromium (o, si está en caché, solo sus librerías del sistema) → **E2E smoke tests** (`npx playwright test`, con `PW_NO_BUILD=1`) | `npm run build && PW_NO_BUILD=1 npm run test:e2e` (o solo `npm run test:e2e`, que compila antes) |
| `typecheck`            | **svelte-check ratchet** (`node scripts/svelte-check-ratchet.js`)                                                                                                                                                                                        | `node scripts/svelte-check-ratchet.js`                                                           |
| **`ci-ok`**            | corre siempre (`if: always()`, en `ubuntu-latest`, sin `npm ci`) y pasa solo si `unit`, `e2e` y `typecheck` terminaron bien (o se saltearon). **Es el único chequeo obligatorio**                                                                        | —                                                                                                |

Fuera de `ci.yml` aparecen además:

| Chequeo (nombre en GitHub)                  | Qué hace                                                                                 | Dónde está                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Workers Builds: kinkyvibe`                 | Cloudflare compila la rama y publica su preview con link (modo demo, [demo.md](demo.md)) | configurado en Cloudflare (`wrangler.toml`, [workers-migracion.md](workers-migracion.md)) |
| `Analyze (javascript)`, `Analyze (actions)` | escaneo de seguridad de GitHub (CodeQL) sobre el código y los workflows                  | configuración por defecto de GitHub (no hay archivo en el repo)                           |
| `CodeQL`                                    | en los PRs, el resumen de ese escaneo: falla si el PR trae una alerta nueva              | ídem                                                                                      |

Además, `ci.yml` tiene el job **`ui-impacto`** (informe de impacto visual,
[ui-impacto.md](ui-impacto.md)): solo en PRs que tocan estilos o componentes, sube el artifact
`ui-impacto` con capturas antes y después. Es **solo informativo**: no está en los `needs` de
`ci-ok` y es el único job con `continue-on-error`, porque no es una prueba.

**Dependabot** (`.github/dependabot.yml`) abre los lunes PRs agrupados de dependencias: uno con
todas las actualizaciones minor y patch de npm, otro con las de seguridad y otro con las actions
de los workflows. Cada salto de major llega en su propio PR. Pasan por la misma CI y, como todo
PR, se mergean solo con la aprobación de gorrite.

Dependabot regenera `package-lock.json` desde cero, y ahí se caen los peers opcionales. Por eso
`@types/node` (de la versión mayor de `.node-version`) es una devDependency explícita: sin ella,
svelte-check deja de encontrar `process` y `node:fs` en los tests y el ratchet falla.

`ci-ok` existe para que la protección de `main` pida un solo chequeo: si alguien agrega un job a
`ci.yml`, lo suma a los `needs` de `ci-ok` y listo, sin tocar la configuración de GitHub.

Detalles de `e2e`:

- El **Worker bundle** empaqueta `worker/index.js` con el build como lo haría el deploy, sin
  subir nada ni necesitar cuenta de Cloudflare. Si falla, el deploy también fallaría.
- Antes de `vite preview`, `playwright.config.js` corre `scripts/import-content.js`: aplica las
  migraciones a la base local y le importa los `.md` de eventos y material (el sitio los lee solo
  de la base). La primera vez tarda ~1-2 minutos; después, segundos.
- Chromium se guarda en caché entre corridas, por versión de `@playwright/test`.
- Si las pruebas fallan, sube `playwright-results` (capturas y trazas) como artifact por 7 días.

`npm run lint` es solo ESLint: **no** revisa el formato de Prettier, y la CI tampoco. Para eso,
`npm run format:check` (todo el repo) o `npx prettier --check docs` (solo la documentación).
La configuración está en `eslint.config.js` (formato plano; las rutas ignoradas también van ahí,
ya no hay `.eslintrc` ni `.eslintignore`).

## Los tipos de pruebas

### Unitarias (vitest)

- Viven **al lado del código**: `algo.js` tiene su `algo.test.js` en la misma carpeta. También
  corren las de `scripts/**/*.test.js`.
- `npx vitest run` (o `npm run test:unit`) las corre todas; `npx vitest run src/lib/server/tickets`
  solo una carpeta; `npm run test:unit:watch` las repite al guardar.
- **Chequeo del contenido** (`src/tests/content.test.js`): revisa todas las publicaciones de
  `src/lib/posts` (propiedades legibles, fechas con zona horaria, imágenes que existen, autores
  con perfil…). Los problemas viejos están anotados en `src/tests/content-known-issues.json` y
  solo falla si aparece uno **nuevo**. Si arreglaste alguno:
  `UPDATE_CONTENT_ALLOWLIST=1 npx vitest run src/tests/content.test.js`.
- **Mails "golden"**: `src/lib/server/tickets/email.golden.json` guarda cómo sale cada mail; si
  cambiás un mail a propósito, actualizá ese archivo en el mismo PR y explicalo.

### Pruebas con base de datos

Las pruebas que tocan D1 usan **una base D1 real** (el mismo motor que Cloudflare, vía
miniflare), creada vacía con `createTestDB()` de `src/lib/server/db/testing.js`, que aplica
**todas las migraciones de `migrations/`**. No necesitan internet ni tocan la base local de
`npm run dev`. Lo normal es una base por archivo (`beforeAll`) y `resetDB()` en cada `beforeEach`.
Para que sean rápidas, el archivo de la base vive en `/dev/shm` (en memoria; si no se puede, en
la carpeta temporal) y cada consulta, las migraciones enteras y cada `resetDB()` son un solo
pedido al worker de miniflare. Así se prueba, por ejemplo, que 30 compras al mismo tiempo no vendan de más. Las
migraciones que reconstruyen tablas tienen su propia prueba con datos
(`src/lib/server/db/migration0010.test.js`). Más en [datos.md](datos.md).

### En el navegador (Playwright)

Hay dos juegos, con configuraciones distintas:

| Juego                       | Config                         | Contra qué corre                                                            | ¿En CI?                                                                      |
| --------------------------- | ------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Humo (`tests/*.spec.js`)    | `playwright.config.js`         | el build de producción (`vite preview`, puerto 4173)                        | **Sí** (job `e2e`, con un reintento)                                         |
| Entradas (`tests/tickets/`) | `playwright.tickets.config.js` | `npm run dev:tickets` en el puerto 5371, con Mercado Pago y admin simulados | **No**, por decisión de gorrite: correlo a mano si tocás entradas o el panel |

El juego de entradas cubre la compra, la gorra, el editor de eventos, Ajustes y cada link del
menú del panel (`tests/tickets/menu.spec.js`). Como la CI no lo corre, si tu PR toca esas partes
pegá su resultado en la descripción.

```sh
npx playwright install --with-deps chromium          # una vez
npm run test:e2e                                     # humo (compila antes; PW_NO_BUILD=1 reusa el build)
npx playwright test -c playwright.tickets.config.js  # entradas, editor de eventos y ajustes
```

Variables útiles: `PW_CHROMIUM_PATH` (humo) o `PW_CHROMIUM` (entradas) para usar un Chromium ya
instalado; `TICKETS_SHOTS_DIR` para guardar capturas.

### Tipos (svelte-check con trinquete)

`node scripts/svelte-check-ratchet.js` corre svelte-check y compara con
`scripts/svelte-check-baseline.json`, que hoy está en **0 errores**. Falla solo si svelte-check
cuenta **más** errores que la línea de base; el log del job `typecheck` lista cada error actual.
Si alguna vez bajan, el script pasa y pide bajar el número en el mismo PR; **nunca se sube** para
que dé verde. `npm run check` corre svelte-check sin trinquete (lo mismo, sin comparar).

## Protecciones para agentes

- **Guardia de merge** (`scripts/hooks/check-merge.js`, conectado en `.claude/settings.json`):
  antes de que un agente mergee, pregunta a GitHub por el PR y lo frena si la base no es `main`
  (PR apilado), si está cerrado o en borrador, si algún chequeo no está verde, si usa `--admin` o
  si no puede verificar. Es una ayuda contra errores; la protección de verdad es la de `main` en
  GitHub (`ci-ok`).
- **Al arrancar una sesión** (`scripts/hooks/session-start.sh`): corre `npm ci` si falta
  `node_modules` o cambió `package-lock.json`.

## Antes de pushear

```sh
npm run lint
npx vitest run
npm run build
node scripts/svelte-check-ratchet.js
npx prettier --check docs      # si tocaste documentación
npx playwright test -c playwright.tickets.config.js  # si tocaste entradas o el panel (la CI no lo corre)
```

Pegá el resumen de cada uno en la descripción del PR. No se dice "los tests pasan" sin haberlos
corrido.

## Cuando algo está en rojo

1. Abrí el chequeo en rojo en el PR ("Details") y buscá el primer error del log.
2. Según cuál:
   - **Lint**: `npm run lint` en tu compu muestra lo mismo; arreglalo (o `npm run format` si es
     formato).
   - **Unit + content tests** (job `unit`): `npx vitest run <archivo>` reproduce. Si es el chequeo del
     contenido, el mensaje dice qué publicación y qué propiedad.
   - **Build** (job `e2e`): `npm run build`; suele ser un import roto o un `.md` con propiedades mal escritas.
   - **E2E smoke tests**: el job sube `playwright-results` (capturas y trazas) como artifact por
     7 días. Reproducí con `npm run test:e2e`. En CI hay un reintento, así que si falló dos veces
     no es casualidad.
   - **typecheck**: el log lista cada error de tipos; arreglalos (no subas la línea de base).
   - **CodeQL**: lee la alerta en la pestaña Security. Si es un problema real de seguridad, no
     lo detalles en público: arreglalo y avisale a gorrite en privado.
   - **Worker bundle (wrangler dry-run)**: `npm run build && npx wrangler deploy --dry-run --outdir .wrangler/dry-run`
     reproduce; suele ser un import que el runtime de Workers no tiene.
   - **Workers Builds**: el link "Details" lleva al log del build en Cloudflare.
3. **Nunca** se saltea, borra ni afloja una prueba para que dé verde (`.skip`, sacar
   `expect`, `continue-on-error`). Si una prueba está mal, se dice en el PR y se arregla a la vista.
4. Si parece intermitente (pasa y falla sin cambios), no lo tapes con reintentos: anotalo en el PR
   o abrí un issue.
