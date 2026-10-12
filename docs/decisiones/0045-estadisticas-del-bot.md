# 0045. Estadísticas de uso del bot: quién y cuánto, y para qué solo sumado

- Fecha: 2026-10-12
- Estado: Aceptada (pedido de gorrite, 12/10, con la regla de privacidad que sigue). Suma una
  excepción a «de Telegram solo se guarda el id» ([0037](0037-puerta-por-telegram.md), migración
  0033): para las estadísticas se guarda también el nombre y el @usuario de quien usa el bot.

## Contexto

gorrite pidió estadísticas de uso del bot con una regla dura: **nunca se tiene que poder saber qué
miró o buscó una persona**. Se puede saber quién usa el bot, cuánto lo usa cada persona (solo
totales) y para qué se usa en general, incluido qué se mira y qué se busca, pero solo sumado y sin
poder atarlo a nadie.

## Decisión

- **Dos tablas que no se pueden cruzar** (migración 0057):
  - una por persona y por día (hora de Argentina) con un solo número, cuántas veces usó el bot, y
    el nombre que manda Telegram. Nada de qué hizo, ni una hora más fina que el día;
  - otra con contadores por semana ISO, tipo y clave (la pantalla, el comando, lo buscado, la cosa
    pública). Sin el id de nadie ni el día.
- **No se pueden juntar**: no comparten ninguna clave ni una hora fina, y las dos son
  `WITHOUT ROWID` (no queda el orden en que se insertaron).
- **Solo lo público**: una cosa se cuenta solo si está en el índice público del bot y el sitio la
  lista. Nunca nada oculto, «solo con cuenta», sin aprobar ni no listado.
- **En el panel, umbrales del lado del servidor**: lo buscado y las cosas se muestran solo desde 5
  veces en la semana (lo demás, sumado en «otras»), y el detalle de una semana solo si esa semana
  usaron el bot 5 personas o más: con menos, lo contado sería de alguien que la lista de personas
  nombra. Los totales por tipo se muestran siempre.
- **Retención**: las filas por persona, 180 días. Los totales quedan (no tienen a nadie).
- **Nunca traba al bot**: una escritura por update, en `waitUntil`, y si falla se pierde el conteo.
- Sale detrás del interruptor **Telegram: estadísticas de uso** (`telegram_estadisticas`),
  apagado (0001). La migración va a preview y producción antes del merge (0028).

## Descartado

- **Una sola tabla con el id y la acción** (un registro de eventos): permitiría ver qué hizo cada
  persona, justo lo que la regla prohíbe.
- **Contar en Analytics Engine** (como las visitas, [analiticas.md](../analiticas.md)): no tiene
  personas a propósito, y «quién usa el bot» las necesita. Las dos tablas en D1 hacen las dos cosas
  sin juntarlas.
- **Mostrar todo el detalle y esconder en la interfaz lo de menos de 5**: lo escondido igual
  saldría de la base y llegaría al navegador.
