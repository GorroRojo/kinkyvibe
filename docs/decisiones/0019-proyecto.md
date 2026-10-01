# 0019. "Proyecto" reemplaza a "grupo"

- Fecha: 2026-10-01
- Estado: Aceptada

## Contexto

El perfil que no es de una persona se llamaba "grupo" (0002). Al pasar amigues a perfiles (#137),
quedó claro que esos perfiles son, sobre todo, proyectos.

## Decisión

- El tipo de perfil no-persona se llama **"Proyecto"**. Los grupos que ya existen pasan a
  proyecto.
- Un proyecto puede tener integrantes o no, como antes. Lo demás de 0002 no cambia.

## Descartado

- Seguir con "grupo".
- Tener los dos tipos a la vez.

## Consecuencias

- Es un renombre transversal (datos, rutas, textos): va en su propio PR y se mergea antes que
  #137.
