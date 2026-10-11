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
- **«Si ocultás el taller, ocultar también sus partes»** (casilla en la sección Partes):
  `ocultar_partes: true` en el `extra` del taller (como `entradas_por_parte`). Prendida, una parte
  se ve solo si quien mira también ve el taller: con el taller oculto, sus partes no salen en las
  listas públicas (calendario, búsqueda, RSS, sitemap…) ni en su página (404), salvo para les
  admins. La regla está en `partVisibleWhere` de `src/lib/server/objects/visibility.js` y la usan
  las lecturas públicas de `src/lib/server/contenido/posts.js`. Apagada, cada parte tiene su
  propia visibilidad, como siempre. Una parte nueva no copia la opción. **Confirmado por gorrite
  (5/10)**: viene apagada (así nada cambia para los talleres que ya existen).
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

- **Mails y página de la entrada:** los mails de entradas, transferencia y recordatorios de un
  taller con una sola entrada llevan «Las N partes del taller», una línea por parte
  («Parte 2 · vie 9 oct · 22:00 · <lugar>», « · cancelada» si se canceló), en el HTML (dentro de la
  tarjeta de la plantilla común) y en el texto plano. La página de cada entrada
  (`/entradas/t/<token>`) muestra la misma lista. El lugar completo, como el del taller, solo con
  la compra aprobada (en el de transferencia, el que se ve en el sitio). Lo arma
  `src/lib/server/tickets/workshopParts.js`; con «Entradas por parte», o en un evento suelto, no
  hay lista y los mails salen byte a byte como siempre.

## Dónde se ve

- **Página del evento:** «Taller en 3 partes» o «Parte 2 de 3 de <taller>» y la lista de las
  partes con su fecha y link (`PartesTaller.svelte`), juntas y pegadas al botón de comprar (o a
  la inscripción), después del texto; también en un evento que ya pasó
  (`src/lib/components/evento/Partes.svelte`).
- **Calendario:** cada parte en su fecha con «Parte N de M» (grilla y lista).
- **Panel:** en la ficha, un chip «Parte 2 de 3 de «…»» (o «Taller en 3 partes»). En Editar, la
  sección **Partes** (`PartesEditor.svelte`): ordenar y sacar partes (sacar no borra: queda como
  evento suelto), crear una parte nueva copiando el taller (texto, etiquetas, personas, imagen y
  lugar; sin entradas si hay una sola), sumar un evento existente (sugiere los `<taller>-parte-N`
  sueltos, como se cargaban antes), «Entradas por parte» y «Si ocultás el taller, ocultar también
  sus partes».

## Pendiente

- Los talleres cargados antes como eventos sueltos se unen a mano desde la sección Partes (sugiere
  los `-parte-N`); no hay migración que los una sola.
