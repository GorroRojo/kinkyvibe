# 0009. Infraestructura, backups, pagos y documentación

- Fecha: 2026-09-30
- Estado: Aceptada

## Contexto

Tareas programadas, colas de mails, mail entrante y tiempo real solo existen en Workers. La base
guarda 30 días de historia y restaurar pisa todo. Varios agentes trabajan en paralelo sobre el
mismo código.

## Decisión

- **Pasar de Cloudflare Pages a Workers** después del merge de los PRs abiertos, en un PR propio
  que no cambia nada visible. La cuenta ya está en Workers Paid.
- **Backups**: copia nocturna de la base a R2, guardada por meses, con pruebas de restauración cada
  tanto. Fotos y videos también en R2, con su copia. "No quiero perder nunca nada."
- **Agentes**: un mapa de zonas del código y un agente por zona; las piezas compartidas primero.
- **Documentación**: guías cortas por parte, al lado del código, actualizadas en cada PR. Una guía
  de incorporación para une desarrolladore humane. Soluciones simples y con pruebas.
- **Pagos**: un segundo proveedor configurado de reserva, que se cambia desde el panel. Lo
  explícito (por ejemplo, video) **nunca** se cobra por Mercado Pago. Las transferencias quedan
  siempre como plan B.
- Migraciones de producción: las `0004` a `0010` se aplicaron el 30/9, antes de mergear el panel
  (#115).
- Datos de demo: fechas relativas y botón "Recargar datos de prueba" en el panel (solo en la rama
  demo).
- Limpiezas después del merge, en PRs chicos: recordatorios en tandas con tamaño configurable,
  prettier con chequeo en CI, sacar la dependencia `buffer`, `compatibility_date` más nueva, sacar
  la action `load` sin uso del editor.

## Descartado

- Quedarse en Pages.
- Confiar solo en la historia de 30 días de D1.
- Un solo proveedor de pago para todo.
- Documentación larga separada del código.

## Consecuencias

- La configuración de despliegue cambia con la migración a Workers; gorrite hace los pasos del
  dashboard con una guía.
- Los términos de Mercado Pago limitan cierto contenido para adultos: lo que se cobre de ese tipo
  va por otro proveedor, para no arriesgar la venta de entradas.
