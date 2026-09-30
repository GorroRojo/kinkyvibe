# 0007. Amistades, asistencia, guardados y suscripciones

- Fecha: 2026-09-30
- Estado: Aceptada

## Contexto

Con cuentas (0002), la gente puede conectarse entre sí, guardar cosas y elegir de qué quiere
enterarse.

## Decisión

- **Amistades mutuas**: las dos personas aceptan.
- **Asistencia**: tus amistades ven a qué eventos vas, por defecto. Se puede ocultar con **"No
  mostrar que voy"** al comprar, y con una opción general en "Mi rincón".
- **Guardados**: también se pueden guardar amigues; colecciones con nombre; nota personal por ítem
  guardado. Les superadmins pueden verlos (0002).
- **Suscripciones**:
  - Por serie ("Avisame si se repite").
  - Newsletter general.
  - Newsletter personalizado por **etiquetas o combinaciones de etiquetas** (por ejemplo,
    "shibari" → eventos, material y docentes nuevos; "cnc" + "articulo" → algo más específico).
- **Calendario**: un botón **"Suscribirme a esto"** da un link de Google Calendar para
  exactamente lo que la persona está mirando (una serie, una etiqueta o una combinación de
  etiquetas), también en las páginas de serie y de etiqueta.
  - Con cuenta, su calendario además se actualiza con lo de su cuenta: series y etiquetas que
    sigue y eventos a los que compró entrada.
  - Los calendarios respetan la privacidad de los lugares (0005): sin nombre ni dirección cuando
    el nivel los oculta.
  - Google actualiza los calendarios suscriptos solo cada ~12–24 h; los cambios no son
    inmediatos.

## Descartado

- Seguir a alguien sin que acepte (amistad de un solo lado).
- Asistencia oculta por defecto.

## Consecuencias

- A qué eventos va cada quien es un dato delicado: "No mostrar que voy" se respeta en todas las
  vistas públicas.
- Las suscripciones usan las mismas etiquetas del contenido; renombrar una etiqueta tiene que
  mantener las suscripciones.
