# 0039. Navegación del panel, opción C parte 2 (Fijados, «+ Crear», Puerta fuera de la barra)

- Fecha: 2026-10-11
- Estado: Aceptada. Cambia tres puntos de [0038](0038-navegacion-del-panel-opcion-c.md): la Puerta
  sale de la barra lateral, hay un menú «+ Crear» y las pestañas muestran lo que viene.

## Contexto

gorrite probó la parte 1 de la opción C (#301) y pidió una parte 2 con sus respuestas.

## Decisión

- **La Puerta sale de la barra lateral.** Sigue en la barra de abajo del celu, en «Ir a…», en la
  pestaña Puerta de cada evento y en el bot de Telegram. Su URL (`/admin/checkin`) no cambia. La
  barra lateral queda con 7 secciones.
- **«+ Crear ▾»** en la barra de arriba (y un «+» en el header del celu) en vez de «+ Cargar
  evento»: un menú con todo lo que se crea hoy (evento, serie, lugar, eventos desde una planilla,
  rol, código de descuento, perfil, material, entrada de la Kinkipedia) y lo que viene como
  «Próximamente», deshabilitado. Las mismas acciones están en «Ir a…». El botón «Cargar evento»
  de la página de Eventos sigue.
- **Fijados**: 📌 en cada reciente y en cada resultado de «Ir a…» que lleva a una página del panel
  (no las «Próximamente» ni las secciones de la barra). Van arriba de Recientes, hasta 7, en el
  orden de cada admin (arrastrar, o «Subir»/«Bajar» con el teclado). En su navegador, por login.
- **Recientes más lindas**: ícono, nombre y una línea chica de contexto (el evento, la sección).
- **Pestañas**: llevan el contador «a revisar» de su sección (el mismo que la barra lateral y
  «Para revisar») y lo que viene al final, gris y sin link, salvo con «Ocultar lo que viene». En
  el celu (< 600 px) toda barra de pestañas es un botón «Sección: … ▾» con la lista (sin tira que
  se desliza); el botón es la navegación principal de la página, y en la ficha del evento las
  acciones del encabezado quedan debajo, más chicas, con «⋯ Acciones».
- **Más ágil**: barrita de carga arriba mientras llega la página siguiente, el link tocado queda
  «cargando», y los menús precargan al pasar el mouse.
- **Links «volver»**: ninguno lleva a una página «Próximamente» ni a una pestaña hermana.

## Descartado

- Dejar la Puerta en la barra lateral y además en el celu: en la compu se entra desde cada evento.
- Fijar páginas «Próximamente» o las secciones de la barra (ya están a un clic).

## Consecuencias

- `nav.js`: grupo `puerta` con `side: false`; `sectionTabs` con `counts` y `hideSoon`;
  `areaBackLink` sin link si la página del área es «Próximamente».
- Nuevos `createMenu.js`, `pinnedPlaces.js`, `CreateMenu.svelte` y `PlaceLink.svelte`; `Tabs`
  con `menu` en todas las barras del panel.
- `backLinks.test.js` cuida los links «volver».
