# 0015. Los tipos encadenados se deciden al comprar

- Fecha: 2026-10-01
- Estado: Aceptada

## Contexto

Un tipo encadenado se habilita cuando otro se agota o cierra (0006). Faltaba definir cuándo se
evalúa y cómo se ve mientras tanto.

## Decisión

- Se decide **en el momento de la compra**, con el estado de ese momento.
- Mientras no está habilitado, se ve deshabilitado y con su precio.

## Descartado

- Ocultar el tipo hasta que se habilite: la persona no sabe qué precio viene después.

## Consecuencias

- En `main` con #134. Las claves nuevas del frontmatter van en inglés.
