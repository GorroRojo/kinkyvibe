# 0016. Un pago tardío se acepta al precio de la orden

- Fecha: 2026-10-01
- Estado: Aceptada

## Contexto

Un pago puede llegar después de que la reserva venció o de que cambió el tramo.

## Decisión

- Se acepta, **al precio que tenía la orden**.

## Descartado

- Rechazar el pago, o cobrar la diferencia con el precio nuevo.

## Consecuencias

- En `main` con #134.
- Si con ese pago el tramo de preventa pasa su cantidad o el código de descuento sus usos máximos,
  la orden se aprueba igual y en silencio, sin marca para revisar (solo se marca, `late_payment`,
  si pasa el cupo del tipo); gorrite lo confirmó el 26/10 (auditoría de plata, M5).
