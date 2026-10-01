# 0025. "Lo que sigo"

- Fecha: 2026-10-01
- Estado: Aceptada

## Contexto

Había piezas sueltas para lo mismo: "Avisame si se repite" (#141), suscripciones por etiqueta
(0007) y un calendario personal con sus propios ajustes. gorrite pidió un solo sistema.

## Decisión

- **Un solo sistema**, que configura cada persona, para qué aparece en su calendario y de qué
  recibe mails.
- Se puede seguir: **etiquetas** (las series son etiquetas: todo se basa en etiquetas),
  **perfiles** y **lugares**.
- Por cada cosa seguida: "en mi calendario", "mail cuando se anuncia algo nuevo" y "recordatorio
  el día antes".
- El calendario también puede sumar mis entradas y los eventos donde participo. Las etiquetas
  seguidas también sirven para filtrarlo.
- El "Avisame si se repite" de #141 se migra a este sistema.

## Descartado

- Un sistema y unos ajustes distintos para series, etiquetas y calendario.
- Los ajustes del feed personal dentro de #141 (se sacaron).

## Consecuencias

- PR propio, después de mergear #141 (orden en 0026).
- Los calendarios siguen respetando la privacidad de los lugares (0005, 0007).
