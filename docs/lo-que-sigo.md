# Lo que sigo

## Qué hace

Con una cuenta del público ([cuentas.md](cuentas.md)), una persona puede **seguir** etiquetas (las
series son etiquetas), perfiles (personas y proyectos) y lugares. Por cada cosa que sigue elige:

- **En mi calendario**: sus eventos aparecen en su calendario personal (`.ics`);
- **Mail cuando se anuncia algo nuevo**;
- **Recordatorio el día antes**.

Todo se configura en **Mi rincón → Lo que sigo** (`/mi-rincon/sigo`), con un CSV de la lista. Es
también el lugar del **calendario personal** (`.ics`): qué entra y el link para suscribirse. En Mi
rincón es una sola tarjeta, «Lo que seguís y tu calendario».
Es el diseño de [0025](decisiones/0025-lo-que-sigo.md): un solo sistema en lugar de piezas
sueltas («Avisame si se repite», suscripciones por etiqueta y los ajustes del calendario).

Se hace en PRs chicos, uno arriba del otro:

1. **El modelo** (migración `0032_lo_que_sigo.sql`), seguir y dejar de seguir, y la página de Mi
   rincón (este documento).
2. Los botones «Seguir» en las páginas de etiquetas y perfiles.
3. Lo seguido, mis entradas y los eventos donde participo, en el calendario personal.
4. Los mails (algo nuevo y recordatorio) y pasar «Avisame si se repite» a este sistema.

### La página

`/mi-rincon/sigo` agrupa lo seguido en **Etiquetas y series · Perfiles · Lugares**. Cada cosa es una
tarjeta con el emoji y el color de su etiqueta (o la imagen de la serie o del perfil), el nombre con
link a su página, el próximo evento anunciado y sus opciones: «En mi calendario» aparte y los
avisos como grilla de qué («Algo nuevo», «Recordatorio el día antes») × por dónde (Mail; Telegram
apagado, con «Próximamente»). Sin nada seguido, invita a seguir.

Arriba, **«Agregar»** busca etiquetas y series del árbol, perfiles y lugares con el selector de etiquetas del sitio (`ChipCombobox`, con `look="search"`: el aspecto del
buscador de las listas, campo redondeado con lupa y sugerencias con emoji y color) y sigue lo
elegido con las opciones de siempre, sin salir de la página (`?/seguir`). Sin JavaScript es el mismo
campo con «Seguir» (el nombre de la etiqueta, un alias o la forma de la URL).

Abajo, **«Tu calendario»** (`#calendario`): qué junta el calendario personal, «Mis entradas» y «Los
eventos donde participo» y el link secreto para suscribirse (se ve una sola vez; «Generar un link
nuevo» revoca el anterior; `?/crearLink`, `?/revocarLink`).

Antes eran dos páginas: **Mi rincón → Calendario** (`/mi-rincon/calendario`) tenía el link y la
lista de «Avisos de series», que con «Lo que sigo» ya son cosas seguidas. Con `lo_que_sigo`
prendido, esa dirección sigue andando (sin redirect) y muestra un aviso que lleva a
`/mi-rincon/sigo#calendario`; sus acciones también andan, por si quedó una pestaña abierta. Apagado,
Mi rincón y esa página quedan como siempre.

Las columnas de la grilla salen de `NOTIFY_CHANNELS` (`src/lib/utils/sigo.js`). Sumar Telegram
(el bot, [telegram.md](telegram.md)) es darle sus casillas en `fields` y `enabled: true`: la grilla
(`src/lib/components/sigo/FollowOptions.svelte`) no cambia. Con la fase 2 del bot
([telegram.md](telegram.md), migración 0033) la columna se prende por cuenta con
`notifyChannels(data.telegram)`: andando con el chat vinculado, «Sin conectar» si no, y
«Próximamente» con el bot apagado. La tarjeta «Telegram» (`TelegramCard.svelte`) va abajo de lo
seguido.

## Cómo prenderlo

Interruptor **«Lo que sigo»** (`lo_que_sigo`, variable `LO_QUE_SIGO_ENABLED`), apagado por
defecto (las cuentas del público ya no tienen interruptor: están siempre). Apagado,
`/mi-rincon/sigo` y sus acciones dan 404 y Mi rincón no muestra el link.

Antes, en producción: aplicar la migración `0032_lo_que_sigo.sql`
([0028](decisiones/0028-migraciones-antes-del-merge.md)). En local:
`LO_QUE_SIGO_ENABLED=1 npm run dev`.

## Lo que nunca se tiene que romper

