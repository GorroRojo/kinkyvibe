# Cómo se escribe una búsqueda

La referencia de la sintaxis de búsqueda de kinkyvibe: qué entiende cada buscador, cómo se lee lo
que se escribe y qué código lo hace. Es la fuente de verdad para quien programa (personas y agentes):
si cambiás cómo se busca en cualquier lado, cambiá esto en el mismo PR. La guía para quien usa el
sitio, el bot o el panel sale de acá (ver «La guía visible», abajo). Por qué es así:
[0046](decisiones/0046-sintaxis-de-busqueda.md).

> **Estado (12/10):** esto es la **propuesta** de 0046, todavía sin el OK de gorrite (tres puntos
> abiertos: la regla de respaldo de las fechas, las formas cortas y qué busca `@nombre`). Tampoco
> está hecho en todos lados: la columna «Hoy» de cada tabla dice dónde ya anda, y cada PR que lo
> aplica la actualiza.

## Los tres buscadores

| Buscador  | Dónde está                                                  | Qué busca                                                                    | Motor                                                               |
| --------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Sitio** | Ctrl+K o la lupa (`SearchPalette.svelte`)                   | Lo público: eventos, material, amigues, Kinkipedia, series                   | Índice público en el navegador (`$lib/utils/search.js`)             |
| **Bot**   | Modo inline (`@bot …`) y «🔎 Buscar» (`telegram/inline.js`) | Lo mismo que el sitio                                                        | El mismo índice, en el servidor (`telegram/inlineSource.js`)        |
| **Panel** | Ctrl+K del panel (`paletteActions.js`, `/admin/buscar`)     | Además: órdenes, personas, perfiles, entradas, códigos, etiquetas y acciones | D1 (`$lib/server/admin/search.js`), con `$lib/utils/searchQuery.js` |

El sitio y el bot tienen que dar **los mismos resultados para lo mismo escrito** (los dos usan el
índice público y lo que no está listado nunca aparece). El panel busca más cosas y suma operadores
propios, pero **todo lo que existe en los tres se escribe igual**.

## Cómo se lee lo que se escribe

1. **Se normaliza**: sin mayúsculas ni tildes (`fold()`), así `Mañana` = `manana` y `Sábado` =
   `sabado`. La `ñ` también se pliega (`ñ` → `n`).
2. **Se parte en piezas** separadas por espacios. Lo que está entre comillas dobles (`"…"`) es una
   sola pieza, también como valor (`lugar:"club x"`, `-"sin esto"`); una comilla sin cerrar llega
   hasta el final.
3. **Cada pieza se clasifica**, en este orden:
   - empieza con `-` y tiene algo después → **exclusión** de lo que sigue (palabra, frase, etiqueta
     u operador);
   - empieza con `#` → **etiqueta**;
   - empieza con `@` → **persona**;
   - es `nombre:` o `nombre:valor` y `nombre` es un operador **de ese buscador** → **operador**. Si
     es `nombre:` solo y la pieza siguiente no es otro operador, el valor es la pieza siguiente
     (`evento: cuerdas` = `evento:cuerdas`);
   - es una palabra de fecha (`hoy`, `manana`, `semana`, `finde`) → **fecha** (ver la regla de
     respaldo, abajo);
   - lo demás → **texto**. Un `algo:` que no es un operador se busca como texto (`20:30`,
     `foo:bar`).
4. **Todo se combina con Y**: tienen que cumplirse todas las piezas. No hay O ni paréntesis. Dos
   operadores de tipo distintos (`evento: material:`) suman los tipos (es la única excepción: tipo A
   o tipo B).
5. **Las palabras ordenan, los operadores filtran.** Una palabra suelta que nombra un tipo
   (`evento`, `taller`, `material`, `wiki`…) no es obligatoria: sube lo de ese tipo sin sacar lo
   demás. Así `evento cuerdas palermo` anda sin saber la sintaxis (primero los eventos de cuerdas en
   Palermo). Los operadores (`evento:`, `#cuerdas`, `lugar:`) sí sacan lo que no cumple.
