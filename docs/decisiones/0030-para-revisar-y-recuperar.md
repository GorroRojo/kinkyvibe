# 0030. «Para revisar» cuenta cada fila; etiquetas, series y mails por evento se recuperan

- Fecha: 2026-10-09
- Estado: Aceptada. Completa 0010 (Inicio del panel).

## Contexto

La auditoría de unificación del panel (9/10) encontró dos cosas:

- El botón «Para revisar» sumaba solo transferencias, órdenes para revisar, perfiles y eventos
  «Online» con lugar, mientras la tarjeta del Inicio mostraba además mails que no salieron, cupos
  sobrevendidos, links de transmisión que faltan, recordatorios, el chequeo nocturno… El botón
  decía 2 sobre una tarjeta con 7 filas rojas. Etiquetas y el importador de contenido tenían su
  propio «Para revisar» que nunca llegaba al Inicio.
- «Recuperar» (Actividad) cubría eventos, material, perfiles y la biblioteca, pero no las
  etiquetas ni las series (se borran suave, sin fila para recuperar) ni el texto propio de un mail
  de un evento (se borraba del todo).

## Decisión

- **El botón «Para revisar» cuenta cada fila de la tarjeta.** Una fila cuenta 1, también la que
  junta varias cosas («3 transferencias esperando confirmación» de un evento, «4 eventos sin
  imagen», el chequeo nocturno): es lo que se ve. La tarjeta y el botón salen de la misma función.
- Etiquetas (sin declarar, fuera del árbol, referencias rotas) y la lista para revisar del
  importador de contenido son una fila más de «Para revisar», con link a su página. Sus páginas
  siguen con su lista.
- **Se pueden recuperar** las etiquetas y las series (también los alias) y el texto propio de un
  mail de un evento («Volver a la plantilla general» o guardar todo vacío), desde «Recuperar» de
  Actividad.
- Siguen siendo permanentes (sin «Recuperar»): las preguntas de inscripción, los roles y las notas
  internas de una persona.

## Descartado

- Contar las cosas (3 transferencias = 3): una fila con un número adentro sumaba distinto de lo
  que se ve, que era el problema.
- Marcar cada fila con «cuenta / no cuenta»: dejaba lugar para que vuelvan a ser distintos.

## Consecuencias

- El contador del menú hace las mismas consultas de «Para revisar» que el Inicio (dos tandas; la
  segunda solo si hay eventos con entradas que vienen). La lista del importador no se puede contar
  en cada página: su página guarda lo que encontró (`review_snapshots`, migración 0047) y la fila
  dice cuándo se revisó.
- Ver docs/panel.md («Para revisar» y «Recuperar»).

## Cómo va

- En la rama `claude/unificar-panel`: «Para revisar» (primer commit) y «Recuperar» (segundo).
