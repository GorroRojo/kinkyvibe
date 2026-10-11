# 0031. La reserva por transferencia dura 2 días hábiles

- Fecha: 2026-10-11
- Estado: Aceptada. Reemplaza la reserva de 2 h + «Confirmar mi reserva» (48 h) de las
  transferencias (descripta en tickets.md; completa 0006).

## Contexto

Una compra por transferencia guardaba el lugar 2 horas. El mail traía un link «Confirmar mi
reserva» que la extendía a 48 horas desde la compra (`TICKETS_TRANSFER_HOLD_HOURS`); sin
confirmar, se liberaba a las 2 horas. Eran dos plazos, un paso más para quien compra y un mail
confuso (mezclaba «2 horas», «48 horas» y «antes de esa fecha»). Además, 48 horas corridas no
tienen en cuenta cuándo se revisan las transferencias.

## Decisión

- **Una sola regla:** la reserva dura **2 días hábiles completos después del día de la compra**
  y vence a las **20:00 (hora de Argentina) del segundo día hábil**.
- Los días hábiles son **de martes a sábado**, de 14 a 20 (hora de Argentina). El día de la
  compra nunca cuenta, sea la hora que sea.
  - Domingo → miércoles 20:00. Martes 15:00 → jueves 20:00. Viernes → martes 20:00 (sábado y
    martes). Sábado → miércoles 20:00. Lunes → miércoles 20:00.
- **Cerca del evento:** si el evento empieza antes de ese vencimiento, la reserva dura hasta que
  empieza (el mismo comienzo que cierra la venta por defecto, `start`).
- **Sin paso de confirmar** ni reserva corta: la compra tiene el plazo completo desde el
  principio. El formulario, las condiciones, la página de estado y el mail dicen hasta cuándo,
  con día y hora («Te guardamos el lugar hasta el miércoles 15 de octubre a las 20:00…»).
- **Los feriados no se tienen en cuenta.**
- Por qué (gorrite): **más simple para todes; la sobreventa casi nunca es un problema.**

## Descartado

- Mantener el paso de confirmar con otros plazos: suma un paso y un mail más difícil de leer.
- Horas corridas (48 h, configurables): no siguen los días en que se revisan las transferencias.
- Contar feriados: necesita un calendario que mantener; por ahora no vale la pena.

## Consecuencias

- `transferDeadline(creada, comienzo)` en `src/lib/utils/transferDeadline.js`, pura. Los días
  hábiles y la hora de cierre son constantes de ese archivo, para que algún día sean un ajuste.
- `TICKETS_TRANSFER_HOLD_HOURS` deja de existir (no era secreta; si está cargada en Cloudflare
  se puede borrar, el código ya no la lee).
- Los links «Confirmar mi reserva» de mails ya mandados siguen andando: muestran «Tu reserva ya
  está guardada hasta…» o «Tu reserva ya venció» y no cambian nada.
- Las reservas que ya existían quedan con su vencimiento: no se reescriben datos ni hay
  migración. La clave de firma de esos links (`hold_confirm_key` en `ticket_settings`) queda,
  solo para verificarlos.
- «Deshacer rechazo» (panel) da una reserva nueva con la misma regla, contada desde ese momento.
- Confirmar una transferencia vencida sigue igual (pase de límite de 0006).
