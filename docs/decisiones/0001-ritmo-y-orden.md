# 0001. Ritmo y orden del plan

- Fecha: 2026-09-30
- Estado: Aceptada

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
- Lo social pronto: moderar con tres personas no alcanza, y la comunidad ya tiene su lugar.

## Consecuencias

- Un agente no arranca un bloque que no es el actual sin que gorrite lo pida.
- Todo PR de algo nuevo trae su interruptor y sale apagado.
