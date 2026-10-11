# Impacto visual de un cambio

## En pocas palabras

Antes de aprobar un cambio de diseño (un color, un componente, un espaciado), conviene ver **qué
páginas cambian y cómo**. `npm run ui:impacto` saca capturas de unas 20 páginas principales del
sitio y del panel, en celu y en compu, dos veces: con la versión de antes (la «base», por
ejemplo `main`) y con la de ahora. Las compara píxel a píxel y arma un informe,
`ui-impacto/index.html`: arriba dice «Cambiaron N de M capturas» y abajo, página por página,
**base | nuevo | diferencias** (lo que cambió, pintado de magenta). Primero las que cambiaron; las
iguales quedan plegadas al final.

En cada PR que toca estilos o componentes, la CI lo corre sola (job `ui-impacto`) y deja el
informe como artifact. **Es solo informativo: nunca frena un merge.**

## Lo que no se rompe

- **Datos inventados, nada real.** Cada lado usa su propia base D1 local, en una copia temporal,
  con el contenido de los `.md` del repo y los datos de prueba del modo demo ([demo.md](demo.md)).
  Nunca toca la base de `npm run dev` ni una base remota, ni manda mails, ni cobra (Mercado Pago
  simulado, sesión de admin falsa como `npm run dev:admin`).
- **El job no bloquea**: no está en los `needs` de `ci-ok` y tiene `continue-on-error: true`. Es la
  única excepción a la regla de [pruebas-y-ci.md](pruebas-y-ci.md), porque no es una prueba. Nunca
  se usa `continue-on-error` en un job de pruebas.
- Las capturas tienen que ser **repetibles**: si una página cambia sola (una hora relativa, algo al
  azar), ensucia todos los informes. Ver «Si algo cambia sin que nadie lo toque», abajo.

## Correrlo en tu compu

```sh
npx playwright install chromium        # una vez
npm run ui:impacto -- --base origin/main
# abrí ui-impacto/index.html en el navegador
```

Compara la base (`--base`: una rama, un tag o un commit; por defecto `origin/main`, hacé
`git fetch` antes) contra **tu árbol tal como está**, incluidos los cambios sin commitear y los
archivos nuevos. No toca tu árbol, tu stash ni tu base local.

Opciones:

| Opción               | Qué hace                                                                        |
| -------------------- | ------------------------------------------------------------------------------- |
| `--base <ref>`       | contra qué comparar (por defecto `origin/main`)                                 |
| `--out <carpeta>`    | dónde escribir el informe (por defecto `ui-impacto/`, que git ignora)           |
| `--solo inicio,wiki` | solo esas páginas (los `id` de `scripts/ui-impacto/pages.js`): mucho más rápido |
| `--ahora <fecha>`    | el «hoy» simulado, en ISO (por defecto, hoy a las 12:00 de Argentina)           |
| `--umbral <n>`       | cuántos píxeles distintos se toleran antes de decir «cambió» (por defecto 0)    |
| `--conservar`        | no borra las copias temporales (para investigar un error)                       |

`PW_CHROMIUM_PATH` usa un Chromium ya instalado, como en las pruebas E2E.

Tarda unos **10 minutos** en una compu de 4 núcleos: ~3 para armar la base local (importar el
contenido de los `.md` es lo más lento), ~3 por lado para levantar `vite dev`, visitar cada página
una vez y sacar las 44 capturas. Si los dos lados tienen los mismos datos (mismas migraciones,
posts, `src/lib/server` y `scripts`: lo normal en un cambio de diseño), la base se arma una sola
vez y se copia. Con `--solo` las capturas tardan bastante menos (la base, no).

## Cómo leer el informe

- **Arriba**: base y nuevo (con su commit), el «hoy» simulado, y la frase «Cambiaron N de M
  capturas (X de Y páginas)», con la lista de las páginas para mirar.
- **Para mirar**: cada página con sus dos tamaños (celu 390 × 844 y compu 1280 × 800). Para cada
  uno, tres columnas: **base**, **nuevo** y **diferencias** (la captura nueva desteñida, con lo
  distinto en magenta). Tocá una imagen para verla en tamaño real. El porcentaje dice cuánto de la
  imagen cambió: un color de borde da poquito; un cambio de espaciado mueve todo lo de abajo y da
  mucho, aunque visualmente sea chico.
