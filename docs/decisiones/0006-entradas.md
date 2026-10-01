# 0006. Entradas: cupo, puerta, preventas y límites

- Fecha: 2026-09-30
- Estado: Aceptada. Los detalles de preventas y puerta del 1/10 están en
  [0012](0012-precio-de-puerta-por-tipo.md) a [0016](0016-pago-tardio.md).

## Contexto

La venta de entradas ya funciona. Hacen falta más formas de armar precios y cupos sin complicar
la compra, y más flexibilidad para les admins el día del evento.

## Decisión

- **Cupo opcional**: sin cupo = ilimitado. El público solo ve "quedan N" cuando quedan menos de
  ~10.
- El primer tipo de entrada se llama "General".
- **Venta en puerta, por evento**: interruptor "Hay entradas en la puerta" (con precio en puerta
  opcional). Si no hay, "Solo anticipadas" y el panel no ofrece venta en puerta. Los eventos que ya
  existen sin ese dato funcionan **como hoy** (venta permitida, sin mensaje público).
- **Preventas, las dos formas**: tramos dentro de un tipo (por cantidad y por fecha) y tipos
  encadenados que se habilitan cuando otro se agota o cierra. Sin complicar la compra.
- Lista de espera: configurable por evento (tiempo de reserva, o avisar a todes a la vez).
- **Les admins pasan cualquier límite** (venta en puerta, confirmar transferencias, carga manual de
  entradas y cualquier otro), con aviso, confirmación y registro en la actividad.
- Entradas a **$0 = sin cargo**: saltean el pago.
- Sin aforo aparte: el cupo alcanza.

## Descartado

- Mostrar siempre cuántas quedan.
- Solo tramos, o solo tipos encadenados.
- Límites duros que ni les admins pueden pasar.

## Consecuencias

- La matemática de precios y preventas necesita buenas pruebas (incluidas pruebas con números al
  azar).
- Las migraciones tienen que dar valores por defecto que mantengan el comportamiento actual.

## Cómo va (1/10)

- En `main` (#134, migración `0016` aplicada en producción antes del merge): tramos por cantidad
  y por fecha, tipos encadenados, cupo opcional, interruptor de puerta, precio de puerta por tipo
  y pases de límite de admins. Guías: [`docs/entradas.md`](../entradas.md) y
  [`docs/tickets.md`](../tickets.md).
- Pendiente: el pase de límite queda solo con el botón, sin casilla (PR chico aparte).
