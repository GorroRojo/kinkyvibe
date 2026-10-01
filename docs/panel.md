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
viene, al final. Este paso no movió ninguna URL: las que todavía no coinciden con su área (por
ejemplo Plantillas, que sigue en `/admin/ajustes/mails/plantillas`) se mudan en otro PR.

| Área         | Secciones (URL de hoy)                                                                                                                                                                                                 | Para qué                                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —            | Inicio (`/admin`)                                                                                                                                                                                                      | próximos eventos, para revisar, plata del mes, actividad, "desde tu última visita"                                                                                                                                             |
| Eventos      | Eventos, Cargar evento, Agenda (+ Importar planilla), Check-in, Series (`/admin/eventos/series`), Lugares (`/admin/eventos/lugares`, con "Para aprobar" y "Rechazados"), Roles y preguntas (`/admin/ajustes/personas`) | lista y ficha de cada evento (sus pestañas no cambian); modo puerta; series; lugares; roles de personas en eventos y preguntas de inscripción                                                                                  |
| Ventas       | Todas las ventas (`/admin/entradas`), Transferencias, Códigos · próximamente: Tienda (fase 8)                                                                                                                          | ventas de todos los eventos, bandeja de transferencias, códigos de descuento                                                                                                                                                   |
| Comunidad    | Personas, Perfiles (`/admin/amigues`: la única lista de perfiles, con los lugares en su filtro; decisión de gorrite del 1/10), Cuentas                                                                                 | quienes compraron (con notas), todos los perfiles (fichas de /amigues, de cuentas y del panel; filtros, CSV, «Para aprobar», pedidos "Es mi perfil"), cuentas del público ([cuentas.md](cuentas.md), [amigues.md](amigues.md)) |
| Mensajes     | Plantillas (`/admin/ajustes/mails/plantillas`) · próximamente: Bandeja (fase 5), Lo que sigo (fase 2)                                                                                                                  | textos de los mails ([mails.md](mails.md))                                                                                                                                                                                     |
| Etiquetas    | Árbol de etiquetas (`/admin/etiquetas`)                                                                                                                                                                                | la taxonomía del sitio ([contenido.md](contenido.md))                                                                                                                                                                          |
| Contenido    | Material, No listadas · próximamente: Colecciones (fase 4), Videos (fase 7)                                                                                                                                            | editores de contenido ([contenido.md](contenido.md))                                                                                                                                                                           |
| Estadísticas | Ventas en el tiempo (`/admin/estadisticas`)                                                                                                                                                                            | gráficos                                                                                                                                                                                                                       |
| Ajustes      | Plata: Cobros, Fondo, Propinas (`/admin/propinas`) · Comunicación: Mails y envíos · Equipo: Admins · Sistema: Interruptores, Actividad (`/admin/actividad`, también "Recuperar" lo borrado)                            | datos para transferir y comisión de MP, % del Fondo, propinas, remitente y recordatorios, lista de admins, interruptores, registro (con CSV)                                                                                   |

**Para revisar**: botón global en la barra de arriba y en el header del celu, con un contador
(transferencias pendientes + órdenes para revisar + perfiles y pedidos "Es mi perfil"). Por ahora
lleva a la tarjeta "Para revisar" del Inicio.

**Barra lateral**: las áreas se abren de a una. Se abre la de la página actual; en Inicio, la
última que abriste (se recuerda en el navegador, `navPrefs.js`; sin storage anda igual). Un área
cerrada muestra la suma de sus contadores.

**Celu**: la barra de abajo sigue igual (Inicio, Eventos, Check-in, Ventas, Más). "Más" muestra
las áreas y, al tocar una, sus secciones. Cuando llegue la Bandeja (fase 5), el cuarto lugar pasa a
ser "Para revisar".

**Lo que viene**: las secciones aprobadas que todavía no existen están en `nav.js` con
`soon: true, phase: N` y un `soonText`. Se ven al final de su área, grises y punteadas, con "fase
N", y su URL reservada abre una sola página genérica "Próximamente" (`[...section=soon]`, con el
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
sin permiso da 403. Lo nuevo sale detrás de un interruptor, apagado (0001).

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

Decisiones 0002, 0003, 0008 y 0010: cuentas del público (separadas del login de admins, que sigue
con GitHub), niveles de permiso (superadmins → organizadores), bandeja de mails dentro del panel,
el panel como CRM, formularios nuevos (edición larga con índice, compra en tres pasos) y más
gráficos.
