# 0058. El aviso «Cada venta» por Telegram lleva el detalle de la compra

- Fecha: 2026-11-05
- Estado: Aceptada. Pedido de gorrite (5/11): «quiero todos los detalles de la compra en el
  mensaje», en un bloque que se despliega. Cambia en parte [0041](0041-telegram-para-admins.md)
  (la regla «sin datos de compradores» de los avisos para admins), solo para «Cada venta».

## Contexto

0041 dejó los avisos para admins «sin datos de compradores: solo cantidades y links al panel», y
descartó mandar nombres o mails por Telegram aunque fuera a admins. En la práctica, quien prendió
«Cada venta» abre el panel en cada aviso para ver quién compró, qué y cómo pagó. Telegram ya tiene
bloques citados que se despliegan (`<blockquote expandable>`, Bot API 7.4), así que el detalle no
ocupa el chat.

## Decisión

- El aviso **«Cada venta»** suma, abajo de la línea de siempre (que queda igual, como resumen), un
  bloque que se despliega con el detalle de la compra: nombre y pronombres de quien compró, mail,
  número de orden, las entradas (tipo, tramo, cantidad y precio), los extras, el código de
  descuento, lo que cubrió el Fondo (o el aporte), lo que pagó, el recargo y la comisión de Mercado
  Pago y lo neto (los mismos números y palabras que Órdenes), el medio de pago, las respuestas a
  las preguntas de inscripción y la hora de la compra (Argentina).
- Es **lo mismo que esas personas ya ven en Órdenes del panel**, y nada más: **nunca el DNI** (ni
  los últimos dígitos), el teléfono, les titulares, el id del pago, la nota ni los tokens o
  códigos de las entradas.
- Solo a les admins que prendieron «Cada venta», con las mismas reglas de 0041: chat privado,
  todavía en `ADMINS`, una sola vez, sin sonido en el horario de silencio.
- Todo lo que escribió quien compra se escapa; el mensaje nunca pasa del límite de Telegram (4096):
  se cortan las respuestas con «…».
- Los demás avisos (transferencias, contracargos, resumen diario, día del evento, «📊 Estado»)
  siguen sin datos de compradores.

## Descartado

- Mandar también el DNI (completo o los últimos 3 dígitos): no hace falta para saber quién compró
  y en el panel el completo se pide aparte y queda registrado.
- Sumarlo a «Cada transferencia»: no se pidió; la transferencia se revisa en el panel igual.
- Un interruptor aparte para el detalle: quien no lo quiere apaga «Cada venta»; el bloque va
  cerrado.

## Consecuencias

- `src/lib/server/telegram/adminNotify.js` (`saleDetail`, `saleNoticeWithDetail`), con los textos
  en «Textos del bot» (`admin.venta_*`); `docs/telegram.md` lo explica. Sin migración.
- Quien tiene el Telegram vinculado como admin recibe datos personales en su celu: es una razón
  más para desvincularlo si alguien deja de ser admin (sacarle de `ADMINS` ya corta los avisos).