6. **El orden no importa**, salvo `>` (acciones del panel), que solo cuenta al principio.
7. **Sin nada escrito** (o solo espacios), cada buscador muestra lo suyo de siempre (el sitio, lo
   próximo; el bot, su lista; el panel, Recientes y acciones).
8. **Largo máximo**: 100 caracteres (`QUERY_MAX` del bot; acordado: lo mismo en los tres); lo que
   sobra se corta antes de leer.

### Texto

| Escribís         | Qué hace                                                                                              | Ejemplo                | Hoy               |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ---------------------- | ----------------- |
| palabras sueltas | Tienen que estar todas, en cualquier campo y orden. Sitio y bot: perdona errores de tipeo y prefijos. | `cuerdas suspension`   | sitio, bot, panel |
| `"frase"`        | Esas palabras juntas y en ese orden.                                                                  | `"reduccion de danos"` | panel             |
| `-palabra`       | Sin esa palabra. También `-"frase"`, `-#etiqueta`, `-evento:` (sin eventos).                          | `taller -online`       | panel             |

- **Dónde se buscan las palabras** (sitio y bot): el título y sus otros nombres, las etiquetas
  (con sus otros nombres), les autores, el resumen, **todo el cuerpo**, y en un evento también el
  nombre, el barrio y la ciudad de su lugar (lo público, nunca la calle). Pesa más el título, después
  las etiquetas y les autores, después el resto. **Falta hoy**: el índice corta el cuerpo (400
  caracteres en eventos, 2500 en lo demás, `BODY_MAX`) y no está claro que un evento lleve el nombre
  de su lugar; lo arregla el PR del sitio (`buscar-sintaxis-sitio`).
- **`-palabra` y `-#etiqueta` no son lo mismo**: `-online` saca todo lo que diga «online» en
  cualquier lado (también un texto que diga «esto no es online»); `-#online` saca solo lo que tiene
  esa etiqueta. Casi siempre se quiere lo segundo.
- **Tipeo** (sitio y bot): una palabra coincide exacta (1), como prefijo (0,8) o con errores de
  tipeo (0,5; 0,4 si además es prefijo), según `matchQuality()`. El panel compara por `LIKE`
  (contiene), sin errores de tipeo.
- **Palabras vacías** (sitio y bot): `de`, `la`, `el`… no cuentan, salvo que sean todo lo escrito
  (`STOPWORDS`). En una frase sí cuentan.

### Etiquetas y personas

| Escribís                  | Qué hace                                                                                                                            | Ejemplo    | Hoy   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----- |
| `#etiqueta` o `etiqueta:` | Con esa etiqueta, por su nombre o sus otros nombres (alias). Varias: tienen que estar todas.                                        | `#shibari` | panel |
| `@nombre`                 | Sitio y bot: lo que esa persona firma (material, Kinkipedia) u organiza (eventos, cuando el dato está). Panel: personas y perfiles. | `@gorrite` | panel |

- La etiqueta se busca **con su árbol**: `#cuerdas` trae también lo etiquetado con una etiqueta
  hija (como ya hace el bot con `siteTagManager`).
- `#` solo, o `#` con una etiqueta que no existe, se busca como texto.
- **`@` es un perfil del sitio** (amigues, autores), por su nombre visible, su dirección
  (`/amigues/<nombre>`) o sus otros nombres. **No** es un usuario de Telegram ni de GitHub: eso es
  privado y no entra en la búsqueda pública. Para no tener que saber cómo se llama exacto,
  escribir `@` abre el autocompletado (`@gor` → elegís a la persona).

### Tipo de resultado

| Escribís                      | Qué hace                                | Hoy                       |
| ----------------------------- | --------------------------------------- | ------------------------- |
| `evento:` (`eventos:`, `e:`)  | Solo eventos.                           | bot (al principio), panel |
| `material:` (`m:`)            | Solo material.                          | bot (al principio)        |
| `wiki:`, `kinkipedia:` (`w:`) | Solo la Kinkipedia (entradas y series). | bot (al principio)        |
| `serie:` (`series:`, `s:`)    | Solo series.                            | bot (al principio)        |
| `amigues:` (`a:`)             | Solo amigues.                           | bot (al principio)        |

