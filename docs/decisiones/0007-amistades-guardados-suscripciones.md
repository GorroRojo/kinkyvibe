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

## Descartado

- Seguir a alguien sin que acepte (amistad de un solo lado).
- Asistencia oculta por defecto.

## Consecuencias

- A qué eventos va cada quien es un dato delicado: "No mostrar que voy" se respeta en todas las
  vistas públicas.
- Las suscripciones usan las mismas etiquetas del contenido; renombrar una etiqueta tiene que
  mantener las suscripciones.