- **Lo que sigue cada cuenta es privado.** No se muestra en ninguna página pública ni a otras
  cuentas, tampoco como «N personas siguen esto». Todas las lecturas de `follows.js` reciben la
  cuenta y devuelven solo lo suyo.
- **No se guarda ningún mail** en estas tablas: los avisos usan el mail de la cuenta.
- **Solo se sigue lo que se puede ver**: una etiqueta que existe, o un perfil que la cuenta puede
  ver (con las reglas de visibilidad de los objetos) y que está aprobado para /amigues (o que ella
  gestiona). Si algo seguido deja de existir o de verse, en Mi rincón aparece como «Ya no está
  disponible», sin nombre ni link, y se puede dejar de seguir.
- **Borrar la cuenta borra lo seguido** (`deleteAccount`).

## Cómo funciona

### Tablas (`migrations/0032_lo_que_sigo.sql`)

| Tabla                  | Qué guarda                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `follows`              | cuenta, qué sigue (`target_kind` + `target_key`), las tres opciones, de qué aviso viene y fechas |
| `follow_events_seen`   | cuándo el cron vio por primera vez cada evento próximo (para «se anunció algo nuevo», paso 4)    |
| `follow_notifications` | un mail por cuenta, evento y tipo (`nuevo` o `recordatorio`), nunca dos (paso 4)                 |

Qué se sigue:

- `etiqueta`: por su `key` (el nombre en los posts), que es el mismo con el archivo de etiquetas y
  con la base (interruptor `etiquetas_db`, [etiquetas.md](etiquetas.md)). Un alias o la forma de la
  URL («Rancheadita-Kinky») se resuelven al nombre canónico antes de guardar. Si después se
  renombra desde la base, el nombre viejo queda como alias y lo seguido se sigue resolviendo.
- `perfil`: por el id del objeto (persona, proyecto o lugar), que no cambia aunque cambie la
  dirección. Si es un lugar o no se decide al leer (`profileKindOf`).

### El calendario personal

`/ics/mio/<token>.ics` (el link está en Mi rincón → Lo que sigo → «Tu calendario»; sin
`lo_que_sigo`, en Mi rincón → Calendario) junta, con `lo_que_sigo` prendido (`src/lib/server/sigo/calendar.js`):

- **mis entradas**, incluidos los eventos no listados (son de la persona);
- **los eventos donde participo**: los que nombran en `personas:` un perfil que la cuenta gestiona;
- **lo seguido con «en mi calendario»**: los eventos con la etiqueta o una de sus hijas, los que
  nombran al perfil y, si es un lugar, los que se hacen ahí y lo muestran en público
  (`listedVenueEvents`). Solo si la cuenta todavía puede ver ese perfil.

Las dos primeras se prenden y apagan en Mi rincón → Lo que sigo → «Tu calendario» y se guardan en
`accounts.preferences` (`sigoCalEntradas`, `sigoCalParticipo`; sin la clave = prendido). Lo que no
es una entrada propia sale solo de eventos listados. Con `lo_que_sigo` apagado, el calendario
muestra solo las entradas, como siempre.

### Los mails (`src/lib/server/sigo/notify.js`)

Los corre el cron de mails (POST /api/cron/recordatorios, cada 15 minutos) con `lo_que_sigo`
prendido. Van al mail de la cuenta, uno por cuenta, evento y tipo
(`follow_notifications`), aunque varias cosas seguidas lleven al mismo evento (el mail dice cuáles):

- **Se anunció algo nuevo**: un evento próximo (listado, no cancelado) de algo que la cuenta sigue
  con ese mail, si lo seguía desde antes de que el cron viera el evento (`follow_events_seen`). La
  primera corrida de todas anota lo que ya estaba con fecha 0: prender el interruptor no manda una
  tanda de mails por todo lo ya anunciado.
- **Recordatorio el día antes**: cuando faltan 24 horas o menos para el evento. No sale (ni por
  mail ni por Telegram) si la cuenta ya tiene entrada (orden aprobada con su `account_id` o su
  mail): le llegan los recordatorios de las entradas.

Cada mail lleva el link a Mi rincón → Lo que sigo y otro para no recibir más mails de lo que sigue
(`/avisos/sigo/<cuenta>.<firma>`, sin entrar y aunque el interruptor esté apagado; apaga los
dos mails de todo, lo seguido y el calendario quedan). Hasta 50 mails por corrida.

### «Avisame si se repite» (`src/lib/server/sigo/avisame.js`)

Con `lo_que_sigo` prendido:

