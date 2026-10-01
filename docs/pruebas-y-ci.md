# Pruebas y CI

## En pocas palabras

Cada vez que alguien abre o actualiza un pull request, GitHub corre solo una serie de chequeos:
revisa el estilo del código, corre más de mil pruebas automáticas, compila el sitio y lo recorre
con un navegador de verdad. Al mismo tiempo, Cloudflare publica una copia de prueba del sitio
(un "preview") con su propio link. Si todo da verde aparece el tilde ✅ **`ci-ok`**, que es la
única condición que GitHub exige para poder mergear. Si algo da rojo ❌, el PR no entra hasta
arreglarlo. Y además, nadie mergea sin que gorrite lo apruebe.

## Qué corre en cada PR

| Chequeo (nombre en GitHub)                            | Qué hace                                                                                 | Dónde está                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `test`                                                | lint → pruebas unitarias (vitest) → build → pruebas en navegador (Playwright, humo)      | `.github/workflows/ci.yml`                                      |
| `typecheck`                                           | svelte-check con "trinquete": falla si hay más errores de tipos que la línea de base (0) | `scripts/svelte-check-ratchet.js`                               |
| **`ci-ok`**                                           | pasa solo si `test` y `typecheck` pasaron. **Es el único chequeo obligatorio**           | `.github/workflows/ci.yml`                                      |
| `Cloudflare Pages`                                    | publica un preview del PR con su link (con modo demo, ver [demo.md](demo.md))            | configurado en Cloudflare                                       |
| `CodeQL`, `Analyze (javascript)`, `Analyze (actions)` | escaneo de seguridad de GitHub sobre el código y los workflows                           | configuración por defecto de GitHub (no hay archivo en el repo) |

`ci-ok` existe para que la protección de `main` pida un solo chequeo: si alguien agrega un job a
`ci.yml`, lo suma a los `needs` de `ci-ok` y listo, sin tocar la configuración de GitHub.

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
miniflare), creada en memoria con `createTestDB()` de `src/lib/server/db/testing.js`, que aplica
**todas las migraciones de `migrations/`**. No necesitan internet ni tocan la base local de
`npm run dev`. Así se prueba, por ejemplo, que 30 compras al mismo tiempo no vendan de más. Las
migraciones que reconstruyen tablas tienen su propia prueba con datos
(`src/lib/server/db/migration0010.test.js`). Más en [datos.md](datos.md).

### En el navegador (Playwright)

Hay dos juegos, con configuraciones distintas:

| Juego                       | Config                         | Contra qué corre                                                            | ¿En CI?                                         |
| --------------------------- | ------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------- |
| Humo (`tests/*.spec.js`)    | `playwright.config.js`         | el build de producción (`vite preview`, puerto 4173)                        | **Sí**                                          |
| Entradas (`tests/tickets/`) | `playwright.tickets.config.js` | `npm run dev:tickets` en el puerto 5371, con Mercado Pago y admin simulados | No: correlo a mano si tocás entradas o el panel |

```sh
npx playwright install --with-deps chromium          # una vez
npm run test:e2e                                     # humo (compila antes; PW_NO_BUILD=1 reusa el build)
npx playwright test -c playwright.tickets.config.js  # entradas, editor de eventos y ajustes
```

Variables útiles: `PW_CHROMIUM_PATH` (humo) o `PW_CHROMIUM` (entradas) para usar un Chromium ya
instalado; `TICKETS_SHOTS_DIR` para guardar capturas.

### Tipos (svelte-check con trinquete)

`node scripts/svelte-check-ratchet.js` corre svelte-check y compara con
`scripts/svelte-check-baseline.json`, que hoy está en **0 errores**. Falla si aparece uno nuevo.
Si alguna vez bajan, se baja el número en el mismo PR; **nunca se sube** para que dé verde.

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
```

Pegá el resumen de cada uno en la descripción del PR. No se dice "los tests pasan" sin haberlos
corrido.

## Cuando algo está en rojo

1. Abrí el chequeo en rojo en el PR ("Details") y buscá el primer error del log.
2. Según cuál:
   - **Lint**: `npm run lint` en tu compu muestra lo mismo; arreglalo (o `npm run format` si es
     formato).
   - **Unit + content tests**: `npx vitest run <archivo>` reproduce. Si es el chequeo del
     contenido, el mensaje dice qué publicación y qué propiedad.
   - **Build**: `npm run build`; suele ser un import roto o un `.md` con propiedades mal escritas.
   - **E2E smoke tests**: el job sube `playwright-results` (capturas y trazas) como artifact por
     7 días. Reproducí con `npm run test:e2e`. En CI hay un reintento, así que si falló dos veces
     no es casualidad.
   - **typecheck**: el log lista cada error de tipos; arreglalos (no subas la línea de base).
   - **CodeQL**: lee la alerta en la pestaña Security. Si es un problema real de seguridad, no
     lo detalles en público: arreglalo y avisale a gorrite en privado.
   - **Cloudflare Pages**: el link "Details" lleva al log del build en Cloudflare.
3. **Nunca** se saltea, borra ni afloja una prueba para que dé verde (`.skip`, sacar
   `expect`, `continue-on-error`). Si una prueba está mal, se dice en el PR y se arregla a la vista.
4. Si parece intermitente (pasa y falla sin cambios), no lo tapes con reintentos: anotalo en el PR
   o abrí un issue.
