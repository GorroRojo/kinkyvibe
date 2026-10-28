# 0052. Link de puerta por evento

- Fecha: 2026-10-26
- Estado: Aceptada

## Contexto

Para que alguien ayude en la puerta hoy hace falta una cuenta de admin (0003): quien está en la
puerta tiene a mano todo el panel (todos los eventos, DNI completos, reembolsos, exportaciones,
mails). La auditoría de comunidad (K28) pidió una guía ya y, después de decidir, un acceso solo de
puerta.

## Decisión

- Un escalón nuevo en la escalera de 0003, antes de organizadores: el **link de puerta**. Une
  admin lo crea para **un** evento desde su ficha, con etiqueta y vencimiento (por defecto, el fin
  del día del evento más 6 horas; como mucho 7 días), y lo puede revocar desde ahí.
- El link abre **solo** el modo puerta de ese evento, sin cuenta: escanear, escribir el código,
  buscar, vender en la puerta, marcar y deshacer ingresos, la lista sin conexión. Nada más del
  panel.
- Muestra **lo mismo que la puerta del panel** para hacer entrar a la gente (nombre, pronombres,
  tipo, quién compró y su mail, los últimos 3 del DNI, la compra), y nada más: **no** el DNI
  completo (gorrite cambió la propuesta original, que no mostraba mails ni DNI).
- Con el link **no se pasan límites** (cupo, 10 por venta, solo anticipadas, evento cancelado) ni
  se cobra otro precio que el de la puerta: eso sigue siendo de admins (0006). Sin conexión, esos
  límites también frenan la venta al sincronizar (vuelve al celu como rechazada); solo una venta que
  pasa el **cupo** se guarda igual y va a «Para revisar» (0035).
- Cada acción hecha con un link queda en el registro de actividad con el id del link.
- Sin cambios en la política de devoluciones ni en lo que recibe Mercado Pago.

## Descartado

- Una cuenta de «solo puerta»: hace falta un login, y la puerta suele ser de una noche.
- Un link sin vencimiento o para varios eventos.
- Un link que no muestre mails ni la cola del DNI: la puerta busca por ahí (decisión de gorrite).

## Consecuencias

- Cómo funciona y por qué es seguro: `docs/tickets.md`, «Link de puerta».
- Los límites del link se controlan en el servidor en cada camino (venta con conexión y
  sincronización de ventas sin conexión), con topes por link y por hora de entradas vendidas y de
  mails de compra; con un link, el mail de compra sale solo en ventas con conexión.
- Con un link no viaja lo interno del panel: ni la nota, quién confirmó, el descuento o el
  reembolso de una compra, ni el token de las entradas en el buscador, ni los logins de admins.
- La puerta con link guarda en el celu aparte de la del panel. Cuando el link vence o el servidor
  dice que ya no sirve, se borran la lista guardada, los ingresos marcados y los últimos escaneos,
  pero nunca las ventas sin mandar (0035): quedan a la vista para que une admin las cargue (o las
  manda otro link vivo del evento). Revocar no puede llegar a un celu sin conexión: ese celu
  conserva la lista hasta que vence el link o vuelve a conectarse.
- `/puerta` no carga scripts de analytics de terceros (el token va en el fragmento).
- El rol de organizadore (`rol-organizadore`) puede reusar esto para la puerta de sus eventos.
