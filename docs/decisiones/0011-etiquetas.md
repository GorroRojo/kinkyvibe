# 0011. Sistema de etiquetas

- Fecha: 2026-09-30
- Estado: Aceptada

## Contexto

Las etiquetas ya ordenan el contenido y ahora también van a definir series (0005) y suscripciones
(0007). Hoy son simples; hace falta un modelo más rico sin inventarlo de cero.

## Decisión

- **TagStudio es la referencia** para el sistema de etiquetas:
  - alias;
  - nombre corto;
  - varias etiquetas madre;
  - etiquetas que funcionan como categorías;
  - color por etiqueta;
  - campos en los ítems.
- El detalle se revisa cuando empiece ese bloque (paso 3 de 0001).

## Descartado

- Diseñar el sistema de etiquetas sin una referencia.

## Consecuencias

- Las series (0005) y las suscripciones por etiqueta (0007) se apoyan en este modelo.
- Antes de cambiar etiquetas, revisar TagStudio y actualizar esta decisión si algo se aparta.
