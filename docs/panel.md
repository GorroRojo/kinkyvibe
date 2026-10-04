# Panel de admin

## Qué hace

`/admin` es donde la organización maneja el sitio sin tocar código: cargar y editar eventos,
material y amigues, ver las ventas, confirmar transferencias, controlar el ingreso en la puerta,
mandar mails a quienes compraron, ajustar cobros, el Fondo y los textos de los mails, y ver quién
cambió qué. Se entra con la cuenta de GitHub (solo las cuentas de la lista de admins). Anda en la
compu y en el celu, arranca en tema claro y tiene un buscador (`/` o Ctrl/⌘+K) que encuentra
eventos, órdenes, entradas, códigos y personas.

## Lo que nunca se tiene que romper

- **Cada `load`, cada form action y cada `+server.js` del panel llama a `requireAdmin`** (o
  `getEventAdmin`) en el servidor. Las form actions **no** pasan por el layout: protegerlas en el
  layout no alcanza. Varias rutas tienen su prueba al lado (`*.test.js`); sumá una en cada ruta
  nueva.
- **Pasar un límite** (cupo, horario, "solo anticipadas"…) es siempre: cálculo en el servidor →
  `409 needsConfirmation` → diálogo en la página (`OverrideDialog`, nunca `window.confirm`) →
  reenvío con la clave → registro `tickets.override`. Nunca un parámetro que la compra pública
  pueda usar (decisiones 0003 y 0006, [entradas.md](entradas.md)).
- **Toda acción que cambia datos queda en Actividad** (`logAdminAction`, tabla `admin_audit`),
  sin DNI, tokens, secretos ni datos bancarios.
- **El DNI no se muestra completo por defecto**: en el control de ingreso se ven los últimos 3 y
  verlo completo queda registrado (`order.reveal_dni`). La búsqueda por DNI solo devuelve los
  últimos 3.
- **Los datos de amigues (mail, teléfono, cumpleaños) son públicos a propósito** (0010): no es un
  problema a arreglar.
- El modo demo y el admin falso de dev no existen en producción ([demo.md](demo.md)).

## Secciones

La lista única de secciones está en `src/lib/admin/nav.js` (menú lateral, barra y panel "Más" del
celu, botón "Para revisar", página "Próximamente" y buscador salen de ahí). Es el **mapa del panel**
que aprobó gorrite: Inicio arriba, **7 áreas** que se abren de a una y **Ajustes al pie**. Dentro
de cada área, las secciones van por frecuencia de uso (lo de todos los días primero) y lo que
viene, al final.

**Menú simplificado** (revisión de UI, paso 3): el menú no muestra las 8 áreas sino 5 grupos
(`NAV_GROUPS` en `nav.js`): Eventos, Ventas (con Estadísticas), Comunidad (con Mensajes), Contenido
(con Etiquetas) y Ajustes al pie. Las secciones de las áreas que se suman van debajo del nombre de
su área. Es solo el menú: cada sección sigue en su área y en su URL. En la página principal de
cada sección de un grupo (menos Eventos) el layout pone una barra de pestañas con todas las
secciones del grupo, como la que tenía Ajustes (`sectionTabs`).

Cada sección vive en **`/admin/<área>/<sección>`**. Las excepciones: Inicio (`/admin`), Puerta
(`/admin/checkin`, porque esa URL está guardada en los celus de la puerta) y las áreas de una sola
sección (Etiquetas, Estadísticas), que usan la URL del área.

