# Estilo visual: tokens

Los colores, tamaños de letra, espacios, radios y sombras del sitio y del panel salen de variables
CSS («tokens») definidas en [`src/lib/styles/style.scss`](../src/lib/styles/style.scss) (`:root`).
El panel de admin redefine los de color y sombra para su tema oscuro en
[`src/lib/admin/panel.scss`](../src/lib/admin/panel.scss) (`@mixin light` / `@mixin dark`).

## Lo que no se rompe

- En los componentes no van px/rem sueltos para letra, `gap` o `padding`: usá un token. Si ningún
  token sirve, mejor preguntar antes que inventar un tamaño.
- Pesos de letra: **400 y 700**, nada más (Lato no tiene 600; el navegador lo dibuja como 700).
- Colores nuevos no: mezclá los del sitio con `color-mix` o usá los alias de abajo.
- Si agregás un token de color o sombra, dale también su valor oscuro en `@mixin dark` del panel.
- Los posts (`src/lib/posts/`) no se tocan: los editan personas desde el panel.

## Texto (escala fluida de Utopia)

Crecen solos entre un celu de 320px y una pantalla de 1240px. Usá los alias; los pasos
`--step--2` … `--step-5` siguen existiendo (el h1 de los posts usa `--step-5`).

| Token          | Tamaño      | Para qué                                                                                       |
| -------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `--text-xs`    | 12.5–12.8px | chips, contadores, fechas chiquitas, notas al pie                                              |
| `--text-sm`    | 15–16px     | texto secundario, tablas, el texto común del panel                                             |
| `--text-base`  | 18–20px     | texto de lectura (posts, descripciones largas)                                                 |
| `--text-lg`    | 21.6–25px   | subtítulos chicos, números destacados                                                          |
| `--text-xl`    | 26–31px     | títulos de sección                                                                             |
| `--text-2xl`   | 31–39px     | títulos de página                                                                              |
| `--text-3xl`   | 37–49px     | títulos grandes                                                                                |
| `--text-field` | 16px        | letra de inputs y textareas: nunca menos de 16px, si no Safari en iPhone hace zoom al tocarlos |

Los `em` quedan para ajustes relativos al texto de alrededor (un ícono, un `.small` dentro de un
botón).

## Espacio (escala fluida de Utopia)

Para `gap`, `padding` y márgenes. Mismos parámetros que el texto.

| Token         | Tamaño    | Para qué                                               |
| ------------- | --------- | ------------------------------------------------------ |
| `--space-3xs` | 4.5–5px   | entre un ícono y su texto, chips pegados               |
| `--space-2xs` | 9–10px    | gap de una fila de botones o chips, padding de un chip |
| `--space-xs`  | 13.5–15px | padding de inputs y filas de listas                    |
| `--space-s`   | 18–20px   | padding de una tarjeta, gap entre tarjetas             |
| `--space-m`   | 27–30px   | entre bloques de una página                            |
| `--space-l`   | 36–40px   | entre secciones                                        |
| `--space-xl`  | 54–60px   | márgenes grandes de página                             |
| `--space-2xl` | 72–80px   | separaciones de portada                                |
| `--space-3xl` | 108–120px | idem, muy grandes                                      |

Los pares (`--space-3xs-2xs`, `--space-2xs-xs`, `--space-xs-s`, `--space-s-m`, `--space-m-l`,
`--space-l-xl`, `--space-xl-2xl`, `--space-2xl-3xl`, y `--space-s-l`) van de un paso en el celu
al otro en desktop: sirven para el padding de páginas y secciones, que en el celu tiene que achicarse
más que el resto.

Algunos valores viejos (0.4rem, 0.2rem, 0.1rem…) quedaron sueltos porque ningún paso les queda
cerca; se van a ir pasando a tokens a medida que se rediseñe cada componente.

## Radios

| Token           | Tamaño    | Para qué                                              |
| --------------- | --------- | ----------------------------------------------------- |
| `--radius-s`    | 9–10px    | chips cuadrados, inputs chicos, miniaturas            |
| `--radius-m`    | 13.5–15px | tarjetas y cajas comunes                              |
| `--radius-l`    | 18–20px   | tarjetas grandes, diálogos (`--card-round` del panel) |
| `--radius-pill` | 999px     | botones en píldora, chips redondos, buscador          |

