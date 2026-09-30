# Cuentas del público

## Qué hace

Cualquier persona puede tener una cuenta en el sitio, **opcional**: entra en **"Ingresar"**
(`/ingresar`) con un código de 6 números que le llega por mail o, si puso una, con su contraseña.
En **"Mi rincón"** (`/mi-rincon`) ve su mail, sus compras (también las de antes de tener cuenta),
pone, cambia o saca la contraseña, cierra sesión o borra la cuenta. Tocar la contraseña y borrar la
cuenta piden además un código fresco por mail (ver "Acciones delicadas").

Es la parte 1 del bloque "cuentas y perfiles" (decisión 0002). Los perfiles, las passkeys y la
compra con cuenta vienen después. Les admins siguen entrando con GitHub en `/login`: son dos
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
  contraseña) o `delete` (borrar la cuenta), y solo sirve para ese. Uno de ingreso no confirma
  nada y uno de confirmación no sirve para ingresar.
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
| Pedir código, por conexión    | 10 cada 15 minutos                          |
| Escribir código, por conexión | 20 cada 15 minutos (además de 5 por código) |
| Contraseña, por mail          | 10 cada 15 minutos                          |
| Contraseña, por conexión      | 20 cada 15 minutos                          |

"Conexión" es el `clientHash` de las entradas: la IP con una sal que cambia cada día, hasheada.
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
- Cambiar la contraseña cierra las otras sesiones de la cuenta (la actual sigue abierta).

### Sesiones (`src/lib/server/cuentas/session.js`)

- Duran **hasta cerrar sesión** (P7.11): el servidor no las vence nunca.
- Cookie `kvRincon`: token al azar de 256 bits, `HttpOnly`, `Secure` (salvo http://localhost),
  `SameSite=Lax`, 400 días (el máximo de los navegadores). `last_seen_at` se actualiza como
  mucho una vez por día y, cuando pasa, la cookie se vuelve a mandar con 400 días más.
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

### Evento que pide cuenta (P7.1)

Por ahora solo el hook: `eventRequiresAccount(meta)` en `src/lib/server/cuentas/index.js` lee
`requiere_cuenta: true` del frontmatter del evento. La compra todavía no lo usa.

## Dónde está el código

- `src/lib/server/cuentas/`: `accounts.js` (cuentas, contraseña, borrado), `codes.js`,
  `session.js`, `orders.js` (compras de la cuenta), `password.js`, `crypto.js`, `email.js`,
  `index.js` (los pasos de ingresar con sus límites) y `web.js` (cookies, `locals.member`, mails).
- `src/lib/server/flags.js`: interruptores. Panel: `src/routes/(authed)/admin/ajustes/interruptores/`.
- Páginas: `src/routes/(content)/ingresar/` y `src/routes/(content)/mi-rincon/`.
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

## Pendiente (partes siguientes)

- Perfiles (personas y grupos, decisión 0002) y passkeys.
- Compra con cuenta: guardar `orders.account_id`, "Recordar mi DNI" (en `preferences`) y los
  eventos con `requiere_cuenta`.
