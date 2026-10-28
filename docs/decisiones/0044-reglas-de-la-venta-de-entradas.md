# 0044. Reglas de la venta de entradas para el lanzamiento, y otras respuestas del 12/10

- Fecha: 2026-10-12
- Estado: Aceptada. Decidido por gorrite en la Mesa («Sí, todas» a lo propuesto para el
  lanzamiento de las entradas; el mismo día, el plazo de Mercado Pago, `/legales` y las otras
  respuestas de abajo). Completa 0006 (entradas), 0018 (propinas al Fondo) y 0040 (lista de
  espera). Cómo se devuelve todo de un evento cancelado lo completa
  [0051](0051-reembolsar-todas-evento-cancelado.md) («Reembolsar todas» para las órdenes de Mercado
  Pago).

## Contexto

Antes de vender entradas de verdad quedaban preguntas abiertas para les organizadores
([tickets.md](../tickets.md#preguntas-para-les-organizadores)): qué pasa si un evento se cancela o
se reprograma, si el Fondo tiene un tope por evento, cuándo cierra la venta, quién reembolsa y
cómo se cuentan los aportes de las entradas solidarias. Casi todo ya tenía un comportamiento en el
código; faltaba decidir si se quedaba así.

## Decisión

- **Evento cancelado:** se le devuelve todo a todes desde el panel (Reembolsar en cada orden), o,
  si la persona prefiere, un taller grabado, como dice la política de devoluciones.
- **Evento reprogramado:** la entrada vale para la nueva fecha. Quien no pueda ir pide la
  devolución con el mismo plazo de siempre: hasta 5 días hábiles antes de la nueva fecha.
- **Tope del Fondo por evento:** sin tope, como hoy. El panel ya muestra cuánto puso el Fondo en
  cada evento («Fondo usado»); si algún día hace falta un tope, se suma.
- **Cierre de la venta online:** al empezar el evento, como hoy. Cada evento puede cerrar antes (o
  cerrar un tipo antes) desde Editar › Entradas, y la puerta sigue vendiendo.
- **Quién reembolsa:** cualquier admin, como hoy; queda en Actividad. Sin reembolsos parciales por
  ahora: se hacen desde Mercado Pago y se anotan.
- **Aportes de las entradas solidarias:** suman al total del mes del Fondo, igual que las propinas
  al Fondo (0018), sin anotar a nadie como Mecenas.
- **Entrada solidaria pagada con un código:** el aporte es el completo (el código lo pone la
  organización), como hoy.
- **Plazo de acreditación de Mercado Pago:** el más largo que les sirva a les organizadores, para
  que el recargo de quien compra sea el más bajo. La comisión de ese plazo se carga en Ajustes ›
  Cobros (gorrite lo hizo el mismo día, junto con las pruebas en el sandbox y una compra real con
  su reembolso).
- **`/legales`:** el piloto abre sin `/legales`; la página mínima se retoma después del piloto.

### Otras respuestas del mismo día

- **Arreglos de datos viejos de producción** (mapa con dirección libre, talleres viejos en partes,
  textos viejos): los hace Claude de a tandas, cada una con el OK de gorrite en la Mesa.
- **Bot, Mis entradas:** la tarjeta muestra «Ver la transmisión» cuando el link está cargado, con
  la misma regla que la página de la entrada.
- **Bot en el sitio:** discreto: un link en el pie, una línea en el calendario y la tarjeta de Mi
  rincón que ya existe; los textos van en un PR con capturas.
- **Canal de anuncios de Telegram:** algún día.
- **Lista de espera, «Terminar la reserva y pasar a la siguiente»:** se le pregunta a le admin al
  tocar el botón si le manda un mail a esa persona (lo que quedaba a confirmar en 0040).
- **Promos de varios eventos:** «código de combo»: comprar el evento A manda por mail un código
  para el evento B, que vale solo para el mail de quien compró y para ese evento. El pack de dos
  eventos en una sola compra queda para algún día.
- **Sistema de diseño, paso 3:** gorrite aprueba los componentes con tarjetas en la Mesa, una por
  grupo chico, con capturas y link a `/estilo`, en lugar de una página de aprobación por
  componente.
- **Ideas viejas:** siguen todas, no son «algún día»: la barra de progreso de lectura (fina,
  arriba, solo en los textos largos de Material y Kinkipedia), el carrusel de la portada, la
  negociación interactiva para bottoms (necesita componentes interactivos dentro de los textos de
  la base) y las notificaciones push con PWA. Los campos de perfil tipo CV quedan para algún día.
- **Kinkipedia más rica y una lista de series mejor armada:** descartado, ni siquiera algún día.
- **kv-fondo en este repo:** no; kv-fondo sigue en su repo privado y los dos hablan por la API.

## Descartado

- Crédito para otro evento en lugar de la devolución cuando se cancela o se reprograma.
- Un tope del Fondo por evento: hoy no hace falta.
- Cerrar la venta online antes del comienzo en todos los eventos.
- Limitar los reembolsos a superadmins, o reembolsos parciales desde el panel.
- Achicar el aporte de una solidaria en proporción al código.
- Contar las solidarias como Mecenas, o mostrarlas en fondo.kinkyvibe.ar con nombre.
- Acreditación al instante: comisión más alta, la paga quien compra.

## Consecuencias

- Lo que dice «como hoy» ya está en el código: el cierre por defecto es el comienzo
  (`tickets_close` y el `close` de cada tipo), la puerta no mira la ventana de venta, el Fondo no
  tiene tope, Reembolsar pide `requireAdmin`, es total y queda como `order.refund`, y el aporte
  guardado es el nominal aunque haya código.
- **Falta un cambio de código:** el total del mes que lee fondo.kinkyvibe.ar
  (`/api/fondo/propinas-total`) hoy suma solo las propinas al Fondo; tiene que sumar también los
  aportes de las entradas solidarias aprobadas, coordinado con kv-fondo (issue #265). Plan:
  `fondo-aportes-entradas`.
- Cancelar un evento no reembolsa solo ni avisa por mail: se reembolsa orden por orden desde
  Ventas › Órdenes (cada reembolso manda su mail). Desde 0051, las de Mercado Pago también se
  pueden reembolsar todas juntas con «Reembolsar todas».
- El mail de cambio de fecha ya dice que lo comprado sigue valiendo y que, si no puede, responda y
  se le devuelve lo pagado; el plazo es el de la política de devoluciones del pie.
- Detalle en [tickets.md](../tickets.md#preguntas-para-les-organizadores). En el plan:
  `lanzamiento-decisiones` (hecho); `fondo-aportes-entradas`, los tres arreglos de datos viejos,
  los dos ítems del bot y las cuatro ideas viejas (siguen); `diseno-aprobar-componentes`
  (sigue esperando a gorrite: aprueba cada tarjeta); `mp-plazo-comision`, `lanzamiento-pruebas-mp` y
  `lanzamiento-compra-real` (hechos por gorrite);
  `legales-minimos` (después de `lanzamiento-piloto`); `bot-canal-anuncios` y `perfil-campos-cv`
  (algún día); `kinkipedia-series-mejor` y `kv-fondo-repo` (descartados).
  `lista-espera-mail-terminar` y `promos-varios-eventos` los cierran los PRs que los hacen.
