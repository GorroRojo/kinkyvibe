# 0027. Qué se mergea de noche

- Fecha: 2026-10-01
- Estado: Aceptada

## Contexto

Los agentes trabajan de noche, mientras gorrite no puede aprobar cada PR.

## Decisión

- De noche pueden ir a `main` los arreglos de **bugs, seguridad y optimización**, con todo en
  verde. Es una aprobación general de gorrite para ese tipo de PR.
- Las **funciones nuevas esperan** el OK de gorrite.
- Lo que falte decidir se marca "a confirmar".

## Descartado

- Mergear todo lo que dé verde.
- No mergear nada sin gorrite, ni siquiera arreglos.

## Consecuencias

- Las demás reglas de merge de `CLAUDE.md` siguen: base `main`, `ci-ok` en verde, de a un PR,
  sin `--admin`.