- **con cuenta**, «Avisame» es seguir la etiqueta de la serie con «mail cuando se anuncia algo
  nuevo» (y «en mi calendario»). Darse de baja apaga ese mail, pero la etiqueta queda seguida;
- las suscripciones con cuenta que ya había en `series_subscriptions` pasan a `follows` en el cron
  (y las de una cuenta, apenas abre Mi rincón → Lo que sigo, así aparecen en su lista), con
  `created_at` = cuándo se confirmaron y su id en `series_subscription_id`. La fila vieja se
  borra en la misma tanda, así no llegan dos avisos. El link de baja de los mails que ya salieron
  (`/avisos/baja/<id>.<firma>`) sigue andando: apaga el mail de lo nuevo de esa etiqueta;
- **sin cuenta**, nada cambia: el mail con doble confirmación y los avisos de siempre.

En las páginas, con cuenta, «Avisame» dice que es seguir la serie y lleva a Lo que sigo
(`seriesAccountState` devuelve `sigo`). En `/wiki/<serie>` no se muestra: el botón «Seguir» de la
misma página hace lo mismo. Sin cuenta, el formulario con el mail sigue en los dos lados.

Si se apaga `lo_que_sigo` después de prenderlo, lo que ya pasó a `follows` no recibe mails hasta
que se vuelva a prender.

### Código

- `src/lib/utils/sigo.js`: lo puro (qué se puede seguir, las opciones, el orden y el CSV), con
  tests.
- `src/lib/server/sigo/follows.js`: lecturas y escrituras de `follows` y de las preferencias.
- `src/lib/server/sigo/targets.js`: qué es cada cosa seguida y si la cuenta la puede seguir.
- `src/lib/server/sigo/web.js`: el interruptor y la cuenta de la sesión.
- `src/routes/(content)/mi-rincon/sigo/`: la página (acciones `seguir`, `dejar`, `opciones`) y el
  CSV (`sigo.csv`).
- `src/lib/components/sigo/`: «Agregar» (`FollowAdd.svelte`) y la grilla de opciones de cada cosa
  seguida (`FollowOptions.svelte`).
- `src/lib/components/FollowButton.svelte`: el botón «Seguir» en `/wiki/<etiqueta>` y en
  `/amigues/<perfil>` (solo perfiles de la base). Pregunta a `GET /api/sigo?tipo=&clave=` al cargar,
  porque la página de una etiqueta puede estar prerenderizada: con el interruptor apagado da 404 y
  el botón no aparece. Sin sesión lleva a `/ingresar` y vuelve a la página; en las series, quien no
  tiene cuenta sigue teniendo «Avisame si se repite» solo con el mail. Con sesión manda a
  `/mi-rincon/sigo?/seguir` o `?/dejar` (sin JavaScript, el resultado se ve en Mi rincón).
  `/api/sigo` solo dice si **esta** cuenta lo sigue, nunca quién más.

### Decidido por Claude, a confirmar con gorrite

- Al tocar «Seguir» quedan prendidos «en mi calendario» y «mail cuando se anuncia algo nuevo»; el
  recordatorio, apagado (`DEFAULT_FOLLOW_OPTIONS`).
- Hasta 300 cosas seguidas por cuenta y 120 cambios por hora.
- El recordatorio sale cuando faltan 24 horas o menos (no a una hora fija del día anterior).
- «Avisame» con cuenta deja también «en mi calendario» prendido.
- Los mails de «Lo que sigo» usan su propia clave de firma (`sigo_mail_stop_key`).
- El calendario personal existe siempre (el interruptor `series` quedó fijo); «Lo que sigo» le
  suma cosas.
- Mi rincón muestra una sola tarjeta, «Lo que seguís y tu calendario», y la página se sigue
  llamando «Lo que sigo» (como el interruptor y los mails). `/mi-rincon/calendario` no redirige:
  muestra un aviso con el link.
- «Agregar» usa `ChipCombobox` con el aspecto del buscador público y no `TagSearch`: `TagSearch`
  maneja los filtros de las listas (los stores `filteredTags` y `searchText`) y no sirve para otra
  cosa sin reescribirlo.

### Límites

| Qué                                 | Límite            |
| ----------------------------------- | ----------------- |
| Cosas seguidas por cuenta           | 300               |
| Seguir, dejar, opciones, por cuenta | 120 cada una hora |

## Cómo probar

```sh
npx vitest run src/lib/utils/sigo.test.js src/lib/server/sigo "src/routes/(content)/mi-rincon/sigo"
```
