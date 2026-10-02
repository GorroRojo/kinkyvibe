# Lo que sigo

## Qué hace

Con una cuenta del público ([cuentas.md](cuentas.md)), una persona puede **seguir** etiquetas (las
series son etiquetas), perfiles (personas y proyectos) y lugares. Por cada cosa que sigue elige:

- **En mi calendario**: sus eventos aparecen en su calendario personal (`.ics`);
- **Mail cuando se anuncia algo nuevo**;
- **Recordatorio el día antes**.

Todo se configura en **Mi rincón → Lo que sigo** (`/mi-rincon/sigo`), con un CSV de la lista.
Es el diseño de [0025](decisiones/0025-lo-que-sigo.md): un solo sistema en lugar de piezas
sueltas («Avisame si se repite», suscripciones por etiqueta y los ajustes del calendario).

Se hace en PRs chicos, uno arriba del otro:

1. **El modelo** (migración `0032_lo_que_sigo.sql`), seguir y dejar de seguir, y la página de Mi
   rincón (este documento).
2. Los botones «Seguir» en las páginas de etiquetas y perfiles.
3. Lo seguido, mis entradas y los eventos donde participo, en el calendario personal.
4. Los mails (algo nuevo y recordatorio) y pasar «Avisame si se repite» a este sistema.

## Cómo prenderlo

Interruptor **«Lo que sigo»** (`lo_que_sigo`, variable `LO_QUE_SIGO_ENABLED`), apagado por
defecto. Necesita también **«Cuentas del público»** (`cuentas`): con cualquiera de los dos
apagado, `/mi-rincon/sigo` y sus acciones dan 404 y Mi rincón no muestra el link.

Antes, en producción: aplicar la migración `0032_lo_que_sigo.sql`
([0028](decisiones/0028-migraciones-antes-del-merge.md)). En local:
`LO_QUE_SIGO_ENABLED=1 CUENTAS_ENABLED=1 npm run dev`.

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

Qué más suma el calendario (paso 3): «mis entradas» y «los eventos donde participo», en
`accounts.preferences` (`sigoCalEntradas`, `sigoCalParticipo`; sin la clave = prendido).

### Código

- `src/lib/utils/sigo.js`: lo puro (qué se puede seguir, las opciones, el orden y el CSV), con
  tests.
- `src/lib/server/sigo/follows.js`: lecturas y escrituras de `follows` y de las preferencias.
- `src/lib/server/sigo/targets.js`: qué es cada cosa seguida y si la cuenta la puede seguir.
- `src/lib/server/sigo/web.js`: los interruptores y la cuenta de la sesión.
- `src/routes/(content)/mi-rincon/sigo/`: la página (acciones `seguir`, `dejar`, `opciones`) y el
  CSV (`sigo.csv`).

### Decidido por Claude, a confirmar con gorrite

- Al tocar «Seguir» quedan prendidos «en mi calendario» y «mail cuando se anuncia algo nuevo»; el
  recordatorio, apagado (`DEFAULT_FOLLOW_OPTIONS`).
- Hasta 300 cosas seguidas por cuenta y 120 cambios por hora.

### Límites

| Qué                                 | Límite            |
| ----------------------------------- | ----------------- |
| Cosas seguidas por cuenta           | 300               |
| Seguir, dejar, opciones, por cuenta | 120 cada una hora |

## Cómo probar

```sh
npx vitest run src/lib/utils/sigo.test.js src/lib/server/sigo "src/routes/(content)/mi-rincon/sigo"
```
