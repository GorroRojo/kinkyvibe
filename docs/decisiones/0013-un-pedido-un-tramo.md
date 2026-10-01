# 0013. Un pedido entra en un solo tramo

- Fecha: 2026-10-01
- Estado: Aceptada

## Contexto

Con tramos por cantidad (0006), un pedido puede cruzar el límite de un tramo: quedan 2 a un
precio y la persona quiere 4.

## Decisión

- Un pedido entra entero en **un solo tramo**. Si en el tramo actual quedan 2, se compran esas 2
  y el resto en otro pedido.

## Descartado

- Partir un pedido entre tramos con precios distintos: complica la compra y el total.

## Consecuencias

- En `main` con #134.
