# 0003. Superadmins y permisos

- Fecha: 2026-09-30
- Estado: Aceptada

## Contexto

Les admins tienen que poder hacer todo sin código ni terminal. Más adelante van a sumarse
organizadores con permisos más acotados.

## Decisión

- **gorrite, Mel y Pau son superadmins**, les tres.
- Escalera de permisos para cargar y editar contenido: superadmins ahora → organizadores (sus
  eventos y series) después → cualquier cuenta propone con revisión, mucho más adelante.
- Las cuentas superadmin quedan como están, sin pasos extra obligatorios por ahora.
- Les admins pueden pasar **cualquier límite** del sistema (ver 0006), con aviso, confirmación y
  registro en la actividad. "La producción de eventos es caótica, el sistema tiene que ser
  versátil."
- Claude puede operar el panel con un conector (cargar eventos, ver ventas, confirmar
  transferencias), siempre con permiso.

## Descartado

- Un solo nivel de admin, sin lugar para organizadores.
- Límites duros que ni les admins pueden pasar.

## Consecuencias

- El código de permisos distingue superadmin de organizadore desde el principio, aunque hoy solo
  haya superadmins.
- Toda acción que pasa un límite queda en el registro de actividad.