Nombres viejos que siguen andando: `--round` (1rem), `--round-sm` (= `--radius-s`),
`--round-pill` (= `--radius-pill`).

## Sombras

Solo tres:

| Token        | Para qué                                                     |
| ------------ | ------------------------------------------------------------ |
| `--shadow-1` | tarjetas apoyadas sobre el fondo (`--shadow` es el mismo)    |
| `--shadow-2` | menús, popovers, tooltips, el «levantarse» al pasar el mouse |
| `--shadow-3` | diálogos, paletas de búsqueda, cosas que flotan sobre todo   |

Los brillos de color (rosa alrededor de un botón) y los bordes hechos con `box-shadow: inset …` no
son sombras: esos quedan como están.

## Colores

- Marca: `--1` rosa, `--2` violeta, `--3` verde, `--4` amarillo, cada uno con `-light`, `-dark` y
  `-tint` (fondo pálido); texto legible sobre los tints: `--1-ink`, `--2-dark`, `--3-ink`, `--4-ink`.
- Neutros del sitio: `--bg` (fondo), `--surface` (tarjetas), `--ink` (texto), `--muted`
  (secundario), `--line` (bordes), `--hover`.
- **`--error`** (rojo) y **`--error-bg`**: errores, malas noticias, avisos que importan y acciones
  permanentes que no se pueden deshacer (borrar para siempre). «Guardado ✓» y «Deshacer» **no**
  van en rojo: siguen en verde (`--ok`) o neutro.
- **`--placeholder`**: el texto de ejemplo de los inputs. Gris, bastante más claro que el texto
  real y en cursiva, para que un campo vacío nunca parezca lleno. La regla está una sola vez en
  `style.scss`; los componentes no la pisan (lo controla `src/tests/placeholders.test.js`).
- En el panel hay alias propios (`--text`, `--accent`, `--ok`, `--warn`, `--bad`, `--info`…),
  listados al principio de `panel.scss`.

## Foco

- Teclado: anillo violeta (`--focus-ring`) en todo lo que se puede enfocar (`:focus-visible`).
- Campos de texto (inputs de texto y textareas): borde rosa (`--focus-field`) cuando tienen el
  foco, también con el mouse, así se ve dónde se está escribiendo.
- No saques el `outline` sin poner otra señal de foco igual de visible.

## Piezas

Las piezas compartidas, con las decisiones de gorrite de la revisión de UI. Usá estas antes de
armar una variante nueva en un componente.

