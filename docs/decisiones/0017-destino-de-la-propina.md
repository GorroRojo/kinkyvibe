# 0017. La persona elige el destino de su propina

- Fecha: 2026-10-01
- Estado: Aceptada

## Contexto

Las propinas reemplazan al cafecito al pie de las publicaciones de KinkyVibe (#133). La propuesta
mandaba todo a KinkyVibe.

## Decisión

- La persona elige **"Para KinkyVibe"** (por defecto) o **"Para el Fondo"**.
- La plata entra siempre a la misma cuenta de Mercado Pago; el destino solo cambia cómo se cuenta.
- Solo en publicaciones de KinkyVibe.

## Descartado

- Un destino fijo.

## Consecuencias

- En `main` con #133 (migración `0022`: el destino se valida en el servidor y en la base). Guía:
  [`docs/propinas.md`](../propinas.md).
