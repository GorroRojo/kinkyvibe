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
- Con el link **no se pasan límites** (cupo, 10 por venta, solo anticipadas): eso sigue siendo de
  admins (0006). Sin conexión, una venta que pasa un límite se guarda igual y va a «Para revisar»
  (0035), como la de cualquier celu.
- Cada acción hecha con un link queda en el registro de actividad con el id del link.
- Sin cambios en la política de devoluciones ni en lo que recibe Mercado Pago.

## Descartado

- Una cuenta de «solo puerta»: hace falta un login, y la puerta suele ser de una noche.
- Un link sin vencimiento o para varios eventos.
- Un link que no muestre mails ni la cola del DNI: la puerta busca por ahí (decisión de gorrite).

## Consecuencias

- Cómo funciona y por qué es seguro: `docs/tickets.md`, «Link de puerta».
- El rol de organizadore (`rol-organizadore`) puede reusar esto para la puerta de sus eventos.
