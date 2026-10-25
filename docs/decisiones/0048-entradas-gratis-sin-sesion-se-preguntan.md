# 0048. Las entradas gratis pedidas sin la sesión de la cuenta se preguntan en Mi rincón

- Fecha: 2026-10-25
- Estado: Aceptada (lo pide el ítem `mails-no-fui-yo` del plan, parte 2). Completa una parte de [0002](0002-cuentas-y-perfiles.md): «las compras viejas aparecen solas
  en la cuenta cuando el mail está verificado» sigue valiendo para las pagas, no para las gratis
  pedidas sin sesión.

## Contexto

El formulario de entradas gratis acepta cualquier mail, sin confirmarlo. Con la regla de 0002, una
orden gratis hecha con el mail de otra persona aparecía sola en su Mi rincón (y en «Mis entradas»
del bot y en su calendario personal), aunque nunca la hubiera pedido. La parte 1 de «No fui yo»
(docs/mails.md) ya cortó los mails; faltaba lo que se ve en la cuenta.

## Decisión

- Una orden **gratis** que llega a la cuenta solo por el mail (sin su `account_id`) no se lista
  hasta que la persona dice «Sí, son mías». Mientras tanto va aparte, en «¿Son tuyas?» dentro de
  «Tus compras y entradas».
- «No es mía» la deja de mostrar para esa cuenta. No se toca la orden (sigue aprobada; la
  organización la ve como siempre).
- Lo pedido con la sesión de la cuenta de ese mail cuenta como «Sí» desde la compra.
- Las compras pagas (Mercado Pago, transferencia) se ven siempre, sin preguntar: alguien que paga
  con un mail ajeno no gana nada.
- Lo elegido se guarda aparte (`free_order_choices`, migración 0061), por cuenta y orden; al borrar
  la cuenta, se borra.

## Descartado

- Marcar la orden con el `account_id` al decir «Sí»: es «adoptar» la orden, y 0002 eligió no
  escribir nada en las órdenes desde la cuenta.
- Solo un botón «No es mía» con todo visible: lo ajeno se seguía viendo hasta que la persona lo
  notara.