| Pieza                | Cómo se usa                                                                                                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Botón principal      | `.kv-btn` (panel) / `.pill-btn` (sitio): píldora rosa llena, sin sombra 3D ni violeta. El botón de **comprar entradas** es otro y queda distinto.                                                                                                         |
| Botón secundario     | `.kv-btn.ghost` / `.pill-btn.ghost`: píldora con borde rosa.                                                                                                                                                                                              |
| Destructivo          | `.danger`: rosa oscuro lleno, **con ícono** (por ejemplo `Trash2`). Para lo que se puede deshacer.                                                                                                                                                        |
| Permanente           | `.permanent`: rojo (`--error`). Solo para lo que no tiene vuelta atrás (borrar para siempre).                                                                                                                                                             |
| Tamaños              | Uno normal (44px de alto) y uno chico (`.small`; `.sm` es lo mismo). Solo ícono: `.icon`, con `aria-label` y `title`.                                                                                                                                     |
| Campo de texto       | `.kv-input` o `<label class="kv-field">`: rectángulo neutro (borde `--field`, `--radius-s`), 44px, letra de 16px. Con foco, borde rosa. Píldora solo en buscadores (`type="search"`). Grande (~54px, `.large`) solo en el flujo de compra.                |
| Casilla              | `<input type="checkbox">` ya sale con el estilo del sitio (`style.scss`). Va cuando hay un botón Guardar.                                                                                                                                                 |
| Interruptor          | `<input type="checkbox" role="switch">`: para prender/apagar al instante, sin Guardar (como Ajustes › Interruptores). Feedback: «Guardando…» → «Guardado ✓».                                                                                              |
| Uno de N             | `.kv-segmented` (como «Mostrar \| Ocultar» del sitio, más grande, en minúscula normal, 44px). En el panel: `charts/Segmented.svelte`. Si cada opción lleva descripción: tarjetas con radio (`.kv-choice`).                                                |
| «Estás acá»          | Violeta sobre lila (`--link` sobre `--link-bg`; en el sitio `--2-dark` sobre `--2-tint`): pestañas, menú lateral, índice del editor, menú del sitio.                                                                                                      |
| Tarjeta              | `Card.svelte`: blanca lisa. `status` pone un borde de color a la izquierda (solo si hay un estado); `filled` la llena de color para destacar. La entrada conserva su borde punteado.                                                                      |
| Badge                | `Badge.svelte`: **siempre con ícono** (si no pasás `icon`, va el del tono). Muchas para comparar: el color dice qué significa; pocas: que combine con el componente.                                                                                      |
| Avisos               | `.kv-flash`: verde por defecto («Guardado ✓»); `.bad` es rojo (`--error`) para errores y malas noticias; `.warn` amarillo. `UndoToast` con `error` también va en rojo; «Deshacer» sigue verde.                                                            |
| Confirmación         | Diálogo centrado: `askConfirm({ title, text, confirmLabel, tone })` de `$lib/admin/confirm.js` (nunca `window.confirm`). `tone`: `primary`, `danger` o `permanent`. Borrar para siempre mantiene su página de escribir para confirmar, con el botón rojo. |
| Diálogo propio       | `<dialog class="kv-dialog">` con `<div class="kv-dialog-btns">`.                                                                                                                                                                                          |
| Lista vacía          | `EmptyState.svelte`: ícono de Lucide + título + una línea gris (sin emoji). «Próximamente» sigue con su caja punteada.                                                                                                                                    |
| Hoja del celu        | Se cierra arrastrando hacia abajo **y** con una X: `use:sheetDrag` de `$lib/admin/sheetDragAction.js`.                                                                                                                                                    |
| Acción de texto      | `.kv-link`: violeta, subrayado, con ícono adelante. Los «ver más» tienen su propio estilo.                                                                                                                                                                |
| Tabla                | `.kv-table` para leer; el estilo de planilla editable solo donde se edita.                                                                                                                                                                                |
| Encabezado de página | El de la ficha de evento (imagen, título, fecha, chips, acciones); sin imagen, el ícono grande del tipo.                                                                                                                                                  |

Íconos: los de [Lucide](https://lucide.dev) (`@lucide/svelte`) en la interfaz. Los emoji quedan
para el contenido y las etiquetas.

## Textos

Las palabras del panel y del sitio, con las decisiones de gorrite de la revisión de UI (paso 3).
Valen para el texto que se ve; los ids de etiquetas, las URLs, los slugs, los valores de la base y
el dominio no cambian.

| Qué                 | Cómo                                                                                                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Iniciar sesión      | **«Entrar»** («Entrar con GitHub», «Entrá a tu cuenta…»). Nunca «Iniciar sesión» ni «Ingresar».                                                                                                                                              |
| Modo puerta         | **«Puerta»**: la sección del menú (`/admin/checkin`), la pestaña de la ficha del evento y la pantalla de escanear. No «Check-in», «Ingreso» ni «Modo puerta».                                                                                |
| La marca            | **«Kinky Vibe»** (dos palabras), también en los asuntos de los mails (los que cambió une admin en Plantillas quedan como están). No en la etiqueta `KinkyVibe`, las URLs, el dominio, el código ni el remitente.                             |
| Verbos              | «Borrar» (contenido), «Sacar» (de una lista o relación), «Apagar»/«Prender» (interruptores, códigos), «Guardar» (lo que ya existe), «Crear» (lo nuevo).                                                                                      |
| Estados de la venta | «Agotadas» y «Venta cerrada».                                                                                                                                                                                                                |
| Fechas              | Listas: `vie 2 oct · 22:00` (`argDateList`). Encabezados y mails: `viernes 2 de octubre de 2026, 22:00` (`argDateTimeLong`). Registros: «hace X» o `2/10/26 13:43` (`argDateLog`). Sin fechas ISO ni «hs». Todo en `src/lib/utils/dates.js`. |
