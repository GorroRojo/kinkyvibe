# 0042. Ajustes: una portada con 4 grupos de tarjetas en vez de pestañas

- Fecha: 2026-10-12
- Estado: Aceptada (gorrite, 12/10, en la Mesa, con la maqueta de 4 grupos). Cambia un punto de
  [0038](0038-navegacion-del-panel-opcion-c.md): Ajustes ya no lleva a su primera página
  (Cobros) ni tiene pestañas.

## Contexto

Con la opción C, cada sección de la barra lateral lleva a la primera página de su grupo, que
muestra una barra de pestañas con las demás. Ajustes tiene 9 páginas: una tira larga en la compu y
una lista ▾ larga en el celu, donde lo que se configura una vez (Cobros, Fondo) se mezcla con lo
que se mira (Automatizaciones, Actividad). El prototipo de la opción C ya proponía agrupar Ajustes
en Plata, Comunicación, Equipo y Sistema.

## Decisión

- **«Ajustes» lleva a una portada** (`/admin/ajustes`) con los cuatro subgrupos de
  `src/lib/admin/nav.js` y una tarjeta por página: ícono, nombre, qué hay en una línea y una
  **línea de estado** con un dato en vivo («Mercado Pago y transferencia», «3 admins», «4 en
  prueba», «Todo al día», «Último cambio: hace 5 min»…).
- La línea de estado sale de **una tanda a la base** (más lo que ya calcula Automatizaciones). Si
  el dato no es barato o no es claro, la tarjeta va sin línea: mejor nada que adivinar.
- **Sin pestañas en Ajustes**, tampoco la lista ▾ del celu. Cada página vuelve a la portada con
  «← Ajustes».
- Las URLs de cada página no cambian; «Ir a…», Recientes y Fijados siguen llevando directo.

## Descartado

- Dejar las pestañas además de la portada: dos maneras de lo mismo, y la tira larga era el
  problema.
- Ir a buscar el porcentaje del Fondo a fondo.kinkyvibe.ar para la tarjeta: haría lenta la
  portada; se muestra el fijado a mano o el último que llegó.

## Consecuencias

- `NAV_GROUPS` admite `landing` (el ítem de la portada de un grupo); un grupo con portada no tiene
  `sectionTabs` y su sección de la barra lleva a la portada.
- Una página nueva de Ajustes necesita `sub` (su grupo) y `desc` (la línea de la tarjeta) en
  `nav.js`, y, si tiene un dato barato, su línea en `src/lib/server/admin/ajustesStatus.js`.