| Área         | Secciones (URL)                                                                                                                                                                                                                                                        | Para qué                                                                                                                                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —            | Inicio (`/admin`)                                                                                                                                                                                                                                                      | próximos eventos, para revisar, plata del mes, actividad, "desde tu última visita"                                                                                                                                                        |
| Eventos      | Eventos (`/admin/eventos`), Cargar evento (`/nuevo`), Agenda (`/agenda`, + Importar planilla en `/importar`), Check-in (`/admin/checkin`), Series (`/series`), Lugares (`/lugares`), Roles y preguntas (`/roles`)                                                      | lista y ficha de cada evento (`/admin/eventos/<slug>`, sus pestañas no cambian); modo puerta; series; lugares; roles de personas en eventos y preguntas de inscripción                                                                    |
| Ventas       | Todas las ventas (`/admin/ventas`), Transferencias (`/transferencias`), Códigos (`/codigos`) · próximamente: Tienda (`/tienda`, fase 8)                                                                                                                                | ventas de todos los eventos, bandeja de transferencias, códigos de descuento                                                                                                                                                              |
| Comunidad    | Personas (`/admin/comunidad/personas`), Perfiles (`/perfiles`: la única lista de perfiles, con los lugares en su filtro; decisión de gorrite del 1/10), Cuentas (`/cuentas`; la ficha de un perfil es `/cuentas/perfiles/<id>`)                                        | quienes compraron (con notas), todos los perfiles (fichas de /amigues, de cuentas y del panel; filtros, CSV, «Para aprobar», pedidos "Es mi perfil"), cuentas del público ([cuentas.md](cuentas.md), [amigues.md](amigues.md))            |
| Mensajes     | Plantillas (`/admin/mensajes/plantillas`) · próximamente: Bandeja (`/admin/mensajes`, fase 5), Lo que sigo (`/lo-que-sigo`, fase 2)                                                                                                                                    | textos de los mails ([mails.md](mails.md))                                                                                                                                                                                                |
| Etiquetas    | Árbol de etiquetas (`/admin/etiquetas`, + Importar a la base en `/importar`)                                                                                                                                                                                           | la taxonomía del sitio ([etiquetas.md](etiquetas.md))                                                                                                                                                                                     |
| Contenido    | Material (`/admin/contenido/material`), No listadas (`/no-listadas`) · próximamente: Colecciones (`/colecciones`, fase 4), Videos (`/videos`, fase 7)                                                                                                                  | editores de contenido ([contenido.md](contenido.md))                                                                                                                                                                                      |
| Estadísticas | Ventas en el tiempo (`/admin/estadisticas`)                                                                                                                                                                                                                            | gráficos                                                                                                                                                                                                                                  |
| Ajustes      | Plata: Cobros (`/admin/ajustes/cobros`), Fondo (`/fondo`), Propinas (`/propinas`) · Comunicación: Mails y envíos (`/mails`) · Equipo: Admins (`/admins`) · Sistema: Interruptores (`/interruptores`), Automatizaciones (`/automatizaciones`), Actividad (`/actividad`) | datos para transferir y comisión de MP, % del Fondo, propinas, remitente y recordatorios, lista de admins, interruptores, lo que corre solo (crons, mails programados, bot; solo para mirar), registro (con CSV y "Recuperar" lo borrado) |

**Ficha de una persona** (`/admin/comunidad/personas/<id>`, con un id corto sacado del mail; nunca
el mail en la URL). Es una sola ficha con todo lo que sabemos de alguien, encontrada por el mail
normalizado (sin espacios ni mayúsculas) y por su cuenta: Cuenta (fechas, contraseña sí/no, sesiones,
«Mis datos», permiso para tener perfiles), Compras (todas las órdenes por cuenta o por mail, con
entradas, respuestas, recordatorios y mails a compradores), Perfiles (los que gestiona, pedidos «Es
mi perfil», invitaciones y los eventos donde participan), Lo que sigue (seguimientos, avisos,
series, calendario y Telegram: nunca tokens ni el id del chat), Notas internas y Actividad. La
ficha de una cuenta (`/admin/comunidad/cuentas/<id>`) muestra la misma ficha (también para una
cuenta borrada), así que los links viejos siguen andando. Las notas internas van por el mail; una
cuenta borrada ya no tiene mail, así que sus notas quedan atadas a la cuenta (`account_id`,
migración 0045, con `email` vacío). El DNI no viene con la página: cada
«Mostrar» lo pide aparte y queda en Actividad (`person.dni.reveal`, sin el DNI). Propinas y códigos
de ingreso no se pueden atar a una persona y no aparecen. Código: `src/lib/server/admin/ficha.js`
(una sola tanda de consultas), `fichaRoutes.js` y `src/lib/components/admin/personas/Ficha.svelte`.

