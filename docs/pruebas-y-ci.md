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

Lo de GitHub Actions que corre en cada PR está en un solo archivo, `.github/workflows/ci.yml`
(el único otro workflow es el vigilante del repaso, ver abajo, que no corre en PRs). Corre en cada pull request (también cuando se edita su descripción, por el job
`plan-pr`) y en cada push a `main`, con permiso de solo lectura sobre el repo (`permissions:
contents: read`). Si pusheás de nuevo a la misma rama o editás la descripción, la corrida anterior
se cancela (`concurrency`) y vuelve a correr todo. Los jobs de prueba corren en paralelo, usan
Ubuntu 22.04 y la versión de Node de `.node-version` (con caché de npm), y arrancan con `npm ci`.
Tienen un límite de tiempo: 15 minutos `unit`, `tests` y `e2e`, 10 `typecheck`.

**PRs de solo documentación** (gorrite, 11/10): el job `changes` mira qué archivos toca el PR. Si
todos están en `docs/`, son `.md` de la raíz o están en `.claude/`, corre solo `docs` (el chequeo
de formato) y se saltean `unit`, `tests`, `e2e` y `typecheck`; `ci-ok` igual da verde, porque
cuenta lo salteado como bien. `plan` y `plan-pr` corren igual. En `main` (push) corre todo
siempre (salvo `plan-pr`, que es solo de PRs).

| Job (nombre en GitHub)          | Pasos, en orden                                                                                                                                                                                                                                                                                                                          | Cómo reproducirlo en tu compu                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `unit`                          | **Lint** (`npm run lint`) → **Prettier** (`npm run format:check`)                                                                                                                                                                                                                                                                        | `npm run lint && npm run format:check`                                                           |
| `tests (1/3)`, `(2/3)`, `(3/3)` | trae la caché de vitest → **Unit + content tests** repartidas en 3 máquinas por tiempo (`npx vitest run --shard=N/3 --fsModuleCache`): juntas corren todas                                                                                                                                                                               | `npx vitest run` (todas), `npx vitest run --shard=1/3` o `npm run test:related`                  |
| `e2e`                           | **Build + seed + Chromium** en paralelo (`npm run build`, `node scripts/semilla.js` e instalar Chromium o, si está en caché, solo sus librerías del sistema) → **Worker bundle** (`npx wrangler deploy --dry-run --outdir .wrangler/dry-run`) → guardia del modo demo → **E2E smoke tests** (`npx playwright test`, con `PW_NO_BUILD=1`) | `npm run build && PW_NO_BUILD=1 npm run test:e2e` (o solo `npm run test:e2e`, que compila antes) |
| `typecheck`                     | **svelte-check ratchet** (`node scripts/svelte-check-ratchet.js`)                                                                                                                                                                                                                                                                        | `node scripts/svelte-check-ratchet.js`                                                           |
| `plan`                          | **plan-lint** (`node scripts/plan-lint.js`, sin `npm ci`): en [plan.md](plan.md), ids únicos y bien escritos, fase y estado en cada ítem, cada uno en la sección de su fase, dependencias que existen y no están en una fase posterior, y las fases de `src/lib/admin/nav.js` iguales a las del plan (ver abajo)                         | `node scripts/plan-lint.js`                                                                      |
| `plan-pr`                       | solo en PRs: **la línea `Plan:`** de la descripción (`node scripts/plan-pr.js`, lee el evento): `Plan: <id>[, <id>]` con ids que existen en el `plan.md` del PR, o `Plan: ninguno`. Los PRs de bots (Dependabot) no la necesitan                                                                                                         | —                                                                                                |
| **`ci-ok`**                     | corre siempre (`if: always()`, en `ubuntu-latest`, sin `npm ci`) y pasa solo si `changes`, `docs`, `unit`, `tests`, `e2e`, `typecheck`, `plan` y `plan-pr` terminaron bien (o se saltearon). **Es el único chequeo obligatorio**                                                                                                         | —                                                                                                |

Fuera de `ci.yml` aparecen además:

