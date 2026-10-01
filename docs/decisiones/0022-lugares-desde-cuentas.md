# 0022. Las cuentas también pueden crear lugares

- Fecha: 2026-10-01
- Estado: Aceptada

## Contexto

La propuesta de #137 dejaba la carga de lugares solo a les admins.

## Decisión

- Cualquier cuenta puede crear un lugar. Aparece en el sitio **recién cuando une admin lo
  aprueba**, igual que los perfiles públicos nuevos.

## Descartado

- Lugares cargados solo por admins.

## Consecuencias

- En #137. Los lugares nuevos esperan en "Para revisar".
- Ajuste (gorrite, después de #137): rechazar un lugar **no lo borra**. Queda quién, cuándo y un
  motivo opcional (tabla `profile_rejections`, migración 0025); sigue sin aparecer en el sitio,
  sale de "Para aprobar" y quien lo cargó lo ve como «Rechazado» en Mi rincón → Perfiles, con el
  motivo. Lo puede editar (sigue rechazado) y lo vuelve a mandar con el botón «Volver a mandar»
  (vuelve a "Para aprobar" y queda en Actividad). En el panel, la tarjeta "Rechazados" (con CSV)
  los lista y deja aprobarlos.
- Las cuentas también cargan la ubicación en el mapa (latitud y longitud), con el mismo campo y
  la misma validación que el editor del panel.
