# Entradas (guía corta)

La referencia completa, con cada regla de precios, el Fondo, Mercado Pago y las variables de
entorno, está en [tickets.md](tickets.md). Esta es la versión corta.

## Qué hace

Un evento del calendario puede vender entradas desde el sitio. La persona elige tipo y cantidad,
paga con **Mercado Pago** o **transferencia** y recibe por mail **un QR por entrada** (o el link de
la transmisión, si es online). Hay códigos de descuento, el **Fondo KinkyVibe** (descuento
automático en los eventos con la etiqueta KinkyVibe), entradas **a la gorra** y entradas sin
cargo. Les admins ven las ventas en el panel, confirman transferencias, venden en la puerta, cargan
invitaciones a mano, reembolsan y controlan el ingreso escaneando el QR con el celu.

## Lo que nunca se tiene que romper

- **La venta online nunca pasa el cupo ni un tramo de preventa.** La reserva es una sola sentencia
  `INSERT … SELECT … WHERE vendidas + reservadas + cantidad <= cupo` (y lo mismo con la cantidad
  del tramo), atómica en D1. No se reemplaza por "leer y después escribir". Sin cupo (`capacity`
  vacío) = sin límite.
- **Preventas: el tramo (y su precio) lo elige el servidor al reservar.** El formulario manda el
  tramo que vio solo para avisar "El precio cambió" si ya no es el vigente; una compra entra entera
  en un tramo. Ver [Preventas escalonadas](tickets.md#preventas-escalonadas-y-tipos-encadenados).
- **El precio lo calcula siempre el servidor** a partir del frontmatter del evento y los ajustes.
  El formulario solo manda qué eligió la persona.
- **El webhook de Mercado Pago no confía en lo que recibe:** verifica la firma y le pregunta el
  pago a la API de MP, compara monto y moneda y actualiza de forma idempotente.
- **Les admins pueden pasar cualquier límite (decisión 0006), pero solo así:** en el servidor,
  después de `requireAdmin`, con un aviso en la página que explica el límite y un botón para confirmar
  (sin casilla extra) y una clave (si algo cambió, vuelve a preguntar), y una fila en el registro de actividad
  (`tickets.override`). Hoy: vender en puerta (también en eventos «Solo anticipadas», donde el
  modo puerta no lo ofrece salvo con "Vender igual"), confirmar una transferencia vencida (cupo y
  tramo) y cargar entradas a mano (cupo, máximo, venta cerrada, encadenado sin habilitar)
  (`src/lib/server/tickets/overrides.js`).
- **La compra pública conserva todos los límites.** `reserveOrder` no tiene override y mandar
  `override` en la compra no hace nada (hay pruebas).
- El `id` de un tipo de entrada **no cambia nunca** una vez que vendió (las órdenes lo guardan).
- **Privacidad:** el DNI nunca va en mails, logs, URLs ni la página de la entrada; el borrador del
  formulario vive en `sessionStorage`, nunca en `localStorage`.
- El ingreso solo lo marcan admins (quien tiene el link de su entrada no puede marcarse adentro).
- Los simulados (Mercado Pago falso, admin falso, eventos de prueba `prueba-entradas-*`) solo
  existen en `vite dev`: nunca llegan al build de producción.

## Dónde está el código

| Qué                                    | Dónde                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Lógica del servidor                    | `src/lib/server/tickets/` (un archivo por tema; ver la tabla de [tickets.md](tickets.md#archivos)) |
| Cálculo de precio y textos compartidos | `src/lib/utils/tickets.js`                                                                         |
| Página de compra                       | `src/routes/(content)/calendario/[event]/entradas/`                                                |
| Estado, entrada, QR, checkout simulado | `src/routes/entradas/`                                                                             |
| Webhook de MP / cron de recordatorios  | `src/routes/api/mercadopago/webhook/`, `src/routes/api/cron/recordatorios/`                        |
| Panel                                  | `src/routes/(authed)/admin/entradas/`, `admin/eventos/[slug]/`, `admin/checkin/`                   |
| Tablas                                 | `migrations/0002` a `0005`, `0010` y `0016` (ver [datos.md](datos.md))                             |
| Preventas y encadenados                | `src/lib/utils/ticketTiers.js` (puro), `TicketTiersEditor.svelte`                                  |

## Cómo probar

```sh
npm run dev:tickets     # MP simulado + admin falso (.env.tickets); nada real se cobra ni se manda
```

- Evento de prueba: `http://localhost:5173/calendario/prueba-entradas-2026-12` (en su página está
  el paso a paso). Para usar otro evento sin tocarlo: `TICKETS_DEV_FIXTURE=<slug>` en
  `.env.tickets.local`.
- Checkout simulado en `/entradas/simular-pago/<orden>` (aprobar, rechazar, pendiente).
- Sin `RESEND_API_KEY`, los mails se muestran en la consola.
- Demo con preventas: `scripts/demo/n3-entradas.sql` (datos inventados, solo para la base de
  preview; ver el encabezado del archivo).
- Pruebas: `npx vitest run src/lib/server/tickets` y
  `npx playwright test -c playwright.tickets.config.js` (este segundo **no corre en CI**: correlo
  si tocás la compra, el editor de entradas o los ajustes). Ver [pruebas-y-ci.md](pruebas-y-ci.md).
- En un preview de PR: entrar como admin de prueba ([demo.md](demo.md)).

## Tareas comunes

**Poner un evento a la venta.** Panel → Eventos → el evento → Editar → sección 🎟️ Entradas:
prender "Vender entradas por el sitio", cargar los tipos (el primero, «General»), cupo si hay,
precio fijo, preventas o a la gorra, medios de pago y, si es presencial, "Hay entradas en la
puerta" (con precio en la puerta opcional) o, apagado, "Solo anticipadas".

**Preventas escalonadas.** En el tipo, «Cómo se cobra» → Preventas: cada tramo con nombre, precio
y, opcional, cantidad ("los primeros 5") y fecha ("hasta el 9/10"); el último sin nada es "el
resto". Para una tanda que sale cuando se agota otra: un tipo aparte con «Se habilita» → "Cuando se
agote o cierre «…»".

**Cortar la venta.** Estado "Agotadas" o una fecha de cierre. Con ventas hechas, el editor no deja
borrar un tipo vendido ni apagar la venta.

**Confirmar una transferencia.** Entradas → Transferencias → Confirmar pago. Si la reserva venció
y no hay cupo, pide confirmar el pase de límite.

**Vender en la puerta / cargar invitaciones.** Check-in → el evento → Vender en puerta; o menú
"Opciones" → Cargar entradas a mano.

**Reembolsar.** Ficha del evento → Órdenes → Reembolsar… (total; MP o marcar la transferencia como
devuelta). Anula las entradas y avisa por mail.

**Cambiar la comisión, el alias o el Fondo.** Ajustes → Cobros / Fondo. Los datos bancarios van
ahí (en D1), **nunca en el repo**.

**Antes de vender de verdad:** revisar la lista de [pendientes](tickets.md#pendientes-antes-de-vender-de-verdad)
y borrar los eventos `prueba-entradas-*`.