- Estados: **cambió**; **solo en el cambio** o **solo en la base** (la página falló o no existe en
  un lado: el error se ve debajo); **no se pudo capturar** (falló en los dos lados).
- **Páginas sin cambios**: plegadas al final, con una sola captura.
- `registro/base.log` y `registro/nuevo.log`: la salida de cada lado (npm, la base, el servidor y
  cada captura), para cuando algo falla. `resumen.json` tiene los mismos datos que el informe.

Las capturas son de página completa, cortadas a 8000 px de alto.

## En la CI

El job `ui-impacto` de `.github/workflows/ci.yml` corre en cada pull request, pero solo hace algo
si el PR cambia `src/**/*.svelte`, `src/**/*.scss`, `src/**/*.css`, `src/lib/styles/**` o
`src/lib/components/**` (si no, termina enseguida y lo dice en el resumen). Compara el merge del PR
contra su base (`--base HEAD^1`: el primer padre del merge que arma GitHub). Después:

- en la página de la corrida (Summary) queda el resumen: cuántas capturas cambiaron y una tabla
  con las páginas y cuánto cambió cada tamaño;
- el informe completo queda como artifact **`ui-impacto`** (14 días): bajalo, descomprimilo y abrí
  `index.html`.

Aunque falle (o tarde más de 30 minutos), el PR puede mergearse igual: `ci-ok` no lo espera.

## Cómo funciona

Todo está en `scripts/ui-impacto/`:

| Archivo      | Qué hace                                                                                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run.js`     | Arma una copia temporal de cada lado con `git worktree` (el árbol actual entra con `git stash create`, que no toca el stash, más los archivos nuevos), `npm ci`, la base, el servidor y las capturas; compara y escribe el informe                                                    |
| `seed.js`    | Prepara la base local de un lado con **su** código: migraciones + `scripts/import-content.js`, `reloadDemoData()` del modo demo, `n3-personas.sql` y `n3-cuentas.sql`, y una sesión de la persona de prueba (para Mi rincón). Lo que ese lado no tiene se saltea y el informe lo dice |
| `setup.js`   | Lo que se carga con el servidor ya levantado, como une admin (el código usa `$lib` y no se puede llamar desde Node): la segunda parte del taller de prueba                                                                                                                            |
| `clock.js`   | Reloj corrido: el servidor y el seed arrancan en el «hoy» simulado (la base y el cambio ven el mismo día aunque se corran a otra hora)                                                                                                                                                |
| `pages.js`   | La lista de páginas y los dos tamaños                                                                                                                                                                                                                                                 |
| `shoot.js`   | Las capturas con Playwright: un contexto nuevo por captura, cartel de edad aceptado, tema claro, sin animaciones, fuentes e imágenes cargadas, reloj del navegador en el «hoy» simulado y sin pedidos a otros sitios                                                                  |
| `compare.js` | La comparación (pixelmatch) y el resumen, puros (`compare.test.js`)                                                                                                                                                                                                                   |
| `report.js`  | El HTML y el Markdown del informe, puros                                                                                                                                                                                                                                              |

Cada lado se sirve con `vite dev` (como `npm run dev:tickets`) porque la sesión de admin falsa solo
existe en desarrollo. Antes de capturar se visita cada página una vez, para que la compilación de
`vite dev` no caiga en una captura.

## Tareas comunes

- **Sumar una página**: una entrada en `PAGES` de `scripts/ui-impacto/pages.js` (`id` corto, que es
  el nombre de las capturas, `title`, `path(ctx)` y, si hace falta, `prepare(page, ctx)` para tocar
  algo antes de la captura). Si necesita datos nuevos, se agregan en `seed.js`. Probala con
  `npm run ui:impacto -- --solo <id>`.
- **Si algo cambia sin que nadie lo toque** (aparece como «cambió» comparando una rama consigo
  misma: `npm run ui:impacto -- --base HEAD` con el árbol limpio): marcá ese elemento con el
  atributo `data-ui-impacto-mascara` (se tapa con un recuadro gris en las dos capturas) o sumá su
  selector a `MASK_SELECTORS` de `shoot.js`.
- **Una página da error**: el mensaje está debajo de la captura y en `registro/<lado>.log`. Con
  `--conservar` quedan las copias temporales para levantar ese lado a mano.