- Van en cualquier lugar de lo escrito, con o sin espacio después de los dos puntos, en singular o
  plural.
- **Un operador que solo sirve para un tipo ya implica ese tipo**: `lugar:` y los de fecha acotan a
  eventos sin escribir `evento:` (`lugar:palermo finde`). Vale también para los que se sumen
  después (por ejemplo uno de quién organiza: `organiza:@nombre #taller hasta:hoy` serían los
  talleres pasados de esa persona, sin `evento:`).
- En el panel, `evento:` además deja poner una palabra de pestaña al final (ver «Solo en el
  panel»).

### Lugar y fechas (solo eventos)

| Escribís                            | Qué hace                                                                    | Ejemplo                           | Hoy   |
| ----------------------------------- | --------------------------------------------------------------------------- | --------------------------------- | ----- |
| `lugar:`                            | Eventos en ese lugar (el nombre público del lugar).                         | `lugar: palermo`                  | panel |
| `hoy`, `mañana`, `semana`, `finde`  | Eventos en esos días (hora de Argentina). `esta semana` = `semana`.         | `finde #cuerdas`                  | panel |
| `cuando:`                           | Un día de la semana (el próximo) o una fecha `d/m` o `d/m/aaaa`.            | `cuando: sabado`, `cuando: 15/10` | panel |
| un mes, `este mes`, `mes que viene` | Eventos de ese mes (el próximo con ese nombre). También `cuando:noviembre`. | `noviembre #cuerdas`              | —     |

- **Regla de respaldo** (sitio y bot): si una palabra de fecha suelta (`finde`, `noviembre`) no
  deja ningún resultado, se busca como texto, para que «finde» encuentre «Finde de cuerdas». Con `cuando:`
  nunca se cae a texto. En el panel la fecha manda siempre (como hoy).

### Solo en el panel

| Escribís                      | Qué hace                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `>texto`                      | Solo acciones (tiene que ir al principio).                                                                                                           |
| `orden:` + texto              | Solo órdenes, por nombre, mail, DNI o referencia `KV-…`.                                                                                             |
| `orden:pendiente`, `estado:…` | Órdenes en ese estado: `pendiente`, `transferencia`, `aprobada`, `rechazada`, `cancelada`, `reembolsada`, `vencida` (también en plural o masculino). |
| `tipo:a,b`                    | Solo esos tipos: `orden`, `persona`, `perfil`, `etiqueta`, `entrada`, `codigo`, `accion`, `evento`.                                                  |
| `evento:latex puerta`         | La palabra de pestaña al final (`puerta`, `ordenes`, `mail`, `ventas`, `duplicar`) lleva directo a esa pestaña del primer evento.                    |
| una referencia, DNI o código  | `KV-…`, un DNI o el código de una entrada se reconocen solos, sin operador.                                                                          |

En el sitio y el bot estos se buscan como texto (`orden:` no es un operador ahí).

## Qué código lo hace

- **Hoy**: `$lib/utils/searchQuery.js` (`parseSearchQuery`) es el parser del panel;
  `telegram/inline.js` (`parseInlineQuery`, `INLINE_PREFIXES`) lee solo el prefijo de tipo del
  bot; el sitio no lee operadores (`queryTerms` en `search.js`).
- **Acordado**: un solo parser para la base en `$lib/utils/` que usan los tres. El panel lo llama
  y suma lo suyo (`>`, `orden:`, `estado:`, `tipo:`, pestañas). `parseInlineQuery` y el
  `queryTerms` del sitio pasan a usarlo.
- Cada operador lleva tests del parser (lo escrito → lo entendido) y uno de punta a punta por
  buscador. Los ejemplos de este archivo son casos de test.

## Cómo se suma un operador

1. Agregalo acá: en qué tabla, qué hace, en qué buscadores, un ejemplo.
2. Si va en los tres, va en el parser común; si es solo del panel, en la parte del panel.
3. Que no choque con texto común: un nombre de operador que sea una palabra frecuente (`hoy`)
   necesita la regla de respaldo.
