# Cuentas del público

## Qué hace

Cualquier persona puede tener una cuenta en el sitio, **opcional**: entra en **"Ingresar"**
(`/ingresar`) con un código de 6 números que le llega por mail o, si puso una, con su contraseña.
En **"Mi rincón"** (`/mi-rincon`) ve su mail, sus compras (también las de antes de tener cuenta),
pone, cambia o saca la contraseña, cierra sesión (en ese navegador o en todos lados) o borra la
cuenta. Tocar la contraseña y borrar la
cuenta piden además un código fresco por mail (ver "Acciones delicadas").

Es la parte 1 del bloque "cuentas y perfiles" (decisión 0002); la parte 2 son los perfiles (ver
"Perfiles" más abajo). Las passkeys y la compra con cuenta vienen después. Les admins siguen entrando con GitHub en `/login`: son dos
cosas separadas (`locals.user` para admins, `locals.member` para cuentas) y una no toca a la otra.

Todo está **detrás del interruptor `cuentas`, apagado**: sin prenderlo, `/ingresar` y
`/mi-rincon` dan 404 y el encabezado no muestra nada.

## Cómo prenderlo

- **Desde el panel:** Ajustes → Interruptores → "Cuentas del público" → Prender. Tarda hasta 30
  segundos en verse en todo el sitio (cada isolate recuerda el valor un rato) y queda en el
  registro de actividad.
- **Variable `CUENTAS_ENABLED`** (panel de Cloudflare): `1` lo fuerza prendido, `0` lo fuerza
  apagado aunque el panel diga otra cosa (sirve para cortarlo de golpe). Sin la variable, manda el
  panel.
- Antes, en producción: aplicar la migración `0013_cuentas.sql` y tener `RESEND_API_KEY`. En un
  preview, los códigos solo llegan a las direcciones de `EMAIL_ALLOWLIST` (ver [mails.md](mails.md)).
- En local: `CUENTAS_ENABLED=1 npm run dev`. Sin `RESEND_API_KEY`, el mail no sale y el código se
  ve en la consola de `vite dev` (solo en dev).

## Lo que nunca se tiene que romper

- **La compra sigue funcionando sin cuenta.** Nada de esto cambia el checkout.
- **Ningún secreto en claro en la base:** del token de sesión y del código por mail se guarda
  solo el SHA-256; de la contraseña, PBKDF2. El mail no se guarda en `login_codes` ni en
  `rate_limits` (solo su hash) y la IP no se guarda nunca.
- **Ningún mensaje dice si un mail tiene cuenta o contraseña.** Pedir un código responde igual
  para cualquier mail (la cuenta se crea recién al verificarlo); con contraseña, el mismo
  "El mail o la contraseña no coinciden" en los tres casos, y cuesta el mismo tiempo (se calcula
  un PBKDF2 igual).
- **Al borrar la cuenta, las órdenes quedan** (decisión P7.6), desvinculadas: `orders.account_id`
  pasa a `NULL`. Se borran las sesiones y los códigos pendientes, y la fila de `accounts` queda
  sin ningún dato (sin mail, sin contraseña, con `deleted_at`).
  Antes se sueltan sus perfiles (`closeAccount()` en `src/lib/server/cuentas/index.js` →
  `releaseAccountProfiles()` en `perfiles.js`):
  - sus **perfiles de persona** (también los que ya había borrado) **se vacían**: sin
    presentación, pronombres, links, imagen ni texto de búsqueda, con el nombre «Perfil borrado»,
    sin los grupos de los que eran parte, sin su fila de gestión ni sus bloqueos, y con
    `created_by` y `updated_by` = `cuenta:borrada` (el mismo para todas las cuentas borradas, así
    nada los vincula entre sí). La fila queda, borrada (borrado suave), solo para que la dirección
    no la use otra persona;
  - cada **grupo** pasa a quien lo gestiona hace más tiempo, con sus datos (son del grupo), o se
    borra (suave, con sus datos) si no queda nadie;
  - se borran las invitaciones que mandó.

  El código se verifica antes de empezar. Soltar los perfiles no entra en una sola tanda (cada
  perfil se guarda con `saveObject()`), así que está hecho para poder correrse de nuevo: si algo
  falla a la mitad, la cuenta sigue viva y el próximo intento termina; si otro guardado se cruza
  con un perfil, se vuelve a leer y se reintenta. La cuenta se borra recién al final, en una
  tanda.

