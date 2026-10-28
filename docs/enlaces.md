# Cómo se escribe el cuerpo de un objeto

La referencia de la sintaxis del cuerpo de todo lo que se escribe en el sitio: entradas de la
Kinkipedia, material, perfiles (amigues y lugares), eventos y series. Es la fuente de verdad para
quien programa (personas y agentes): si cambiás cómo se escribe o se dibuja un cuerpo, cambiá esto
en el mismo PR. Por qué es así: [0047](decisiones/0047-cuerpos-enlazados.md). La sintaxis de
búsqueda (la que va dentro de una consulta viva) está en [buscar.md](buscar.md).

> **Estado (28/10):** acordado con gorrite, **casi nada hecho todavía**. Hoy anda Markdown con
> los `[[término : texto]]` viejos (solo a la Kinkipedia) y las menciones `@`, y al guardar, los
> `[[…]]`, `![[…]]`, `@` y `#` del cuerpo ya quedan como edges `enlaza` (abajo, «Al guardar»),
> aunque todavía no se dibujen. «Lo que enlaza acá» ya está, detrás del interruptor
> `lo_que_enlaza` (apagado; abajo). La columna «Hoy» dice qué ya se dibuja; cada PR que suma algo la
> actualiza.

## La idea

Los cuerpos son una **red de páginas enlazadas**, como en Obsidian, Logseq o Anytype: cada objeto
puede enlazar a cualquier otro, y cada página muestra **lo que enlaza acá**. La Kinkipedia es la
más enciclopédica; el material tiene otro tono, pero es la misma red.

**No se inventa una sintaxis**: se toma una ya conocida para cada cosa, **una sola forma de
escribir cada cosa**:

- la base es **Markdown** ([CommonMark](https://commonmark.org) con las extensiones de
  [GFM](https://github.github.com/gfm/): notas al pie, tablas);
- enlaces, incrustados, etiquetas y avisos, como **Obsidian**
  ([Obsidian Flavored Markdown](https://help.obsidian.md/obsidian-flavored-markdown));
- componentes (un botón de compra, un mapa) con las **directivas** de la propuesta de CommonMark
  ([generic directives](https://talk.commonmark.org/t/generic-directives-plugins-syntax/444), con
  `remark-directive`);
- y tres cosas nuestras o de otro lado, marcadas abajo.

Lo que esos documentos ya explican no se repite acá: esto dice qué tomamos, qué agregamos y cómo
lo guarda y lo dibuja el sitio.

## Qué se puede escribir

| Escribís                              | Qué es                                                                                     | De dónde            | Hoy                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------- | ------------------------- |
| Markdown (títulos, listas, negrita…)  | Lo de siempre.                                                                             | CommonMark          | sí                        |
| `texto[^1]` y `[^1]: la nota`         | Nota al pie, con su «volver».                                                              | GFM                 | —                         |
| tablas                                | Tablas de Markdown.                                                                        | GFM                 | —                         |
| `[[Consentimiento]]`                  | Enlace a ese objeto (cualquier tipo), por su título o sus otros nombres.                   | Obsidian            | solo a la Kinkipedia      |
| `[[Consentimiento\|lo que dijimos]]`  | El mismo enlace con otro texto visible.                                                    | Obsidian, MediaWiki | —                         |
| `[[Consentimiento : lo que dijimos]]` | Lo mismo, la forma vieja del sitio (con espacios alrededor de `:`). Sigue andando siempre. | nuestra             | sí (solo a la Kinkipedia) |
| `[[Consentimiento#En la práctica]]`   | Enlace a una sección.                                                                      | Obsidian            | —                         |
| `[[Consentimiento#^a1b2]]`            | Enlace a un párrafo (más adelante).                                                        | Obsidian            | —                         |
| `![[Taller de cuerdas nivel 1]]`      | El objeto incrustado como tarjeta (un evento con su fecha y su botón, una imagen…).        | Obsidian            | —                         |
| `#cuerdas`                            | Etiqueta dentro del texto (enlaza a la etiqueta y se la suma al objeto).                   | Obsidian            | —                         |
| `#[[reducción de daños]]`             | Etiqueta con espacios.                                                                     | Logseq              | —                         |
| `@nombre`                             | Mención de un perfil del sitio (enlaza a su página).                                       | nuestra             | sí                        |
| `> [!aviso] Título`                   | Un aviso destacado (tipos: `aviso`, `nota`, `idea`…).                                      | Obsidian            | —                         |
| bloque ` ```consulta `                | Una lista viva: adentro va una búsqueda ([buscar.md](buscar.md)).                          | Dataview (Obsidian) | —                         |
| `:nombre[texto]{opciones}`            | Un componente dentro de una oración (`:precio[$ 12.000]{tipo=general}`).                   | directivas          | —                         |
| `::nombre[texto]{opciones}`           | Un componente en su línea (`::comprar`, `::mapa`, `::galeria`).                            | directivas          | —                         |
| `:::nombre[título]` … `:::`           | Un bloque que envuelve texto (`:::aviso-de-contenido`, `:::columnas`).                     | directivas          | —                         |

- Un `#` seguido de espacio es un título de Markdown, nunca una etiqueta.
- `\@` y `\#` escriben el signo sin que sea mención ni etiqueta (`\@` ya anda).
- Un enlace o una etiqueta dentro de código (`` `[[esto]]` `` o un bloque de código) no se toca.
- Las directivas son **solo para componentes**: lo que Obsidian ya cubre (enlaces, incrustados,
  avisos) se escribe como Obsidian. Una directiva que el sitio no conoce muestra su texto tal cual
  (no se pierde nada).
- **Lo que no se usa** (para que no haya dos formas de lo mismo): las propiedades `clave:: valor`
  de Logseq (los datos van en los campos del formulario), `{% %}` de Markdoc (lo cubren las
  directivas) y `((id))` de Logseq (lo cubre `[[…#^id]]`).

### Las consultas vivas

````md
```consulta
evento: #shibari desde:hoy
```
````

Se dibuja como la lista de lo que trae esa búsqueda, siempre al día. Cualquier visor de Markdown
la muestra como un bloque de código, así que no rompe nada. Solo trae lo público (lo mismo que el
buscador del sitio).

### Los componentes (directivas) que hay

Cada uno se suma a esta tabla cuando se hace:

| Directiva                          | Qué dibuja                                                                 | Hoy |
| ---------------------------------- | -------------------------------------------------------------------------- | --- |
| `:precio[…]{tipo=…}`               | El precio de un tipo de entrada, en vivo.                                  | —   |
| `::comprar{evento=…}`              | El botón de compra con sus estados (agotadas, lista de espera, la puerta). | —   |
| `::mapa{lugar=…}`                  | El mapa del lugar, con la precisión que deja su privacidad.                | —   |
| `::galeria{carpeta=…}`             | Una galería de la biblioteca.                                              | —   |
| `:::aviso-de-contenido[…]` … `:::` | Tapa el texto hasta que se toca «Mostrar».                                 | —   |
| `:::columnas` … `:::`              | El texto en dos columnas (una en el celu).                                 | —   |

## Cómo lo guarda y lo dibuja el sitio

- **Se guarda Markdown**: es lo que se edita, en los dos editores (abajo).
- **Los enlaces van a la base**: al guardar, cada `[[…]]`, `![[…]]`, `@` y `#` se resuelve a un
  objeto y queda como una relación en el grafo (`edges`, con su tipo). De ahí salen «Lo que enlaza
  acá» y `enlaza:` en la búsqueda. **Ya anda** (abajo, «Al guardar» y «Lo que enlaza acá»).
- **Apuntan al objeto, no al título**: cambiarle el nombre a una entrada no rompe los enlaces y se
  ven con el nombre nuevo.
- **Quién puede ver qué**: un enlace a algo que quien lee no puede ver se dibuja como texto
  común; «Lo que enlaza acá» nunca muestra algo oculto, «solo con cuenta» o sin aprobar a quien no
  lo puede ver.
- **Lo que falta**: un enlace a algo que no existe queda marcado «falta» (se ve, no se rompe). El
  panel lista todo lo que falta y cuántas veces se enlaza: la lista de qué escribir para hacer
  crecer la Kinkipedia.
- **Lo viejo**: los links internos que hoy están como URL (`/wiki/…`, `/material/…`) se pasan a
  `[[…]]` de a tandas, cada una con el OK de gorrite en la Mesa.

### Al guardar: el edge `enlaza`

Lo hace `saveObject()` en cada guardado, por cualquier camino (panel, Mi rincón, importaciones), en
la misma tanda que el objeto: es un edge **calculado** (`derived`, como `adjunto` del material,
[objetos.md](objetos.md)). Lo tienen los cuatro tipos con cuerpo (`data.body`): evento, material,
perfil y etiqueta (el texto de la wiki).

- **Qué se lee**: `bodyReferences` (`src/lib/utils/enlaces.js`) saca del cuerpo lo que nombran
  `[[…]]`, `![[…]]`, `@nombre`, `#etiqueta` y `#[[etiqueta]]`, sin el texto visible (`|texto`,
  ` : texto`) ni la sección (`#…`). No cuenta lo que está en código, en `<script>`/`<style>`, en
  comentarios HTML, en direcciones (`instagram.com/@alguien`, `href="#x"`) ni lo escapado.
- **Cómo se resuelve** (`src/lib/server/objects/enlaces.js`, solo entre objetos vivos y nunca el
  mismo objeto):
  - `@nombre`: el perfil con esa dirección (la vieja de la ficha o la del objeto), como
    `/amigues/<nombre>`;
  - `#etiqueta`: la etiqueta con ese nombre (`key`; un alias es una etiqueta más), comparado como
    `/wiki/<término>` (sin mayúsculas, guiones por espacios), o con esa dirección;
  - `[[nombre]]`: primero una etiqueta (lo que hacen hoy los `[[…]]`), si no el objeto con ese
    título (sin mayúsculas), si no el de esa dirección. Si empatan dos tipos gana material, después
    evento, perfil y etiqueta; en el mismo tipo, el más viejo.
- **Qué se guarda**: un edge `enlaza` por objeto, en el orden del texto (`position`), sin `data`,
  como mucho 200 por objeto. Se suman los nuevos y se sacan los que el texto ya no nombra; los demás
  edges (`persona`, `etiqueta`, `lugar`…) no se tocan. Nadie los manda a mano (es un error).
- **Lo que falta no se guarda**: un edge necesita un objeto en la otra punta y no hay tabla para
  los nombres sueltos. La lista de lo que falta (abajo, «Enlaces que faltan») lo vuelve a calcular
  leyendo los cuerpos, con la misma resolución.
- **Lo que se guarda junto con otros**: en una importación grande (`saveObjects`), un enlace a un
  objeto que se crea en la misma tanda todavía no se encuentra; el próximo guardado (o
  `scripts/enlaces-backfill.js`) lo suma.
- **`#etiqueta` no suma la etiqueta al objeto** (todavía): por ahora es un enlace como cualquier
  otro. Sumarla a las etiquetas del objeto (lo que dice la tabla de arriba) espera a que gorrite
  decida cómo convive con el campo de etiquetas del formulario.
- **Quién puede ver qué** (para «Lo que enlaza acá», abajo, y quien dibuje los enlaces): el edge
  se guarda aunque la otra punta sea oculta, «solo con cuenta» o un perfil sin aprobar. Quien lo lea muestra un edge solo si quien mira puede ver **las dos** puntas
  (`getEdges` con su `viewer`; los perfiles, además, aprobados, como `vinculosPublicos.js`), y un
  enlace a algo que quien mira no puede ver se dibuja **igual que uno a algo que no existe** (si se
  dibujaran distinto, se sabría que existe algo oculto con ese nombre).
- **Lo ya guardado**: `node scripts/enlaces-backfill.js` (solo la base local) cuenta qué cambiaría;
  con `--apply`, vuelve a guardar con `saveObject()` los objetos que cambian, sin tocar sus datos
  (sube la versión, suma una fila «migracion» al historial, deja `updated_at` y lo importado sin
  editar como estaba). Para preview o producción no tiene opción: eso lo decide gorrite.

### Lo que enlaza acá

Al pie de la página de un evento, un material, un perfil y una entrada de la Kinkipedia (o de una
etiqueta sin texto), la sección «Lo que enlaza acá»: las páginas cuyo cuerpo la enlaza (los edges
`enlaza` que llegan), por título, con su tipo (Evento, Material, Amigues, Kinkipedia). Sin nada,
no se ve. Detrás del interruptor **`lo_que_enlaza`** (`LO_QUE_ENLAZA_ENABLED`, apagado;
[interruptores.md](interruptores.md)). Código: `src/lib/server/contenido/loQueEnlaza.js` y
`src/lib/components/LoQueEnlaza.svelte`.

- **Quién ve qué**: un edge sale solo si quien mira (anónime, con cuenta, admin) ve **las dos**
  puntas: `visibleWhere` en las dos, `partVisibleWhere` (la parte de un taller que oculta sus
  partes) y, en los perfiles, aprobados y no ocultos (`shownProfileSql`, como /amigues). Lo **no
  listado** tampoco sale (se abre con el link, no aparece en listas), salvo para admins.
- **En la Kinkipedia** cuenta también lo que enlaza a un alias de la etiqueta (`[[alias]]` lleva
  a la misma página).
- **Caché**: se lee en cada pedido, con quien mira; no se recuerda entre pedidos. La caché de 1
  minuto ([0049](decisiones/0049-cache-de-1-minuto-sin-sesion.md)) guarda solo pedidos sin
  cookies, o sea anónimes: la página guardada lleva solo lo que ve cualquiera (público → público).
- **Una consulta por página**, por la dirección de la página (no por su id ya leído): con las
  tandas automáticas sale en la misma ida a la base que lo demás de la página, y no suma idas
  (`pedido-consultas.test.js`). Apagado, ninguna consulta. Como mucho 50 por página.
- **Lo guardado antes de `enlaces-guardar`** no tiene edges hasta que se vuelve a guardar (o
  `scripts/enlaces-backfill.js`, `enlaces-pasar-guardados`).
- Que un `[[Título]]` lo gane un objeto oculto (la revisión de #564) no cambia acá: si quien mira no
  lo ve, ese edge no sale.

### Enlaces que faltan (panel)

Etiquetas › **Enlaces que faltan** (`/admin/etiquetas/falta`, botón arriba de Etiquetas; solo
admins): los `[[…]]`, `@` y `#` de los cuerpos que no llevan a ningún objeto, de lo que más se
escribe a lo que menos, con cuántas veces y en qué objetos (con link a su editor y a su página, y
si son «solo con cuenta» u ocultos). Es la lista de qué escribir para hacer crecer la Kinkipedia.
Código: `src/lib/server/contenido/enlacesFalta.js`.

- **Se calcula al abrir la página** (no hay tabla): dos consultas en fila, los cuerpos (como mucho
  3000, los editados más recientemente primero; si hay más, la página lo dice) y, con todo lo que
  nombran junto, los candidatos (`candidatesFor`, la misma del guardado). Con la semilla local
  (541 cuerpos, 426 enlaces, 40 que faltan en 16 nombres), ~270 ms en local.
- **Se resuelve igual que al guardar**, sin mirar visibilidad: lo que lleva a algo oculto no falta.
- `[[x]]`, `![[x]]` y `#x` cuentan como un mismo nombre (sin mayúsculas); `@x` va aparte.
- **No crea la página**: el panel no tiene todavía cómo crear una etiqueta, un perfil o una
  publicación con un nombre dado desde un link. Se crea a mano o se corrige el texto
  (`enlaces-falta-crear` del plan).
- No está en el menú (el mapa del panel es de gorrite, [0038](decisiones/0038-navegacion-del-panel-opcion-c.md)):
  se llega desde Etiquetas o por la dirección.

## Los dos editores

Para los dos tipos de gente que escribe, y se pasa de uno al otro cuando se quiere:

- **Markdown con ayuda**: se escribe el texto como está acá, con autocompletado al escribir `[[`,
  `@`, `#` y `::`, y la vista previa al lado.
- **Visual**: los enlaces y las menciones son fichas, los incrustados y los componentes son
  tarjetas, y se insertan desde un menú («Botón de compra», «Aviso de contenido»…).
- Lo que se guarda es siempre el Markdown. **Ida y vuelta sin pérdida**: pasar de un editor al otro
  no cambia ni un carácter (lo prueba un test). Es la condición para elegir el editor visual.

## Qué código lo hace

- **Hoy**: `src/lib/server/contenido/freeHtml.js` (los `[[término : texto]]`, `WIKI` y
  `rehypeWikiLinks`, que arman `/wiki/<término>`), `src/lib/utils/customRehype.js` (menciones y
  enlaces), `src/lib/utils/markdownPreview.js` (la vista previa del panel) y
  `src/lib/utils/jsonLd.js` (saca los corchetes para los datos estructurados).
  Al guardar: `src/lib/utils/enlaces.js` (qué nombra el texto) y
  `src/lib/server/objects/enlaces.js` (a qué objeto, y el edge `enlaza`). «Lo que enlaza acá»:
  `src/lib/server/contenido/loQueEnlaza.js`.
- **Acordado**: un solo procesador de Markdown con las extensiones de arriba, que usan la página,
  la vista previa, el bot (los mensajes enriquecidos) y la búsqueda (el texto que se indexa).
  Cada extensión con sus tests: lo escrito → lo que se dibuja, y lo escrito → las relaciones que se
  guardan.
