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