**Agenda** (`/admin/eventos/agenda`, cambiada en #171). Usa todo el ancho de la pantalla; en la
compu el mes llena el alto y los días crecen con sus eventos. Tiene dos vistas, Calendario y
Planilla:

- **Carga rápida**: tocar un día vacío (o «Evento») abre una hoja para duplicar un evento que ya
  existe (buscador, con series y ediciones recientes primero) o «Empezar de cero» con el título.
  Crea un **borrador** en ese día sin salir de la agenda: no listado, con la marca `borrador: true`
  en su `.md` (`DRAFT_KEY` en `src/lib/utils/sheetImport.js`), por el mismo camino que Importar
  planilla (`src/lib/server/eventos/drafts.js`).
- **«Qué falta»** (`eventMissing.js`): imagen, resumen, dónde, región, precio, link o entradas, y
  quién organiza. Se ve en los borradores del calendario y en la planilla.
- **«Confirmar»** un borrador (en la agenda y en la ficha del evento): le saca la marca y lo lista;
  queda en Actividad (`event.confirm`). Publicarlo desde la planilla también le saca la marca.
- **Filtro «A confirmar»** (calendario y planilla): solo los borradores con la marca. Un evento no
  listado a propósito (sin la marca) no aparece ahí ni ofrece «Confirmar».
- **Limitación conocida**: un borrador recién creado se ve en la agenda hasta que recargás la
  página; después desaparece hasta que el sitio se vuelve a publicar con su commit (unos minutos),
  porque la agenda lee los eventos del deploy.

**Mover una URL** (regla de gorrite para el paso 2 del mapa): **sin redirecciones** desde la vieja
(un favorito puede dar "no encontrado", y está bien), pero **nada interno** puede apuntar a ella.
Dos pruebas lo cuidan:

- `src/lib/admin/adminPaths.test.js` junta cada `'/admin/…'` escrito en `src/` y verifica que
  exista esa ruta (estática o dinámica); además, que ningún archivo de `src/`, `docs/`, `tests/` ni
  `scripts/` nombre una URL vieja (lista `REMOVED_TREES`) o una página borrada (`REMOVED`). Al
  mudar una sección, sumá su URL vieja a `REMOVED_TREES`.
- `tests/tickets/menu.spec.js` (Playwright, con el admin falso) entra a cada link del menú y espera
  que abra en su propia URL.

Los links que se arman en varios lugares salen de `nav.js` (`navItem`, `eventHref`,
`contentAdminHref`) o de `links.js`; no los escribas a mano. Las migraciones de D1 viejas nombran
URLs de antes en sus comentarios: son append-only y no se tocan.

**Para revisar**: botón global en la barra de arriba y en el header del celu, con un contador
(transferencias pendientes + órdenes para revisar + perfiles y pedidos "Es mi perfil"). Por ahora
lleva a la tarjeta "Para revisar" del Inicio.

**Barra lateral**: las áreas se abren de a una. Se abre la de la página actual; en Inicio, la
última que abriste (se recuerda en el navegador, `navPrefs.js`; sin storage anda igual). Un área
cerrada muestra la suma de sus contadores.

**Consultas en tanda** (Inicio y contadores del menú): el Inicio hace **dos** idas a la base
(`db.batch`) en vez de una por consulta (eran 33): la primera con todo lo que no depende de la
lista de eventos, la segunda con lo que sí (totales, recordatorios, "desde tu última visita", la
tendencia de ventas). Los contadores del menú son **una** (las dos cuentas de órdenes van en una
sola consulta, cada una por su índice; «No listadas» se cuenta con una consulta, sin armar las
listas públicas). Si una
consulta de la tanda falla (por ejemplo, falta una migración), cada una se corre sola con su
respaldo, como antes. Para sumar algo al Inicio: un `…Query` en `src/lib/server/admin/inicio.js`
(ver `src/lib/server/db/batch.js`) y una línea en la tanda que corresponda; el test
`src/routes/(authed)/admin/inicio-tanda.test.js` cuenta las idas.

**Eventos → lista, por páginas** (gorrite, 2/10): la página no trae todos los eventos (son
cientos). Trae los próximos, los borradores y los pasados de los últimos 90 días; «Ver anteriores»
(en Pasados) pide al servidor la tanda siguiente (`/admin/eventos/lista.json?anteriores=N`), y
buscar busca primero en lo cargado y enseguida en todos (`?q=`). Los filtros son al instante sobre
lo cargado y sus cuentas son de todos. El CSV sale del servidor con todos los eventos del filtro o
de la búsqueda (`/admin/eventos/eventos.csv`). Ver `src/lib/server/eventos/panelList.js` y
`src/lib/admin/eventList.js`.

**Celu**: la barra de abajo sigue igual (Inicio, Eventos, Check-in, Ventas, Más). "Más" muestra
las áreas y, al tocar una, sus secciones. Cuando llegue la Bandeja (fase 5), el cuarto lugar pasa a
ser "Para revisar".

**Lo que viene**: las secciones aprobadas que todavía no existen están en `nav.js` con
`soon: true, phase: N` y un `soonText`. Se ven al final de su área, grises y punteadas, con
«Próximamente», y **no son links** (no hay nada que abrir todavía); su URL reservada igual abre una sola página genérica "Próximamente" (`[...section=soon]`, con el
matcher `src/params/soon.js`) que dice qué va a hacer. Cada persona puede esconderlas con «Ocultar
lo que viene» en su menú de usuario (en el navegador, con try/catch).

**Ciclo de vida de una sección** (documentado también en `nav.js`):

1. **Próximamente**: `soon: true, phase: N, soonText`.
2. **En prueba**: la página existe pero su interruptor está apagado (`flag: 'clave'`). Solo la ven
   les superadmins (hoy son todes les admins), con la etiqueta "prueba". Si con el interruptor
   apagado la página da 404, `hiddenWhenOff: true` y no se muestra.
3. **Lista**: se prende el interruptor; cuando el interruptor desaparece, se borra `flag`.
4. **Descartada**: se borra el ítem.

## Dónde está el código

| Qué                                 | Dónde                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| Páginas                             | `src/routes/(authed)/admin/`                                                             |
| Lógica del servidor del panel       | `src/lib/server/admin/` (inicio, ventas, personas, búsqueda, auditoría…)                 |
| Lógica de entradas que usa el panel | `src/lib/server/tickets/` (`overrides.js`, `door.js`, `manual.js`, `checkin.js`…)        |
| Quién es admin                      | `ADMINS` en `src/lib/server/auth.js` (por id numérico de GitHub); `requireAdmin`         |
| Login con GitHub                    | `src/routes/login`, `src/routes/callback`, `src/lib/server/session.js`                   |
| Menú, atajos, tema, borradores      | `src/lib/admin/` (`nav.js`, `navPrefs.js`, `commands.js`, `theme.js`, `draft.js`)        |
| Componentes y estilos               | `src/lib/components/admin/` (`panel/`, `door/`, `inicio/`…), `src/lib/admin/panel*.scss` |

## Cómo probar

```sh
npm run dev:admin      # admin falso; los commits de contenido van a una carpeta temporal
npm run dev:tickets    # admin falso + entradas simuladas (para Ventas, Transferencias, puerta…)
npx vitest run src/lib/server/admin src/lib/admin
npx playwright test -c playwright.tickets.config.js
```

En el preview de un PR: «🧪 Entrar como admin de prueba» en `/login` ([demo.md](demo.md)).

## Tareas comunes

**Agregar una sección.** Si está aprobada pero no se construye todavía, sumá el ítem en `nav.js`
con `soon: true`, `phase` y `soonText`, al final de su área. Para construirla, cambiá `soon` por
`false` (con `flag` si sale detrás de un interruptor), creá la ruta en `src/routes/(authed)/admin/…` con `requireAdmin` en el `load` y en cada
action, registrá los cambios con `logAdminAction` y agregá una prueba de que sin sesión redirige y
sin permiso da 403. Lo nuevo sale detrás de un interruptor, apagado (0001; ver
[interruptores.md](interruptores.md)).

**Agregar une admin.** Hoy es código: sumar `{ id, login }` en `ADMINS` de `auth.js`, con el id
sacado de `https://api.github.com/users/<login>` (no tipeado a mano). Ajustes › Admins solo lo
muestra.

**Ver quién hizo algo.** Ajustes › Sistema › Actividad (filtros y CSV).

**Algo "para revisar".** Aparece en Inicio, en Ventas y en la ficha del evento (pago tarde que
pasó el cupo, posible cobro doble); "Marcar como revisada" después de resolverlo. Los perfiles
nuevos de cuentas aparecen en Inicio y en el contador de Comunidad › Perfiles hasta que se marcan
como revisados (o se ocultan o borran) desde su ficha.

**Dejar que una cuenta tenga perfiles.** Comunidad › Cuentas → buscar el mail → la ficha → "Darle el
permiso". Queda en Actividad. Sacarlo no borra sus perfiles: solo deja de verlos
([cuentas.md](cuentas.md), «Permiso para tener perfiles»).

## Lo que viene

Decisiones 0002, 0003, 0008 y 0010: niveles de permiso (superadmins → organizadores), bandeja de mails dentro del panel,
el panel como CRM, formularios nuevos (edición larga con índice, compra en tres pasos) y más
gráficos.

## Automatizaciones

Ajustes → Automatizaciones (`/admin/ajustes/automatizaciones`) junta, **solo para mirar**, todo
lo que corre solo. La lógica está en `src/lib/server/admin/automatizaciones.js`.

- **Tareas programadas**: los dos crons de `wrangler.toml` (`[triggers]`, los mismos que
  `src/lib/server/scheduled.js`): la vuelta de mails cada 15 minutos y el backup nocturno (con el
  chequeo de integridad después). Cada una con la próxima corrida y la última vez: el último mail
  que salió (la base no guarda las vueltas que no mandaron nada) y el último backup de R2 (solo en
  producción; en un preview, la última corrida del chequeo, `integrity_runs`).
- **Mails que salen solos**: recordatorios de entradas (los configurados en Ajustes → Mails),
  links de transmisión, avisos de series y de «Lo que sigo» (nuevo y recordatorio), con el último
  envío, los pendientes y los que fallaron (`reminder_sends`, `stream_link_sends`,
  `series_notifications`, `follow_notifications`). «Mail a compradores» no está: sale desde la
  página del evento, no del cron.
- **Bot de Telegram**: el interruptor, si el secreto del webhook y el token están cargados (sí/no;
  nunca el valor) y cuántos chats hay vinculados.
- **Reglas**: «próximamente» (las del tipo «si pasa X, hacé Y»).

Cada fila linkea a donde se configura. Nunca muestra a quién se le mandó algo.