4. Sumalo a la guía visible si es de los que ve la gente.

## Hacia dónde va

Dirección acordada con gorrite (12/10), no compromiso: cada paso es su propio PR y se escribe en
las tablas de arriba cuando se hace. La idea: el poder de Logseq (el sitio es un grafo de objetos
y relaciones) con la forma de escribir de Twitter (que se lee casi como texto), sin asumir gente
técnica.

### Cuatro capas, un mismo texto

Todo es texto en la misma caja: se puede copiar, mandar como link o pegar en el bot.

1. **Escribir y listo**: palabras sueltas, con errores de tipeo y otros nombres. La mayoría no sale
   de acá.
2. **Tocar en vez de escribir**: chips de filtro (Eventos, Este finde, una etiqueta, un lugar) y
   autocompletado al escribir `#`, `@` o `algo:`. Tocar un chip escribe el operador en la caja
   (`evento: finde`): así se aprende la sintaxis sin leer una guía.
3. **Operadores**: los de arriba, más `#cuerdas,shibari` (una u otra; la coma es el «o» amable),
   `OR` entre palabras (`impacto OR spanking`), `desde:` y `hasta:` (fechas, como el `since:` de
   Twitter) y `tiene:pdf`, `tiene:video`, `tiene:imagen`.
4. **El grafo**:
   - `[[Mirones]]`: esa cosa exacta, elegida del autocompletado (no el texto «mirones»).
   - Relaciones como operadores: `serie:[[Mirones]]`, `parte-de:[[…]]`, `organiza:@nombre`,
     `autore:@nombre`.
   - `enlaza:[[Consentimiento]]`: lo que enlaza a esa página (la referencia inversa).
   - **Pregunta abierta**: anidar, como `evento: lugar:(#accesible)` (eventos en lugares con esa
     etiqueta). Poderoso, pero es donde la gente se pierde; solo si alguien lo necesita.

### Lo mismo, usado en otros lados

- **Consultas vivas en una página**: une editore escribe `{{evento: #shibari desde:hoy}}` en una
  entrada de la Kinkipedia y la página muestra esa lista, siempre al día.
- **Seguir una búsqueda**: «Lo que sigo» puede seguir `#cuerdas lugar:palermo`, no solo una
  etiqueta, y avisar por Telegram cuando aparece algo nuevo que cumple.
- **Un link**: `/buscar?q=…` abre la misma búsqueda para quien lo toca.
- Va de la mano con los `[[enlaces]]` en el cuerpo de todos los objetos (Kinkipedia, material,
  perfiles, eventos) y su «Lo que enlaza acá»: `enlaza:` y `[[ ]]` son esos mismos datos. Las
  referencias inversas respetan quién puede ver qué (nunca muestran algo oculto ni «solo con
  cuenta» a quien no lo puede ver).

### En qué orden

1. Esta sintaxis base en los tres buscadores y la guía visible (`buscar-sintaxis-*`,
   `buscar-guia-visible`).
2. Chips, autocompletado y los operadores baratos de la capa 3.
3. El grafo: `[[ ]]`, las relaciones y `enlaza:` (con los enlaces en el cuerpo).
4. Consultas vivas y seguir una búsqueda.

## La guía visible

La guía es un resumen de este archivo para quien busca, no otra fuente de verdad: si algo cambia
acá, se cambia ahí en el mismo PR.

- **Sitio**: «¿Cómo buscar?» debajo del campo del buscador (las tablas de texto, etiquetas, tipo y
  fechas, con ejemplos que al tocarlos se escriben en el buscador) y la misma guía en
  `/ayuda/buscar`, para poder mandar el link.
- **Bot**: «🔎 Cómo buscar» en ❓ Ayuda, y una línea en el mensaje de Buscar.
- **Panel**: la línea de ayuda de la paleta abre todo, incluido «Solo en el panel».
- Muestra la forma larga y la corta al lado (`evento:` (o `e:`)), salvo que gorrite decida otra
  cosa en 0046.