| Chequeo (nombre en GitHub)                  | Qué hace                                                                                 | Dónde está                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Workers Builds: kinkyvibe`                 | Cloudflare compila la rama y publica su preview con link (modo demo, [demo.md](demo.md)) | configurado en Cloudflare (`wrangler.toml`, [workers-migracion.md](workers-migracion.md)) |
| `Analyze (javascript)`, `Analyze (actions)` | escaneo de seguridad de GitHub (CodeQL) sobre el código y los workflows                  | configuración por defecto de GitHub (no hay archivo en el repo)                           |
| `CodeQL`                                    | en los PRs, el resumen de ese escaneo: falla si el PR trae una alerta nueva              | ídem                                                                                      |

**El plan y la CI** ([plan.md](plan.md), «Reglas»): `plan` y `plan-pr` corren también en los
PRs de solo documentación. La relación con el menú del panel: cada sección «Próximamente» de
`nav.js` (las que tienen `phase`) tiene un ítem en el plan con `nav: <id de la sección>`, y su
`phase` es la fase de ese ítem. Si cambia la fase de algo del menú, se cambia en los dos lados en
el mismo PR; si una sección nueva entra con `phase`, entra también su ítem. Si `plan-pr` da rojo,
alcanza con editar la descripción del PR: la CI vuelve a correr sola.

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

**Vigilante del repaso semanal** (`.github/workflows/repaso-vigilante.yml`, ítem
`plan-repaso-semanal` de [plan.md](plan.md)): no corre en PRs sino todos los días a las 04:23 UTC
(y a mano desde la pestaña Actions, «Run workflow»), así que no está en los `needs` de `ci-ok`.
Sin Claude, mira si hay algún PR con la etiqueta `repaso-semanal` creado en los últimos 8 días
(la rutina de Claude de los lunes lo abre siempre). Si no hay, abre el issue «El repaso semanal
del plan no corrió» con esa etiqueta, salvo que ya haya uno abierto; si vuelve a haber un PR de
repaso y el issue sigue abierto, lo cierra con un comentario. Permisos: `contents: read`,
`issues: write`, `pull-requests: read`. La etiqueta `repaso-semanal` la crea el vigilante la
primera vez que abre el issue si todavía no existe (también se puede crear a mano en Issues →
Labels). La lógica está en `scripts/repaso-vigilante.js` (la decisión es una función pura, con
pruebas en `scripts/repaso-vigilante.test.js`).

`ci-ok` existe para que la protección de `main` pida un solo chequeo: si alguien agrega un job a
`ci.yml`, lo suma a los `needs` de `ci-ok` y listo, sin tocar la configuración de GitHub.

Detalles de `e2e`:

- El **Worker bundle** empaqueta `worker/index.js` con el build como lo haría el deploy, sin
  subir nada ni necesitar cuenta de Cloudflare. Si falla, el deploy también fallaría.
- Antes de `vite preview`, `playwright.config.js` corre `scripts/semilla.js`: aplica las
  migraciones a la base local y le carga la semilla de contenido (`src/lib/server/semilla/`:
  eventos, material, fichas de amigues, etiquetas y wiki; el sitio los lee solo de la base). La
  primera vez tarda ~1-2 minutos; después, segundos. Por eso en la CI la primera carga corre al
  mismo tiempo que el build y la instalación de Chromium, y la de Playwright es la segunda
  (segundos).
- `playwright.config.js` tiene `fullyParallel: true`: cada prueba es independiente, así los 2
  workers de Playwright se reparten las pruebas sueltas y no archivos enteros (`smoke.spec.js`
  tiene casi todas).
- Se probó compilar en un job aparte y correr Playwright en 2 partes que bajan el build (PR #311):
  tardaba más (la semilla y el build siguen en serie con las partes, y cada parte repite
  `npm ci` y Chromium) y gastaba el doble de minutos. Las pruebas en sí son ~20 s.
- Chromium se guarda en caché entre corridas, por versión de `@playwright/test`.
- Si las pruebas fallan, sube `playwright-results` (capturas y trazas) como artifact por 7 días.

Detalles de `tests`:

- **Reparto por tiempo**: vitest reparte `--shard` con la misma cantidad de archivos en cada
  parte, sin mirar cuánto tardan, y una parte terminaba mucho después que las otras.
  `scripts/vitest/sequencer.js` (en `vite.config.js`, `test.sequence.sequencer`) los reparte por
  lo que tardó cada uno según `scripts/vitest/durations.json`: del más lento al más rápido, cada
  archivo va a la parte que menos suma. Un archivo que no está ahí cuenta como la mediana; cada
  archivo corre en exactamente una parte aunque los tiempos estén viejos. Cada parte sube lo que
  tardó cada archivo como artifact `vitest-durations-N` (30 días). Para actualizar los tiempos
  (conviene cuando se suman o cambian pruebas lentas), bajá los tres de una corrida reciente de
  `main` y juntalos:
  `gh run download <id> -p 'vitest-durations-*' -D /tmp/tiempos && node scripts/vitest/merge-durations.js /tmp/tiempos/*/vitest-durations.json`.
  Tienen que ser tiempos de la CI: medidos en otra máquina (`npm run test:durations`) las
  proporciones cambian y el reparto sale torcido.
- **Caché**: cada parte guarda y recupera `node_modules/.vite` (cuánto tardó cada archivo la
  última vez: los lentos arrancan primero) y `node_modules/.vitest-cache` (los módulos ya
  transformados, `--fsModuleCache`, solo en la CI). La clave lleva la parte, el hash de
  `package-lock.json` y el commit; los PRs arrancan de la última de `main`.

`npm run lint` es solo ESLint: **no** revisa el formato de Prettier. Eso lo hace el paso
**Prettier** del job `unit` con `npm run format:check` (todo el repo menos lo que lista
`.prettierignore`: los posts del CMS, `static/` y otros). Si falla, corré `npm run format` y
commiteá el resultado. `.prettierignore` tiene además una lista **temporal** de archivos que
todavía no tienen formato porque los tocan ramas abiertas; cuando esas ramas entran, se formatean
y se sacan de la lista.
La configuración está en `eslint.config.js` (formato plano; las rutas ignoradas también van ahí,
ya no hay `.eslintrc` ni `.eslintignore`).

## Los tipos de pruebas

### Unitarias (vitest)

- Viven **al lado del código**: `algo.js` tiene su `algo.test.js` en la misma carpeta. También
  corren las de `scripts/**/*.test.js`.
- `npx vitest run` (o `npm run test:unit`) las corre todas; `npx vitest run src/lib/server/tickets`
  solo una carpeta; `npm run test:unit:watch` las repite al guardar.
- `npm run test:related` (`scripts/test-related.js`) corre solo las relacionadas con lo que
  cambiaste respecto de `origin/main`: lo commiteado en la rama, lo no commiteado y los archivos
  nuevos (`vitest related`: las pruebas que importan, directa o indirectamente, algún archivo
  cambiado, más las pruebas cambiadas). Los borrados se ignoran. Si no cambió nada, no corre
  nada. Si cambió algo que afecta a todas y vitest no ve como import (`package.json`, el lockfile,
  `vite.config.js`, `migrations/`, `src/tests/`, `scripts/vitest/`…), corre todas. Lo que va
  después de `--` le llega a vitest (`npm run test:related -- --maxWorkers=2`);
  `TEST_RELATED_BASE` cambia la base. Ojo: un archivo que una prueba lee con `readFile` (y no
  importa) no cuenta como relacionado; la CI igual corre todas.
- **Etiquetas en las pruebas**: sin base, el árbol de etiquetas está vacío; `src/tests/setup.js`
  (en `setupFiles` de `vite.config.js`) pone las de la semilla como respaldo para todas las
  pruebas. Las que necesitan contenido real lo leen de la semilla (`src/lib/server/semilla/testing.js`).
  (El viejo chequeo de los `.md`, `src/tests/content.test.js`, se fue con ellos: 0032.)
- **Mails "golden"**: `src/lib/server/tickets/email.golden.json` guarda cómo sale cada mail; si
  cambiás un mail a propósito, actualizá ese archivo en el mismo PR y explicalo.
- **Componentes con clics** (`*.dom.test.js`): se montan en jsdom con `@testing-library/svelte`
  (proyecto `dom` de `vite.config.js`, con el Svelte del navegador); el resto de las pruebas
  (proyecto `unit`) sigue en Node y renderiza con `svelte/server`. Ejemplo:
  `src/lib/components/admin/TicketsEditor.dom.test.js`.
- **HTML de componentes**: para leer lo que devuelve `render` usá `textOf` y `withoutComments` de
  `src/lib/testing/html.js`. No saques etiquetas ni comentarios con expresiones regulares
  (`/<[^>]*>/`, `/<!--.*?-->/`): CodeQL lo marca como alerta alta aunque sea un test, y el PR queda
  en rojo.

### Pruebas con base de datos

Las pruebas que tocan D1 usan **una base D1 real** (el mismo motor que Cloudflare, vía
miniflare), creada vacía con `createTestDB()` de `src/lib/server/db/testing.js`, que aplica
**todas las migraciones de `migrations/`**. No necesitan internet ni tocan la base local de
`npm run dev`. Lo normal es una base por archivo (`beforeAll`) y `resetDB()` en cada `beforeEach`.
Para que sean rápidas, el archivo de la base vive en `/dev/shm` (en memoria; si no se puede, en
la carpeta temporal), y las consultas viajan por un **WebSocket** abierto con el worker de
miniflare: cada consulta, cada `batch`, cada `resetDB()` es un mensaje (~2 ms en vez de ~6 ms con
un pedido HTTP por consulta); lo que no entra en un mensaje (más de 4 M caracteres) va por un
pedido suelto, igual que antes. Mismo D1 y mismas respuestas por los dos caminos. Las migraciones
**no se aplican en cada archivo**: el globalSetup de vitest (`src/tests/globalSetup.js`) arma una
vez por corrida, en segundo plano, una **plantilla** (una base con todas las migraciones), y
`createTestDB()` copia ese SQLite en la carpeta nueva de cada base. Cada base sigue siendo su propia
copia, aislada de las demás. Si la plantilla no está lista todavía, no se pudo armar, es de otras
migraciones (se compara una huella de los archivos de `migrations/`, por ejemplo si cambiás una con
`vitest` en modo watch) o falla la copia, esa base migra como siempre;
`createTestDB({ template: false })` fuerza ese camino. `src/lib/server/db/template.test.js`
comprueba que una base copiada de la plantilla es igual a una migrada archivo por archivo
(esquema de `sqlite_master`, filas, `sqlite_sequence`) y que la plantilla se usó: si falla, no
relajes la comparación. Si cada prueba de un archivo arranca con los mismos datos y
armarlos es caro (por ejemplo, importar todas las etiquetas de la semilla: ~10 s con la máquina
cargada), se arman una vez, se guarda la copia con `snapshotDB()` y cada prueba la vuelve a poner
con `restoreDB()` (exactamente las mismas filas, en un solo pedido; ver
`src/routes/(authed)/admin/eventos/series/series-crear.test.js`). Así se prueba, por ejemplo, que 30 compras al mismo tiempo no vendan de más. Las
migraciones que reconstruyen tablas tienen su propia prueba con datos
(`src/lib/server/db/migration0010.test.js`). Más en [datos.md](datos.md).

**Tiempos límite**: el de vitest es de 5 s por prueba. No se sube para todas: si una prueba es
lenta a propósito (recorre toda la semilla, lee todo el repo), se le sube solo a ella
(`it('…', { timeout: 30_000 }, …)` o a su `describe`) con un comentario que diga por qué.
Antes, conviene ver si se puede hacer más rápida (una base por archivo, una copia con
`restoreDB()`, el reloj de mentira en vez de esperas de verdad). Lo que es preparación y no lo
que se prueba va en un `beforeAll` con su tiempo límite, no en la primera prueba: por ejemplo, la
primera importación de una página o de la galería, que vite transforma (cientos de módulos: varios
segundos, y más de 15 con la máquina cargada). Vite guarda lo transformado y `vi.resetModules()`
solo olvida lo ya evaluado, así la prueba la vuelve a importar de verdad (con sus mocks) en
milisegundos (ver `series-crear.test.js` y `src/lib/estilo/estiloGuard.test.js`). Las bases de prueba (también las
sin migraciones, `createTestDB({ migrate: false })`) se levantan en un `beforeAll`, nunca dentro
de una prueba: el arranque de miniflare contaría para el tiempo límite de la prueba.

**Lo privado no sale en público** (`src/routes/privados.test.js`): planta objetos de cada tipo en
cada nivel que no ve une visitante (oculto, solo con cuenta, borrado, sin aprobar, no listado, y
cada nivel de privacidad de un lugar), más datos de personas (mails de cuentas, una compra con sus
respuestas, una nota interna), y revisa todas las listas, feeds, JSON, imágenes para compartir y
direcciones directas. Es de vitest, sin navegador. Si agregás una salida pública, sumala ahí con una línea (ver
[objetos.md](objetos.md)).

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
  si no puede verificar. También lo frena si el PR cambia `docs/plan.md` y no tiene un
  comentario `Plan revisado contra main <sha>` con el SHA actual de `main` (completo o de 7
  caracteres o más): antes de mergear, se relee el diff del plan contra el `main` de ese momento y
  se deja ese comentario; si `main` se movió, se relee y se comenta de nuevo. Es una ayuda contra
  errores; la protección de verdad es la de `main` en GitHub (`ci-ok`).
- **Al arrancar una sesión** (`scripts/hooks/session-start.sh`): corre `npm ci` si falta
  `node_modules` o cambió `package-lock.json`.

## Antes de pushear

```sh
npm run lint
npm run test:related          # las pruebas de lo que cambiaste (la CI corre todas: npx vitest run)
npm run build
node scripts/svelte-check-ratchet.js
npm run format:check          # la CI lo corre (npm run format lo arregla)
npx playwright test -c playwright.tickets.config.js  # si tocaste entradas o el panel (la CI no lo corre)
```

Pegá el resumen de cada uno en la descripción del PR (y si corriste `test:related` o la suite
entera), junto con la línea `Plan: <id>` o `Plan: ninguno` ([plan.md](plan.md)). Si tocaste
`docs/plan.md` o el `phase` de `nav.js`, corré también `node scripts/plan-lint.js`. No se dice "los
tests pasan" sin haberlos corrido. La CI corre siempre la suite entera.

## Cuando algo está en rojo

1. Abrí el chequeo en rojo en el PR ("Details") y buscá el primer error del log.
2. Según cuál:
   - **Lint**: `npm run lint` en tu compu muestra lo mismo; arreglalo (o `npm run format` si es
     formato).
   - **Unit tests** (job `unit`): `npx vitest run <archivo>` reproduce.
   - **Build** (job `e2e`, paso «Build + seed + Chromium»): `npm run build`; suele ser un import
     roto. Si falla la semilla o Chromium en el mismo paso, el log los muestra:
     `node scripts/semilla.js` reproduce la semilla.
   - **E2E smoke tests**: el job sube `playwright-results` (capturas y trazas) como artifact por
     7 días. Reproducí con `npm run test:e2e`. En CI hay un reintento, así que si falló dos veces
     no es casualidad.
   - **typecheck**: el log lista cada error de tipos; arreglalos (no subas la línea de base).
   - **plan**: el log lista cada problema de `docs/plan.md` con su línea;
     `node scripts/plan-lint.js` reproduce.
   - **plan-pr**: falta la línea `Plan:` en la descripción del PR o nombra un id que no está en
     el plan. Editá la descripción (o sumá el ítem al plan en el PR).
   - **CodeQL**: lee la alerta en la pestaña Security. Si es un problema real de seguridad, no
     lo detalles en público: arreglalo y avisale a gorrite en privado.
   - **Worker bundle (wrangler dry-run)**: `npm run build && npx wrangler deploy --dry-run --outdir .wrangler/dry-run`
     reproduce; suele ser un import que el runtime de Workers no tiene.
   - **Workers Builds**: el link "Details" lleva al log del build en Cloudflare.
3. **Nunca** se saltea, borra ni afloja una prueba para que dé verde (`.skip`, sacar
   `expect`, `continue-on-error`). Si una prueba está mal, se dice en el PR y se arregla a la vista.
4. Si parece intermitente (pasa y falla sin cambios), no lo tapes con reintentos: anotalo en el PR
   o abrí un issue.
