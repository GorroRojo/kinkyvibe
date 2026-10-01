# 0024. Les organizadores ven las respuestas de inscripción

- Fecha: 2026-10-01
- Estado: Aceptada

## Contexto

Los campos personalizados al inscribirse (0005) llegan con #139. La propuesta era que solo les
admins vieran las respuestas.

## Decisión

- Las respuestas las ven les admins **y les organizadores** del evento.
- Siguen visibles aunque el interruptor esté apagado.
- Las preguntas viven en la base hasta que los eventos se migren.

## Descartado

- Respuestas solo para admins.

## Consecuencias

- En #139, que se mergea después de #137. Hoy solo hay superadmins (0003): el permiso queda listo
  para cuando haya organizadores.
