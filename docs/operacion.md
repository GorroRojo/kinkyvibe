# Manual de operación

Qué hacer cuando algo se rompe en producción, quién puede hacer cada cosa y qué revisar antes de
una venta grande. Es para quien administra el sitio y para quien programa: listas cortas que
remiten a la guía de cada área en vez de repetirla. Sale de la auditoría de confiabilidad (F11,
F13, F22 y F4).

Nada privado acá (el repo es público): nombres, casillas, teléfonos, cuentas y quién tiene cada
acceso van en la Mesa. Donde dice «ver Mesa», el dato está ahí.

## Qué corre dónde

| Pieza                    | Dónde                                                                    | Qué hace                                                                                                                                                                           | Guía                                                                                         |
| ------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Sitio y panel            | Cloudflare, Worker `kinkyvibe` (dominio kinkyvibe.ar)                    | Todas las páginas, el panel, la API, los webhooks                                                                                                                                  | [workers-migracion.md](workers-migracion.md)                                                 |
| Publicación              | Workers Builds (Cloudflare, conectado al repo)                           | Cada push a `main` publica producción; cada otra rama, un preview con su base `kinkyvibe-preview`                                                                                  | [pruebas-y-ci.md](pruebas-y-ci.md)                                                           |
| Base                     | D1 `kinkyvibe` (binding `DB`)                                            | Todo el contenido, las ventas, las cuentas. Time Travel de 30 días                                                                                                                 | [datos.md](datos.md)                                                                         |
| Archivos                 | R2: `MEDIA` (biblioteca), `MEDIA_COPIA` (copia), `BACKUPS`               | Imágenes y archivos; copia nocturna de la biblioteca; backups de la base                                                                                                           | [imagenes.md](imagenes.md), [workers-migracion.md](workers-migracion.md#backups-de-la-base)  |
| Crons (solo producción)  | El mismo Worker (`[triggers]` de `wrangler.toml`, en UTC)                | Cada 15 min: recordatorios y tandas de mails, reintento del mail de las entradas, conciliación con Mercado Pago, avisos a admins y, una vez por hora, la salud del webhook del bot | [tickets.md](tickets.md), [mails.md](mails.md), [telegram.md](telegram.md#salud-del-webhook) |
|                          |                                                                          | 06:00 UTC (03:00 en Argentina): backup de la base a R2, integridad, copia de la biblioteca                                                                                         | [workers-migracion.md](workers-migracion.md#backups-de-la-base)                              |
|                          |                                                                          | 21:15 UTC: cotización del dólar para PayPal                                                                                                                                        | [propinas.md](propinas.md)                                                                   |
| Cobros                   | Mercado Pago → `POST /api/mercadopago/webhook`                           | Aprueba las órdenes. Si el webhook no llega, la página de estado y la conciliación del cron le preguntan a MP                                                                      | [tickets.md](tickets.md)                                                                     |
| Mails que salen          | Resend (dominio kinkyvibe.ar); rebotes por `POST /api/resend/webhook`    | Entradas, transferencias, recordatorios, avisos                                                                                                                                    | [mails.md](mails.md)                                                                         |
| Mails que llegan         | Cloudflare Email Routing (zona kinkyvibe.ar)                             | Reenvía las direcciones del dominio (`entradas@`…) a la casilla de la organización. Quién mira cada casilla: ver Mesa                                                              | [mails.md](mails.md#remitentes)                                                              |
| Bot de Telegram          | `POST /api/telegram` (webhook registrado con `npm run telegram:webhook`) | Vista del sitio por chat, puerta por Telegram, estado y avisos para admins                                                                                                         | [telegram.md](telegram.md)                                                                   |
| Vigilante de producción  | GitHub Actions (`vigilante-produccion.yml`), cada 30 min                 | Si el sitio no responde dos veces seguidas, abre el issue «Producción no responde» asignado al dueño del repo                                                                      | [pruebas-y-ci.md](pruebas-y-ci.md)                                                           |
| Login de admins          | OAuth App de GitHub (variables `GITHUB_CLIENT_*`)                        | La entrada al panel. Quiénes son admins: `ADMINS` en `src/lib/server/auth.js`. En qué cuenta de GitHub vive la app: ver Mesa                                                       | [panel.md](panel.md)                                                                         |
| Sistema vecino: el Fondo | fondo.kinkyvibe.ar (otro Worker, otro repo)                              | Comparte con este sitio la cuenta de Mercado Pago, el dominio de Resend, la cuenta de Cloudflare y el secreto `FONDO_MAIL_SECRET`                                                  | [mails.md](mails.md#mail-del-fondo-tu-link), [propinas.md](propinas.md)                      |
| Dominio y DNS            | NIC Argentina (titularidad) y Cloudflare (DNS)                           | Titularidad, renovación, vencimiento, medio de pago y recordatorios: ver Mesa                                                                                                      | —                                                                                            |

Salud en un vistazo: `https://kinkyvibe.ar/api/health` responde `ok`, si la base contesta, si
tiene la última migración del código y el commit publicado.

## Accesos

Cada cuenta de abajo tiene que tener **verificación en dos pasos** y **dos personas que puedan
entrar**. Quién tiene cada una: ver Mesa. Contraseñas y claves, nunca en el repo ni en la Mesa: en
un gestor de contraseñas compartido.

| Cuenta                      | Qué permite                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| Cloudflare (Super Admin)    | Todo lo de producción: variables y secretos, volver atrás, logs, D1 (migrar, restaurar), R2, DNS |
| GitHub (dueño del repo)     | Ajustes del repo, protección de `main`, secretos de Actions, la OAuth App del login              |
| GitHub (colaboradore)       | Mergear PRs (un revert también): suficiente para volver atrás el código sin Cloudflare           |
| Mercado Pago                | Credenciales, webhooks y su clave, reembolsos parciales, pagos                                   |
| Resend                      | Clave de la API, webhooks, estado de cada mail, lista de supresión, cupo                         |
| Telegram (@BotFather)       | El token del bot                                                                                 |
| NIC Argentina               | El dominio                                                                                       |
| Casillas de la organización | Lo que llega a las direcciones del dominio y a la de devoluciones                                |
| Admin del sitio (`ADMINS`)  | El panel: órdenes, reembolsos, transferencias, interruptores, puerta                             |

**Pendiente (gorrite: «Después»):** hoy hay una segunda persona admin del sitio, pero las cuentas
de arriba dependen de una sola persona y no hay gestor de contraseñas compartido (ver Mesa). La
recomendación de la auditoría (F4):

- [ ] Invitar a la segunda persona a Cloudflare como Super Administrator, con 2FA obligatoria.
- [ ] Sumarla como colaboradore en GitHub.
- [ ] Armar el gestor de contraseñas compartido con el inventario de accesos y de secretos.
- [ ] Prueba en seco, de solo lectura: `npx wrangler login` y
      `npx wrangler d1 migrations list kinkyvibe --remote`.
- [ ] Después, cambiar en las guías «hoy gorrite» por «quien tiene Super Admin en Cloudflare».

Hasta entonces, todo lo que en este manual dice «con la cuenta de Cloudflare» lo hace solo
gorrite. Lo que dice «desde el panel» lo puede hacer cualquier admin.

## Dónde llegan los avisos

- **«Para revisar» en el Inicio del panel**: mails que no salieron o rebotaron, pausas prendidas,
  el bot sin recibir mensajes, eventos cancelados con algo por devolver.
- **Issue «Producción no responde»** en GitHub, del vigilante, asignado al dueño del repo.
- **Bot de Telegram para admins** (interruptor `telegram_admin`, en «🔔 Mis avisos»): resumen
  diario, cada venta, cada transferencia y los cambios de Claude
  ([telegram.md](telegram.md#estado-y-avisos-para-admins-0041)).
- **Errores de la aplicación**: cada error que no es un 404 deja una línea JSON en los logs con un
  código corto, que la página de error muestra. Cuando esté el aviso automático de errores
  (`errores-alertas` en el [plan](plan.md)), va a llegar por el bot de admins; hasta entonces, se
  ven en los logs (Workers → kinkyvibe → Observability → Logs, o `npx wrangler tail kinkyvibe`).
- **Canal de incidentes** (dónde se avisa entre admins): ver Mesa.

## Revisión de rutina

**Cada semana** (cualquier admin, desde el panel):

- [ ] «Para revisar» del Inicio vacío o con todo entendido.
- [ ] Ajustes → Automatizaciones: el backup de anoche está y nada dice «con problemas».
- [ ] Ajustes → Interruptores: ninguna pausa de emergencia prendida sin motivo.
- [ ] Sin issue «Producción no responde» abierto.

**Cada mes** (con la cuenta de Cloudflare):

- [ ] Bajar el último backup a una compu, fuera de Cloudflare
      ([workers-migracion.md](workers-migracion.md#backups-de-la-base)).
- [ ] De vez en cuando, el simulacro de restauración en local
      ([Restaurar un backup](workers-migracion.md#restaurar-un-backup), b).
- [ ] Resend → Metrics: rebotes y quejas bajos ([mails.md](mails.md)).
- [ ] Recordatorio de vencimiento del dominio en el calendario (ver Mesa).

## Guía de incidente (cinco pasos)

1. **Confirmar.** Abrir el sitio y el panel desde otra red o el celu. Captura con la hora.
   `https://kinkyvibe.ar/api/health` dice si la base contesta.
2. **Avisar** en el canal de incidentes (ver Mesa): qué pasa, desde cuándo, la captura. Sin datos
   de compradores.
3. **Cortar el daño desde el panel**, si hace falta: cerrar la venta del evento (fecha de cierre
   o tipos agotados), apagar el interruptor de la parte que falla, «Reintentar» o «Reenviar» en
   «Para revisar».
4. **Arreglar** con la cuenta de Cloudflare o con un PR, según la receta de abajo.
5. **Cerrar:** avisar que volvió, revisar lo que quedó a medias (órdenes, mails, ingresos) y
   anotar qué pasó y qué falta para que no se repita (una línea en el [plan](plan.md) si queda
   trabajo).

Si alguien escribe por un error, pedile: la hora, la URL, una captura, el código que muestra la
página de error y qué hizo ya.

## Recetas

### El sitio no carga

- [ ] ¿Es todo el sitio o una página? ¿Responde `/api/health`? ¿Hay issue del vigilante?
- [ ] ¿Coincide con un merge reciente? → [Una publicación rompió algo](#una-publicación-rompió-algo).
- [ ] [cloudflarestatus.com](https://www.cloudflarestatus.com): si Cloudflare está caído, esperar
      y avisar; no hay nada para hacer de nuestro lado.
- [ ] `health` dice `atrasada`: falta aplicar una migración en producción
      (`npm run db:migrate:remote`, con la cuenta de Cloudflare; [datos.md](datos.md)).
- [ ] Logs del Worker (Observability → Logs) o `npx wrangler tail kinkyvibe`, buscando
      `"area":"error"`.
- [ ] El dominio no resuelve: DNS en Cloudflare y vencimiento del dominio (ver Mesa).

**Noche de evento con el sitio caído:** la puerta sigue con la lista guardada si se abrió antes
con conexión (si hay señal pero no valida, modo avión); la puerta por Telegram, si estaba
preparada; y el plan B en papel ([tickets.md](tickets.md#puerta-cómo-hacerla)). Con GitHub caído
nadie puede entrar al panel: lo mismo vale.

### Una publicación rompió algo

Del más rápido al más lento ([workers-migracion.md](workers-migracion.md#volver-atrás-rollback)):

1. **Volver a la versión anterior** (con la cuenta de Cloudflare): Workers → kinkyvibe →
   Deployments → la versión anterior → Rollback. O en la terminal:

   ```sh
   npx wrangler deployments list     # qué versión está publicada y las anteriores
   npx wrangler rollback             # vuelve a la anterior (o pasale la versión que elegiste)
   ```

   Dura hasta el próximo push a `main`: el paso 2 va igual.

2. **Revertir el PR** (sin Cloudflare, lo puede hacer una sesión):
   `git revert -m 1 <sha-del-merge>` en una rama nueva, PR, CI verde, merge. Workers Builds
   publica solo.
3. Si el problema son datos que el código rompió, ver [Datos rotos](#datos-rotos-o-borrados).

Un build que falla en Workers Builds no publica nada: producción sigue con la versión anterior.
El log está en el link «Details» del check del commit.

### Una compra falla

- [ ] ¿Falla para todes o para una persona? Probar la página de compra de un evento (sin pagar).
- [ ] ¿Hay pausa de emergencia (`TICKETS_PAUSED`) o la venta del evento está cerrada?
- [ ] [status.mercadopago.com](https://status.mercadopago.com) o el panel de MP.
- [ ] Logs: buscar la ruta de compra o `"area":"error"` y el código que vio la persona.
- [ ] Si hay que frenar la venta online entera ya: `TICKETS_PAUSED`
      ([interruptores.md](interruptores.md#pausas-de-emergencia)). La puerta y la carga a mano
      siguen.
- [ ] Pagó y no tiene entradas: la orden en Ventas › Órdenes. Si sigue pendiente, la conciliación
      del cron la aprueba sola en menos de una hora (ver la receta siguiente).

### El webhook de Mercado Pago no llega

Los pagos igual entran: la página de estado consulta a MP y la conciliación del cron pregunta cada
15 minutos por las órdenes sin aprobar de las últimas 72 h ([tickets.md](tickets.md)). Pero hay
que arreglarlo.

- [ ] Logs: líneas `[conciliacion] … aplicado sin webhook` seguidas = el webhook no está llegando.
- [ ] MP → Tus integraciones → Webhooks: la URL es `https://kinkyvibe.ar/api/mercadopago/webhook`
      y los envíos fallidos dicen con qué código.
- [ ] 503 o rechazos por firma: `MP_WEBHOOK_SECRET` no coincide con la clave de MP. Cambiarla en
      los dos lados a la vez ([inventario](workers-migracion.md#3-variables-y-secretos-de-producción)).
- [ ] 5xx: es un error nuestro; MP reintenta solo. Buscar el código en los logs.

### Los mails no llegan o rebotan

- [ ] Una persona: la receta paso a paso está en
      [mails.md](mails.md#alguien-dice-que-no-le-llegó-la-entrada).
- [ ] Muchas: Resend → Emails y Metrics. ¿Cupo agotado (429)? ¿`RESEND_API_KEY` cargada?
      ([mails.md](mails.md#cupo-de-resend-y-errores-pasajeros)). El mail de las entradas se
      reintenta solo 48 h.
- [ ] Rebotes o quejas en masa: `MAILS_PAUSED` frena las tandas y deja los mails de cada compra
      ([interruptores.md](interruptores.md#pausas-de-emergencia)). Revisar
      [Rebotes y quejas](mails.md#rebotes-y-quejas).
- [ ] Rebota lo que **nos** escriben (a `entradas@` u otra dirección del dominio): Cloudflare →
      zona kinkyvibe.ar → Email Routing (reglas y casilla de destino).

### El bot de Telegram no contesta

- [ ] «Para revisar» dice «El bot de Telegram no está recibiendo mensajes»: volver a registrar el
      webhook con `npm run telegram:webhook` ([telegram.md](telegram.md#salud-del-webhook)).
- [ ] Interruptor `telegram_bot` prendido; `TELEGRAM_BOT_TOKEN` y `TELEGRAM_WEBHOOK_SECRET`
      cargados.

### Datos rotos o borrados

Primero, ¿se puede deshacer desde el panel? Las ediciones tienen historial y los borrados del panel
se recuperan ([contenido.md](contenido.md)). Volver la base atrás es el último recurso: **pisa
todo lo escrito después**, ventas y webhooks incluidos.

Con la cuenta de Cloudflare, solo si pasó hace menos de 30 días:

```sh
# 1. Backup manual de cómo está ahora (POST /api/cron/backup, ver workers-migracion.md, paso 6)
# 2. Anotar el bookmark de ahora, para poder deshacer la restauración
npx wrangler d1 time-travel info kinkyvibe
# 3. Volver a un momento de antes del problema (UTC)
npx wrangler d1 time-travel restore kinkyvibe --timestamp=2026-10-01T05:00:00Z
# Para deshacer: restaurar al bookmark anotado en el paso 2
npx wrangler d1 time-travel restore kinkyvibe --bookmark=<el bookmark anotado>
```

Después, rehacer a mano lo que entró entre el problema y la restauración (órdenes aprobadas,
transferencias confirmadas), mirándolo en el backup del paso 1. Si pasó hace más de 30 días, o si
solo hay que recuperar unas filas, restaurar un backup nocturno en una base nueva y copiar lo
necesario ([Restaurar un backup](workers-migracion.md#restaurar-un-backup), c). Para una copia
propia, usá esos backups: `wrangler d1 export` falla con las tablas virtuales FTS5 de la base.

### Se filtró una clave

1. Rotarla donde nace y cargar la nueva en Cloudflare (Worker kinkyvibe → Settings → Variables and
   Secrets → Production, o `npx wrangler secret put <NOMBRE>`, pegada, nunca tipeada). Qué se
   sincroniza con qué al rotar: el
   [inventario de variables y secretos](workers-migracion.md#3-variables-y-secretos-de-producción).
   Los casos con trampa: `MP_WEBHOOK_SECRET` (cambiar en MP a la vez), `FONDO_MAIL_SECRET` (el
   mismo valor en el Worker del Fondo), `TELEGRAM_*` (después, `npm run telegram:webhook`),
   `GITHUB_CLIENT_SECRET` (generar otro en la OAuth App y borrar el viejo).
2. Tokens de API de Cloudflare: Mi perfil → API Tokens → revocar. Secretos de GitHub Actions:
   Settings del repo → Secrets.
3. Conector de Claude: Ajustes → Admins → «Cerrar las de todes»
   ([conector-claude.md](conector-claude.md#cómo-cortarlo)).
4. Une admin que ya no tiene que entrar: PR que le saca de `ADMINS` en `src/lib/server/auth.js`;
   vale al publicarse.
5. Si la clave quedó en el repo, rotarla igual (borrar el commit no alcanza) y avisarle a gorrite
   en privado.

Si se pierde la OAuth App del login: crear otra en GitHub con el callback `/callback`, cargar
`GITHUB_CLIENT_ID` y `GITHUB_CLIENT_SECRET` y volver a publicar. Mientras, la puerta por Telegram
anda si estaba prendida.

## Cortes de emergencia

| Para                         | Dónde                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frenar la venta online       | `TICKETS_PAUSED` en Cloudflare ([interruptores.md](interruptores.md#pausas-de-emergencia))                                                         |
| Frenar los mails en tanda    | `MAILS_PAUSED` en Cloudflare (mismo lugar)                                                                                                         |
| Apagar una parte nueva       | Ajustes → Sistema → Interruptores; de golpe, sin panel: la variable `<INTERRUPTOR>_ENABLED=0` en Cloudflare ([interruptores.md](interruptores.md)) |
| Cortar el conector de Claude | Interruptor `conector_claude` (o solo `conector_claude_edicion` para que no cambie nada); de golpe: `CONECTOR_CLAUDE_ENABLED=0`                    |
| Cerrar la venta de un evento | En su ficha: fecha de cierre de la venta o tipos agotados                                                                                          |

Las pausas de Cloudflare no se van solas con la próxima publicación (`keep_vars = true`): hay que
sacarlas a mano.

## Antes de una venta grande o de un evento con entradas

- [ ] **No mergear** a `main` durante la venta ni la noche del evento, salvo un arreglo urgente de
      eso mismo. Tampoco aplicar migraciones.
- [ ] La lista de mails antes de una preventa: cupo de Resend, calentar el dominio, abrir por
      tramos ([mails.md](mails.md#antes-de-la-primera-preventa-grande)).
- [ ] Una compra de prueba con Mercado Pago hasta las entradas en el mail, y el webhook con 200 en
      los logs.
- [ ] Datos para transferir cargados y quién confirma transferencias (ver Mesa).
- [ ] Puerta: quién está (ver Mesa), la guía corta leída
      ([tickets.md](tickets.md#puerta-cómo-hacerla)), la pantalla abierta con conexión hasta
      «Listo para sin conexión», plan B en papel.
- [ ] `telegram_bot` y `telegram_puerta` prendidos y el Telegram vinculado de al menos dos admins
      ([telegram.md](telegram.md#la-puerta-por-telegram-0037)).
- [ ] Alguien con la cuenta de Cloudflare a mano durante la venta (hoy, gorrite).

Si hay que cancelar el evento: [tickets.md](tickets.md#cancelar-un-evento-con-entradas-vendidas).
