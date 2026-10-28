# Venta de entradas (fase 1, prototipo)

> Referencia completa. Para la versión corta (qué no se puede romper, cómo probar, tareas comunes) ver [entradas.md](entradas.md); los mails, en [mails.md](mails.md); la base, en [datos.md](datos.md).

Permite que la gente compre entradas para un evento del calendario desde el sitio, pague con **Mercado Pago (Checkout Pro)** o **transferencia bancaria**, y reciba por email un **QR por entrada**. Hay **códigos de descuento**, el **Fondo KinkyVibe** (que cubre parte de cada entrada, y al que se puede aportar pagando una entrada solidaria), un **recargo por la comisión de Mercado Pago** y entradas **"a la gorra"** (cada quien elige cuánto paga; en eventos online, con el link de la transmisión en lugar de QR). Les organizadores ven quién compró en `/admin/ventas`, confirman transferencias, cargan el alias para transferir y la comisión en **Ajustes de venta** y controlan el ingreso en la puerta escaneando el QR (o tipeando el código corto de la entrada) con el celu.

> Estado: prototipo probado solo con Mercado Pago y Resend **simulados** (el entorno donde se escribió no tenía acceso a sus APIs). Antes de vender de verdad hay que probarlo con las credenciales de prueba de MP y resolver la lista de [pendientes](#pendientes-antes-de-vender-de-verdad).

## Cómo se activa en un evento

Se agrega `tickets` a los datos del evento (en la base; el editor de eventos lo arma). Los eventos sin `tickets` siguen igual que siempre (con su `link` externo).

**Desde el panel (lo normal):** la sección **🎟️ Entradas** del editor de eventos, al crear o duplicar (`/admin/eventos/nuevo`) y al editar (pestaña **Editar** de la ficha del evento, `/admin/eventos/<slug>/editar`). Tiene:

- el interruptor "Vender entradas por el sitio" (apagado = sin `tickets`, se usa el `link` del evento);
- los tipos de entrada: nombre (el primero se propone como «General»), cupo **opcional** (vacío = sin límite) y **precio fijo**, **preventas** (tramos de precio: ver [Preventas escalonadas y tipos encadenados](#preventas-escalonadas-y-tipos-encadenados)) o **a la gorra** (mínimo y sugerido, con los botones rápidos que va a ver quien compra), y **«Se habilita»** (desde que abre la venta, o cuando se agote o cierre otro tipo), para agregar, quitar y reordenar. El diseño es primero para el celu (una columna) y se acomoda según el ancho del editor (container queries): en la compu, nombre y «Cómo se cobra» arriba, y precio, cupo y cierre propio en una fila pareja; los tramos se editan en `TicketTiersEditor.svelte`, uno por fila en pantallas anchas. Todo lo de la sección va en un `<div>` dentro del `<fieldset>`: en Chromium, si cambian los hijos directos del `<fieldset>` (por ejemplo, la lista de errores) a la vez que el contenido de una tarjeta con `container-type`, la tarjeta se queda sin contenido visible (pasaba al elegir «Preventas» con errores a la vista; lo prueba `tests/tickets/editor.spec.js`). El `id` de cada tipo sale del nombre al crearlo y **no cambia nunca** (las órdenes lo guardan), aunque se cambie el nombre;
- medios de pago, **horario de la venta** (apertura y cierre opcionales, con fecha y hora de Argentina; por defecto se puede comprar desde que se publica y hasta que empieza el evento) y el **cierre propio** opcional de cada tipo, modalidad (automática, presencial u online), **entradas en la puerta** (solo presenciales; ver abajo), recordatorios por mail y, en "Avanzado", la comisión de Mercado Pago del evento;
- **nada del Fondo**: es automático. Un aviso dice si el evento lo usa, según la etiqueta KinkyVibe, y cambia en vivo al prender o apagar "Lo organiza KinkyVibe".

Se valida en el navegador y otra vez en el servidor con las mismas reglas (`validateTicketsForm` en `src/lib/utils/ticketsEditor.js`, más `parseTicketConfig` sobre el archivo final): pesos enteros, precio > 0, mínimo ≤ sugerido, cupo entero o vacío, al menos un tipo y un medio de pago. **Al editar un evento que ya vendió** (se consultan las ventas en D1): no deja borrar un tipo con entradas vendidas o reservadas («Sacar» queda desactivado y la tarjeta dice por qué: se puede cerrar con el cupo o el cierre propio), bajar el cupo por debajo de eso ni apagar la venta (para cortarla: estado "Agotadas" o una fecha de cierre); cambiar un precio solo avisa que las compras hechas mantienen el suyo (también pasar un tipo que ya vendió de precio fijo a preventas: se acepta, y las compras hechas quedan con su precio). Si la base no responde, lo dice y el servidor vuelve a revisar al guardar. Cada tipo y cada tramo tiene una `key` local (la del `{#each}`, no se guarda) con un prefijo distinto por carga de la página, para que no choque con las de un borrador recuperado (si chocaban, el editor se colgaba). Solo se reescribe lo que cambió: comentarios, orden y claves que el editor no conoce se conservan (también dentro de cada tipo).

**A mano**, en el archivo:

```yaml
tags:
  - KinkyVibe # el Fondo KinkyVibe solo aplica a eventos con esta etiqueta (ver abajo)
tickets:
  - id: general # minúsculas, números, - o _ (va en la base de datos: no cambiarlo después de vender)
    name: General # lo que ve la gente
    price: 10000 # pesos, entero: el "Valor" de la planilla (precio COMPLETO, sin fondo)
    capacity: 40 # opcional: cupo de este tipo; sin `capacity` (o vacío) no tiene límite
  - id: anticipada
    name: Anticipada
    price: 8000 # el fondo aplica también acá
    capacity: 10
    close: 2026-10-09T23:59-03:00 # opcional: este tipo deja de venderse antes que el resto
  - id: gorra
    name: A la gorra
    a_la_gorra: { minimo: 0, sugerido: 5000 } # en lugar de `price` (ver "A la gorra")
    capacity: 100
  - id: fiesta
    name: Fiesta
    capacity: 25 # opcional, como siempre
    tiers: # en lugar de `price`: preventas (ver "Preventas escalonadas")
      - { id: preventa-1, name: Preventa 1, price: 8000, quantity: 5 } # los primeros 5
      - { id: preventa-2, name: Preventa 2, price: 9000, until: 2026-10-09T23:59-03:00 }
      - { id: fiesta, name: General, price: 10000 } # sin cantidad ni fecha: el resto
  - id: ultima-tanda
    name: Última tanda
    price: 12000
    after: fiesta # se habilita cuando «fiesta» se agota o cierra
    door_price: 14000 # opcional: precio en la puerta y en la carga a mano (si falta: el del último tramo o el fijo)
tickets_open: 2026-10-01T12:00-03:00 # opcional; antes de eso: "Abre el jueves 1/10 a las 12:00"
tickets_close: 2026-10-16T18:00-03:00 # opcional; si falta, la venta cierra cuando empieza el evento
payment_methods: [mercadopago, transferencia] # opcional; por defecto solo mercadopago
mp_fee_percent: 2 # opcional; si falta: Ajustes de venta, TICKETS_MP_FEE_PERCENT o 2 %
modalidad: online # opcional: online | presencial (ver "Eventos online")
puerta: true # opcional (presenciales): true = también en la puerta; false = "Solo anticipadas"; si falta, ver abajo
puerta_precio: $ 12.000, solo efectivo # opcional, con `puerta: true`: nota de texto libre para la página (un número solo se muestra como $); lo que se cobra es el `door_price` de cada tipo
meta_venta: plata:250000 # opcional: la meta de venta del panel (plata:<pesos netos de la comisión de MP> o entradas:<cantidad>); ver "Meta de venta"
```

- El precio que se cobra **siempre** sale de este frontmatter, leído en el servidor. El formulario solo manda el tipo, la cantidad, cómo quiere pagar (opción del fondo), el código y el medio de pago.
- **El Fondo KinkyVibe solo aplica a eventos con la etiqueta `KinkyVibe`** (decisión de la organización; también cuentan sus alias `Kinkyvibe` y `kinkyvibe`, que se resuelven con el árbol de etiquetas del sitio (de la base), no comparando texto: `isKinkyVibeEvent` en `config.js`). En un evento **sin** la etiqueta: precio de lista y nada más: no se muestra "¿Cómo querés pagar tu entrada?" (ni descuento del fondo ni solidaria / muy solidaria / Sugar), ni textos del Fondo, no se guarda fondo usado ni aportes (y el admin no muestra las columnas del fondo para ese evento, salvo que tenga órdenes viejas con montos del fondo). El servidor lo hace cumplir: `validatePurchase` ignora cualquier `option` que llegue en el POST y la orden queda `completo`, con `fondo_percent` NULL (hay tests unitarios y E2E con un POST armado). Las órdenes ya hechas no cambian.
- En los eventos KinkyVibe, **el fondo aplica a todos los tipos de entrada** y **es automático**: el porcentaje del mes sale de fondo.kinkyvibe.ar (ver [Descuento automático del Fondo](#descuento-automático-del-fondo)) y se aplica a todos los tipos con precio, redondeado al peso. **No hay fondo fijo por evento ni por tipo**: `fondo_percent` en el evento y `fondo` (pesos) en un tipo ya no existen y, si quedan en un frontmatter, se ignoran sin error. Los precios siguen a fondo.kinkyvibe.ar también durante una venta; cada orden guarda el porcentaje y los montos con los que se compró (las órdenes ya hechas no cambian). Si el porcentaje cambia entre que se cargó la página y la compra, no se cobra el nuevo sin avisar: ver [Descuento automático del Fondo](#descuento-automático-del-fondo). Los tipos **a la gorra** no tienen fondo (quien paga elige el monto). Se eligió así porque el Fondo KinkyVibe funciona como **un porcentaje de descuento sobre todo** (ver [El Fondo KinkyVibe](#el-fondo-kinkyvibe)). Con 100 % la entrada "con el descuento del fondo" queda gratis.
- `status: cancelado` o `status: agotadas` cierran la venta.
- **Cantidad:** un stepper compacto **− n +** al lado de la etiqueta (botones de 42 px, cómodos para el dedo; también se puede tipear), de 1 a `min(disponibles, 20)`: cada entrada lleva su bloque de datos y con más el formulario se vuelve inmanejable en el celu. El servidor rechaza más de 20. Cada entrada tiene su propio QR y su código corto.
- `transferencia` solo aparece si además hay datos para transferir (en **Ajustes de venta** o, si ahí está vacío, en `TICKETS_TRANSFER_INFO`); `mercadopago`, si hay `MP_ACCESS_TOKEN` (o el mock en dev). Para que no pase en silencio, si un evento tiene tildada «Transferencia» y no hay datos, el editor de eventos (sección Entradas) y el **Inicio** del panel (en «Para revisar», para los eventos que vienen y no están cancelados) avisan «Activaste transferencia pero faltan los datos en Ajustes → Cobros: por ahora no se ofrece», con link a `/admin/ajustes/cobros`. Solo reciben sí/no (`transferReady` / `transferReadyFromSettings` en `src/lib/server/tickets/index.js`), nunca los datos.
- En la página del evento, un evento sin `tickets` muestra el `link` después del texto con el mismo botón grande que «Comprar entradas» (`BotonCompra.svelte`); si es un link web, se abre en otra pestaña y dice «Se abre en <sitio>».
- En la página del evento, un evento con `tickets` no muestra el botón de inscripción del `link` (sigue al final del texto si tiene `link_text`): **después del texto** («De qué se trata»: el texto se lee antes de comprar, maqueta final de gorrite) hay un botón grande **Comprar entradas** (`src/lib/components/evento/Compra.svelte`) con el precio "desde" (con el fondo aplicado; "a la gorra" si hay tipos a la gorra) y cuántas quedan si son pocas, que lleva a la página de compra.
- **Cuántas quedan, en público:** solo se muestra un número cuando un tipo **con cupo** tiene **menos de 10** disponibles ("Quedan 7", "¡Últimas 3!", "¡Última!"; `publicLeft`/`leftText` en `src/lib/utils/tickets.js`); si no, no se muestra ni el cupo ni lo vendido. En el botón de la página del evento, solo si todos los tipos a la venta tienen cupo y entre todos quedan menos de 10. Agotado sigue diciendo "Agotada". La página de compra recibe por tipo `available` acotado a 20 (lo que se puede comprar de una vez), no el cupo real.
- **Sin cupo** (sin `capacity`): el tipo no se agota nunca. La reserva online, la venta en la puerta y la confirmación de transferencias vencidas no controlan cupo para ese tipo (`?N IS NULL OR …` en la misma sentencia); un pago aprobado tarde no queda "para revisar" por cupo; el admin muestra "vendidas (sin cupo)". `capacity: 0` sí es un cupo (agotado).
- **Entradas en la puerta** (`puerta` / `puerta_precio`, eventos presenciales; en los online se ignora), tres estados (`parseDoor` en `config.js`, `doorText` en `src/lib/utils/tickets.js`, `doorSalesOpen` en `door.js`):
  - **sin `puerta`** (los eventos de antes): todo sigue como siempre: el modo puerta ofrece **Vender en puerta** y la página pública **no dice nada** sobre la puerta;
  - **`puerta: true`**: se vende en la puerta y la página del evento y la de compra dicen "También hay entradas en la puerta: …". El precio es la nota `puerta_precio` si está (manda); si no, el que sale del «Precio en puerta» de los tipos (`doorPricesText` en `src/lib/utils/tickets.js`, con el mismo `doorPrice` que cobran la puerta y la carga a mano; gorrite, 12/10): un solo precio, «$ 12.000»; varios, «desde $ 10.000»; con tipos a la gorra, «… o a la gorra» (o solo «a la gorra»). Lo arma `getTicketsView` (`door.typesPrice`);
  - **`puerta: false`**: la página dice "Solo anticipadas: no hay entradas en la puerta." y el modo puerta **no ofrece** "Vender en puerta": en su lugar muestra "Solo anticipadas" y un botón secundario "Vender igual (pasa un límite)" (paso aparte); une admin puede vender igual confirmando el aviso (ver [Pasar límites desde el panel](#pasar-límites-desde-el-panel)); sin esa confirmación `sellAtDoor` devuelve `no-door`.
  - En el editor es la casilla "Hay entradas en la puerta", **prendida por defecto** (eventos nuevos y los que no tenían la clave). Al guardar un evento presencial con venta, siempre se escribe `puerta: true | false` explícito, así los eventos que se editan desde ahora quedan con una elección.
- Bajar el `capacity` por debajo de lo vendido no cancela nada: solo frena nuevas ventas.

## Cómo funciona

1. **Compra** (página propia: **`/calendario/<slug>/entradas`**, separada de la del evento para que el formulario no empuje hacia abajo el texto del evento; arriba, un encabezado compacto con título, fecha, lugar e imagen):
   - **Tres pasos: Entradas → Tus datos → Pagar.** **Entradas**: tipo (preventas/tandas), cómo pagarla (opciones del Fondo) o cuánto (a la gorra), cantidad y código de descuento. **Tus datos**: quien compra, cada entrada y las preguntas de inscripción. **Pagar**: medio de pago, condiciones, la casilla de +18 y el botón. Arriba, un **indicador de pasos** (`StepIndicator.svelte`, el actual con `aria-current="step"`; los pasos ya hechos son botones para volver). Al cambiar de paso el foco va al título del paso.
   - **Mails mal escritos.** Al salir del campo de mail (en «Tus datos» y en la lista de espera), si el dominio parece mal escrito (`gmai.com`, `hotmial.com`, `gmail.con`…) aparece «¿Quisiste decir …@gmail.com?» con «Sí, corregilo» (`EmailTypoHint.svelte`, `src/lib/utils/emailTypos.js`: dominios válidos que nunca se tocan, un mapa exacto de errores, TLD imposibles a `.com` y una letra de distancia de los dominios grandes). Solo sugiere, en el navegador: no bloquea la compra y el servidor no rechaza nada por esto (rechazar es una decisión de gorrite). En «Pagar», antes del botón: «Te mandamos las entradas a <mail>. Revisá que esté bien.» con «Cambiarlo», que vuelve a «Tus datos».
   - **Resumen siempre a la vista** (`PurchaseSummary.svelte`): tipo, opción, cada línea del precio y el total. En pantallas anchas es una columna al costado (fija al bajar); en el celu, una barra arriba del formulario con el total y un botón **Ver detalle**. Es un solo bloque que cambia con CSS (container queries sobre el bloque de compra), así el total aparece una sola vez. Las líneas salen de `computePrice` vía `purchaseSummary` (`src/lib/utils/purchaseSteps.js`): no hay otra cuenta.
   - **Un solo formulario**: los pasos que no se ven quedan en la página con `hidden`, así ir y volver no pierde nada y se manda todo junto, igual que antes (las form actions `?/discount` y `?/buy` no cambiaron). **Sin JavaScript** se ven los tres pasos juntos (un `<noscript>` saca el `hidden` y esconde los botones de paso) y funciona como un formulario común.
   - **Validación por paso:** «Continuar» (o saltar adelante con el indicador) valida el paso con **las mismas funciones que el servidor** (`validateBuyer`, `validateHolders` en `src/lib/utils/ticketBuyer.js`, que `validatePurchase` re-exporta, y `validateAnswers`): si hay errores no avanza, los marca al lado de cada campo y lleva el foco al primero; mientras se corrige, los errores se actualizan. Con JavaScript el formulario va con `novalidate` (los avisos son los nuestros, en voseo). Al enviar se revisan los tres pasos; si el servidor devuelve errores, se abre el primer paso que los tiene (`firstStepWithErrors`).
   - **Quien compra** (uno por compra): nombre, **pronombres (obligatorios**, se guardan en la orden, `buyer_pronouns`), email (ahí van todas las entradas) y **DNI** (7 a 9 dígitos, se aceptan puntos; se guarda solo con dígitos).
   - **Con cuenta**: estos datos arrancan completados con lo guardado y el mail de la cuenta, y aparecen las casillas «Guardar mis datos para la próxima» y «Recordar mi DNI» (aparte, sin marcar). Ver [cuentas.md](cuentas.md), «Datos guardados para la compra». Sin cuenta, nada cambia.
   - **Cada entrada** (datos para el evento): nombre (como le conocen, no el del documento) y **pronombres (obligatorios**, hasta 40 letras; el servidor también lo exige). Al lado de "Pronombres" hay un **?** chiquito y gris (está por las dudas) que abre <https://pronombr.es> en **otra pestaña** (`target="_blank" rel="noopener"`), para no perder lo escrito. La entrada 1 copia el nombre y los pronombres de quien compra hasta que se editen ahí (sin JavaScript, si quedan vacíos se usan los de quien compra).
   - Tipo, **¿Cómo querés pagar tu entrada?** (ver [Precio](#precio-fondo-código-y-recargo)) o, en un tipo a la gorra, **¿Cuánto querés pagar por entrada?**, cantidad, código de descuento opcional (botón **Aplicar**, que valida en el servidor y muestra el total en el resumen; no aparece con un tipo a la gorra), medio de pago y la casilla de +18/condiciones.
   - **Medio de pago:** dos tarjetas del mismo alto, una al lado de la otra (en el celu, una debajo de la otra), y la explicación de cada medio debajo, en un lugar reservado (las dos explicaciones ocupan la misma celda y solo se ve la elegida): elegir uno no mueve nada (la línea del recargo también reserva su lugar). Hay un test E2E que mide que no cambie ninguna posición.
   - **Condiciones:** una sola lista con el mismo formato (`purchaseConditions` en `src/lib/utils/tickets.js`): +18, una entrada por persona, cuándo llegan las entradas, cuánto se reserva el lugar y la política de devoluciones.
   - **Borrador en `sessionStorage`:** lo que se va completando (tipo, opción, cantidad, datos de quien compra —DNI incluido—, cada entrada, código, medio de pago y el paso, si los anteriores siguen bien) se guarda en `sessionStorage` y se restaura si la página se recarga; se borra cuando la compra sale bien (redirección a MP, a la transferencia o a las entradas). Se incluye el DNI porque `sessionStorage` es solo de esa pestaña, no se comparte con otras ni sobrevive a cerrarla, y no guarda nada que la persona no haya escrito ya en esa misma página; perder el DNI en una recarga era justamente lo molesto. **Nunca `localStorage`** (quedaría en la compu después de cerrar). La casilla de +18 no se guarda. Si el servidor devuelve el formulario con errores, mandan esos valores.
   - Con **Mercado Pago**: el servidor valida, **reserva cupo por 20 minutos** creando una orden `pending` y crea una _preferencia_ de Checkout Pro. La persona va al checkout de Mercado Pago.
   - Con **transferencia**: ver [Transferencia](#transferencia).
   - Si el **total queda en $ 0** (código de 100 %, o $ 0 a la gorra con mínimo 0): no pasa por Mercado Pago; se emiten las entradas en el momento (con los mismos límites de intentos). **Una orden gratis por mail y evento** (aprobada o reservada vigente), salvo que la cuenta con sesión sea la de ese mail: la controla la misma sentencia que el cupo (`freeOnce` en `reserveOrder`) y la página responde «Con este mail ya se pidieron entradas gratis para este evento. Si es tu mail, entrá a tu cuenta con ese mail para pedir más.» (`FREE_ONCE_MESSAGE`). La puerta y la carga a mano no tienen este tope.
2. **Cupo sin sobreventa:** la reserva es una única sentencia `INSERT … SELECT … WHERE vendidas + reservadas + cantidad <= cupo` (o sin límite si el tipo no tiene cupo). D1 ejecuta cada sentencia de forma atómica y en serie, así que dos compras simultáneas no pueden pasarse. Cuentan las órdenes aprobadas y las reservas vigentes.
3. **Webhook** `POST /api/mercadopago/webhook`: verifica la firma `x-signature` con `MP_WEBHOOK_SECRET`, y **no confía en el contenido**: pide el pago a la API de MP (`GET /v1/payments/<id>`), busca la orden por `external_reference`, compara monto y moneda (ARS) y actualiza el estado de forma idempotente (las notificaciones se repiten y llegan desordenadas). Al aprobarse se crean las entradas (una por unidad, con un token aleatorio de 256 bits) y se manda el email. Si una lectura falla después de aprobar (releer la orden, revisar el cupo de un pago tardío, leer las entradas), se loguea y el webhook contesta 2xx igual: la aprobación ya quedó hecha; si no se pudo revisar el cupo de un pago tardío, la orden queda para revisar. Si el email falla, lo reintenta el cron ([mails.md](mails.md#reintento-del-mail-de-las-entradas)).
4. **Vuelta de MP** (`/entradas/<orden>/estado`): si el webhook todavía no llegó, vuelve a consultar el pago a la API igual que el webhook. Muestra el estado y, en el mismo navegador de la compra, los links a las entradas y el email completo (la cookie `kv_orders`, ver [Seguridad](#seguridad-resumen)). Mientras el pago sigue pendiente, la página vuelve a consultar sola, cada vez más espaciado (5, 10, 20 y después cada 30 segundos; 8 veces, unos 3 minutos: `nextOrderPollDelay` en `src/lib/utils/orderPolling.js`), y recarga solo la orden (`invalidate('kv:orden')`), no el layout del sitio. Después de leer la orden (y de re-consultar a MP), lo demás (la venta del evento, la cookie, las entradas, las partes del taller y los datos para transferir) se lee junto, no en fila.
5. **Email** (Resend): datos del evento y un QR por entrada (imagen GIF servida en `/entradas/t/<token>/qr.gif`, porque Gmail no muestra SVG) con su **código corto en grande al lado**, y link a `/entradas/t/<token>`. En eventos online, en lugar de QR: el link de la transmisión si ya está cargado, o el aviso de que llega antes del evento.
6. **Entrada** (`/entradas/t/<token>`): QR con el **código corto** al lado, en grande (ver abajo), nombre, pronombres, tipo y estado (válida / ya usada / anulada). No muestra datos de otras personas. En eventos online muestra el link de la transmisión cuando está (solo con la compra aprobada).
7. **Código corto de cada entrada** (`tickets.code`): 6 caracteres de un alfabeto sin ambiguos (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`: sin 0/O, 1/I/L), único por evento (índice único en la base), al azar (31⁶ ≈ 887 millones). Se elige dentro del mismo `INSERT` que emite la entrada entre tres candidatos al azar no usados en el evento, así que un choque nunca hace fallar la aprobación de un pago. Sirve para tipearlo en la puerta si el QR no se puede escanear: el control de ingreso lo acepta con o sin "KV-", espacios o guiones, y lee O como 0 e I/L como 1 (letras que los códigos no usan). No reemplaza al token del QR para ver la entrada: solo lo usan les admins en el control de ingreso.
8. **Admin** (`/admin/ventas`): vendidas/cupo, reservas y recaudación bruta por tipo, y por evento **Fondo usado**, **Aportes al fondo** y **Neto del fondo**; por evento, la ficha `/admin/eventos/<slug>` con pestañas (Resumen, Editar, Ventas, Puerta, Códigos, Mails y Preguntas; Ventas tiene las vistas Totales con ventas por día y cómo pagaron, Órdenes y Transferencias, y Mails las vistas Mandar un aviso y Plantillas, ver [panel.md](panel.md)): la lista de órdenes, exportar CSV (`/admin/eventos/<slug>/ordenes.csv`) y reenviar el mail. El control de ingreso es el modo puerta (punto 9).
9. **Modo puerta** (check-in): `/admin/checkin` elige el evento (hoy primero, después los próximos y los de los últimos 60 días, con cuántes entraron; con un solo evento hoy entra directo a ese, con «Otro evento» para volver a la lista, ver docs/panel.md) y abre `/admin/eventos/<slug>/ingreso`: pantalla completa y oscura, sin menús del panel (`bare: true`), con la pantalla siempre prendida (Screen Wake Lock, que se vuelve a pedir al volver a la pestaña). Arriba, el botón **?** abre la guía para quien está en la puerta ([Puerta: cómo hacerla](#puerta-cómo-hacerla)).
   - **Contador** "18 de 31 adentro" con el detalle por tipo, y **escáner** de QR con la cámara (API `BarcodeDetector`: Chrome en Android, Edge), con linterna y cambio de cámara si el celu los tiene. En iPhone (Safari no tiene `BarcodeDetector`) se puede escanear con la cámara del sistema: abre la página de la entrada, que a les admins les muestra el botón "Marcar ingreso" (a quien no es admin no: el form action llama a `requireAdmin`, hay tests).
   - **Resultado** en grande con vibración (y sonido opcional, apagado por defecto): verde "Adelante", amarillo "Ya ingresó" (hora y quién), rosa "Anulada", "De otro evento" o "QR inválido". Muestra la persona, pronombres, tipo, quién compró y su **email**, el **DNI parcial** (últimos 3; al tocarlo se ve completo y queda en el registro de actividad como `order.reveal_dni`, sin el número), el código y **"Primera vez en <serie>"**. "Deshacer" (queda como `checkin.undo`). Tocar el resultado abre la **compra completa**: estado, medio de pago, montos, fondo, descuento, todas las entradas de la orden con su ingreso, fechas y link a la orden.
   - **Serie de un evento** (`src/lib/server/tickets/series.js`): sus etiquetas de serie, las hijas (o nietas) de «evento recurrente», como en las páginas de series. Ya no se adivina por el slug: un evento sin etiqueta de serie no muestra nada. Es la primera vez de la persona si no hay, en ediciones anteriores de la serie (las que van antes en el orden de ediciones, por fecha), una entrada aprobada o con ingreso marcado con el mismo nombre (sin tildes ni mayúsculas) ni, si la entrada es de quien compró, una compra con el mismo email. Si ninguna edición anterior tiene entradas vendidas acá, no se muestra nada.
   - **Escribir código** y **Buscar persona**: el código corto (ver arriba) o el link del QR; y un buscador con sugerencias mientras se escribe (desde 2 letras) por nombre y pronombres de la entrada, nombre, email y DNI de quien compró y código, sin distinguir tildes ni mayúsculas; cada sugerencia dice con qué campo coincidió (el DNI, parcial: la respuesta trae solo los últimos 3 dígitos, aunque se busque por el DNI completo, que se compara en el servidor). Es un combobox accesible (flechas, Enter). Las sugerencias vienen de `GET /admin/eventos/<slug>/ingreso/buscar?q=` (con `requireAdmin`); el filtro se hace en el servidor en JS porque SQLite no ignora tildes. Tocar una persona marca su ingreso.
   - **Últimos escaneos**: los últimos 5 de este celu, con su estado y la hora.
   - **Sin conexión**: al entrar, el celu baja la lista de entradas del evento (`GET …/ingreso/lista`: hash SHA-256 del token, código, persona, tipo, estado, ingreso, quién compró, email, últimos 3 del DNI y primera vez; nunca el token ni el DNI completo) y la guarda en localStorage. Si se corta la conexión, valida los QR y códigos contra esa lista, marca el ingreso local y lo encola con la hora; un aviso muestra que no hay conexión, qué sigue andando (validar, buscar en la lista guardada y vender en la puerta, con la nota de que las ventas se mandan después) y qué necesita conexión (ver el DNI completo), y cuántas ventas e ingresos faltan sincronizar («2 ventas y 1 ingreso por sincronizar»). Con conexión, cuando la lista ya quedó guardada, un cartel chico verde dice «Listo para sin conexión» con la hora de la lista, para que quien está en la puerta sepa que puede seguir si se corta (`doorConnectionNote` en `src/lib/admin/doorOffline.js`). Al volver, los manda (acción `?/sync`): el servidor los aplica de forma idempotente (reintentar no duplica) y, si otra persona u otro celu ya había marcado esa entrada, gana el primer ingreso guardado y el celu muestra el conflicto. La hora del celu se acota a los últimos 3 días y a no más que ahora. La página tiene que abrirse con conexión (no hay service worker); si se recarga sin conexión no carga. Por eso, sin conexión, el aviso dice además «No cierres ni recargues esta pestaña: sin conexión no vuelve a cargar» (`keep` de `doorConnectionNote`), la flecha «←» pregunta antes de salir (diálogo en la página, «Salir igual») y la pantalla no tiene «tirar para recargar» (`overscroll-behavior-y: contain`) (auditoría de UX, V12).
   - **Vender en puerta** (en eventos con `puerta: false`, o pasando el cupo o las 10 entradas por venta, pide confirmar: ver [Pasar límites desde el panel](#pasar-límites-desde-el-panel)): tipo, cantidad (hasta 10 sin confirmar; tope técnico 100), **precio por entrada** (al lado de la cantidad, ya cargado con el de la puerta, `doorPrice`; se puede cambiar, ver abajo) y opción del fondo, o monto a la gorra (los montos se leen con `parseAmount`, como en la compra online: «5.000», «$ 5.000» o «5000,00» son $ 5.000, «5000.00» da error en vez de $ 500.000, y respetan el tope técnico de la compra), efectivo o transferencia ya recibida, nombre, y opcionales pronombres, DNI, email (y mandarle las entradas por mail), nombres de las otras personas y una **nota** («Agregar nota»). Crea una orden **ya aprobada** con `channel = 'puerta'` y `payment_method` `efectivo` o `transferencia` (quien vendió queda en `confirmed_by`), controla el **cupo en la misma sentencia** que la compra online (cuentan aprobadas y reservas vigentes: dos ventas a la vez no se pasan), emite las entradas y las marca adentro, todo en una transacción, y queda en el registro de actividad (`order.door_sale`). No aplica la ventana de venta, los topes por email ni códigos de descuento. Si se le mandan las entradas por mail y el evento tiene un combo, el mail lleva el código combo (ver [Códigos combo](#códigos-combo)).
     - **Una venta errada** (auditoría de UX, V12; gorrite, 26/10: **en la Puerta no hay «Anular» ni reembolso**, eso queda en el panel con su confirmación): el resultado de cada venta registrada dice «¿Te equivocaste? Ver la orden», que lleva a esa orden en Ventas › Órdenes (`orderHref` en `src/lib/admin/orderFormat.js`: `…/ordenes#orden-<id>`; la página baja hasta la orden, la marca y, si el filtro «Mostrar» la escondía, pasa a «Todas»). Una venta sin conexión que todavía no se sincronizó no tiene orden: ver «Descartar» abajo.
     - **Otro precio y nota** (gorrite, 12/10, probando la puerta con celus): en un tipo con precio, el precio por entrada se puede cambiar por lo que se cobró de verdad: entero de 0 a $ 100.000.000 (el tope de `price`; se lee con `parseAmount` a través de `parseDoorAmount` en `src/lib/admin/doorSale.js`; negativos, centavos o texto se rechazan) y el total de la venta dentro del tope técnico de la compra (`exceedsOrderMax`, como a la gorra). Se cobra como si fuera el `door_price` de esa venta: el Fondo sale de `parseDoorPrice` con el mismo porcentaje y el total de `computePrice` (sin recargo de Mercado Pago: en la puerta no hay). Si es distinto del de la puerta, el de la puerta queda en `orders.door_list_price` (migración 0063) y el panel dice «Precio cambiado en la puerta: $ 5.000 en vez de $ 12.000» (Órdenes, la hoja «Ver compra» y el resultado de la venta); el registro lo anota (`priceChanged: { from, to }` y «precio cambiado» en el resumen). **0 queda «sin cargo»** (`gratis`) como en la carga a mano, y con canal `manual`: la base solo acepta precio 0 en las manuales y a la gorra (CHECK de la migración 0010), y cambiar ese CHECK exige reconstruir `orders`, que hoy borraría en cascada `order_answers` (ítem `puerta-precio-cero-canal` del plan). Las entradas quedan adentro igual y va al registro como `order.door_sale`. Un 0 tiene que escribirlo quien vende: un `door_price: 0` de la configuración (el editor ya no lo deja guardar) sin precio escrito sigue avisando «cargala a mano», como dice arriba. La nota es la de la carga a mano: `orders.admin_note`, hasta 300 caracteres, solo en el panel (Órdenes, «Ver compra» y el resultado de la venta; nunca en mails); el registro anota solo que tiene nota (`withNote`).
   - **Vender en puerta sin conexión** ([decisión 0035](decisiones/0035-vender-en-puerta-sin-conexion.md)): el mismo formulario (con el precio por entrada y la nota), sin el DNI (sin conexión no se guarda en el celu) y, con transferencia, con la casilla «Vi que llegó la transferencia». Si con lo que sabe el celu (cupo de cuando había conexión, menos lo vendido sin conexión; 10 por venta; solo anticipadas) se pasaría un límite, avisa con el mismo diálogo, pero se puede guardar igual. La venta queda en la cola del celu (`localStorage`, `queueOfflineSale` en `src/lib/admin/doorOffline.js`) con un id del celu; sus entradas cuentan como adentro en ese celu y se ven como «pendiente de sincronizar». Al volver la conexión (o con «Sincronizar») se mandan **antes que los ingresos y en el orden en que se vendieron** (acción `?/syncSales`, `applyQueuedSales` en `door.js`): cada una pasa por la misma validación (`parseDoorSale`) y la misma función (`sellAtDoor`) que la venta con conexión, con la hora del celu (acotada como la de los ingresos); el precio cambiado y la nota viajan en la venta (`amount` y `note`), se validan otra vez al sincronizar y dan la misma orden que con conexión. Cambiar el precio **no es un límite**: no la manda a «Para revisar». Una venta guardada antes de que existiera el campo (sin `amount`) cobra el precio de la puerta; un precio inválido no se registra y queda a la vista en el celu. Es **idempotente**: el id del celu queda en `orders.client_sale_id` (índice único, migración 0051), así que un reintento devuelve la orden que ya existe. **Un límite no frena la venta**: si al sincronizar se pasa el cupo, se agotó el tipo, son más de 10, el evento es solo anticipadas o se canceló, se guarda igual con esos límites en `orders.offline_review`, sale en «Para revisar» («Venta sin conexión de … para revisar», con «Marcar como revisada» en Órdenes) y el celu muestra un aviso. **El precio es el de cuando se sincroniza**: la venta se registra con el precio en la puerta (salvo que quien vendía haya escrito otro) y el % del Fondo de ese momento, no con los de cuando se vendió. Por eso el celu manda lo que cobró (`charged_total`, el total que vio quien vendía) y, si el servidor la registra con otro total, también queda en `offline_review` (`{ kind: 'price', charged, recorded }`) y en «Para revisar»: «Se cobró $ 16.800; quedó registrada en $ 16.500». No se corrige sola: quien organiza decide. Una venta de un celu con una versión anterior (sin `charged_total`) no se compara. Si el servidor no la puede registrar (por ejemplo, un tipo que ya no existe), el celu la deja a la vista con sus datos («Cargala a mano») hasta que alguien descarta el aviso: nunca se borra sola. **Descartar una venta que todavía no se mandó** (auditoría de UX, V12): mientras está en la cola del celu, se puede descartar desde el resultado de la venta («¿Te equivocaste? Descartar esta venta»), desde «Ver compra» o desde «Opciones» › «Ventas sin sincronizar». Siempre pregunta antes con un diálogo en la página (nunca `window.confirm`) y solo la saca de la cola y de la lista local de este celu (`discardQueuedSale` en `doorOffline.js`, que sin `confirmed` no hace nada); no toca el servidor ni la plata (si se cobró, se devuelve a mano). Mientras se pregunta no se sincroniza, y con una sincronización en curso no se ofrece. Una venta que ya se sincronizó no se descarta en la Puerta: es una orden, con su «Ver la orden». Queda en el registro como `order.door_sale` (con `offline: true`) y, si pasó límites, `tickets.override`.

10. **Cargar entradas a mano** (`/admin/eventos/<slug>/ordenes/cargar`; link en el menú "Opciones" del modo puerta): invitaciones, cortesías o pagos que llegaron por otro lado. Tipo, cantidad, nombre y email (opcional) de quien recibe, nombre de cada entrada, **cómo se pagó** (cortesía / invitación, efectivo, transferencia u otro), **monto por entrada** (0 = sin cargo; la cortesía siempre es 0; se lee con `parseAmount`, igual que en la compra online y en la puerta) y una nota opcional (solo en el panel, `orders.admin_note`). Crea una orden **ya aprobada** con `channel = 'manual'` (`createManualOrder` en `src/lib/server/tickets/manual.js`, con la misma sentencia que la venta en la puerta: `insertApprovedOrder` de `door.js`), no marca el ingreso y, si hay email y se tilda, manda las entradas por mail. Total 0 queda como `gratis`. Queda en el registro (`order.manual`). Límites (se pueden pasar confirmando): cupo, 20 por compra y venta cerrada (por horario, del tipo, agotadas o cancelado); "todavía no abrió" no es un límite. Migración 0010: canal `manual`, medio `otro`, precio 0 en las manuales y `admin_note`.

### Puerta: cómo hacerla

La guía corta para quien está en la puerta. En el modo puerta está en el botón **?** de arriba
(y en «Opciones» → «Cómo hacer la puerta»): es `src/lib/components/admin/door/DoorGuide.svelte`,
con el mismo texto que acá. Si cambia una, cambiá la otra.

**Antes de abrir**

- Abrí la pantalla **con conexión** y esperá el cartel verde «Listo para sin conexión»: la lista
  de entradas queda guardada en el celu por si se corta.
- Celu con batería (o cargador a mano) y el brillo alto. La pantalla no se apaga sola.
- Plan B en papel: si el celu se queda sin batería, anotá nombre y código de cada persona y
  cargalo después.

**Escanear**

- Apuntá la cámara al QR de la entrada (en el celu de la persona o impreso).
- **Verde «Adelante»**: pasa. Si te equivocaste de persona, «Deshacer».
- **Amarillo «Ya ingresó»**: esa entrada ya se usó (dice a qué hora y quién la marcó). No lo
  discutas en la fila: pedile el mail de la compra y avisale a une organizadore.
- **«Anulada», «De otro evento» o «QR inválido»**: no pasa con esa entrada. Probá con «Buscar
  persona» por si tiene otra a su nombre.
- En iPhone la cámara de la pantalla no lee QRs: «Escribir código» o «Buscar persona» (les
  admins también pueden abrir el QR con la app Cámara: la entrada muestra «Marcar ingreso»).

**Escribir código y buscar**

- **Escribir código**: las 6 letras y números de abajo del QR, o el link de la entrada.
- **Buscar persona**: por el nombre de la entrada, el de quien compró, el mail, el DNI o el
  código. Antes de marcar, confirmá que es esa persona (con el mail de la compra o los últimos
  números del DNI).
- No leas en voz alta el nombre del documento, el DNI ni el mail.

**Vender en la puerta** (si el evento vende en la puerta)

- «Vender en puerta»: tipo, cantidad y cómo pagó (efectivo o una transferencia que ya viste
  llegar). Las entradas quedan adentro al toque.
- Si cobraste otro precio, cambialo antes de registrar y anotá el motivo en «Agregar nota».
- Si pide confirmar (cupo lleno, más de 10 entradas o un evento solo anticipadas), frená y
  consultalo con une organizadore.

**Sin conexión**

- Si se corta, seguí igual: escanear, escribir el código, buscar en la lista guardada y vender
  siguen andando. Arriba dice cuánto queda por sincronizar.
- Cuando vuelve la conexión se manda solo; si no, «Sincronizar». **No cierres la pestaña ni
  borres los datos del navegador** con cosas pendientes.
- Si otro celu ya había marcado esa entrada, al sincronizar sale un aviso: cuenta el primer
  ingreso.

**Si hay un problema**

- La persona no aparece o la entrada no le funciona: no la dejes pasar ni la rechaces sola. Que
  espere a un costado y llamá a une organizadore.
- Dudas de edad: se puede pedir documento solo para ver la fecha de nacimiento. El nombre de la
  entrada no tiene que coincidir con el del documento.
- Si alguien está mal, se siente insegure o hay una situación de violencia, avisale enseguida a
  la persona de cuidado del evento.
- No prestes tu sesión de admin ni el celu con el panel abierto: si hace falta alguien más en la
  puerta, que lo resuelva une organizadore.

### Pasar límites desde el panel

Decisión de gorrite: la producción de un evento es caótica y el sistema tiene que ser versátil. Une admin puede pasar **cualquier límite de venta** en tres lugares, siempre con aviso y confirmación explícita, y queda en el registro de actividad:

| Dónde                                                             | Qué se puede pasar                                                                                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Vender en puerta** (modo puerta)                                | cupo del tipo, 10 por venta, evento cancelado, evento solo anticipadas (`puerta: false`)                                                |
| **Confirmar una transferencia** que llegó tarde (reserva vencida) | cupo del tipo (los lugares ya se ocuparon)                                                                                              |
| **Cargar entradas a mano**                                        | cupo del tipo, 20 por compra, venta cerrada (horario, cierre del tipo, agotadas, cancelado), tipo encadenado que todavía no se habilitó |
| **Confirmar una transferencia** de un tramo de preventa           | cantidad del tramo (si se llenó mientras la reserva estaba vencida; el precio ya quedó fijo)                                            |
| **Confirmar una transferencia** de un evento cancelado            | evento cancelado («El evento está cancelado.»; nada se cancela ni reembolsa solo, decisión 0044)                                        |

Los topes por email y por conexión de la compra pública (`HOLD_LIMITS`, límites por cliente) no existen en estas acciones del panel: no hay nada que pasar.

Cómo funciona (`src/lib/server/tickets/overrides.js`):

1. El servidor calcula qué límites se pasarían (`doorSaleLimits`, `transferLimits`, `manualOrderLimits`).
2. Si se pasa alguno y el pedido no trae la confirmación, la acción contesta **409 con `needsConfirmation`**: la lista de límites con un mensaje ("El cupo de «General» ya está completo (50 / 50): quedarían 52 / 50, 2 entradas de más.") y una **clave** que describe exactamente esos límites.
3. La página muestra un **aviso en la página** (`OverrideDialog`, nunca `window.confirm`) con la lista de límites; alcanza con el botón que confirma (sin casilla extra; el foco arranca en "Cancelar"). Si le admin confirma, reenvía el formulario con `override=<clave>`. Si algo cambió entre el diálogo y la confirmación (otra venta), la clave ya no coincide y vuelve a preguntar.
4. Con la clave correcta, la función pasa `override: true` y la sentencia no controla el cupo. Se anota la acción de siempre (con `overrides` en el detalle) y una fila aparte `tickets.override`: "Pasó límites de entradas (venta en la puerta): cupo de «General» +2 (52 / 50)".

La **compra pública no cambia**: `override` solo lo leen acciones del panel después de `requireAdmin`; `reserveOrder` no tiene override, y mandar `override` en `?/buy` no hace nada (hay tests). Con más vendidas que cupo, el panel muestra "52 / 50" con una marca (`CapacityBar`) y "quedan" nunca es negativo.

### Preventas escalonadas y tipos encadenados

Decisión de gorrite (B6): las dos cosas. Lógica pura en `src/lib/utils/ticketTiers.js` (servidor y navegador), lectura del frontmatter en `config.js` (`parseTiers`, `withTier`, `typeAvailability`), reserva en `orders.js`.

**Tramos dentro de un tipo** (`tiers`, en lugar de `price`): una lista ordenada de 1 a 10 tramos `{ id, name, price, quantity?, until? }`.

- **El tramo vigente es el primero que todavía no llegó a su cantidad ni a su fecha.** Por cantidad ("los primeros 5 a $ 8.000"), por fecha ("hasta el 9/10 a $ 8.000") o las dos (lo que llegue primero). Un tramo sin cantidad ni fecha es "el resto" y tiene que ir último (si no, el editor y `parseTicketConfig` lo rechazan: los que siguen nunca se venderían). Si no queda ningún tramo vigente, el tipo está agotado.
- Cuentan las entradas **aprobadas y las reservas vigentes de ese tramo**, igual que el cupo. Si una reserva vence, su lugar vuelve a su tramo (puede volver a verse "Preventa 1" un rato).
- El `capacity` del tipo sigue siendo el cupo total (opcional). Lo que se puede comprar es el menor entre lo que queda del cupo y lo que queda del tramo.
- **Tramos que suman menos que el cupo** (todos con cantidad, ninguno «el resto»): online se venden como mucho la suma de los tramos; cuando se terminan, el tipo figura «Agotado» aunque quede cupo, y el resto solo se vende en la puerta o se carga a mano (las dos cuentan para el cupo y no gastan tramos). Puede ser a propósito, para guardar lugares para la puerta: el editor no lo bloquea, solo avisa cuántas se venden online y qué pasa con las otras (`tiersOnlineMax` en `ticketsEditor.js`; auditoría de plata, D25).
- `id` de cada tramo: como el de los tipos, sale del nombre al crearlo en el editor y **no cambia nunca** (las órdenes lo guardan en `orders.ticket_tier`, migración `0016_preventas.sql`). Con ventas, el editor no deja borrar un tramo vendido ni bajarle la cantidad por debajo de lo vendido o reservado; cambiar precios solo afecta compras nuevas.
- **Precio "pleno"**: en un tipo con tramos, `price` es el del **último** tramo. Lo usan las pantallas del panel. La venta en la puerta y la carga a mano **no gastan lugares de las preventas** (`ticket_tier` NULL), aunque sí cuentan para el cupo. _Confirmado por gorrite._
- **Precio en la puerta y en la carga a mano, por tipo** (decisión de gorrite: un evento puede tener varios precios en la puerta): cada tipo puede tener `door_price` (opcional, entero desde 0, mismo tope que `price`; a la gorra no). **Un precio en puerta de $ 0 no es una venta sin cargo**: si el precio de la configuración es 0 (y no es a la gorra) y quien vende no escribió un precio, `sellAtDoor` contesta `free-door` antes de tocar la base y la pantalla (con o sin conexión, y la cola al sincronizar) dice «Esta entrada es sin cargo en la puerta: cargala a mano.». Una entrada sin cargo en la puerta es una decisión de quien vende en esa venta: escribe $ 0 en el precio por entrada (ver «Otro precio y nota» arriba) y queda `gratis` con canal `manual`. El editor no deja guardar un «Precio en puerta» de $ 0; `parseDoorPrice` sigue leyendo un `door_price: 0` ya guardado (no apaga la venta en la puerta de un evento ya configurado). Se cobra `door_price` si está; si no, el del último tramo; en un tipo sin tramos, su precio fijo. Los eventos sin `door_price` siguen igual. Una sola función pura, `doorPrice(type)` en `ticketTiers.js`, que usan la venta en la puerta (`sellAtDoor` y la pantalla del modo puerta, que muestra el precio de cada tipo), el monto sugerido de la carga a mano y el editor («Precio en puerta» en cada tipo, con lo que se va a cobrar). El Fondo se calcula sobre el precio que se cobra (`parseDoorPrice` en `config.js`). El `puerta_precio` del evento es **solo una nota** para la página: no cambia lo que se cobra.
- **El Fondo** se calcula sobre el precio de cada tramo (`round(precio × % / 100)`), y los códigos de descuento y el recargo de MP van sobre ese subtotal, como siempre. A la gorra no puede tener tramos.

**Precio en el servidor, sin carreras:**

1. `?/buy` toma un solo "ahora" y lee lo tomado por tipo y por tramo (`getTaken`); elige el tramo vigente (`typeAvailability`) y arma el tipo "efectivo" (`withTier`: precio y fondo del tramo).
2. El formulario manda el id del tramo que vio la persona (`tier`, campo oculto) **solo para avisar**: si no coincide con el vigente, no se reserva y se contesta "El precio cambió: «General» ahora está en «Preventa 2» ($ 9.000). Revisá y confirmá de nuevo." Nunca se cobra otro precio sin que la persona lo vea. Toda respuesta con error de `?/buy` para un tipo con tramos lleva el tramo vigente (`tier`: id, nombre, precio y fondo) y la página de compra muestra ese tramo y ese precio y lo manda en el campo oculto (`withCurrentTier` en `src/lib/utils/tickets.js`; SvelteKit no vuelve a cargar la página después de un error), así confirmar de nuevo pasa sin recargar. Un `tier` inventado o el de un tramo más barato no sirve de nada (el precio lo elige el servidor).
3. **Una compra entra entera en un tramo** (un solo precio por orden, que es lo que guardan `unit_price` y sus `CHECK`): si pide más de lo que queda a ese precio, contesta "En «Preventa 1» quedan 2 entradas a este precio: comprá esas ahora y, si querés más, hacé otra compra." La página ya limita la cantidad a lo que queda en el tramo. _Confirmado por gorrite_ (la alternativa, partir una compra en dos precios, cambia el esquema de órdenes).
4. `reserveOrder` controla **en la misma sentencia** `INSERT … SELECT … WHERE` el cupo del tipo y la cantidad del tramo (aprobadas + reservas vigentes con ese `ticket_tier`), así que dos compras simultáneas no pueden pasarse de un tramo. La fecha del tramo se mira con el mismo "ahora". Si el tramo se llenó en el medio devuelve `reason: 'tier'` y `?/buy` vuelve a elegir y avisa del precio nuevo.
5. Un pago de Mercado Pago que llega tarde se acepta como siempre (con el precio de su orden); solo se marca para revisar si pasa el cupo del tipo, no por el tramo ni por los usos máximos del código: esos se pasan en silencio ([0016](decisiones/0016-pago-tardio.md)). Una **transferencia vencida** cuyo tramo se llenó mientras tanto pide pasar ese límite al confirmarla (ver arriba).

**Lo que ve quien compra** (sin complicarse): el nombre del tipo, una etiqueta con el tramo vigente ("Preventa 2"), su precio y, si quedan menos de 10 en el tramo, "¡Últimas 3! a este precio"; si el tramo es por fecha y hay muchas, "Preventa 1 hasta el viernes 9/10 a las 23:59". No se muestran los tramos que vienen.

**Tipos encadenados** (`after: <id de otro tipo>`): el tipo se puede comprar recién cuando el otro está **agotado** (sin cupo o sin tramos vigentes) o **cerrado** (por horario). Mientras tanto la página lo muestra deshabilitado con "Se habilita cuando se agote «General»" y `?/buy` lo rechaza. No puede apuntarse a sí mismo ni formar círculos (lo rechazan el editor y `parseTicketConfig`); el editor avisa si el tipo del que depende no tiene cupo, ni último tramo con cantidad, ni cierre propio (puede no habilitarse nunca). La habilitación se decide al comprar con lo vendido y reservado de ese momento: si entre la lectura y la reserva vence una reserva del tipo anterior, lo peor que pasa es que alguien compre el encadenado al precio que vio (no hay sobreventa: el cupo de cada tipo sigue en la sentencia). La carga a mano de un encadenado que no se habilitó pide pasar ese límite (`not_active`).

Estados de una orden: `pending` / `awaiting_transfer` → `approved` / `rejected` / `cancelled` / `expired`, y `approved` → `refunded`. Un pago aprobado gana siempre (aunque la reserva haya vencido: la plata entró; queda un aviso en el log por posible sobreventa), un rechazo o "pendiente" tardío nunca pisa una aprobación, y una orden aprobada solo pasa a `refunded` por el mismo pago que la aprobó. Un reembolso anula las entradas en el control de ingreso.

### Precio: fondo, código y recargo

Todos los precios que se ven normalmente (tarjetas de tipo, lista cuando la venta está cerrada) son **con el fondo ya aplicado**; en las tarjetas el precio completo aparece chiquito y tachado. Después del tipo, el formulario pregunta **"¿Cómo querés pagar tu entrada?"** (`FONDO_OPTIONS` en `src/lib/utils/tickets.js`), con el precio por entrada de cada opción:

| Opción (`fondo_option`)                     | Precio por entrada       | Se guarda                      |
| ------------------------------------------- | ------------------------ | ------------------------------ |
| **Con el descuento del fondo** (`fondo`)    | precio − fondo           | `fondo_amount` = fondo × cant. |
| **Precio completo** (`completo`)            | precio                   | —                              |
| **Entrada solidaria** (`solidaria`)         | precio + 10 % del precio | `fondo_contribution`           |
| **Entrada muy solidaria** (`muy-solidaria`) | precio + 30 % del precio | `fondo_contribution`           |
| **Entrada Sugar** (`sugar`)                 | precio + 50 % del precio | `fondo_contribution`           |

- Por defecto está marcada la primera. Si el fondo es 0 (porcentaje 0 %), la primera **no aparece** y la marcada es **Precio completo** (el servidor también: una opción `fondo` sin fondo se guarda como `completo`).
- Los porcentajes son sobre el **precio completo**, redondeados al peso **por entrada** (0,5 hacia arriba) y multiplicados por la cantidad. El formulario aclara que lo que se paga de más va entero al Fondo KinkyVibe. "Sugar" coincide con el nombre de un nivel de Mecenas del fondo.

El servidor calcula todo (`computePrice`; el formulario usa la misma función solo para mostrar). Orden:

1. **Opción del fondo** por entrada × cantidad: `subtotal = precio × cant. − fondo usado + aporte`.
2. **Código de descuento** sobre ese subtotal: porcentaje (redondeado al peso) o monto fijo en pesos **por compra**; nunca deja el total por debajo de 0.
3. **Recargo de Mercado Pago** (solo si se paga con MP y queda algo por pagar): `bruto = ⌈base / (1 − tasa)⌉` en pesos enteros, para que después de la comisión quede la base. La tasa sale, en orden, de `mp_fee_percent` del evento, de **Ajustes → Cobros** (`/admin/ajustes/cobros`), de `TICKETS_MP_FEE_PERCENT` o, si no hay ninguna, **2 %** (valor por defecto que eligió la organización). **La comisión real varía** (depende del plan y del plazo de acreditación de la cuenta de MP): les organizadores la ajustan en Ajustes de venta; con `0`, sin recargo. Transferencia paga la base, sin recargo.
4. `total = subtotal − descuento + recargo`.

Ejemplo: $ 10.000 con 20 % de fondo, 2 entradas solidarias, código 20 %, Mercado Pago 2 %: 2 × $ 11.000 = $ 22.000 (aporte $ 2.000) → −$ 4.400 = $ 17.600 → recargo $ 360 → **$ 17.960**.

El formulario muestra "Entradas (n × $X) · 💜 Ya descontado: el Fondo cubre $F / 💜 Incluye $A de aporte al Fondo KinkyVibe · Código −$D · Recargo Mercado Pago $Y · Total $Z" y cambia en vivo.

La orden guarda `unit_price` (precio completo), `fondo_option`, `fondo_amount` (fondo usado, ≥ 0, solo con `fondo`), `fondo_contribution` (aporte, ≥ 0, solo con las solidarias), `subtotal`, `discount_code`, `discount_amount`, `surcharge_amount` y `total` (con `CHECK` en la base que obligan a que cierren las cuentas: `migrations/0002_tickets.sql`). `/admin/ventas` muestra por evento **Fondo usado**, **Aportes al fondo** y **Neto del fondo** = aportes − fondo usado (solo órdenes aprobadas; con signo: verde "+" si entró más de lo que cubrió el fondo, rojo "−" si el fondo puso más); la página de cada evento, las tres columnas por tipo y en el total; el CSV, `opcion_fondo`, `fondo` y `aporte_fondo`. Si una compra solidaria usa además un código, el aporte guardado es el nominal (el código lo pone la organización: lo tomamos como un costo de la organización, no del fondo; decisión [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)). Con fondo, aporte, código o recargo, la preferencia de MP lleva un solo ítem por el total (MP no acepta ítems negativos) y el webhook compara lo pagado con `total`.

### Meta de venta

El panel mostraba el avance de cada evento contra **vender todas las entradas** (el cupo), algo
que casi nunca pasa. Ahora cada evento puede tener **una** meta (decisión de gorrite):

- **`meta_venta: plata:250000`**: pesos **netos**, después de la comisión de Mercado Pago. Neto =
  lo recaudado de las órdenes aprobadas (el «Recaudado» del panel: su `total` menos los reembolsos
  parciales hechos en MP, ver [Reembolsos](#reembolsos)) **menos la comisión de MP de las que se
  pagaron con Mercado Pago**. Esa comisión es, por orden (gorrite, Mesa `plata-numeros-panel`):
  - la que **cobró MP**, si el pago la informó: el aviso de MP guarda en `mp_fee_amount` (migración 0069) la suma de `fee_details[].amount` con `fee_payer = 'collector'` del pago (`GET
/v1/payments/{id}`; los campos, verificados con la búsqueda de documentación de MP el
    2026-10-26). La financiación de las cuotas la paga quien compra y no cuenta;
  - si no, la **estimada**: el recargo guardado en la orden (`surcharge_amount`), que se calcula al
    comprar con la tasa vigente (`mp_fee_percent` del evento, Ajustes → Cobros,
    `TICKETS_MP_FEE_PERCENT` o 2 %) justo para que, después de la comisión, quede la base (ver
    [Precio](#precio-fondo-código-y-recargo)).

  Con algo estimado, el panel lo dice: «netos **estimados**» en la meta (y el detalle al pasar el
  mouse: cuánto de la comisión es estimado), «Neto estimado» si toda la comisión es estimada y, si
  es una mezcla, «Neto (comisión estimada en parte: $ X de $ Y)» en «Entradas este mes» del Inicio
  y en «Recaudado» de la ficha; Estadísticas › Ventas muestra por mes la comisión cobrada por MP y
  la estimada por separado. Las órdenes por transferencia, en la puerta, cargadas a mano o sin
  cargo no tienen comisión. Una sola definición: `REVENUE_SQL` / `orderRevenue`, `MP_FEE_SQL` /
  `orderMpFee`, `MP_FEE_ESTIMATED_SQL` / `orderMpFeeEstimated`, `netRevenue` y `netEstimate` en
  `src/lib/utils/salesGoal.js`.

- **`meta_venta: entradas:30`**: entradas vendidas (órdenes aprobadas, sin las reservadas). La
  comisión no cuenta.
- Sin `meta_venta`: como siempre, contra el cupo.
- También se acepta, escrita a mano, la forma de mapa (`meta_venta: { entradas: 30 }`, una sola
  clave). Una meta que no se entiende es «sin meta»: nunca frena la venta ni el panel. El número es
  un entero mayor a 0 (topes: $ 1.000.000.000 y 100.000 entradas).
- Con `contenido_db` es la misma clave dentro de `extra` del objeto `evento` (como `tickets`).
  No hay migración.

**Dónde se edita.** En el editor del evento (crear, duplicar y editar), sección **Entradas** ›
**Meta de venta**: «Sin meta», «Plata (pesos)» o «Entradas» y el número. Solo con la venta
prendida; se escribe solo si cambió (`applyTicketsForm`, `SalesGoalField.svelte`). **Duplicar** un
evento (el formulario, la carga rápida de la agenda o la importación de la planilla) copia la meta
del original como cualquier otro campo; en el formulario se puede cambiar antes de guardar.

**Dónde se ve.** Con meta, el avance contra la meta («$ 180.000 netos de $ 250.000 (72 %)» o «23
de 30 entradas»; verde y «meta cumplida» al llegar, sin la marca roja del cupo: pasarse es bueno).
Sin meta, el cupo, como antes:

- Panel → Eventos (la columna de ventas de cada evento; el CSV suma la columna «meta»);
- Inicio: la lista de próximos (y su CSV), «Hoy» y la tarjeta de ventas del próximo evento;
- la ficha del evento › Ventas: la tarjeta «Meta de plata» / «Meta de entradas» y el termómetro
  (el texto arriba y, si la meta es en entradas, una línea «meta N»; el gráfico es de entradas);
- Ventas → Todas las ventas: debajo del título de cada evento.

El cupo no cambia en ningún lado: sigue siendo el límite de la venta y se sigue mostrando como
número («vendidas / cupo») donde ya estaba. «Recaudado» sigue siendo antes de la comisión (sin los
reembolsos parciales hechos en MP).

Código: `src/lib/utils/salesGoal.js` (leer, formulario, lo neto, `goalProgress`; con pruebas en
`salesGoal.test.js`), `goal` en `EventTickets` (`parseTicketConfig`), `mpFee` en `getCounts`
(`tickets/orders.js`), `getAllCounts` y `progress`/`net` en `summarizeEvent` (`admin/sales.js`),
`ticketTotals` y `upcomingEvents` (`admin/inicio.js`), `goal`/`revenue`/`mpFee` en las filas de
Panel → Eventos (`panelList.js`), y los componentes `GoalProgress.svelte` y `SalesGoalField.svelte`.

### Lista de espera (en construcción)

Cuando un evento (o un tipo de entrada) se agota, la gente se anota en una lista; si se libera un
lugar, se le avisa por mail a la próxima persona y se le guarda un rato. Detrás del interruptor
`lista_espera` (apagado, [interruptores.md](interruptores.md)) y de la clave `lista_espera` de cada
evento. Se construye en partes, en ramas que se juntan en `claude/lista-espera` y entran a `main`
como un solo PR (decisión [0001](decisiones/0001-ritmo-y-orden.md)). Lo que eligió gorrite está en
la decisión [0040](decisiones/0040-lista-de-espera.md).

**Ya está (parte 1, datos y reglas).** Nada de esto se ve todavía ni toca la venta.

- Migración `0053_lista_de_espera.sql`: `waitlist_entries` (una fila por anotación) y
  `waitlist_sends` (mails por ronda). Ver [datos.md](datos.md).
- Por evento, `lista_espera` en el frontmatter (o en `extra`): `evento` o `tipo` (atajo), o
  `{ alcance: evento | tipo, todes_a_la_vez: true }`. Queda en `config.waitlist`
  (`parseTicketConfig`); lo que no se entiende cuenta como sin lista y nunca frena la venta (como
  `meta_venta`). Los tiempos de reserva no se eligen por evento (gorrite, 12/10): unos `reservas`
  de antes se ignoran.
- Tiempos fijos en el código (`WAITLIST_SETTINGS`; gorrite, 12/10: sin página de Ajustes, cambiarlos
  es un PR; una clave `waitlist` vieja en `ticket_settings` no se lee). De a una persona por vez;
  la reserva dura 24 h si faltan 7 días o más para el comienzo, 12 h si faltan 48 h o más, 2 h si
  faltan 6 h o más; con menos de 6 h se le avisa a toda la lista a la vez (sin lugar guardado). La
  lista cierra en `min(comienzo − 30 min, cierre de la venta)` y ninguna reserva pasa de ahí. Reglas
  puras en `src/lib/utils/waitlistHold.js` (`holdUntil`).
- Cambios de estado en `src/lib/server/tickets/waitlist.js`: anotarse (con cuenta y el mail
  verificado, entra directo a la fila), confirmar por mail, volver a anotarse después de vencer
  (al final y sin confirmar otra vez), salir, que le saque une admin, terminar, comprar con la
  oferta y borrar las anotaciones sin confirmar a las 48 h.
- **Por evento, la fila cuenta contra el lugar libre total del evento** (la suma de lo que queda en
  sus tipos con cupo), no contra cada tipo: una persona esperando guarda un solo lugar. Por tipo,
  contra el lugar libre de ese tipo.

**Ya está (parte 2, anotarse, confirmar, salir y los mails).** Con el interruptor apagado no se ve
nada (las páginas de confirmar y volver y `?/waitlist` dan 404).

- **Anotarse:** `?/waitlist` en la página de compra
  (`(content)/calendario/[event]/entradas/+page.server.js`, lógica en
  `src/lib/server/tickets/waitlistSignup.js`). Solo el mail (y, por tipo, cuál). Con una cuenta con
  sesión y ese mismo mail verificado, entra directo a la fila; si no, le mandamos el mail de
  confirmar (48 h). La respuesta es la misma esté o no el mail anotado (si ya está en la fila, no se
  le manda nada). Límites (`WAITLIST_SIGNUP_LIMITS`): 10 pedidos por hora por conexión, 3 mails de
  confirmar por día a una misma dirección, el tope por día de mails a una dirección sin confirmar
  entre formularios (`unconfirmedMailAllowed`, ver [mails.md](mails.md#no-fui-yo)), el tope global
  de mails de Resend (`accountMailAllowed`) y 5 anotaciones vivas por evento desde una misma
  conexión. La anotación guarda el `client_hash` (como `orders`, sin IP). El mail de confirmar lleva
  el link «No fui yo» y no sale a una dirección que lo usó (la anotación queda igual).
- **Cuándo se puede** (`waitlistJoinStates`): solo en un alcance agotado; con la venta sin abrir,
  la lista cerrada (`holdUntil` da `closed`: comienzo − 30 min o cierre de la venta, el del tipo en
  una lista por tipo) o el evento cancelado, no. `agotadas` a mano cuenta como agotado. La fila
  cuenta como vendido: por evento, quienes esperan (y los lugares guardados vigentes) se restan del
  lugar libre total del evento; un tipo sin cupo abierto hace que el evento nunca se agote. La
  página muestra un formulario mínimo («Lista de espera», `WaitlistSignup.svelte`) debajo de la
  compra cuando hay dónde anotarse.
- **Links de los mails** (GET muestra el botón, POST hace el cambio, con `MailLinkCard`; en un
  navegador, confirmar se manda solo una vez al abrir; `Referrer-Policy: same-origin`, ver
  [mails.md](mails.md)):
  `/lista-de-espera/confirmar/<token>` (entra a la fila; vencido o usado, no),
  `/lista-de-espera/salir/<id>.<firma>` (sale: `cancelled` por `left`, o se borra si no había
  confirmado; anda siempre, también con el interruptor apagado) y
  `/lista-de-espera/volver/<id>.<firma>` («Volver a anotarme» del mail de vencida o de terminada
  por admin: al final de la fila sin confirmar, solo si la lista sigue abierta). Salir y volver van firmados con
  `waitlist_leave_key`, cada uno con su mensaje (`waitlistMail.js`). No se cuentan en las
  estadísticas (`classify.js`).
- **Los seis mails** con sus plantillas editables (`waitlist_confirm`, `waitlist_offer`,
  `waitlist_reminder`, `waitlist_expired`, `waitlist_ended`, `waitlist_closed`), en
  `waitlistEmail.js`; todos con el
  link para salir. La oferta lleva el link `/calendario/<slug>/entradas?lista=<token>` (el token lo
  arma el motor). Ver [mails.md](mails.md#mails-de-la-lista-de-espera).
- **`waitlist_sends`:** `sendState.js` ahora sirve también para filas por anotación (clave
  `entry_id` + `kind` + `round`), y `sendWaitlistEntryMail` manda cada mail del cron una sola vez
  por anotación, mail y ronda.

**Ya está (parte 3, la fila en la compra y la compra con el link de la oferta).** Con el interruptor
apagado (o el evento sin lista) la sentencia de la compra es la de siempre y `lista` no hace nada.

- **La fila guarda lugares en la compra online** (`src/lib/server/tickets/waitlistPurchase.js`):
  cada persona que espera y cada una con un lugar guardado vigente guarda un lugar; el público
  compra lo que sobra. Por evento, contra el lugar libre total (los tipos a la venta; con uno sin
  límite, el evento no se agota y la fila no guarda nada); por tipo, contra el de ese tipo. Es la
  misma cuenta que `waitlistJoinStates`: «se puede comprar» y «se puede anotar» nunca dicen las dos
  cosas a la vez.
- **En la misma sentencia que crea la orden** (`reserveOrder` con `waitlist`, armado por
  `waitlistGuard`): por cada tipo del alcance va hasta cuánto puede llegar lo tomado y la sentencia
  vuelve a contar lo tomado y la fila en el momento, así dos compras a la vez no se pasan. Si no
  entra por la fila, `reason: 'waitlist'` («Por ahora los lugares que se liberan son para la lista
  de espera. Anotate y te avisamos.», o «Solo quedan N entradas a la venta…» si sobra algo).
- **Una reserva vencida deja de guardar en el acto** (`hold_until <= now`), sin esperar al cron,
  como `expires_at` en las órdenes. El aviso a toda la lista (`hold_until` NULL) no guarda nada:
  compite con el público.
- **Comprar con el link de la oferta** (`/calendario/<slug>/entradas?lista=<token>`): la página
  muestra arriba hasta cuándo le guardamos el lugar (`WaitlistOffer.svelte`) y lo que puede comprar
  esa persona: todo lo libre menos los lugares guardados vigentes de otras personas. El token va en
  un campo oculto `lista`; `buyAction` lo vuelve a mirar (`findOffer`), y `reserveOrder` controla
  que la oferta siga vigente y en la misma tanda pasa la anotación a `purchased` con la orden (un
  link no se usa dos veces). El mail de quien compra puede ser otro (puede comprar para alguien
  más). Un link vencido, usado o inventado: «El link de la lista de espera ya no vale…» (la página
  lo dice arriba y la compra sigue como la del resto). En una lista por tipo, el link es para su
  tipo. Si justo se vendió el lugar en la puerta, se lo dice y la oferta sigue hasta que venza.
- **La puerta, la carga a mano y la confirmación de transferencias no miran la lista** (venden
  aunque haya gente esperando, como decidió gorrite; solo avisan, ver la parte 5).
- La página del evento (botón «Comprar entradas») también resta la fila (las tarjetas de las
  listas de eventos, desde la parte 5).

**Ya está (parte 4, el motor).** Con el interruptor apagado no corre nada (ni la pasada del cron,
ni los mails, ni los empujones).

- **`advanceWaitlist`** (`src/lib/server/tickets/waitlistEngine.js`), una pasada sobre un evento,
  idempotente: (1) vence las reservas pasadas (`expired`, `hold_expired`); (2) devuelve a
  `offered` a quien compró con su oferta y no pagó (la orden se canceló o venció), con el mismo
  link y el mismo vencimiento, sin tiempo extra; una orden rechazada de Mercado Pago sigue
  guardando su lugar hasta que vence (se puede reintentar el pago), así que vuelve recién ahí; (3) mira lo libre de cada alcance y
  no ofrece nada si la venta no está abierta (`agotadas` a mano, todavía no abrió); (4) si hay
  lugar y nadie tiene uno guardado vigente, se lo ofrece a la primera de la fila (`ORDER BY
confirmed_at, id`) con una sola sentencia que vuelve a mirar todo: dos corridas a la vez nunca
  ofrecen dos veces; en el aviso a todes (faltan menos de 6 h, o «todes a la vez»), a toda la fila,
  sin lugar guardado; (5) pasado el cierre de la lista (comienzo − 30 min o el cierre de la venta)
  o con el evento cancelado, cierra lo vivo (`closed` / `event_cancelled`), también a quien
  confirmó después del cierre; (6) borra las anotaciones sin confirmar de más de 48 h. Si el evento
  ya no vende entradas o no tiene lista, solo hace 1, 2 y 6 (nunca cierra por una configuración que
  no se pudo leer). Anotaciones de un alcance que ya no existe (tipo borrado o alcance cambiado a
  mano): `expired` / `type_removed`, sin mail.
- **El link de la oferta** lleva un token de 256 bits que no se guarda: la firma HMAC de
  `offer:<id>:<ronda>` con la clave `waitlist_offer_key` (`offerToken`, se crea sola en
  `ticket_settings`); en la base queda solo su SHA-256. El mail de la oferta, sus reintentos y el
  último aviso llevan el mismo link.
- **Cron:** `runWaitlistCron` en `POST /api/cron/recordatorios` (el de cada 15 minutos; no hay
  cron nuevo), antes de la tanda de mails y en su propio try/catch: pasa por cada evento con
  anotaciones vivas (o con una compra de oferta abandonada). La respuesta trae `waitlistAdvance`
  (cuentas) y `waitlist` (la tanda de sus mails).
- **Mails** (`sendWaitlistMails`): no hay cola aparte, lo que falta sale del estado y de
  `waitlist_sends` (una vez por anotación, mail y ronda; un fallo se reintenta hasta 3 veces). En
  orden: la oferta (cada oferta vigente sin su mail), el último aviso (reservas de 12 h o más, con
  3 h por delante y la oferta ya mandada; nunca en el aviso a todes), «se venció» (con la oferta ya
  mandada) y «se cerró la lista»; los dos últimos solo si pasó hace menos de 48 h. En el cron van
  **primero** en la tanda (`runMailQueueWith`, `sendWaitlist`) y comparten el «de a cuántos».
- **Empujones** (`queueWaitlistAdvance`): en segundo plano (`waitUntil`), como mucho uno por
  minuto y evento (`hitRateLimit`, `waitlist:advance:<slug>`) y solo si el evento tiene a alguien
  esperando o con oferta; avanza la lista y manda los mails de ese evento. Lo garantiza el cron;
  el empujón solo adelanta. Desde: reembolso y cancelación de transferencia en la ficha del evento,
  cancelación desde la bandeja de transferencias, reembolso / contracargo / pago cancelado de
  Mercado Pago (`processPayment`), la preferencia de MP que falla (`cancelPendingOrder`), cada
  carga de la página de compra (las reservas de MP y de transferencia vencen sin aviso), «Guardar»
  en el editor del evento (más cupo, dejó de estar agotado, otra fecha, cancelado), y los links de
  los mails: salir con un lugar guardado, confirmar y volver a anotarse.

**Ya está (parte 5, el panel y la puerta).**

- **Editor del evento** (Entradas → «Lista de espera», `WaitlistField.svelte`; reglas en
  `src/lib/utils/ticketsEditor.js`): sin lista, por evento o por tipo de entrada; «Avisar a todes a
  la vez desde el principio» (los tiempos de reserva son los de Ajustes; ya no hay «Avanzado»).
  Escribe `lista_espera` solo si cambió (una que no se entiende queda como está; con la venta
  apagada no se toca, como la meta). **Con gente anotada** (sin confirmar, esperando o con oferta)
  no deja apagarla, cambiar el alcance, ni borrar o dejar sin cupo el tipo de una lista por tipo:
  «cerrá la lista primero». Lo controla con las anotaciones de la base (`waitlistLiveErrors`,
  también al guardar en el servidor), no con el archivo de antes. Avisa si el interruptor está
  apagado. Duplicar un evento copia la clave (y el importador la lee, `TICKET_META_KEYS`).
- **Ventas › Lista de espera, en la ficha** (`/admin/eventos/<slug>/lista-espera`; se ve con el
  interruptor prendido, o si el evento tiene lista o gente anotada; el contador son las anotaciones
  vivas, y el Resumen muestra «Lista de espera: N»): cuentas por alcance (esperando, con lugar
  guardado hasta HH:MM, avisades a la vez, compraron, terminaron, salieron, sin confirmar), la fila
  en orden y lo terminado (las últimas 200; el resto en el CSV). Acciones, cada una con
  confirmación y en el registro de actividad sin mails (`waitlist.*`, solo el id de la anotación y
  cuentas): «Terminar la reserva y pasar a la siguiente» (`expired` / `admin`, y la lista avanza
  ya; el diálogo pregunta «¿Le avisamos por mail?» con la casilla «Mandarle un mail» marcada, y
  con la casilla sale «se terminó tu lugar», ver abajo; Actividad dice «con mail» o «sin mail»), «Sacar de la lista» (si tenía oferta, avanza), «Ofrecer ahora» (`advanceWaitlist`
  directo, sin el límite del empujón; con el interruptor apagado, no), «Cerrar la lista» (quien
  espera o tiene oferta → `expired` / `closed` con su mail; sin confirmar se borra; y además la
  apaga: saca `lista_espera` del archivo del evento con `turnOffEventWaitlist`,
  `src/lib/server/tickets/waitlistOff.js`, antes de cerrar; si no puede, no cierra nada) y «Volver a probar» los mails que no salieron. CSV en
  `/admin/eventos/<slug>/lista-espera.csv` (con los mails: dato personal). Lecturas en
  `src/lib/server/tickets/waitlistAdmin.js`.
- **Puerta y carga a mano:** «Vender en puerta» y «Cargar entradas a mano» muestran una nota que no
  frena nada (`WaitlistDoorNote.svelte`): «Hay 4 personas en la lista de espera (1 con lugar
  guardado hasta las 21:30). Podés vender igual; si vendés ese lugar, esa persona puede quedarse
  sin entrada.» `sellAtDoor` y `createManualOrder` no cambian.
- **«Para revisar»:** una fila con los mails de la lista que no salieron después de 3 intentos
  (`waitlist_sends.status = 'failed'`), que lleva a la pestaña del evento (ahí «Volver a probar»).
- **Tarjetas de las listas de eventos** (`listStates.js`): restan la fila como la página del
  evento (una consulta más para todos los eventos con lista). La configuración de la venta de
  todos los eventos de la lista sale en una tanda (`getEventTicketsMany` en `events.js`: los
  eventos y cuáles tienen lugar, dos consultas para toda la lista; antes, dos por tarjeta).
- **En la compra, por tipo:** cada tipo agotado con lista dice «Agotadas · Anotate en la lista de
  espera», que baja al formulario con ese tipo elegido.
- **En la página del evento** (gorrite, 12/10): agotado y con dónde anotarse (la misma cuenta que
  el formulario de la compra, `waitlistJoinStates` con algún alcance `open`), el bloque de compra
  (`Compra.svelte`) muestra en vez de «Agotadas.» el botón grande «Agotadas · Anotate en la lista
  de espera», que lleva a `/calendario/<slug>/entradas#lista-espera`. La carga
  (`calendario/[event]/+page.server.js`) suma `waitlist: true` al resumen de la venta solo en ese
  caso; con el interruptor apagado, el evento sin lista o nada donde anotarse, la página queda
  igual que antes. Antes el formulario solo se encontraba entrando a la página de compra.

**Prueba de punta a punta** (`tests/tickets/lista-espera.spec.js`, con
`playwright.tickets.config.js`): cada prueba crea su evento (cupo 1, lista por evento); agotar,
anotarse y confirmar (GET no confirma), la misma respuesta para un mail ya anotado, reembolso, el
cron ofrece, el público no puede comprar el lugar guardado, «Terminar la reserva» pasa a la
siguiente (el link viejo ya no vale), compra con el link (después «ya usaste este link»), CSV, la
nota en la puerta y en la carga a mano, «Sacar de la lista» y «Cerrar la lista» (que además la apaga: el público ya no puede
anotarse).
Los mails en dev no muestran los links: la prueba los arma con la base local (el de confirmar,
cambiando el hash del token por el de uno propio; el de la oferta, con la misma firma que el
motor). El vencimiento por tiempo (y el paso a la siguiente por el cron) lo cubren las pruebas
unitarias del motor (`waitlistEngine.test.js`, con reloj fijo).

**Lo que falta antes del merge a `main`:** que gorrite aplique la 0053 en preview y producción
(0028).

**«Se terminó tu lugar»** (`waitlist_ended`, gorrite 12/10): al terminar una reserva desde el
panel, le admin elige si avisarle (casilla marcada de entrada; `src/lib/admin/waitlistConfirm.js`).
Sin migración: el pedido es la fila del envío en `waitlist_sends` (`expired`, la ronda de la oferta,
en `retry` y sin intentos; `queueEndedMail` en `waitlistEngine.js`), y la tanda manda «se terminó»
en vez de «se venció» cuando el motivo es `admin`. No sale con la lista de espera apagada (el
diálogo no muestra la casilla y lo dice), ni si nunca salió el mail de la oferta. «Volver a probar»
no borra esa fila (la vuelve a `retry`), y su «Volver a anotarme» anda igual que el de vencida.

### Horario de la venta

- `tickets_open` (opcional): antes de ese momento la venta no abrió; la página del evento y la de compra dicen "Abre el jueves 1/10 a las 12:00".
- `tickets_close` (opcional; si falta, el inicio del evento): desde ese instante no se puede comprar. Mientras tanto se muestra "La venta cierra el viernes 2/10 a las 20:00"; después, "Venta cerrada".
- `close` en un tipo (opcional): ese tipo deja de venderse antes (por ejemplo, la anticipada); nunca después del cierre del evento. Si todos los tipos cerraron, la venta está cerrada.
- Formato: con zona (`2026-10-02T20:00-03:00`, lo que escribe el editor) o sin zona (se toma la hora de Argentina, `America/Argentina/Buenos_Aires`, UTC−3 sin horario de verano). **Una fecha sola** (`2026-10-02`, como se usaba antes) en un cierre significa **hasta el fin de ese día** en Argentina; en la apertura, desde el principio del día. (Un YAML importado puede traer esa fecha como `2026-10-02T00:00:00.000Z`; `parseSaleTime` toma la medianoche UTC exacta con `Z` como fecha sola, así que para cerrar justo a las 21:00 del día anterior hay que escribir `2026-10-01T21:00-03:00`.) Un valor que no se entiende deja al evento sin venta (y se loguea).
- El servidor lo controla en cada compra (`salesState`, `typeOpen` y `validatePurchase` en `config.js`). Lo que ya estaba en curso al cerrar se completa: un pago de Mercado Pago que llega después, una transferencia reservada antes que se confirma o la confirmación de la reserva desde el mail.

### Pausa de emergencia de la venta

`TICKETS_PAUSED` (variable del Worker, en el panel de Cloudflare; vacía = apagada) frena la venta
online de todos los eventos de golpe: la página del evento y la de compra muestran su texto (p. ej.
«Volvemos en un rato») en lugar de los botones (`getTicketsView` devuelve `reason: 'paused'` y
`pausedMessage`; un evento cancelado sigue diciendo que se canceló), y `?/buy` contesta 503 con ese
texto **antes de tocar la base**: no se crea ninguna orden de Mercado Pago, transferencia ni
gratis, ni con el link de una oferta de la lista de espera. La lista de espera no avanza.

Sigue igual todo lo que no es una compra nueva desde el sitio: la puerta (con y sin conexión), la
carga a mano, los webhooks de Mercado Pago (una orden ya creada se aprueba cuando llega su pago y
manda sus entradas), la página de estado, confirmar o cancelar transferencias, los reembolsos y
salir de la lista de espera. Cómo prenderla y apagarla:
[interruptores.md](interruptores.md#pausas-de-emergencia). Lo prueban
`src/lib/server/tickets/pausa-venta.test.js` y `src/lib/server/emergencia.test.js` (que además
controla que la pausa solo se mire en la compra pública, la lista de espera y el cron).

### A la gorra

Un tipo de entrada con `a_la_gorra: { minimo, sugerido }` en lugar de `price`:

- `minimo` (entero, puede ser 0) es un mínimo duro; `sugerido` (entero, desde el mínimo) se muestra y es el valor por defecto (campo vacío = sugerido). Botones rápidos (`gorraQuickAmounts`): el mínimo (solo si es mayor a 0), el sugerido, 1,5 × el sugerido (redondeado a los $ 100) y el doble, sin repetidos.
- No hay "mínimo recomendado": con el mínimo (que se exige) y el sugerido alcanza. Un `minimo_recomendado` que haya quedado en algún frontmatter se ignora (no rompe nada, no se muestra) y el editor lo saca la próxima vez que se cambia ese tipo de entrada.
- **No hay monto máximo** (decisión de la organización: a la gorra cada quien paga lo que quiera). Solo hay un tope técnico contra errores de tipeo y números absurdos: el total de la orden (monto × cantidad) no puede pasar de `ORDER_MAX_TOTAL` = $ 100.000.000; si pasa, el formulario y el servidor dicen "Ese monto parece un error de tipeo…". La documentación de Mercado Pago consultada no indica un monto máximo por pago (puede depender de la cuenta y del medio de pago).
- La persona escribe el monto **por entrada** (se aceptan `5000`, `5.000`, `$ 5.000`). El servidor lo vuelve a validar (`validatePurchase`: entero, ≥ mínimo, total de la orden ≤ tope técnico) y es lo único del formulario que usa para el precio; `computePrice` recibe `option: 'gorra'` y ese monto como precio unitario.
- **No aplican** las opciones del Fondo (no se muestra "¿Cómo querés pagar tu entrada?") ni los **códigos de descuento** (no se muestra el campo, y el formulario explica por qué: pagás el monto que elijas; el servidor ignora un código que llegue igual). El **recargo de MP sí** se suma al pagar con Mercado Pago. Monto 0 (con mínimo 0) = camino sin pago ("Confirmar entradas sin cargo").
- La orden guarda `fondo_option = 'gorra'` y `unit_price` = el monto elegido (la base permite `unit_price = 0` solo en ese caso, y un `CHECK` impide código de descuento en órdenes a la gorra).

### Eventos online

La venta decide si un evento es online con **la misma regla que la página** (`isOnlineEvent(meta, { hasVenue })` = `eventMode(...) === 'online'`, en `src/lib/utils/eventPlace.js`; ver [amigues.md](amigues.md) «Online o presencial: una sola regla»): un lugar vinculado manda (presencial); si no, `modalidad: online | presencial`; si no, un «Dónde» que dice solo «Online», «Zoom»… es online y cualquier otro «Dónde» (también solo `location_name`) presencial; sin «Dónde», la etiqueta **Online** (o «virtual»). El lugar vinculado lo lee `getEventTickets`/`listTicketedEvents` (`eventsWithVenue` de `src/lib/server/amigues/venues.js`) y se lo pasa a `parseTicketConfig` (`options.hasVenue`); el editor de entradas lo sabe por el «Lugar» elegido. Antes la venta tenía su propia regla (la etiqueta Online sin `location`, sin mirar `location_name`, el lugar vinculado ni las palabras «Online»/«Zoom» del «Dónde»); gorrite decidió unificarla (octubre de 2026), cuando ningún evento con venta cambiaba de modalidad. Los mails, la página de compra y la de cada entrada dicen «Online» cuando la venta lo dice y, si no, «Nombre · Dirección» (`salePlaceText`). En esos eventos:

- Las entradas llevan **el link de la transmisión en lugar de un QR**, y no hay control de ingreso.
- El link **no va en el repo** (es público): une admin lo carga en la ficha del evento (`/admin/eventos/<slug>`, pestaña Resumen) → **Link de la transmisión** (se guarda en D1, `event_ticket_settings`; tiene que ser `https://`).
- Si el link ya está al aprobarse una compra, va en el mail de las entradas. Si se carga o cambia después, el botón **Enviar el link a todes (N personas)** lo manda por mail a cada compra aprobada que todavía no recibió **ese** link. Es idempotente por valor del link (`stream_link_sends`: orden + SHA-256 del link, reservado antes de mandar, así dos clicks o dos admins no duplican). Si el link cambia, se puede mandar el nuevo a todes. Manda **en tandas** (ver "Envíos en tandas" abajo): el botón manda la primera y deja el envío pedido (`event_ticket_settings.stream_send_hash`); el resto lo manda el cron en las próximas vueltas (o otro toque del botón). El botón también reintenta a quienes habían fallado todos sus intentos.
- La página de la entrada muestra el link cuando existe (solo si la compra está aprobada).

### El Fondo KinkyVibe

Resumen de lo que explica <https://fondo.kinkyvibe.ar> (consultado el 2026-09-29):

- Es un fondo de **Mecenas** (aportes mensuales o de una vez) para que KinkyVibe pueda sostener su trabajo (talleres de sexualidad, kink/BDSM, géneros, reducción de riesgos e historia cuir; fanzines y material digital; eventos con sesiones en vivo, performance, poesía, ferias y cine porno cuir; la comunidad ¡AUCH! con grupos de apoyo y equipo de moderación/monitores; y la tienda y ferias de emprendimientos disidentes) sin cobrarle todo a quien participa.
- **Cómo baja los precios:** tiene un objetivo mensual (a diciembre de 2025, **$ 4.000.000 por mes**, que se actualiza cada 6 meses por inflación). **Por cada 10 % del objetivo que se recauda, baja un 10 % el precio de todos los talleres, eventos y materiales, para todo el mundo** (no solo para Mecenas). Con el 100 %, todo es gratis. Por eso el descuento del fondo es un porcentaje parejo sobre todo (el mismo para todos los eventos KinkyVibe).
- **Niveles de Mecenas** (mensual): Visitante $ 1.500, Casual $ 3.000, Regular $ 7.500 (nombre en el sitio), Sugar $ 15.000, Estrella $ 30.000 y Leyenda $ 45.000 (nombre con link); hay "Super Mecenas" y donaciones mayores aparte.
- El sitio no habla de entradas solidarias: los aportes de las opciones solidaria / muy solidaria / Sugar son una forma más de sumar al fondo desde la compra (el nombre "Sugar" coincide con un nivel). Esos aportes suman al total del mes del Fondo, igual que las propinas al Fondo, sin anotar a nadie como Mecenas (decisión [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)); falta que `/api/fondo/propinas-total` los sume (`fondo-aportes-entradas` en el [plan](plan.md)).

### Códigos de descuento

Admin en `/admin/ventas/codigos` (link desde `/admin/ventas` y el panel): lista con usos, crear, activar/desactivar. Cada código: texto (sin distinguir mayúsculas), porcentaje o monto fijo, evento (o todos), vigencia opcional desde/hasta (hora de Argentina), usos máximos opcionales y entradas por compra opcionales. **Un uso es una compra entera, no una entrada**: un código de 100 % deja sin cargo todas las entradas de esa compra, y «usos máximos» cuenta compras (el panel lo dice al crearlo).

- **Entradas por compra** (`max_tickets`, migración `0058_discount_max_tickets.sql`; vacío = sin límite, como los códigos de antes): cuántas entradas puede tener, como mucho, una compra con el código. Sirve para una cortesía de 100 % para una persona: con `max_tickets = 1` no cubre una compra de varias. «Aplicar» (si ya se eligió la cantidad) y la compra responden «Ese código vale para hasta N entrada(s) por compra.»; el `INSERT` de la orden también lo controla. Las listas del panel muestran «hasta N entradas» y el CSV la columna.

- Un **uso** es una compra (no una entrada) aprobada o con la reserva vigente; si la reserva vence o se cancela, el uso se libera. Los usos se cuentan sin distinguir mayúsculas (`COLLATE NOCASE`), por si alguna orden guardó el código distinto.
- "Aplicar" es informativo. Al crear la orden el código se **vuelve a validar dentro del mismo `INSERT`** que reserva el cupo (activo, vigente, del evento, mismo tipo/valor, usos < máximo, cantidad ≤ entradas por compra), así que compras simultáneas no se pasan de `max_uses` (test con 25 compras concurrentes).
- Un código de otro evento responde "Ese código no existe" (no confirma que exista). Los intentos de "Aplicar" tienen límite por IP (anónimo, con hash).

### Códigos combo

Pedido de gorrite (10/10: «dos eventos a un precio especial si se compran juntos»; 12/10 eligió esta versión chica). Detrás del interruptor **`combo_codigos`** (apagado por defecto; [interruptores.md](interruptores.md)) y de la migración `0056_combo_codigos.sql`. Código: `src/lib/server/tickets/combos.js`.

- **Armarlo:** en la ficha del evento A, pestaña **Códigos**, la tarjeta **Combo con otro evento** (`ComboCodes.svelte`): el evento B (otro que vende entradas con la venta abierta o por abrir), el descuento (porcentaje o monto fijo por compra, como los códigos) y un vencimiento opcional (vacío = hasta que cierre la venta de B). Un combo por par de eventos (tabla `ticket_combos`); guardarlo de nuevo cambia el descuento de los códigos que se generen desde ahí (los ya generados quedan como estaban). **Apagar** frena los códigos nuevos; los ya mandados siguen valiendo. Queda en Actividad (`combo.save`, `combo.activate`, `combo.deactivate`). La tarjeta muestra por combo cuántos códigos se generaron, cuántos se usaron (y en reserva) y cuántos se anularon por reembolso.
- **Generar:** al mandar el mail de las entradas de **cualquier venta aprobada** de A (online con Mercado Pago, transferencia confirmada o sin cargo; en la puerta; cargada a mano, cortesías incluidas), se crea un código común en `discount_codes` para B: `COMBO-` + 6 caracteres al azar del alfabeto de los códigos de entrada, **un solo uso y una sola entrada** (`max_uses = 1`, `max_tickets = 1`: una compra de varias entradas con el código no entra), **solo para el mail de quien compró** (`buyer_email`) y atado a esa orden (`source_order_id`). Uno por orden y evento B (índice único): reenviar el mail o dos envíos a la vez muestran el mismo código. No se genera si B ya cerró la venta, se canceló o está marcada agotada, ni si el combo venció o está apagado. Si algo falla, el mail sale igual, sin el bloque.
- **Todas las ventas generan código** (gorrite, 12/10), también las de la puerta y las cargadas a mano. El código va siempre atado al email de quien compró, así que una venta **sin email** (algunas de la puerta) o en la que no se tilda «mandarle las entradas por mail» no genera nada: no hay a quién mandárselo. La pantalla de la puerta no lo muestra (sería otro camino para un código personal sin mail que lo respalde).
- **El mail** (`comboBlocks` en `email.js`) suma, después de las entradas, el bloque «Un descuento para otro evento: Con tu entrada a A tenés X en B: usá el código …», con el link a la compra de B y «Es personal: vale para una compra con este mismo email, hasta el … Completá tus datos con este email antes de aplicarlo.». Nunca dice el mail. Sin combos, el mail sale igual que siempre, byte a byte.
- **Usarlo en B:** es un código más (mismo campo, mismo cálculo, mismo control dentro del `INSERT`). `discountGuardSql` y `checkDiscountCode` además exigen que el mail de la compra sea el del código (sin distinguir mayúsculas ni espacios) y que la orden de origen siga aprobada. Sin email todavía o con otro, «Aplicar» responde «Ese código no existe», igual que un código que no existe: el código solo no dice si existe. Por eso el mail pide completar los datos antes de aplicarlo (el formulario manda todos los pasos juntos, así que «Aplicar» ve el email aunque esté en «Tus datos»); igual, la compra lo valida con el email aunque no se haya tocado «Aplicar».
- **Límite conocido y aceptado:** nada verifica que el email que se escribe al comprar sea de quien lo escribe, así que con el código y el email alcanza para usarlo. Es un descuento, no un acceso: se acepta.
- **Reembolso de A:** si el código no se usó, **deja de valer** («Ese código ya no está activo»): no hace falta tocarlo, el control mira el estado de la orden de origen (sirve para el reembolso del panel, el de Mercado Pago por webhook y cualquier otro cambio de estado). Si ya se usó, la compra de B queda como está: cada compra es su propia orden, así que el combo **no toca el Fondo ni los reembolsos** (reembolsar B devuelve lo que se pagó por B).
- **Listas:** los códigos combo no aparecen en Ventas › Códigos ni en la pestaña Códigos de B (serían uno por compra); en la lista de órdenes de B se reconocen por el prefijo `COMBO-`.
- **Interruptor apagado:** no se ve la tarjeta, sus actions dan 404 y no se generan códigos nuevos ni se agrega el bloque al mail. Los códigos ya mandados siguen valiendo en B.

### Descuento automático del Fondo

El porcentaje del Fondo KinkyVibe se lee de `GET https://fondo.kinkyvibe.ar/api/porcentaje` (`{ percent, collected, goal, step, updatedAt }`, `percent` de 0 a 100 en pasos de 10; la URL se puede cambiar con `FONDO_PERCENT_URL`) en `src/lib/server/tickets/fondo.js`, con 3 s de timeout y memoria de 10 minutos en el isolate (un fallo se recuerda 1 minuto, para no insistir). Orden de precedencia:

1. el porcentaje fijado a mano en **Ajustes de venta** ("vacío = automático"): es el recurso de emergencia si fondo.kinkyvibe.ar no anda;
2. solo en `vite dev`: `FONDO_PERCENT_OVERRIDE` (en `.env.tickets`, 20), para probar sin red;
3. el de la API (en vivo: si cambia durante una venta, cambian los precios);
4. si la API no responde (o devuelve algo raro): el último valor que se obtuvo bien, guardado en D1 (`ticket_settings`, clave `fondo_percent_last`), con un aviso en el log;
5. 0 (sin descuento). **Nunca frena la venta.**

No hay porcentaje por evento ni monto por tipo (`fondo_percent` y `fondo` en el frontmatter se ignoran): siempre es este porcentaje. Solo aplica a eventos con la etiqueta KinkyVibe.

**La página del evento no espera a la API.** El botón «Comprar entradas» de `/calendario/<evento>` solo muestra el precio: pide el porcentaje con `staleOk` y, si la memoria de 10 minutos venció pero hay uno conocido (la memoria vencida o el guardado en D1), lo usa sin esperar a fondo.kinkyvibe.ar y lo actualiza en segundo plano (`ctx.waitUntil`, una actualización a la vez por isolate). Sin porcentaje conocido, espera como siempre. La página de compra (`/entradas`) y `?/buy` **siempre esperan el valor de siempre** (memoria de 10 minutos o la API): el aviso «El descuento del Fondo cambió» sigue protegiendo lo que se cobra.

El porcentaje se busca solo si el evento vende entradas y usa el Fondo, y a la par de la lectura de su lugar: el evento se lee una sola vez (`eventTicketsWithFondo` en `src/lib/server/tickets/checkout.js`, con `options.fondo` de `getEventTickets`). Lo prueba `venta-consultas.test.js`, que fija cuántas consultas y cuántas tandas en fila hace la venta (la base está lejos: cada consulta que espera a otra es una ida y vuelta). Apenas se sabe que el evento vende entradas, `getTicketsView` lee a la par del lugar y del Fondo lo vendido, la fila de la lista de espera, los ajustes y las preguntas de inscripción (`salesReads`).

La página de compra (`/calendario/<slug>/entradas`) hace lo mismo: el evento, las partes del taller y el interruptor de la lista de espera a la par; después, en este orden, el 404 si el evento no se ve y el redirect al taller (una parte oculta da 404 sin contar de qué taller es); y la venta, el lugar y los datos guardados de la cuenta, a la par. Los datos de la cuenta solo vuelven (y la página solo se marca `private, no-store`) con la venta abierta, como siempre. Lo fija `entradas-consultas.test.js` (con venta, de 18 tandas en fila a 8).

`fondo = round(precio × porcentaje / 100)` por entrada, en todos los tipos con precio (no en los a la gorra) de los eventos KinkyVibe. El precio que se muestra y el que se cobra se calculan en el servidor; el que se cobra, al crear la orden, que guarda el porcentaje usado en `orders.fondo_percent` (columna `orders.fondo_percent`; también en el CSV, `porcentaje_fondo`). Ajustes de venta muestra "Descuento del Fondo ahora: X %", de dónde sale y cuándo se actualizó.

**El porcentaje que se cobra es el que se vio.** Como con los tramos de preventa, el formulario manda el porcentaje que mostró (`fondo_percent`, campo oculto, solo con «Con el descuento del fondo» elegido) **solo para avisar**: si no coincide con el vigente al comprar, `?/buy` no reserva y contesta 409 «El descuento del Fondo cambió: ahora es X %. Revisá el total y volvé a confirmar.». Toda respuesta con error de `?/buy` en un evento con Fondo lleva el porcentaje de ahora (`fondoPercent`) y la página de compra rearma los precios con él (`withFondoPercent` en `src/lib/utils/tickets.js`), así confirmar de nuevo pasa sin recargar. Sin el campo (o vacío: formularios viejos, precio completo o solidarias, eventos sin Fondo) no se frena nada.

### Reembolsos

En la pestaña **Órdenes** de la ficha (`/admin/eventos/<slug>/ordenes`), cada orden aprobada tiene **Reembolsar…**, que abre un paso de confirmación con el monto, quién compró y sus entradas:

- **Mercado Pago:** pide el reembolso **total** del pago con `POST /v1/payments/{id}/refunds` y el body vacío (doc de Checkout Pro "Configurar reembolsos y cancelaciones", consultada con la búsqueda de documentación de MP el 2026-09-29), con `X-Idempotency-Key: refund-<orden>` (doble click = el mismo reembolso). MP pide saldo suficiente en la cuenta y como máximo 180 días desde la aprobación; si lo rechaza, no se cambia nada y se muestra el aviso. En modo simulado, el mock marca el pago como reembolsado.
- **Transferencia:** "Marcar como reembolsada (transferencia devuelta a mano)" hace la misma contabilidad sin llamar a MP. **Sin cargo:** "Anular las entradas".
- Después, `refundOrder` (un único `UPDATE … WHERE status = 'approved'`) pasa la orden a `refunded` y guarda quién y cuándo (`refunded_by`, `refunded_at`). Una orden reembolsada no cuenta para el cupo, los usos de códigos ni los totales (cobrado, fondo usado, aportes); sus entradas quedan anuladas (el control de ingreso dice "Entrada anulada" y la página de la entrada, "Reembolsada"). Se le manda un mail corto a quien compró.
- **Idempotente:** un segundo click (o una pestaña vieja) responde "ya estaba reembolsada". Si el reembolso se hace desde el panel de MP, llega por el webhook (`refunded` / `charged_back`), la orden pasa a `refunded` (sin `refunded_by`) y se manda el mismo mail; si el webhook llega después de un reembolso hecho desde el admin, no cambia nada. Un **contracargo** (`charged_back`: el banco de quien compró revirtió el cobro) también deja la orden en `refunded` y libera el lugar para la lista de espera, pero **no** manda el mail de reembolso (no lo devolvimos nosotres): queda un `console.warn` con la orden y el pago, y les admins que prendieron «Cada venta» en «🔔 Mis avisos» de Telegram reciben «⚠️ Contracargo en Mercado Pago…» con la referencia de la orden, el evento y el total (docs/telegram.md). No se marca «Para revisar»: los motivos de esa marca (`needs_review`) son solo pago tardío y pago duplicado, y sumar otro pediría una migración.
- No hay reembolsos parciales (por entrada) desde el panel: se hacen desde el panel de MP
  (decisión 0044). Cuando MP avisa un pago que sigue aprobado con algo reembolsado
  (`transaction_amount_refunded`), el aviso lo **anota solo** en la orden (`refunded_amount`,
  migración 0069; el acumulado, idempotente) sin cambiar nada más: la orden sigue aprobada, las
  entradas siguen valiendo y no se manda ningún mail. En la pestaña Órdenes la orden dice
  «Reembolso parcial en Mercado Pago: $ X (quedan $ Y)» (y, si MP la informó, «comisión de MP
  $ Z»); el CSV de órdenes todavía no lo trae, y se resta de «Recaudado», de lo neto y de los totales del panel y de Estadísticas
  (`REVENUE_SQL`). Un reembolso total sigue pasando la orden a `refunded`, como siempre.
  Código: `paymentAmounts` y `recordPaymentAmounts` en `src/lib/server/tickets/orders.js`.
- **«Reembolsar todas» (evento cancelado, decisión [0051](decisiones/0051-reembolsar-todas-evento-cancelado.md)):** en la pestaña Órdenes de un evento con `status: cancelado`, arriba, un bloque con cuántas órdenes de Mercado Pago quedan sin reembolsar y por cuánto en total (`refundAllPreview` en `src/lib/server/admin/refunds.js`: aprobadas, `payment_method = 'mercadopago'`, con número de pago y compradas online). Solo admins. «Reembolsar todas…» abre la confirmación en la misma página: hay que escribir **REEMBOLSAR**, y el servidor rechaza si el evento no está cancelado o si la cantidad o el total que vio le admin ya no son los de ahora. La acción `refundAll` (`eventActions.js`) las reembolsa **de a 10 por pedido** (`REFUND_ALL_BATCH`), una después de otra y en orden de compra, cada una con **el mismo paso que «Reembolsar…»** (`refundFromPanel`: MP con `refund-<orden>` y después `refundOrder`; `afterRefund`: Actividad `order.refund`, el mismo mail «Reembolsamos tu compra» y la lista de espera). Si quedan más, «Seguir con las N que faltan» continúa después de la última vista. Nunca reembolsa dos veces (lo reembolsado no se vuelve a pedir; dos pedidos a la vez mandan la misma clave a MP y marcan la orden una vez). Si `refundPayment` da error (o se corta), se consulta el pago (`getPayment`): si MP ya lo tiene reembolsado, la orden se marca con el mismo `refundOrder` y cuenta como hecha; si no, se vuelve a leer la orden (si el webhook la marcó mientras tanto, «ya estaba»). Esto vale también para «Reembolsar…» de una orden. Lo que MP rechaza queda aprobado y el resumen pide revisar el pago en Mercado Pago antes de devolverlo a mano (para no pagarlo dos veces). Un error en una orden no corta la tanda (queda «not-marked», para revisar), y el resumen y la Actividad se anotan igual. Un «Seguir» con una orden que no es de este evento se rechaza (400) en vez de volver a empezar sin el control de cantidad y total; cada tanda queda en Actividad (`event.refund_all`) y en el log. Las aprobadas que no son de MP online (puerta, carga a mano, transferencia) se listan aparte como **«Para devolver a mano»** y no se tocan; las sin cargo solo se cuentan.

### Mails y recordatorios

- **Remitente y respuesta:** por defecto `KinkyVibe <entradas@kinkyvibe.ar>` y `entradas@kinkyvibe.ar` (la organización redirige esa dirección a su Gmail con Cloudflare Email Routing). Se cambian en **Mensajes → Configuración** (donde también se editan los textos de cada mail: ver [mails.md](mails.md)); si ahí están vacíos, `TICKETS_FROM_EMAIL` / `TICKETS_REPLY_TO`. El contacto de la política de devoluciones sigue siendo `TICKETS_CONTACT_EMAIL` (kinkyvibe.talleres@gmail.com). Los mails se mandan con Resend (`RESEND_API_KEY`).
- **Cambio de fecha** (`src/lib/server/tickets/dateChange.js`, migración `0048_avisar_cambio_fecha.sql`): guardar el evento con otro inicio o fin anota el cambio, y la ficha ofrece **Avisar a les compradores** (aviso arriba de las pestañas y tarjeta en Mails → Mandar un aviso). Nunca sale solo: hace falta tocar el botón y confirmar. Le llega una vez por versión a cada orden aprobada de antes del cambio, con la fecha nueva y el `.ics` actualizado (mismo UID, `SEQUENCE` más alto). Ver [mails.md](mails.md).
- **«No fui yo»** (`src/lib/server/email/suppressions.js`, migración `0060_email_suppressions.sql`): el mail de entradas gratis y el de los datos para transferir llevan en el pie un link para que quien lo recibe diga que no fue. Desde ahí, a esa dirección no le sale ningún mail de una orden gratis o de una reserva sin pagar (la orden se crea y se aprueba igual); los de una compra pagada salen siempre. Ver [mails.md](mails.md#no-fui-yo).
- **Recordatorios** (`src/lib/server/tickets/reminders.js`): lista configurable en Ajustes de venta (activado + cuándo: "N horas antes" del inicio, o "N días antes a las HH:MM" en hora de Argentina, UTC−3 fijo). Por defecto: **2 días antes** (48 h) y **el mismo día a las 9:00**. Un «el mismo día» de un evento que empieza antes de esa hora (o a esa hora) sale **el día anterior a las 20:00**, con el mismo id y «es mañana» (`reminderSchedule`; detalle en [mails.md](mails.md)). Un evento no los manda con `recordatorios: false` en el frontmatter. El mail lleva cuándo y dónde, el link y el código de cada entrada o, en eventos online, el link de la transmisión si ya está.
- **Quién los manda:** `POST /api/cron/recordatorios` con el header `x-cron-secret` = `CRON_SECRET` (comparado en tiempo constante; sin `CRON_SECRET` responde 503). Lo llama cada 15 minutos el cron del propio Worker (`src/lib/server/scheduled.js`, horario en `[triggers]` de `wrangler.toml`), sin salir a internet. Es idempotente: `reminder_sends` (orden + id del recordatorio) se reserva antes de mandar (ver "Envíos en tandas"). Solo a órdenes aprobadas (no canceladas ni reembolsadas), de eventos que no empezaron ni se cancelaron, y compradas antes de la hora del recordatorio.
- **Envíos en tandas** (`src/lib/server/tickets/sendState.js`, `mailQueue.js`, migración `0011_send_batches.sql`): cada corrida del cron manda como mucho **"Mails por tanda"** (Mensajes → Configuración; de 5 a 200, vacío = 40): primero los recordatorios que tocan (del evento más cercano al más lejano) y, con lo que sobre, lo que quede de cada "Enviar el link a todes" y de cada «Avisar a les compradores» (cambio de fecha). Lo demás sigue en la próxima corrida, así un evento grande no se corta por los límites de un pedido del Worker. Cada fila de `reminder_sends` / `stream_link_sends` tiene un estado: `sending` (reservada; si queda así más de 10 minutos, el Worker se cortó y se retoma), `sent`, `retry` (falló: se reintenta en la próxima corrida) o `failed` (falló 3 veces: no se reintenta solo). Dos corridas a la vez no duplican nada (la reserva es atómica) y cada mail lleva además una clave de idempotencia de Resend. Los `failed` aparecen en **Para revisar** del Inicio: los recordatorios con **Reintentar** (vuelven a la cola), el link con un acceso al evento (el botón los reintenta).

### Ajustes de venta

Tres páginas del panel (menú **Ajustes**; `requireAdmin` en cada `load` y action) sobre la misma tabla de D1 (`ticket_settings`). Cada una guarda solo sus campos (no borra los de las otras). `getSalesSettings` los lee una sola vez por pedido de lectura (la venta los pide para el Fondo, la transferencia y la comisión); en un `POST` solo se comparte la lectura en camino, así lo leído después de guardar es lo nuevo (`oncePerRequest`):

- **Cobros** (`/admin/ajustes/cobros`):
  - **Datos para transferir:** Alias, CBU/CVU, Titular y Banco (texto libre; se muestran los campos completos, como "Alias: …" en líneas). Si están todos vacíos se usa `TICKETS_TRANSFER_INFO`; si tampoco hay, no se ofrece transferencia.
  - **Comisión de Mercado Pago** (%): vacío = `TICKETS_MP_FEE_PERCENT` o 2 %. El campo viene completo con el valor que se está usando.
- **Fondo** (`/admin/ajustes/fondo`): el porcentaje de ahora y un campo para fijarlo a mano (vacío = automático).
- **Configuración de los mails** (Mensajes → Configuración, `/admin/mensajes/configuracion`; `/admin/ajustes/mails` redirige ahí): remitente, dirección de respuesta, los **recordatorios**, **Mails por tanda** (ver arriba) y, en `/admin/mensajes/plantillas`, el texto de cada mail (tabla `email_templates`; ver [mails.md](mails.md)).

Además, **Admins** (`/admin/ajustes/admins`) muestra quién puede entrar al panel (la lista de `src/lib/server/auth.js`; por ahora solo lectura).

### Transferencia

Opt-in por evento (`payment_methods`) y requiere datos para transferir (Ajustes de venta o `TICKETS_TRANSFER_INFO`; **nunca en el repo**).

1. La orden queda `awaiting_transfer` y **guarda el lugar hasta las 20:00 (hora de Argentina) del segundo día hábil después del día de la compra**, o hasta que empieza el evento si es antes ([decisión 0031](decisiones/0031-reserva-transferencia-dias-habiles.md)). Los días hábiles son de martes a sábado (de 14 a 20); el día de la compra nunca cuenta y los feriados no se tienen en cuenta. Ejemplos: domingo → miércoles 20:00; martes 15:00 → jueves 20:00; viernes → martes 20:00; sábado → miércoles 20:00; lunes → miércoles 20:00. La cuenta es `transferDeadline(creada, comienzo)` en `src/lib/utils/transferDeadline.js` (pura; los días y la hora de cierre son constantes de ese archivo); el comienzo es el mismo que cierra la venta por defecto (`start`). No hay paso de confirmar: el formulario (con la fecha exacta si se compra ahora), las condiciones de compra, la página de estado y el mail dicen hasta cuándo, con día y hora. Cuenta para el cupo y para los usos de códigos igual que las demás reservas; al vencer se libera. Los links «Confirmar mi reserva» de mails viejos (`/entradas/<orden>/confirmar?k=…`, firmados) siguen andando: muestran «Tu reserva ya está guardada hasta…» o «Tu reserva ya venció» y no cambian nada. Las reservas que ya existían quedan con su vencimiento.
2. La persona ve (en `/entradas/<orden>/estado`) el monto, los datos para transferir, una **referencia** `KV-XXXXXXXX` para el concepto y cómo mandar el comprobante (respondiendo el mail o escribiendo a `TICKETS_REPLY_TO`/`TICKETS_CONTACT_EMAIL`). Se le manda un mail con lo mismo.
3. En la bandeja **Ventas › Transferencias** (`/admin/ventas/transferencias`, las de todos los eventos, la que vence antes arriba, con filtro por evento) o en la pestaña **Transferencias** de la ficha (`/admin/eventos/<slug>/transferencias`), **Transferencias pendientes**: **Confirmar pago** aprueba, emite las entradas y las manda por mail, en una transacción idempotente (dos clicks o dos pestañas: se emite una vez). **Cancelar** libera el cupo. Se siguen mostrando 7 días las reservas vencidas: confirmar una vencida solo funciona si todavía hay cupo (comprobado en la misma sentencia); en ese caso no se vuelve a mirar el máximo de usos del código. **Deshacer rechazo** (solo admins): una transferencia cancelada en los últimos 7 días (bandeja: «Rechazadas en los últimos 7 días»; ficha: «Resueltas hace poco») vuelve a «esperando comprobante» con una reserva nueva contada desde ese momento con la misma regla (`transferDeadline`), solo si todavía hay lugar en su tipo y su tramo (`reopenLimits` + `reopenTransfer`, en la misma sentencia); si no, el mismo aviso para pasar el límite. Queda en el registro (`transfer.reopen`) y no le manda nada a quien compró.
4. **No hay verificación automática:** no existe una API confiable y accesible para enterarse de transferencias entrantes a una cuenta bancaria o CVU común (los bancos no ofrecen webhooks a particulares/pequeñas organizaciones, y leer extractos o mails del banco sería frágil e inseguro). Alguien tiene que mirar la cuenta y confirmar a mano.

### Política de devoluciones

Se muestra en "Condiciones de compra y devoluciones" del formulario y al pie de los mails (la dirección es `TICKETS_CONTACT_EMAIL`, por defecto `kinkyvibe.talleres@gmail.com`):

> **Devoluciones y cambios**
> Si no podés venir, avisanos hasta 5 días hábiles antes del evento y te devolvemos lo que pagaste. Si preferís, en lugar de la devolución te ofrecemos un taller grabado de los que haya en la tienda en ese momento.
>
> Si le pasás tu entrada a otra persona, escribinos a kinkyvibe.talleres@gmail.com con su nombre, sus pronombres y su email.

(Reescrita para que se lea más clara, con el mismo sentido que el texto original de la organización. En el formulario va dentro de la misma lista que las demás condiciones.)

### Evento de prueba

`prueba-entradas-2026-12` (en la semilla de contenido, `src/lib/server/semilla/calendario.json`; en producción ya está borrado) es un evento **oculto** (`force_unlisted`) con entradas (General y Anticipada, con fondo en las dos), los dos medios de pago, y en el cuerpo las instrucciones paso a paso para probar todo. `prueba-entradas-gorra-2026-12` es otro, online y a la gorra.

### Archivos

| Qué                                              | Dónde                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Tablas de entradas (y resguardos)                | `migrations/0002_tickets.sql`, `0003_ticket_safeguards.sql`, `0016_preventas.sql` (tramo)          |
| Ajustes de venta                                 | `src/lib/server/tickets/settings.js`, `admin/ajustes/*`                                            |
| Link de la transmisión (online)                  | `src/lib/server/tickets/stream.js`                                                                 |
| Control de ingreso: código y sugerencias         | `src/lib/server/tickets/checkin.js`, `ingreso/buscar`                                              |
| Cálculo de precio, DNI, política (compartido)    | `src/lib/utils/tickets.js`                                                                         |
| Preventas (tramos) y tipos encadenados           | `src/lib/utils/ticketTiers.js`, `config.js` (`parseTiers`, `withTier`), `TicketTiersEditor.svelte` |
| Códigos de descuento                             | `src/lib/server/tickets/discounts.js`, `admin/ventas/codigos`                                      |
| Códigos combo (entre eventos)                    | `src/lib/server/tickets/combos.js`, `admin/ComboCodes.svelte`, pestaña Códigos de la ficha         |
| Configuración desde el frontmatter y validación  | `src/lib/server/tickets/config.js`, `events.js`                                                    |
| Editor de eventos: sección Entradas              | `src/lib/utils/ticketsEditor.js`, `admin/TicketsEditor.svelte`, `src/lib/server/tickets/editor.js` |
| Órdenes, cupo, estados, check-in (SQL)           | `src/lib/server/tickets/orders.js`                                                                 |
| Cliente de Mercado Pago y firma del webhook      | `src/lib/server/tickets/mercadopago.js`                                                            |
| Email (Resend) y QR                              | `src/lib/server/tickets/email.js`, `qr.js`                                                         |
| Variables, mocks y envío del email               | `src/lib/server/tickets/index.js`, `mock.js` (solo dev)                                            |
| Form action de compra                            | `src/lib/server/tickets/checkout.js`                                                               |
| Página y formulario de compra                    | `(content)/calendario/[event]/entradas/`, `TicketPurchase.svelte`, `components/purchase/`          |
| Webhook                                          | `src/routes/api/mercadopago/webhook/+server.js`                                                    |
| Páginas públicas (estado, entrada, QR, simulado) | `src/routes/entradas/`                                                                             |
| Admin y control de ingreso                       | `src/routes/(authed)/admin/ventas/`, `admin/eventos/[slug]/`, `QrScanner.svelte`                   |
| Tests                                            | `src/lib/server/tickets/*.test.js`, `tests/tickets/` (E2E)                                         |

## Variables de entorno

En producción van en Cloudflare: **Workers & Pages → (proyecto) → Settings → Variables and Secrets**, como _Secret_ las que lo son. En local, en un archivo `.env` (ignorado por git). Para probar entradas está `npm run dev:tickets` (ver abajo), que además lee `.env.tickets`.

| Variable                 | Qué es                                                                                                                                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MP_ACCESS_TOKEN`        | Secret. Access token de la aplicación de Mercado Pago (primero el de la **cuenta de prueba vendedora**).                                                                                                                                                                    |
| `MP_WEBHOOK_SECRET`      | Secret. "Clave secreta" de la sección Webhooks de la aplicación de MP. Sin ella todos los webhooks se rechazan (503).                                                                                                                                                       |
| `RESEND_API_KEY`         | Secret. API key de Resend con permiso de envío. Sin ella no se mandan mails (en producción se loguea un error).                                                                                                                                                             |
| `EMAIL_ALLOWLIST`        | Solo previews. Direcciones (separadas por comas) que pueden recibir mails reales desde un preview; cualquier otra se desvía a la primera, con `[DEMO]` en el asunto. Sin ella, un preview no manda mails. Estado del entorno: `GET /api/preview-status` (solo en previews). |
| `TICKETS_FROM_EMAIL`     | Respaldo del remitente si en Ajustes de venta está vacío (por defecto `KinkyVibe <entradas@kinkyvibe.ar>`). El dominio tiene que estar verificado en Resend.                                                                                                                |
| `CRON_SECRET`            | Secret. Clave del cron del Worker para `POST /api/cron/recordatorios` (16 caracteres o más). Sin ella no se mandan recordatorios.                                                                                                                                           |
| `FONDO_MAIL_SECRET`      | Secret. Clave compartida con fondo.kinkyvibe.ar para `POST /api/fondo/mi-link` y `GET /api/fondo/propinas-total` (header `x-fondo-secret`, 16 caracteres o más; ver [mails.md](mails.md) y [propinas.md](propinas.md)). Sin ella esos endpoints contestan 401 siempre.      |
| `TICKETS_REPLY_TO`       | Opcional. Respaldo de la dirección de respuesta si en Ajustes de venta está vacía (por defecto `entradas@kinkyvibe.ar`).                                                                                                                                                    |
| `TICKETS_CONTACT_EMAIL`  | Opcional. Contacto público de la política de devoluciones y cambios de titular. Por defecto `kinkyvibe.talleres@gmail.com`.                                                                                                                                                 |
| `TICKETS_TRANSFER_INFO`  | Respaldo de los datos para transferir si en Ajustes de venta están vacíos; texto libre, saltos de línea reales o escritos `\n`. **No commitear.**                                                                                                                           |
| `TICKETS_MP_FEE_PERCENT` | Opcional. Respaldo de la comisión de MP si en Ajustes de venta está vacía (sin ninguna: 2 %). `0` = sin recargo.                                                                                                                                                            |
| `FONDO_PERCENT_URL`      | Opcional. De dónde se lee el porcentaje del Fondo (por defecto `https://fondo.kinkyvibe.ar/api/porcentaje`).                                                                                                                                                                |
| `SITE_URL`               | Opcional. Origen público (`https://kinkyvibe.ar`) para los links de mails y las URLs que se le pasan a MP. Si falta, se usa el del pedido.                                                                                                                                  |
| `TICKETS_CLIENT_SALT`    | Opcional, Secret. Sal del hash de cliente de los límites anti-abuso (sin ella se usa una fija que igual rota cada día). Cualquier texto largo al azar.                                                                                                                      |
| `TICKETS_PAUSED`         | Opcional, solo en una emergencia. Prendida (cualquier texto que no sea `0`), frena la venta online y ese texto es lo que ve el público (`1` = un texto por defecto). Ver [Pausa de emergencia de la venta](#pausa-de-emergencia-de-la-venta).                               |
| `MAILS_PAUSED`           | Opcional, solo en una emergencia. Prendida, frena los mails en tanda (los de cada compra salen igual). Ver [interruptores.md](interruptores.md#pausas-de-emergencia).                                                                                                       |

Solo en desarrollo (`vite dev`; en el build de producción este código no existe):

| Variable                         | Qué hace                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MP_MOCK=1`                      | Usa el Mercado Pago simulado aunque haya `MP_ACCESS_TOKEN`. Sin `MP_ACCESS_TOKEN` también se simula.                                                                                                                                                                                                                                                                  |
| `TICKETS_DEV_FIXTURE=slug`       | Agrega entradas de prueba (fondo 20 % en todos los tipos: General $10000 sin cupo, Anticipada $8000 cupo 3; MP y transferencia; entradas en la puerta a $ 12.000) a esos eventos sin tocar su archivo. Separar varios con comas. Con la cookie `kv-dev-hoy=<slug>`, ese evento empieza hoy a las 23 (para probar la Puerta que entra directo al único evento de hoy). |
| `TICKETS_DEV_FIXTURE_GORRA=slug` | Lo mismo con un evento online a la gorra (A la gorra: mínimo $1000, sugerido $5000; Libre: mínimo $0, sugerido $3000).                                                                                                                                                                                                                                                |
| `FONDO_PERCENT_OVERRIDE=20`      | Porcentaje del Fondo fijo, sin pedirlo a fondo.kinkyvibe.ar (está en `.env.tickets`).                                                                                                                                                                                                                                                                                 |
| `ADMIN_DEV_MOCK=1`               | Sesión de admin falsa (sin GitHub).                                                                                                                                                                                                                                                                                                                                   |

## Probar en local (sin cuentas de nada)

```sh
npm ci
npm run dev:tickets
```

`dev:tickets` es `vite dev --mode tickets`: Vite y SvelteKit (`$env/dynamic/private`) leen además el archivo **`.env.tickets`**, que está en el repo y tiene solo flags de desarrollo, nada secreto: `MP_MOCK=1`, `ADMIN_DEV_MOCK=1`, `TICKETS_MP_FEE_PERCENT=2`, `FONDO_PERCENT_OVERRIDE=20` y un `TICKETS_TRANSFER_INFO` con un alias inventado. Funciona igual en Windows, Mac y Linux (no hace falta escribir variables delante del comando). Para cambiar algo solo en tu compu, creá `.env.tickets.local` (lo ignora git); las variables del entorno de la terminal pisan a las de los archivos. Como siempre en dev, antes aplica las migraciones locales de D1.

Con eso ya funciona el evento de prueba `http://localhost:5173/calendario/prueba-entradas-2026-12` (el puerto lo muestra la terminal; su página tiene la guía paso a paso). Para probar con otro evento sin tocar su archivo, agregar `TICKETS_DEV_FIXTURE=<slug>` a `.env.tickets.local`.

1. Abrir la página del evento, tocar **Comprar entradas** (lleva a `/calendario/<slug>/entradas`), completar e "Ir a pagar con Mercado Pago" (o "Reservar y ver cómo transferir").
2. Se abre el **checkout simulado** (`/entradas/simular-pago/<orden>`): aprobar, rechazar, dejar pendiente o "aprobar sin webhook" (para ver que la página de estado re-consulta sola). Cada botón manda una notificación **firmada** al webhook igual que MP.
3. Sin `RESEND_API_KEY` el mail no se manda: se loguea en la consola (con los tokens recortados).
4. Admin: `http://localhost:5173/admin/ventas` (ventas de todos los eventos), `http://localhost:5173/admin/ventas/transferencias` (transferencias pendientes de todos los eventos), `http://localhost:5173/admin/ventas/codigos` y `http://localhost:5173/admin/ajustes/cobros` (y `/fondo`, `/mails`).

Tests:

```sh
npx vitest run src/lib/server/tickets                  # unitarios (D1 real en memoria)
npx playwright test -c playwright.tickets.config.js    # E2E: levanta `npm run dev:tickets` en el puerto 5371
# opcional: PW_CHROMIUM=/ruta/a/chrome  TICKETS_SHOTS_DIR=/carpeta/para/capturas
```

Para mirar la base local: `npx wrangler d1 execute kinkyvibe --local --command "SELECT id, status, buyer_email FROM orders"`.

## Probar con Mercado Pago de verdad (credenciales de prueba primero)

> Pasos según la documentación de Mercado Pago Developers tal como la conocemos; los nombres de las pantallas cambian seguido. Verificarlos en <https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/landing>.

1. Con la cuenta de MP de la organización, entrar a **Tus integraciones** en Mercado Pago Developers y **crear una aplicación** (producto: Checkout Pro / pagos online).
2. En la aplicación, **Cuentas de prueba → crear** una cuenta **vendedora** y una **compradora** (país Argentina). Anotar usuarios y contraseñas en un gestor de contraseñas, no en el repo.
3. Iniciar sesión (en una ventana de incógnito) con la **cuenta de prueba vendedora**, crear ahí una aplicación y copiar sus **credenciales de producción** (así las llama MP aunque sean de una cuenta de prueba): ese Access Token es el `MP_ACCESS_TOKEN` de prueba.
4. En la aplicación: **Webhooks → Configurar notificaciones**: URL `https://<tu-deploy-de-preview>/api/mercadopago/webhook`, evento **Pagos**. Copiar la **clave secreta** que muestra → `MP_WEBHOOK_SECRET`. Esta URL es **la única** vía de notificaciones: las preferencias no mandan `notification_url` (tendría prioridad sobre esta URL, la doc no dice que venga firmada y con credenciales de prueba no envía nada). Con el botón **Simular** de esa pantalla se puede mandar una notificación de prueba firmada.
5. Cargar las variables en un deploy de **Preview** de Cloudflare (con su propia base D1) y comprar con la **cuenta compradora de prueba** usando las tarjetas de prueba de la documentación (titular `APRO` = aprobado, `OTHE` = rechazado).
6. MP no puede llegar a `localhost`: para probar el webhook desde la compu hace falta un túnel (p. ej. `cloudflared tunnel --url http://localhost:5173`), cargar esa URL en **Webhooks → Configurar notificaciones** y `SITE_URL` con esa URL (para las `back_urls`: la doc pide no usar `localhost` ni `127.0.0.1` ahí, o el checkout termina en "Algo ha salido mal").
7. Recién cuando todo eso funcione: credenciales de la cuenta real, en Production.

## Resend

1. Crear cuenta en <https://resend.com>, **Domains → Add domain** `kinkyvibe.ar` y cargar los registros DNS (SPF/DKIM) que indica en Cloudflare DNS.
2. **API Keys → Create** con permiso _Sending access_ (idealmente limitada al dominio) → `RESEND_API_KEY`.
3. `TICKETS_FROM_EMAIL` con una dirección de ese dominio (por defecto `KinkyVibe <entradas@kinkyvibe.ar>`).

## Producción: base de datos

Ver [datos.md](datos.md). Antes de deployar código que trae una migración nueva, correr:

```sh
npm run db:migrate:remote        # = npx wrangler d1 migrations apply kinkyvibe --remote
```

Aplica solo las migraciones que falten (se puede correr cuantas veces se quiera). En producción ya están aplicadas de `0001` a `0010` (30/9/2026). Cada cambio de esquema va en una migración nueva.

(y lo mismo contra la base de preview, `kinkyvibe-preview`). Consultas útiles (solo lectura; los datos de producción son de personas reales, no se copian a issues ni PRs):

```sh
npx wrangler d1 execute kinkyvibe --remote --command "SELECT event_slug, status, COUNT(*) FROM orders GROUP BY 1, 2"
```

## Seguridad (resumen)

- **Precio:** solo desde el frontmatter en el servidor; el webhook además compara el monto y la moneda del pago con el total guardado en la orden.
- **Webhook:** firma HMAC-SHA256 con comparación de tiempo constante y `ts` de hasta 15 minutos; aun con firma válida, el estado se toma de la API de MP con nuestro token, nunca del body. Las notificaciones IPN viejas (`?topic=…`, sin firma) se ignoran.
- **Sobreventa:** reserva atómica (ver arriba); test con 30 compras concurrentes. Los tramos de preventa se controlan en la misma sentencia (tests de carrera con filas precargadas en `tiers.test.js`). Un pago de Mercado Pago aprobado después de vencida la reserva se acepta (la plata entró), pero si con eso el tipo pasa su cupo la orden queda **para revisar** (`needs_review = 'late_payment'`); otro pago aprobado para una orden ya pagada queda como `duplicate_payment` (posible cobro doble). Las dos se ven en `/admin/ventas` y en la página del evento ("⚠️ Para revisar", con "Marcar como revisada").
- **Reservas y abuso:** límites en capas en `?/buy` (`CHECKOUT_RATE_LIMITS` en `checkout.js`): primero por cliente (hash con sal de la conexión que rota cada día, `safeguards.js`; la IP no se guarda; una IPv6 cuenta por su red /64), un techo general holgado por evento y por email. Topes de reservas abiertas a la vez por evento (`HOLD_LIMITS` en `orders.js`, en la misma sentencia atómica que el cupo): por email (2 reservas y 20 entradas) y por cliente (40 entradas). Las transferencias arrancan con una reserva corta que se extiende al confirmarla desde el mail. Como mucho 3 mails de reserva o de entradas gratis por hora a una misma dirección y, si no es la dirección de la cuenta con sesión, 5 por día sumando todos los formularios que mandan mails a una dirección sin confirmar (`UNCONFIRMED_MAIL_CAP`; si la base falla, no sale). Una orden gratis por mail y evento salvo con la cuenta de ese mail. Los nombres no aceptan links ni caracteres de control. `TICKETS_CLIENT_SALT` (opcional, secreto) hace secreta la sal del hash de cliente.
- **Eventos de prueba:** los `prueba-entradas-*` del repo solo venden en `vite dev` (`isTestEventSlug` en `events.js`); en el sitio publicado no tienen venta.
- **Tokens:** 256 bits aleatorios (`crypto.getRandomValues`), únicos; el check-in es un único `UPDATE` condicional (dos escaneos simultáneos: gana uno). Las páginas con tokens o ids de orden mandan `Referrer-Policy: no-referrer`, `noindex` y `no-store`; las que tienen un formulario POST común (sin `use:enhance`), como los links de los mails y el gracias de las propinas, van con `same-origin` (con no-referrer el POST sale con `Origin: null` y SvelteKit lo rechaza; ver [mails.md](mails.md)).
- **Compras de este navegador:** la cookie httpOnly `kv_orders` (`path=/entradas`, 7 días) guarda las últimas 5 órdenes como `<orden>.<firma>`, separadas por `~`; la firma es `signLink` con la clave `orders_cookie_key` (se crea sola en `ticket_settings`, ver `signedLinks.js`), cortada a 16 caracteres. `rememberedOrders` (`checkout.js`) solo cuenta las entradas con la firma que puso el servidor; las demás se ignoran (las cookies viejas, sin firma, dejan de contar y la página de estado muestra la compra como a cualquiera: sin entradas y con el email enmascarado).
- **Admin:** cada `load`, cada form action y el CSV llaman a `requireAdmin` en el servidor (las form actions y los `+server.js` no pasan por el layout).
- **Mocks:** detrás de `dev` de `$app/environment`, que es `false` en el build: el módulo del mock, la sesión falsa y el fixture no llegan al worker de producción.
- **CSV:** se arma con `toCsv`/`csvResponse` (`$lib/admin/csv.js`), como los demás del panel: celdas que empiezan con `= + - @` se escapan (inyección de fórmulas) y las fechas (`fecha`, `ingreso`) van en hora de Argentina, `2026-10-02 22:30`.
- **Privacidad:** de quien compra, nombre, pronombres, email y DNI; de cada entrada, nombre y pronombres. En el navegador, el borrador del formulario (DNI incluido) vive solo en `sessionStorage` de esa pestaña y se borra al comprar; nunca en `localStorage`. El DNI nunca va en mails, logs, URLs ni en la página pública de la entrada (que muestra nombre y pronombres); solo lo ven les admins en las órdenes, el CSV y el control de ingreso. En el control de ingreso, lo que baja al celu (las sugerencias de «Buscar persona», la lista sin conexión, el resultado del escaneo) lleva solo los últimos 3 dígitos; el DNI completo se pide aparte con «ver completo», que queda en el registro de actividad (`order.reveal_dni`). Los datos por entrada viajan en la orden hasta que se emiten las entradas y ahí se borran de la orden.
- **Códigos:** revalidados en la misma sentencia atómica que el cupo; límite de intentos por cliente y evento, el mismo contador para "Aplicar" y para comprar con un código.
- **Transferencias:** confirmación solo de admins, idempotente, sin sobreventa al confirmar reservas vencidas.
- **Entradas:** quien tiene el link de una entrada no puede marcarse el ingreso (el form action `?/checkin` llama a `requireAdmin`: sin sesión redirige a `/login`, con sesión no admin a `/`; y la página no muestra el botón): tests en `src/routes/entradas/t/[token]/security.test.js`. El checkout simulado responde 404 fuera de `vite dev` con el mock (test en `simular-pago/[order]/gate.test.js`).
- **Link de transmisión:** solo en D1, nunca en el repo; se muestra solo en entradas de compras aprobadas.

## Verificación contra la documentación de Mercado Pago

Contrastado el 2026-09-29 con la documentación oficial de Mercado Pago Developers (español, Argentina), vía su buscador de documentación. Páginas (todas bajo `https://www.mercadopago.com/developers/es/docs/`):

- **[N]** `checkout-pro-preferences/payment-notifications` (Configurar notificaciones de pago)
- **[V]** `checkout-pro-preferences/additional-settings/term-of-preference` (Definir vigencia de preferencia)
- **[P]** `checkout-bricks/wallet-brick/advanced-features/preferences` (Configuraciones de preferencia: ejemplo completo, modo binario, vigencia, `statement_descriptor`, medios de pago)
- **[C]** `checkout-pro-preferences/create-payment-preference` (Crear y configurar una preferencia de pago)
- **[R]** `checkout-pro-preferences/configure-back-urls` (Configurar URLs de retorno)
- **[A]** `checkout-pro-preferences/additional-settings/opening-schema` (redirección con `init_point`)
- **[M]** `[[EXTEND]]/configure-payment-methods/checkout-pro` (tipos de pago en Argentina: `ticket` = Rapipago/Pago Fácil)
- **[S]** `checkout-api-payments/response-handling/query-results` (valores de `status` y `status_detail`)
- **[G]** `subscriptions/additional-content/payment-management` (`GET /v1/payments/{id}` y `/v1/payments/search`)
- **[I]** `checkout-bricks/payment-brick/payment-submission/cards` (header `X-Idempotency-Key`)

**Verificado (coincide con el código):**

- **Firma del webhook [N]:** header `x-signature` con formato `ts=…,v1=…` (se separa por `,` y cada parte por `=`); manifiesto `id:[data.id_url];request-id:[x-request-id_header];ts:[ts_header];`, con `data.id` tomado de los **query params** de la URL; si `data.id` es alfanumérico en mayúsculas va en minúsculas; si falta `data.id` o `x-request-id` se quita esa parte del manifiesto; HMAC-SHA256 con la clave secreta, en hex. Query params de la notificación: `data.id` y `type` (`type=payment`); el body trae `action`, `data.id`, `type`, etc. Hay que responder 200/201 en menos de 22 s.
- **`ts` [N]:** la doc dice "en milisegundos" y su ejemplo principal es `ts=1742505638683`, aunque otros ejemplos de la misma doc muestran `ts` en segundos (`1781009491`). El código acepta los dos; el checkout simulado ahora firma en milisegundos.
- **Canal firmado [N]:** la firma se documenta para la URL configurada en **Tus integraciones → Webhooks** (la clave secreta sale de ahí). La `notification_url` de la preferencia "tiene prioridad" sobre esa URL, la doc no dice que venga firmada, y "los pagos de prueba, creados con credenciales de prueba, no enviarán notificaciones" por esa vía. **Corregido:** la preferencia ya no manda `notification_url`.
- **Preferencia [P][C][V]:** `items[].id/title/quantity/unit_price/currency_id`; `payer.name` y `payer.email`; `external_reference`; `back_urls.success/failure/pending`; `auto_return: "approved"`; `expires: true` con `expiration_date_from`/`expiration_date_to` en ISO 8601 con milisegundos y huso (`2017-02-01T12:00:00.000-04:00`; usamos `-03:00`); `binary_mode: true` (solo aprobado o rechazado); `payment_methods.excluded_payment_types: [{ id: "ticket" }]` e `installments` (cuotas máximas); `statement_descriptor`. Para MLC la doc pide `unit_price` entero; nuestros precios ya son enteros.
- **Respuesta de la preferencia [C][A]:** `id` (p. ej. `787997534-6dad21a1-…`) e `init_point`, que es la URL a la que se redirige al comprador.
- **Pago [G][S]:** `GET /v1/payments/{id}` devuelve `status`, `status_detail`, `currency_id`, etc. Valores de `status`: `approved`, `authorized`, `in_process`, `pending`, `rejected`, `cancelled`, `refunded`, `charged_back`, `in_mediation` (todos mapeados en `mapPaymentStatus`).
- **Búsqueda [G]:** `GET /v1/payments/search` con `external_reference`, `sort`, `criteria` (`asc`/`desc`) y `limit` (máx. 50); la respuesta trae `paging` y `results`.
- **Parámetros de las back_urls [R]:** llegan por GET `collection_id`, `collection_status`, `payment_id`, `status`, `external_reference`, `payment_type`, `merchant_order_id`, `preference_id`, `site_id`… Usamos `payment_id` (o `collection_id`) solo para saber qué pago consultar, y comprobamos su `external_reference`.
- **Idempotencia [I]:** el header se llama `X-Idempotency-Key` (documentado para `POST /v1/payments`).

**Sigue sin verificar** (la doc consultada no lo dice):

- Si `POST /checkout/preferences` usa o ignora `X-Idempotency-Key` (solo está documentado para pagos; mandarlo no hace daño).
- Si `/v1/payments/search` acepta `sort=date_created` (la doc muestra `date_last_updated`, `id` y `external_reference`; igual se prioriza el pago aprobado entre los resultados).
- El id de tipo de pago `atm` en Argentina (la doc lo muestra solo para México y Perú; en Argentina el efectivo es `ticket`). El largo máximo de `statement_descriptor`.
- `sandbox_init_point`: la doc actual de Checkout Pro no lo menciona; se prueba con credenciales de producción de la cuenta de prueba vendedora y se usa `init_point`.
- Si los reintentos de un webhook (a los 15 min, 30 min, 6 h…, según [N]) conservan el `ts` original. Si lo conservan, un reintento posterior a 15 minutos se rechaza por viejo: el webhook se pierde, pero la página de estado vuelve a consultar el pago. Revisarlo en el historial de notificaciones de la aplicación cuando se pruebe.
- La API de pago en sí no se probó en vivo: los nombres de campos `external_reference` y `transaction_amount` en la respuesta de `GET /v1/payments/{id}` no aparecen en el extracto de la doc consultado (sí en la referencia de la API, que no se pudo abrir).
- **Resend** (`POST https://api.resend.com/emails`): campos `from`, `to`, `subject`, `html`, `text`, `reply_to`, y el header `Idempotency-Key`.

## Pendientes antes de vender de verdad

**Legal y comercial (Argentina)** — consultar con alguien que sepa; esto es una lista, no asesoramiento:

- **Defensa del Consumidor (Ley 24.240):** datos del proveedor visibles (razón social o nombre, CUIT, domicilio), precio final con impuestos, y el **botón de arrepentimiento** (Res. SCI 424/2020) en la home si se vende online, con su procedimiento. Revisar si aplica a entradas para eventos con fecha (hay excepciones discutidas).
- **Términos y condiciones** de compra y **política de reembolsos/cambios** (cancelación del evento, reprogramación, no-show, cambio de titular), enlazados desde el bloque de compra. Las condiciones que muestra hoy son un borrador. Qué pasa si se cancela o se reprograma ya está decidido ([0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)); el piloto abre sin `/legales`, que se retoma después.
- **Facturas:** facturas individuales solo a pedido, fuera del sitio (el sitio no emite ni promete facturas).
- **Datos personales (Ley 25.326):** aviso de privacidad (qué se guarda, para qué, cómo pedir la baja). Ahora también se guarda el DNI de quien compra.
- Verificación de edad: la casilla +18 es una declaración; el control real es en la puerta.

**Mercado Pago:**

- Elegir el **plazo de acreditación** (dinero disponible al instante con comisión más alta, o a 14/30 días con comisión menor) en la cuenta, y **cargar esa tasa en Ajustes de venta** (por defecto 2 %). gorrite decidió el plazo más largo que les sirva a les organizadores, para que el recargo de quien compra sea el más bajo (decisión [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)); gorrite lo eligió en la cuenta y cargó la comisión el 12/10 (`mp-plazo-comision` en el [plan](plan.md)). Si la comisión real es distinta, la organización recibe un poco más o menos que la base.
- Monto mínimo de un pago en MP: no verificado (afecta compras con descuentos grandes que dejan un total muy chico).
- **Reembolsos:** hay botón en el admin (reembolso total). Reembolsa cualquier admin y queda en Actividad; sin reembolsos parciales desde el panel por ahora: se hacen desde Mercado Pago y se anotan (decisión [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)).
- Probar contracargos y pagos aprobados después de vencida la reserva (hoy se aceptan y se loguea un aviso).

**Operación:**

- **Transferencias:** alguien tiene que revisar la cuenta y confirmar a mano (no hay verificación automática). Una reserva por transferencia bloquea cupo hasta las 20:00 del segundo día hábil (decisión 0031): con muchos mails distintos alguien podría bloquear el cupo (los topes por email y por cliente lo limitan); si pasa, cancelar desde el admin.
- **Borrar los eventos de prueba** (`prueba-entradas-2026-12.md` y `prueba-entradas-gorra-2026-12.md`) antes de vender de verdad.
- Una persona "dueña" de las credenciales y de revisar los logs (Cloudflare → Workers & Pages → Logs) durante las ventas.
- Probar el escaneo en la puerta con los celulares reales (Android/Chrome anda con la página; en iPhone, con la cámara del sistema) y con poca señal.

## Fase 2: productores amigues (marketplace)

Idea: que otres productores vendan en el sitio y el dinero vaya directo a su cuenta de MP, con una comisión para KinkyVibe. **Sin verificar contra la documentación actual:** Mercado Pago tiene un modelo _marketplace_ en el que el vendedor vincula su cuenta por **OAuth** (la plataforma obtiene un access token del vendedor), se crean las preferencias con ese token y se indica `marketplace_fee` para la comisión de la plataforma. Habría que confirmar requisitos (aprobación de MP, tipo de cuenta), cómo se renuevan los tokens, cómo se hacen reembolsos y la facturación de cada parte, y guardar los tokens cifrados (no en el repo ni en texto plano).

## Preguntas para les organizadores

Respondidas por gorrite el 12/10 (decisión [0044](decisiones/0044-reglas-de-la-venta-de-entradas.md)):

- **Evento cancelado:** se le devuelve todo a todes desde el panel (Reembolsar en cada orden, o «Reembolsar todas» para las de Mercado Pago, decisión [0051](decisiones/0051-reembolsar-todas-evento-cancelado.md)), o, si la persona prefiere, un taller grabado, como dice la política de devoluciones. Cancelar el evento no reembolsa solo ni manda un aviso: cada reembolso manda su mail. Para que no quede nada sin devolver, mientras un evento cancelado tenga órdenes aprobadas (sin reembolsar) o transferencias esperando comprobante todavía vigentes, el **Inicio** del panel lo muestra en «Para revisar», una fila por evento: «‹evento› está cancelado: 1 orden aprobada ($ 10.000) y 1 transferencia pendiente», con link a Órdenes (a Transferencias si solo quedan transferencias). Aparece aunque la fecha del evento ya haya pasado y se va sola cuando no queda nada; también vuelve si entra un pago después de cancelar (`cancelledLeftoversQuery` en `src/lib/server/admin/inicio.js`, `cancelledEventItems` en `review.js`). Solo avisa: no reembolsa ni cancela nada. Confirmar una transferencia de un evento cancelado (bandeja o ficha) se puede, pero pregunta antes con el aviso de los límites («El evento está cancelado.», `cancelledLimit` en `overrides.js`); confirmarlo no pasa por encima del cupo, que si hace falta se confirma aparte en el mismo aviso.
- **Evento reprogramado:** la entrada vale para la nueva fecha (es lo que dice el mail «Cambió la fecha»). Quien no pueda ir pide la devolución con el mismo plazo de siempre: hasta 5 días hábiles antes de la nueva fecha.
- **Plazo de acreditación de MP:** el más largo que les sirva a les organizadores, para que el recargo de quien compra sea el más bajo. gorrite ya lo eligió en la cuenta y cargó esa comisión en Ajustes › Cobros (12/10).
- **Tope del Fondo por evento:** sin tope, como hoy (cubre todas las entradas vendidas que elijan «con el descuento del fondo»). El panel muestra el Fondo usado en cada evento; si algún día hace falta un tope, se suma.
- **Aportes de las entradas solidarias / Sugar:** suman al total del mes del Fondo (y así al % de descuento), igual que las propinas al Fondo, sin anotar a nadie como Mecenas ni mostrarlos con nombre en fondo.kinkyvibe.ar. Falta que `/api/fondo/propinas-total` los sume, coordinado con kv-fondo (issue #265).
- **Solidaria pagada con un código de descuento:** el aporte es el completo (el código lo pone la organización), como hoy.
- **Cierre de la venta online:** al empezar el evento, como hoy. Cada evento puede cerrar antes (o cerrar un tipo antes) desde Editar › Entradas, y la puerta sigue vendiendo (modo puerta → «Vender en puerta», descuenta del cupo; `puerta: false` la apaga).
- **Quién reembolsa:** cualquier admin, como hoy (queda en Actividad como `order.refund`). Sin reembolsos parciales por ahora: se hacen desde Mercado Pago y se anotan.

Sigue abierto: el monto mínimo de un pago en MP (ver [Mercado Pago](#pendientes-antes-de-vender-de-verdad), arriba).
