# 0040. Lista de espera de las entradas

- Fecha: 2026-10-11
- Estado: Aceptada (respuestas de gorrite del 11/10: «Sí, todas» a lo propuesto, con un cambio en
  la cuenta por evento). Completa 0006 (entradas): la puerta y la carga a mano siguen sin frenar.
  El 12/10 gorrite decidió que «Cerrar la lista» también la apaga y que no hay página de Ajustes
  (los tiempos son fijos). El 12/10 gorrite respondió lo de «Terminar la reserva» (abajo): se
  pregunta al tocar el botón.

## Contexto

Cuando un evento se agota, hoy no hay nada para quien llega tarde: si alguien no paga o pide un
reembolso, el lugar vuelve a la venta y se lo lleva quien justo mira la página. gorrite pidió una
lista de espera por evento o por tipo de entrada, con aviso por mail y un rato para comprar.

Dos cosas del código decidieron la forma: las reservas de la compra vencen solas (nadie avisa
cuando un pago de Mercado Pago o una transferencia vence: el cupo se cuenta con `expires_at`), y el
cupo se controla en una sola sentencia atómica (`reserveOrder`). Por eso la lista no tiene stock
aparte: guarda lugares en la misma cuenta del cupo y la avanza un cron.

## Decisión

- **Por evento o por tipo de entrada**, según el evento (`lista_espera` en el evento; Editar →
  Entradas). Detrás del interruptor `lista_espera`, apagado hasta que gorrite lo prenda.
- **Solo el mail, con doble confirmación** (48 h para confirmar; sin confirmar se borra). Con una
  cuenta con sesión y ese mismo mail verificado, entra directo, sin mail de confirmar. La respuesta
  es la misma esté o no anotado el mail.
- **Quienes esperan guardan lugares del público.** Cada persona en la fila (y cada lugar guardado
  vigente) cuenta como vendido para la compra online; si el cupo crece más que la fila, lo que
  sobra sale a la venta. Sin esto, alguien del público se lleva el lugar en los minutos antes de
  que el cron se lo ofrezca a la fila.
- **Por evento con varios tipos, la fila cuenta contra el lugar libre total del evento** (la suma
  de lo que queda en sus tipos con cupo), no contra cada tipo: una persona guarda un solo lugar.
  Esto reemplaza la «sobrerreserva aceptada» del plan.
- **De a una persona por vez.** A quien le toca le guardamos el lugar un rato y puede comprar
  **todas las que haya libres en ese momento**, al precio vigente. La reserva dura 24 h si faltan 7
  días o más, 12 h si faltan 48 h o más y 2 h si faltan 6 h o más. Con menos de 6 h (o con «avisar
  a todes a la vez» en el evento) se le avisa a toda la fila a la vez, sin lugar guardado: se lo
  queda quien compre primero. La lista cierra 30 minutos antes del comienzo (o al cerrar la venta,
  si es antes) y ninguna reserva pasa de ahí.
- **Los tiempos son fijos, en el código** (`WAITLIST_SETTINGS`; gorrite, 12/10: «no hace falta que
  se pueda configurar los tiempos de reserva», y después, sin página de Ajustes: cambiarlos es un
  PR). El editor del evento solo tiene el alcance y «avisar a todes a la vez»; unos `reservas`
  guardados antes en un evento, o una clave `waitlist` en `ticket_settings`, se ignoran.
- **Una reserva vencida deja de guardar en el acto** (sin esperar al cron), como las órdenes.
- **Si se le vence la reserva, sale de la lista**, con «Volver a anotarme» en el mail (al final de
  la fila, sin confirmar otra vez).
- **Si empezó a comprar con su oferta y no pagó**, recupera la oferta hasta el vencimiento
  original, sin tiempo extra.
- **Mails:** confirmar, «se liberó un lugar», último aviso (solo en reservas de 12 h o más, cuando
  faltan 3 h; nunca en el aviso a todes), «se venció tu lugar» y «se cerró la lista» (al cerrar o
  si se cancela el evento). Todos con un link para salir. Los del cron van primero en la tanda.
- **El link de la oferta no se guarda:** es una firma (`offer:<id>:<ronda>`), y en la base queda
  solo su SHA-256. Quien compra con el link puede poner otro mail (comprar para otra persona).
- **La puerta y la carga a mano no miran la lista** (como siempre: les organizadores tienen el
  control). Solo avisan: «Hay N personas en la lista de espera… Podés vender igual».
- **«Cerrar la lista» termina las anotaciones y apaga la lista en el evento** (gorrite, 12/10), en
  una sola acción: primero saca `lista_espera` del archivo (si no puede, no cierra nada), después
  quien espera o tiene un lugar ofrecido termina con el mail «se cerró la lista». Para volver a
  usarla, se prende en Editar.
- **El panel:** Ventas › Lista de espera, en la ficha del evento (cuentas, la fila, CSV), con
  «Terminar la reserva y pasar a la siguiente», «Sacar de la lista», «Ofrecer ahora» y «Cerrar la
  lista»; cada una pide confirmar y queda en Actividad sin el mail. Los mails que no salieron son
  una fila de «Para revisar» (0030).
- **Mismo trato que las órdenes:** sin purga (salvo lo sin confirmar), solo admins, nunca el mail
  en el registro de actividad ni en los logs.
- **Sin cron nuevo:** la pasada va en el de cada 15 minutos; los cambios que liberan un lugar
  (reembolso, cancelación, pago cancelado, cupo más grande…) dan un empujón para no esperar.

### Respondido por gorrite (12/10)

- **«Terminar la reserva y pasar a la siguiente» pregunta** si le avisamos por mail a esa persona
  (casilla «Mandarle un mail», marcada de entrada). Con la casilla sale «se terminó tu lugar»
  (`waitlist_ended`, como «se venció», con «Volver a anotarme»); sin ella, su link deja de servir
  sin aviso. Con la lista apagada no sale ningún mail y el diálogo lo dice. Actividad anota si se
  pidió el mail. Sin migración (ver [tickets.md](../tickets.md#lista-de-espera-en-construcción)).

## Descartado

- Guardar una cantidad fija de entradas para la lista (un stock aparte): duplica la cuenta del cupo
  y se desarma con cada reembolso o vencimiento.
- Ofrecer a varias personas a la vez cuando se liberan muchos lugares: gorrite prefirió de a una;
  si resulta lento, «avisar a todes a la vez» se prende por evento.
- Que la puerta no pueda vender un lugar guardado: la puerta nunca se frena (0006, 0035).
- Un cron más seguido: con el de 15 minutos y los empujones alcanza, aun con reservas de 2 h.

## Consecuencias

- Migración 0053 (solo agrega): `waitlist_entries` y `waitlist_sends` ([datos.md](../datos.md)).
  Va a preview y producción antes del merge (0028).
- `reserveOrder` suma la condición de la fila solo con el interruptor prendido y el evento con
  lista; apagado, la sentencia es la de siempre.
- Detalle en [tickets.md](../tickets.md#lista-de-espera-en-construcción),
  [entradas.md](../entradas.md), [mails.md](../mails.md#mails-de-la-lista-de-espera) y
  [panel.md](../panel.md); prueba de punta a punta en `tests/tickets/lista-espera.spec.js`.
