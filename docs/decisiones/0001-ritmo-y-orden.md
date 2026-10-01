# 0001. Ritmo y orden del plan

- Fecha: 2026-09-30
- Estado: Aceptada. El orden de lo que sigue lo reemplaza [0026](0026-orden-1-10.md) (1/10).

## Contexto

El sitio quiere ser wiki, red social, grafo de objetos, videos, tienda y eventos a la vez. Son
varios productos, con tres personas para mantenerlos y moderarlos. Sin un orden, los agentes
arrancan todo al mismo tiempo y nada termina de usarse.

## Decisión

- **Un bloque grande a la vez**, con arreglos chicos en paralelo. Cada bloque se mergea y se usa
  antes de empezar el siguiente.
- Orden aprobado:
  - Paso 0: arreglos de entradas y del panel, maqueta de formularios y el primer gráfico
    (termómetro de ventas por evento). Van primero y en paralelo.
  - Paso 1: Workers, backups y este registro de decisiones, más las limpiezas pendientes.
  - Paso 2: cuentas, perfiles y el modelo de objetos (propuestas 6 y 7).
  - Paso 3: series, lugares, roles, preventas y campos personalizados, con los formularios nuevos.
  - Paso 4: guardados, colecciones y amistades.
  - Paso 5: bandeja, mails masivos y CRM.
  - Paso 6: lo social, **algún día**.
  - Paso 7: videos.
  - Paso 8: tienda.
- **Forma de trabajo para bloques grandes**: se construyen en ramas por parte, se integran y se
  prueban juntas en una rama de integración, y entran a `main` como **un solo PR de integración**
  (verificado que funciona una vez mergeado). No se apilan muchos PRs para mergear de a uno ("si
  no, se pierde mucho"). Los arreglos chicos e independientes pueden seguir siendo su propio PR.
- **Todo lo nuevo sale detrás de interruptores**, apagado hasta que se prenda desde el panel.
- PRs abiertos: se mergean en bloques. Primero revisión y seguridad (sin cambios visuales); el
  panel, cuando termine el feedback. Se confirma la lista exacta antes de mergear.
- Lo social: no hay publicaciones libres ni feeds en el plan. La comunidad vive en Telegram, con
  su equipo de moderación. Las bases quedan listas por si algún día.
- Videos: a futuro, de todo (gratis, talleres pagos, en vivo y explícito), con Cloudflare Stream y
  links firmados. El cobro va separado del proveedor de las entradas (ver 0009).
- Tienda: sin decidir. Se deja lugar en las bases.

## Descartado

- Construir varios bloques grandes en paralelo: más difícil de revisar y de usar de verdad.
- Bloques grandes como pila de PRs mergeados de a uno.
- Lo social pronto: moderar con tres personas no alcanza, y la comunidad ya tiene su lugar.

## Consecuencias

- Un agente no arranca un bloque que no es el actual sin que gorrite lo pida.
- Todo PR de algo nuevo trae su interruptor y sale apagado.

## Cómo va (1/10)

- Paso 0: arreglos del panel y de entradas mergeados (#115, #116, #134).
- Paso 1: hecho. Documentación y preparación de Workers y backups (#122), sitio en Workers y
  backups nocturnos andando (ver 0009), este registro (#113).
- Paso 2: bases de objetos (#124) y cuentas y perfiles (#125, #126) en `main`, detrás de
  interruptores.
- Paso 3: preventas en `main` (#134); lugares, personas en eventos, series y formularios en PRs
  abiertos (#137, #139, #141, #143).
- Aparte: propinas en lugar del cafecito (#133), en `main` y apagadas.
