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

- **Una sola sintaxis base que entienden el sitio, el bot y el panel**: palabras sueltas,
  `"frase"`, `-palabra`, `#etiqueta`, los tipos (`evento:`, `material:`, `wiki:`, `serie:`,
  `amigues:`), `@nombre`, `lugar:`, `hoy`/`mañana`/`semana`/`finde` y `cuando:`. El panel suma lo
  que solo tiene sentido ahí (`>`, `orden:`, `estado:`, `tipo:`, las pestañas) y sigue como está.
- **Un solo parser** para la base en `$lib/utils/`, que usan los tres.
- **Un documento de referencia, [buscar.md](../buscar.md)**, para quien programa (personas y
  agentes): la sintaxis completa, cómo se lee lo escrito, qué hace cada buscador, qué código lo
  hace y cómo se suma un operador. Es la fuente de verdad: todo PR que cambie cómo se busca lo
  actualiza en el mismo PR. [panel.md](../panel.md) y [telegram.md](../telegram.md) lo enlazan en
  vez de repetirlo.
- **Una guía visible** en cada buscador, que resume buscar.md para quien busca (dónde va: en
  buscar.md, «La guía visible»).

## Preguntas para gorrite

1. **`hoy`, `mañana`, `semana`, `finde` sueltos en el sitio y el bot.** En el panel ya son
   operadores. Propuesta: que lo sean también en el sitio y el bot, pero si con eso no queda nada,
   se busca la palabra como texto (para que «finde» encuentre un taller llamado «Finde de
   cuerdas»).
2. **Las formas cortas (`e:`, `m:`, `w:`, `s:`, `a:`).** El panel ya usa `e:`. Propuesta: que
   anden en los tres y que la guía las muestre al lado de la larga (`evento:` (o `e:`)).
3. **`@nombre` en el sitio y el bot.** Hoy el índice público tiene autores en el material y la
   Kinkipedia; en los eventos, quién organiza no siempre está. Propuesta: que busque en autores y
   organizadores públicos, y que en los eventos se sume cuando esté el dato.

## Cómo se aplica

Una vez aceptada: un PR por lugar (sitio, bot, panel), cada uno con los tests de cada operador, y
uno más para la guía visible. El sitio y el bot comparten motor, así que el parser de la base va
en `$lib/utils/` y lo usan los dos; el panel lo usa para la parte común y suma lo suyo.
