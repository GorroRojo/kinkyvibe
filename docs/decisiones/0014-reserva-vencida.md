# 0014. Una reserva vencida devuelve el lugar a su tramo

- Fecha: 2026-10-01
- Estado: Aceptada

## Contexto

Una orden pendiente (por ejemplo, una transferencia sin confirmar) ocupa un lugar de un tramo.
Si la reserva vence, hay que decidir a dónde vuelve ese lugar.

## Decisión

- El lugar vuelve **al tramo del que salió**.

## Descartado

- Que el lugar se pierda o pase a otro tramo.

## Consecuencias

- En `main` con #134.
