# 0012. Precio de puerta por tipo de entrada

- Fecha: 2026-10-01
- Estado: Aceptada

## Contexto

Con los tramos (0006), la venta en puerta y la carga a mano cobraban el precio del último tramo.
Un evento con varios tipos de entrada puede querer un precio de puerta distinto para cada uno.

## Decisión

- La puerta y la carga a mano cuentan para el cupo del tipo y cobran el precio del último tramo,
  **salvo** que el tipo tenga su propio precio de puerta (opcional).
- Cada tipo puede tener el suyo: un evento puede tener varios precios de puerta.

## Descartado

- Un solo precio de puerta por evento.
- Cobrar siempre el último tramo, sin opción.

## Consecuencias

- En `main` con #134 (`door_price` en cada tipo). La nota de puerta del evento es solo texto para
  la página: lo que se cobra sale del tipo.
