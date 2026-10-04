# Talleres en varias partes

Talleres como «Contra la moral sexual», «Taller de Historia Sexodisidente» o «Violencia y
conflicto» tienen varios encuentros, cada uno con su fecha, su hora y su lugar. Antes se cargaban
como eventos sueltos (`…-2024-11` y `…-2024-11-parte-2`) sin nada que los uniera.

## El modelo

- **El taller es un evento, y es también la parte 1.** Las otras partes son eventos con un edge
  `parte` desde el taller (regla 4 de [objetos.md](objetos.md): una relación, nunca una dirección
  en `data`). `position` es el orden; sin `data`. Como mucho 20 (21 partes con el taller).
- Una parte es de un solo taller, no hay partes de partes y un taller no es parte de sí mismo: lo
  controla `src/lib/server/eventos/partes.js` (el registro de tipos solo sabe de tipos).
- Todo se escribe con `saveObject()` sobre el taller (versión nueva, revisión `partes`). Cambiar
  solo las partes de un evento importado de un `.md` no lo marca como editado (como el lugar).
- Los dos eventos tienen que estar en la base. Las lecturas públicas solo muestran las partes que
  quien mira puede ver (`visibleWhere`); un taller oculto no muestra sus partes.
- Las reglas puras (numerar, «Parte N de M», «vie 2 oct · 22:00», de qué evento es la entrada,
  datos de una parte nueva) están en `src/lib/utils/partes.js`.

## Entradas

- **Por defecto, una sola entrada:** la del taller, que vale para todas las partes. Las partes no
  venden: su botón «Comprar entrada al taller» lleva a `/calendario/<taller>/entradas`, y
  `/calendario/<parte>/entradas` redirige ahí.
- **«Entradas por parte»** (casilla en la sección Partes): `entradas_por_parte: true` en el `extra`
  del taller, junto con el resto de la configuración de entradas. Cada parte vende la suya (se
  configura en su ficha) y nada de lo de abajo aplica.
- **Ingreso por parte:** el modo puerta de cada parte (2 en adelante) usa las entradas del taller y
  marca el ingreso en `ticket_part_checkins` (migración `0039`, una fila por entrada y parte;
  `src/lib/server/tickets/partCheckins.js`). El de la parte 1 sigue siendo
  `tickets.checked_in_at`. Lista sin conexión, buscador y «Ver compra» muestran el ingreso a esa
  parte. En una parte no se vende en la puerta (la entrada es del taller entero: se vende en el
  modo puerta del taller).
- **Recordatorios:** quien tiene la entrada del taller recibe los recordatorios de cada parte, con
  su título, fecha y lugar. En `reminder_sends` el id lleva la parte (`h48@<parte>`), así cada uno
  se manda una vez. Una parte cancelada no manda.

## Dónde se ve

- **Página del evento:** debajo del título, «Taller en 3 partes» o «Parte 2 de 3 de <taller>»;
  más abajo, la lista de las partes con su fecha y link (`PartesTaller.svelte`).
- **Calendario:** cada parte en su fecha con «Parte N de M» (grilla y lista).
- **Panel:** en la ficha, un chip «Parte 2 de 3 de «…»» (o «Taller en 3 partes»). En Editar, la
  sección **Partes** (`PartesEditor.svelte`): ordenar y sacar partes (sacar no borra: queda como
  evento suelto), crear una parte nueva copiando el taller (texto, etiquetas, personas, imagen y
  lugar; sin entradas si hay una sola), sumar un evento existente (sugiere los `<taller>-parte-N`
  sueltos, como se cargaban antes) y «Entradas por parte».

## Pendiente

- El mail de compra del taller todavía no lista las fechas de las partes.
- Los talleres cargados antes como eventos sueltos se unen a mano desde la sección Partes (sugiere
  los `-parte-N`); no hay migración que los una sola.