- **Las compras se ven solo con el mail verificado** (P7.5): una orden aparece si tiene el
  `account_id` de la cuenta o si su `buyer_email` (sin importar mayúsculas) es el mail verificado.
  Solo lectura: no se modifica ninguna orden. Se muestran las aprobadas, las que esperan la
  transferencia y las reembolsadas.

## Cómo funciona

### Tablas (`migrations/0013_cuentas.sql`)

| Tabla               | Qué guarda                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts`          | id (UUID al azar), mail normalizado y único, cuándo se verificó, hash de la contraseña (opcional), preferencias (JSON), fechas y `deleted_at` |
| `account_sessions`  | hash del token, cuenta, cómo se entró (`code`, `password`; `passkey` reservado), creada y última vez vista                                    |
| `login_codes`       | hash del mail, para qué es (`purpose`), hash del código, intentos, vencimiento y uso                                                          |
| `feature_flags`     | los interruptores del panel (`cuentas` es el primero)                                                                                         |
| `orders.account_id` | columna nueva, para la compra con cuenta que viene; `ON DELETE SET NULL`                                                                      |

Sin "nombre para mostrar" (P7.3): los nombres van a ir en los perfiles. Las **passkeys** van a
ir en una tabla propia (`account_passkeys`, apuntando a `accounts.id`); no hace falta cambiar
nada de estas tablas para sumarlas.

### Código por mail

- 6 cifras al azar (sin sesgo), **10 minutos**, **5 intentos** por código, un solo uso. Pedir
  otro anula el anterior del mismo `purpose`.
- Cada código tiene un `purpose`: `login` (ingresar), `password` (poner, cambiar o sacar la
  contraseña), `delete` (borrar la cuenta) o `grupo` (acciones de dueñes de un grupo y borrarlo,
  ver "Perfiles"), y solo sirve para ese. Uno de ingreso no confirma nada y uno de confirmación
  no sirve para ingresar.
- Se guarda `SHA-256("<id de la fila>:<purpose>:<código>")`: el id, al azar, hace de sal.
- Cada intento suma al contador en la misma sentencia que busca el código, antes de comparar
  (dos intentos a la vez no pueden pasarse de 5). La comparación es en tiempo constante.
- El mail sale por el mismo camino que los de entradas (`deliverEmail` →
  `deliver()` de `src/lib/server/tickets/index.js`): Resend, remitente de Ajustes → Mails y el
  filtro de los previews. El código no va en el asunto.

### Límites de intentos (`rate_limits`)

| Qué                           | Límite                                      |
| ----------------------------- | ------------------------------------------- |
| Pedir código, por mail        | 3 cada 15 minutos y 10 por día              |
| Pedir código, mail + conexión | 4 por día                                   |
| Pedir código, por conexión    | 10 cada 15 minutos                          |
| Escribir código, por conexión | 20 cada 15 minutos (además de 5 por código) |
| Contraseña, por mail          | 10 cada 15 minutos                          |
| Contraseña, por conexión      | 20 cada 15 minutos                          |
| Mails de cuentas, en total    | 300 por hora (códigos y avisos)             |

"Conexión" es el `clientHash` de las entradas: la IP con una sal que cambia cada día, hasheada.
Una IPv6 cuenta por su red /64 entera (`clientNetwork` en `src/lib/server/tickets/safeguards.js`):
a cada casa o servidor le toca por lo menos una /64, así que contar cada dirección por separado
dejaría saltar los límites. Las IPv4 cuentan igual que antes.

El **tope global** (`src/lib/server/cuentas/mailCap.js`) suma todos los mails de cuentas que
salen (códigos de ingreso, códigos para confirmar y avisos de invitación), de cualquier conexión
y a cualquier mail: estos mails usan la misma cuenta de Resend que los de las entradas, y así
nunca se comen ese cupo. Cuenta solo los mails que pasaron los otros límites. Si se llega, pedir
un código responde "Estamos mandando muchos mails en este momento. Probá en un rato." (el mismo
texto para cualquier mail, así no dice nada de la dirección) y los avisos de invitación no salen
(la invitación se crea igual y aparece en Mi rincón).
Los límites se miran en orden (conexión, mail + conexión, mail cada 15 minutos, mail por día) y
cada uno suma solo si pasó el anterior: un pedido rechazado no gasta el cupo del mail, y una sola
conexión puede pedir como mucho 4 de los 10 códigos diarios de un mail, así no deja a otra persona
sin poder entrar. Los códigos para confirmar comparten estos mismos contadores.
Con 5 intentos por código y 10 códigos por día, adivinar un código tiene como mucho 50 chances
en un millón por día y por mail. Si alguien bloquea la contraseña de otra persona a propósito,
el código por mail sigue andando.

### Contraseña (`src/lib/server/cuentas/password.js`)

- **PBKDF2-HMAC-SHA256** con Web Crypto (anda en Workers sin módulos nativos).
- **100.000 iteraciones**: es el máximo que acepta Cloudflare Workers. OWASP recomienda 600.000
  para PBKDF2-SHA256; lo compensan los límites de arriba, el largo mínimo y que el código por mail
  es la vía principal. El formato guarda las iteraciones
  (`pbkdf2-sha256$100000$<sal>$<hash>`): si se pueden subir, los hashes viejos se rehacen solos
  en el próximo ingreso.
- **Sal de 16 bytes** al azar por contraseña y **clave de 32 bytes**.
- Contraseñas de **10 a 200 caracteres**, normalizadas a Unicode NFC.
- Poner, cambiar o sacar la contraseña cierra las otras sesiones de la cuenta (la actual sigue
  abierta).

### Sesiones (`src/lib/server/cuentas/session.js`)

- Duran **hasta cerrar sesión** (P7.11): el servidor no las vence nunca.
- Cookie `kvRincon`: token al azar de 256 bits, `HttpOnly`, `Secure` (salvo http://localhost),
  `SameSite=Lax`, 400 días (el máximo de los navegadores). `last_seen_at` se actualiza como
  mucho una vez por día y, cuando pasa, la cookie se vuelve a mandar con 400 días más.
- En Mi rincón, "Cerrar sesión en todos lados" (`?/salirTodos`) cierra todas las sesiones de la
  cuenta, también la de ese navegador, y vuelve a `/ingresar` con un aviso. No pide código: solo
  saca acceso.
- `hooks.server.js` carga `locals.member` (`{ id, email }`) solo si hay cookie y el interruptor
  está prendido.

### Otras protecciones

- Formularios con form actions de SvelteKit: el chequeo de origen de SvelteKit frena el CSRF.
- `?next=` en `/ingresar` pasa por `safeRedirect`: solo rutas de este sitio.
- `/ingresar` y `/mi-rincon` no se pueden mostrar dentro de un iframe
  (`src/lib/server/securityHeaders.js`), llevan `cache-control: private, no-store` y `noindex`.
- Borrar la cuenta pide escribir «borrar» en la misma página, además del código (abajo).

### Acciones delicadas: código fresco por mail

Como la sesión dura para siempre, tenerla no alcanza para poner, cambiar o sacar la contraseña
ni para borrar la cuenta: quien encuentre un navegador abierto no puede hacerlo sin el mail.

- En Mi rincón, el botón manda un código (`?/confirmar`, con `para=password` o `para=delete`):
  "Te mandamos un código a tu mail para confirmar", después el campo del código y después la
  acción, todo en la misma página, sin ventanas de confirmación.
- La acción verifica y gasta el código del `purpose` que corresponde. Antes chequea lo que no
  gasta el código (que las contraseñas coincidan, «borrar»), así un error de tipeo no obliga a
  pedir otro.
- Los mismos límites que los códigos de ingreso, con los mismos contadores: los mails por
  dirección y los intentos por conexión se suman entre ingresar y confirmar.
- En la página de un grupo pasa lo mismo con hacer dueñe a alguien, sacarle la propiedad o sacar
  a otre dueñe, y borrar el grupo (`para` no existe ahí: `?/confirmar` manda siempre uno de
  `grupo`; ver "Perfiles").

### Evento que pide cuenta (P7.1)

Por ahora solo el hook: `eventRequiresAccount(meta)` en `src/lib/server/cuentas/index.js` lee
`requiere_cuenta: true` del frontmatter del evento. La compra todavía no lo usa.

## Perfiles

Parte 2 del bloque (decisiones A2, E1 y B3 de gorrite). Una cuenta puede tener **varios
perfiles**, de dos tipos:

- **Persona**: separados entre sí y **nunca vinculados de forma visible**. Nada de lo que ve el
  público u otra cuenta dice que dos perfiles son de la misma cuenta.
- **Grupo**: lo gestionan varias cuentas. Mostrar sus integrantes es opcional por grupo
  (`show_members`). **Quienes gestionan no se muestran nunca**, ni en público ni a otras cuentas:
  solo lo ven, en Mi rincón, las otras cuentas que gestionan ese mismo grupo (y les admins).

No hay "nombre para mostrar" aparte (E1): el nombre del perfil es el `title` del objeto. Los
lugares (B3) pueden sumarse más adelante como otro tipo de perfil; nada de esto lo impide.

**Todavía no hay página pública de perfiles.** Los perfiles de amigues siguen siendo archivos
`.md` y no se tocan. `getPublicProfile()` ya arma lo que mostraría esa página (lista blanca de
campos), pero nadie la usa todavía.

### Páginas (detrás del mismo interruptor `cuentas`)

- `/mi-rincon/perfiles`: los perfiles que gestiona la cuenta, crear uno (persona o grupo, nombre
  y quién lo puede ver) y las invitaciones a gestionar grupos que le llegaron.
- `/mi-rincon/perfiles/[slug]`: editar nombre, pronombres, presentación, links y visibilidad.
  - En un grupo: sumar integrantes (con la dirección del perfil de la persona) o sacarlos, ver
    quiénes lo gestionan, invitar, cambiar roles, sacar gente, dejar de gestionar y borrar.
  - En una persona: los grupos que la sumaron, salir de cada uno con un clic, y borrar.
- En `/mi-rincon/perfiles` también están todos los grupos que sumaron a alguno de tus perfiles de
  persona ("Te sumaron a…"), cada uno con su botón para salir.
- Si la cuenta no gestiona ese perfil, da 404 (como si no existiera). Sin sesión, lleva a
  `/ingresar`. Con el interruptor apagado, todo da 404.
- Sin ventanas de confirmación: borrar pide escribir el nombre del perfil en la misma página (y,
  si es un grupo, el código por mail).

### Modelo

- El perfil es un objeto de tipo núcleo `perfil` ([objetos.md](objetos.md)) y se escribe **solo
  con `saveObject()`**. Visibilidad: la del modelo de objetos (`public`, `members`, `hidden`).
  Un perfil oculto lo ven solo les admins: para los perfiles, haberlo creado no da acceso
  (`NO_CREATOR_ACCESS` en `visibility.js`), porque quien creó un grupo puede dejar de
  gestionarlo. Quienes lo gestionan lo ven igual en Mi rincón, porque esas lecturas pasan por
  `profile_managers` (ver abajo).
- **Quién gestiona qué** va en `profile_managers` (migración `0014_perfiles.sql`): las cuentas no
  son objetos, así que no puede ser un edge. Columnas: `profile_id` → `objects(id)` y
  `account_id` → `accounts(id)`, las dos con `ON DELETE CASCADE`, y `role`:
  - `owner` (dueñe): todo, incluso invitar, sacar gente, cambiar roles y borrar el perfil;
  - `manager`: edita el perfil y suma o saca integrantes.

  Un perfil de persona tiene una sola fila (su dueñe). La fila de le dueñe se crea en la misma
  tanda que el perfil (opción `also` de `saveObject()`): o entran los dos o ninguno.

- **Invitaciones a gestionar** en `profile_invites`: solo el hash del mail (el mismo de
  `login_codes`), vencen a los 14 días. `invited_by` pasa a `NULL` si se borra de verdad la
  cuenta que invitó.
  - Les dueñes ven en la lista de pendientes quién mandó cada una (el mail de esa cuenta, que es
    otre dueñe del grupo); nunca el mail invitado. Les `manager` no ven las invitaciones.
  - Si alguien deja de ser dueñe (le sacan la propiedad, le sacan de la gestión o se va), sus
    invitaciones pendientes se borran en la misma tanda. Al borrar una cuenta, también.
- **Integrantes**: edges `es_integrante_de` desde el perfil de una persona hacia el del grupo, sin
  datos extra. Los suma directamente quien gestiona el grupo (sin pedido ni aprobación) y se
  escriben con `saveObject()` sobre el perfil de la persona, con la versión que está guardada en
  ese momento (si otro guardado se cruza, se vuelve a leer y se reintenta: nunca se pisa lo que la
  persona editó).
- **Bloqueo después de irse** en `profile_member_blocks` (también en la migración 0014): grupo,
  perfil de persona y hasta cuándo, nada más. No es un edge porque los edges se leen con
  `getEdges()` y cualquiera que viera los dos perfiles se enteraría de que esa persona estuvo en
  el grupo; no entra en `rate_limits` porque ahí nada dura más de 24 horas. Solo la usa
  `perfiles.js`, nunca se muestra, y las filas vencidas se borran al sumar a ese grupo.
- `created_by` y `updated_by` de los objetos solo los ven les admins (`forViewer()` en
  `src/lib/server/objects/read.js`): así ninguna lectura pública ni de cuentas vincula dos
  perfiles por quién los creó. Una cuenta figura como autora con el prefijo `cuenta:<id>`.

### Reglas (todas en `src/lib/server/cuentas/perfiles.js`; las páginas no deciden nada)

- Solo quien gestiona un perfil lo ve en Mi rincón y lo edita.
- Editar manda la `version` que se abrió. Si alguien guardó en el medio, no se guarda nada y
  aparece "Alguien lo cambió mientras tanto…", con lo que la persona había escrito aparte para
  que no lo pierda.
- **Sumar gestión por mail, sin revelar si ese mail tiene cuenta.** Une dueñe escribe un mail y
  la respuesta es siempre la misma (tenga cuenta, no la tenga, o ya gestione el grupo). La
  cuenta que entra con ese mail **verificado** ve la invitación en Mi rincón → Perfiles y la
  acepta (queda como `manager`) o la rechaza.
- **Aviso por mail de la invitación.** Si hay una cuenta verificada y no borrada con ese mail (y
  todavía no gestiona el grupo), le llega un aviso corto: "Te invitaron a gestionar un perfil en
  KinkyVibe", con el nombre del grupo y el link a `/mi-rincon/perfiles`. Nunca lleva el mail de
  quien invitó. Sale por el mismo camino y con el mismo remitente que los códigos de ingreso
  (`deliverEmail`, que en los previews respeta `EMAIL_ALLOWLIST`).

  Cómo no revela nada: `inviteManager()` hace lo mismo antes de responder haya o no cuenta
  (permisos, límites, guardar la invitación) y **no busca la cuenta**. Buscarla, el límite por
  destinatarie y mandar el mail van en una tarea aparte (`sendInviteNotice()`) que se le pasa a
  `ctx.waitUntil`: la respuesta sale sin esperarla (`inviteNotice()` en `perfilesWeb.js`; sin
  `ctx`, como en `vite dev`, se la deja correr sin esperarla). Si el mail falla, queda en el log y
  la invitación sigue en Mi rincón igual.

- **Límites de invitaciones** (`INVITE_RATE_LIMITS`, tabla `rate_limits`), además de las 20
  pendientes por grupo: 10 por hora por grupo y 20 por hora por cuenta que invita (se cuentan
  siempre, así el "esperá un rato" no dice nada del mail), y 3 avisos por día a un mismo mail,
  de cualquier grupo. Este último no se le muestra a quien invita: la invitación se crea igual y
  solo no sale el mail.
- **Integrantes: el grupo suma directamente**, con resguardos:
  - solo perfiles de persona que la cuenta que suma **puede ver** (`getObject` con su
    visibilidad), por la dirección del perfil, y **nunca uno oculto**, aunque sea propio. Para
    todo lo demás (oculto, de grupo, borrado, inexistente) la respuesta es la misma: "No
    encontramos ese perfil de persona";
  - la persona lo ve en Mi rincón → Perfiles ("Te sumaron a…") y **se va con un clic cuando
    quiera**, sin aprobación de nadie, aunque el grupo esté oculto o borrado;
  - si se va, **ese grupo no la puede volver a sumar por 30 días** (`profile_member_blocks`).
    Si el grupo la saca, no hay bloqueo;
  - `show_members` muestra solo les integrantes que quien mira puede ver (`getEdges` pasa cada
    perfil por la visibilidad). Si une integrante pasa a oculto, deja de aparecer en todos lados,
    también en la lista de quienes gestionan el grupo;
  - quienes gestionan no se muestran nunca, y nada vincula entre sí los perfiles de persona de
    una misma cuenta: cada uno es integrante por su lado. Solo la propia cuenta ve, en su Mi
    rincón, qué perfil suyo está en qué grupo.
- **Acciones de dueñes con código fresco.** Hacer dueñe a alguien, sacarle la propiedad a otre
  dueñe, sacar a otre dueñe de la gestión y borrar un grupo piden un código por mail (purpose
  `grupo`), con el mismo patrón que la contraseña en Mi rincón: "Mandame un código para
  confirmar", el campo del código y la acción, en la misma página. Así, con solo una sesión
  abierta ajena no se puede quedar con un grupo. Lo decide `perfiles.js` (opción `stepUp` de
  `setManagerRole`, `removeManager` y `deleteProfile`), después de chequear permisos: un pedido
  sin permiso no gasta el código. Sacar a une manager, sacarse la propiedad a une misme, dejar de
  gestionar y borrar un perfil de persona no lo piden.
- **Siempre queda al menos une dueñe.** Le última dueñe no puede irse ni perder la propiedad:
  primero hace dueñe a otra persona. La condición va en la misma sentencia SQL, así dos cambios a
  la vez no pueden dejar al grupo sin dueñe. Una cuenta borrada no cuenta como dueñe.
- Un perfil de persona no se "deja": se borra.
- Borrar es suave (`deleted_at` vía `saveObject()`), solo dueñes. Las filas de gestión y los
  edges quedan, para poder deshacerlo desde la base.
- Tope de 20 perfiles vivos por cuenta (propios y de grupos, contando las invitaciones que
  acepta) y de 20 invitaciones pendientes por grupo.
- Si el nombre de un perfil nuevo ya está usado (aunque sea por un perfil oculto ajeno), la
  dirección suma sola un sufijo corto al azar (por ejemplo `nombre-k3x9q`) en vez de avisar que
  existe otro. No es `-2`, `-3`…, que dirían cuántos perfiles hay con ese nombre. Cambiar el nombre después
  no cambia la dirección.

### Probarlo

- `npx vitest run src/lib/server/cuentas/perfiles.test.js "src/routes/(content)/mi-rincon/perfiles"`:
  migración y foreign keys, permisos, le última dueñe, el aviso de conflicto, invitaciones que no
  revelan cuentas (tampoco con el aviso por mail) y sus límites, integrantes (sumar, no poder
  sumar ocultos, irse, el bloqueo de 30 días, visibilidad), que ninguna lectura pública o de otra
  cuenta vincula perfiles ni muestra quién gestiona, y las páginas con el interruptor apagado
  (404) y prendido.

## Dónde está el código

- `src/lib/server/cuentas/`: `accounts.js` (cuentas, contraseña, borrado), `codes.js`,
  `session.js`, `orders.js` (compras de la cuenta), `password.js`, `crypto.js`, `email.js`,
  `index.js` (los pasos de ingresar con sus límites) y `web.js` (cookies, `locals.member`, mails).
- `src/lib/server/flags.js`: interruptores. Panel: `src/routes/(authed)/admin/ajustes/interruptores/`.
- Páginas: `src/routes/(content)/ingresar/` y `src/routes/(content)/mi-rincon/` (perfiles en
  `mi-rincon/perfiles/`).
- Perfiles: `src/lib/server/cuentas/perfiles.js` (reglas), `perfilesWeb.js` (formularios y
  sesión), tipo `src/lib/server/objects/types/perfil.js`, textos en `src/lib/utils/perfiles.js`.
- Link del encabezado: `accountLink` en `src/lib/utils/cuentas.js`, usado en
  `src/routes/(content)/+layout.svelte`.

## Cómo probarlo

- `npx vitest run src/lib/server/cuentas src/lib/server/flags.test.js "src/routes/(content)/mi-rincon"`:
  códigos (vencimiento, intentos, límites), contraseñas, sesiones, borrado, compras por mail y el
  interruptor apagado (404 y sin link).
- `tests/cuentas.spec.js` (Playwright, con `CUENTAS_ENABLED=1` en `playwright.config.js`):
  `/ingresar` se ve y el encabezado lleva ahí.
- A mano: `CUENTAS_ENABLED=1 npm run dev`, pedir un código en `/ingresar` y copiarlo de la
  consola.

## Límites conocidos

Cosas que se sabe que no están resueltas del todo, o que se aceptaron así. Si cambia alguna,
actualizá esta lista.

- **Integrantes sin consentimiento previo.** Un grupo suma a una persona sin pedirle nada (ella
  lo ve en Mi rincón y se va con un clic), el bloqueo de 30 días es por grupo y sumar o sacar
  integrantes no tiene límite propio (cada cambio sube la `version` del perfil de la persona, así
  que puede chocar con lo que ella está editando). Está pendiente de una decisión de gorrite
  (pedido y aceptación, aviso, bloqueo más amplio); no se cambió a propósito.
- **Límites por conexión.** Alguien con muchas IPv4 distintas puede repartir pedidos entre ellas.
  El tope global de 300 mails por hora es el respaldo, pero también se puede llenar a propósito:
  mientras dure (como mucho una hora) nadie recibe códigos nuevos. Las sesiones abiertas no se
  ven afectadas.
- **Turnstile** (o una regla de rate limiting de Cloudflare en `/ingresar`) queda como opción para
  más adelante: necesita claves y configuración en el panel de Cloudflare.
- **Contraseña bloqueada por otres.** Diez contraseñas mal escritas para un mail, desde cualquier
  conexión, bloquean el ingreso con contraseña de ese mail por hasta 15 minutos. El ingreso con
  código sigue andando.
- **Ventana diaria fija (UTC).** Los topes por día se reinician a medianoche UTC: alrededor de esa
  hora se pueden pedir hasta el doble de códigos para un mail. Con 5 intentos por código, adivinar
  uno sigue siendo muy improbable.
- **PBKDF2 con 100.000 iteraciones**, el máximo de Workers (OWASP pide 600.000). Ver "Contraseña".
- **Hash del mail sin secreto.** En `login_codes`, `rate_limits` y `profile_invites` se guarda
  `SHA-256` del mail con un prefijo fijo: con acceso a la base, se puede confirmar si un mail
  adivinado está ahí. Para que "no se guarda el mail" valga también contra eso, habría que usar
  un HMAC con una clave secreta del entorno.
- **Sesiones sin vencimiento** (P7.11). Para cortar todo: "Cerrar sesión en todos lados" o cambiar
  o sacar la contraseña.
- **El nombre del grupo va en el aviso de invitación.** Lo escribe quien gestiona el grupo y llega
  con el remitente del sitio. Va escapado, pero algunos programas de mail convierten en link un
  dominio escrito ahí. Como mucho salen 3 avisos por día a un mismo mail.
- **Quienes gestionan un grupo ven el mail de les demás**, también les `manager`. Les dueñes ven,
  además, quién mandó cada invitación pendiente.
- **Sufijo de dirección.** Si el nombre de un perfil nuevo ya está usado, el sufijo al azar no dice
  cuántos hay, pero que aparezca un sufijo sí dice que existe algún perfil (de cualquier
  visibilidad, también borrado) con esa dirección. Para que no diga nada habría que poner sufijo
  siempre, lo que cambia todas las direcciones.
- **Ids correlativos.** Quienes gestionan un grupo ven el id de cada integrante (en el formulario
  para sacarle); dos perfiles creados seguidos por la misma cuenta tienen ids cercanos.
- **"Solo con cuenta" es cualquiera que se haga una**, con cualquier mail. Los textos de la
  visibilidad lo tienen que dejar claro.
- **Cookie sin prefijo `__Host-`.** Solo importaría si algún subdominio del sitio lo manejara otra
  gente.
- **Al borrar una cuenta**, lo que queda de ella: los grupos que pasan a otra persona o que se
  borran por quedar sin nadie conservan sus datos y su `created_by`/`updated_by`; los edges de
  integrantes que esa cuenta sumó a perfiles ajenos conservan su `created_by`; las invitaciones
  para su mail vencen solas (solo guardan el hash). Las filas borradas (suave) siguen en los
  backups.
- **Previews.** Cualquiera que entra a un preview es admin de demo y puede prender `cuentas` en la
  base del preview (separada de producción, y los mails solo salen a `EMAIL_ALLOWLIST`).

## Pendiente (partes siguientes)

- Passkeys.
- Perfiles: página pública (con `getPublicProfile()`), subir imagen (el campo `avatar` ya existe,
  solo acepta imágenes del sitio) y lugares como tipo de perfil (B3).
- Compra con cuenta: guardar `orders.account_id`, "Recordar mi DNI" (en `preferences`) y los
  eventos con `requiere_cuenta`.
