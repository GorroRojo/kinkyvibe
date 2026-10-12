# 0046. Una sola forma de escribir una búsqueda: sitio, bot y panel

- Fecha: 2026-10-12
- Estado: Propuesta (pedido de gorrite, 12/10: «escribamos primero cuál es la sintaxis, después la
  aplicamos en todos lados y la ponemos visible»). Falta su OK y las tres preguntas de abajo.

## Contexto

Hoy hay tres buscadores y dos motores, y cada uno se escribe distinto:

| Dónde                 | Motor                        | Qué entiende hoy                                                                                                                                                                                          |
| --------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sitio (Ctrl+K)        | índice público (`search.js`) | Palabras sueltas: tienen que estar todas, en cualquier campo; perdona errores de tipeo. Nada más.                                                                                                         |
| Bot (inline y Buscar) | el mismo índice público      | Lo mismo, más un prefijo de tipo al principio: `evento:`, `material:`, `wiki:`/`kinkipedia:`, `serie:`, `amigues:` (`inline.js`).                                                                         |
| Panel (Ctrl+K)        | otro (`searchQuery.js`)      | Operadores: `#etiqueta`, `@persona`, `e:`/`evento:`, `orden:`, `estado:`, `tipo:`, `lugar:`, `hoy`/`mañana`/`semana`/`finde`, `cuando:`, `"frase"`, `-palabra`, `>acciones`. Ver [panel.md](../panel.md). |

Lo que se aprende en un lado no sirve en el otro: `wiki: bondage` en el sitio busca la palabra
«wiki», y `#shibari` solo anda en el panel. Ninguno de los tres explica cómo se busca, salvo una
línea de ayuda en la paleta del panel.

## Decisión

**Una sola sintaxis base que entienden los tres**, y el panel suma lo que solo tiene sentido ahí.
Todo sin mayúsculas ni tildes (`mañana` = `manana`, `sábado` = `sabado`). Un `algo:` que no es un
operador se busca como texto (`20:30`).

### La base (sitio, bot y panel)

| Escribís                           | Qué hace                                                                                               | Ejemplo                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------- |
| palabras sueltas                   | Tienen que estar todas, en cualquier orden. En el sitio y el bot perdona errores de tipeo.             | `cuerdas suspension`              |
| `"frase"`                          | Esas palabras juntas y en ese orden.                                                                   | `"reduccion de danos"`            |
| `-palabra`                         | Sin eso (también `-"frase"` y `-#etiqueta`).                                                           | `taller -online`                  |
| `#etiqueta` o `etiqueta:`          | Con esa etiqueta (también por sus otros nombres).                                                      | `#shibari`                        |
| `evento:` (o `e:`)                 | Solo eventos.                                                                                          | `evento: cuerdas`                 |
| `material:` (o `m:`)               | Solo material.                                                                                         | `material: consentimiento`        |
| `wiki:` o `kinkipedia:` (`w:`)     | Solo la Kinkipedia (entradas y series).                                                                | `wiki: bondage`                   |
| `serie:` (o `s:`)                  | Solo series.                                                                                           | `serie: mirones`                  |
| `amigues:` (o `a:`)                | Solo amigues.                                                                                          | `amigues: cuerdas`                |
| `@nombre`                          | Cosas de esa persona: en el sitio y el bot, lo que firma o organiza; en el panel, personas y perfiles. | `@gorrite`                        |
| `lugar:`                           | Eventos en ese lugar (el público).                                                                     | `lugar: palermo`                  |
| `hoy`, `mañana`, `semana`, `finde` | Eventos en esos días.                                                                                  | `finde #cuerdas`                  |
| `cuando:`                          | Un día de la semana o una fecha.                                                                       | `cuando: sabado`, `cuando: 15/10` |

- El prefijo de tipo va **en cualquier lugar** y con o sin espacio después de los dos puntos
  (`evento:cuerdas`, `cuerdas evento:`). Singular o plural (`eventos:`).
- Se pueden combinar: `evento: finde #shibari -online`.
- Sin nada escrito, cada lugar muestra lo de siempre (el sitio, lo próximo; el bot, su lista).

### Solo en el panel

`orden:` y `estado:` (órdenes), `tipo:` (orden, persona, perfil, etiqueta, entrada, código, acción;
con coma, varios), `>` al principio (solo acciones), y la palabra de pestaña después de un evento
(`e:latex puerta`). Siguen como están. En el sitio y el bot se buscan como texto.

### Dónde se ve

- **Sitio**: un «¿Cómo buscar?» debajo del campo del buscador que abre la tabla de la base (con los
  ejemplos, que al tocarlos se escriben en el buscador). Y la misma tabla en una página
  `/ayuda/buscar`, para poder mandar el link.
- **Bot**: una sección «🔎 Cómo buscar» en ❓ Ayuda, y una línea en el mensaje de Buscar
  («Probá `evento: finde` o `#cuerdas`»). En el modo inline, el texto de cuando no hay nada escrito
  lo nombra.
- **Panel**: la línea de ayuda de la paleta abre la tabla completa (la base más lo del panel).
- Los textos se editan en el panel como los demás (Textos del bot; los del sitio, en su lugar).
- La fuente de verdad es esta decisión; [panel.md](../panel.md) y [telegram.md](../telegram.md)
  la enlazan en vez de repetirla.

## Preguntas para gorrite

1. **`hoy`, `mañana`, `semana`, `finde` sueltos en el sitio y el bot.** En el panel ya son
   operadores. Propuesta: que lo sean también en el sitio y el bot, pero si con eso no queda nada,
   se busca la palabra como texto (para que «finde» encuentre un taller llamado «Finde de
   cuerdas»).
2. **Las formas cortas (`e:`, `m:`, `w:`, `s:`, `a:`).** El panel ya usa `e:`. Propuesta: que
   anden en los tres pero que la guía muestre solo las largas, que se entienden solas.
3. **`@nombre` en el sitio y el bot.** Hoy el índice público tiene autores en el material y la
   Kinkipedia; en los eventos, quién organiza no siempre está. Propuesta: que busque en autores y
   organizadores públicos, y que en los eventos se sume cuando esté el dato.

## Cómo se aplica

Una vez aceptada: un PR por lugar (sitio, bot, panel), cada uno con los tests de cada operador, y
uno más para la guía visible. El sitio y el bot comparten motor, así que el parser de la base va
en `$lib/utils/` y lo usan los dos; el panel lo usa para la parte común y suma lo suyo.
