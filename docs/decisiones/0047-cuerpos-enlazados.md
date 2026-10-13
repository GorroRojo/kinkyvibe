# 0047. Los cuerpos como una red de páginas enlazadas, con sintaxis ya conocida

- Fecha: 2026-10-12
- Estado: Aceptada (gorrite, 12/10, en el chat).

## Contexto

gorrite quiere que el cuerpo de todos los objetos (la Kinkipedia, el material, los perfiles, los
eventos, las series) funcione como en Logseq, Anytype u Obsidian: enlaces entre páginas y lo que
enlaza a cada una, para que la Kinkipedia y el material sean una red viva de documentos (el
material, con su tono menos enciclopédico). Hoy hay Markdown, menciones `@` y un enlace propio,
`[[término : texto]]`, que solo lleva a la Kinkipedia, por su nombre, y no se guarda en ningún
lado. Y pidió no reinventar: usar sintaxis abiertas que ya existan.

## Decisión

- **Todos los objetos son parte de la red**, y cada página muestra lo que enlaza acá, respetando
  quién puede ver qué.
- **Una sintaxis conocida para cada cosa, una sola forma de escribir cada una**: Markdown
  (CommonMark + GFM) de base, Obsidian para enlaces, incrustados, etiquetas y avisos, las
  directivas de CommonMark para componentes, y tres agregados (`@nombre`, `#[[etiqueta con
espacios]]` de Logseq y las consultas vivas como bloque, al estilo Dataview). La forma vieja
  `[[término : texto]]` sigue andando.
- **Los enlaces se guardan como relaciones del grafo** y apuntan al objeto, no al título.
- **Dos editores, el mismo Markdown**: uno de Markdown con ayuda y uno visual, con ida y vuelta
  sin pérdida.
- **La sintaxis vive en un solo lugar, [enlaces.md](../enlaces.md)**; esta decisión no la repite.
  Lo que es búsqueda (lo de adentro de una consulta viva) está en [buscar.md](../buscar.md)
  ([0046](0046-sintaxis-de-busqueda.md)).

Respuestas de gorrite: etiquetas dentro del texto, sí; pasar los links viejos a `[[…]]` de a
tandas con su OK, sí; los dos editores, sí.

## Pendiente

Lo que gorrite había planeado antes en el proyecto de GitHub (no se pudo leer desde la sesión):
sumarlo a enlaces.md cuando lo pase.
