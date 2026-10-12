# 0038. Navegación del panel: opción C (secciones, Puerta propia, «Ir a…» y Recientes)

- Fecha: 2026-10-11
- Estado: Aceptada (parte 1). Cambia el menú de la revisión de UI (paso 3) y el mapa de 0026 en
  un punto: la Puerta pasa a ser un área propia.
- La parte 2 ([0039](0039-navegacion-del-panel-opcion-c-parte-2.md)) cambia tres puntos: la
  Puerta sale de la barra lateral, hay «+ Crear» y las pestañas muestran lo que viene.

## Contexto

La barra lateral tenía unos 30 links en 6 grupos que se abrían y cerraban, con «Cargar evento» y
«Puerta» resaltados como ítems. Se investigó cómo navegan otros paneles (NN/g, Eventbrite, Luma,
Linear, Shopify, Stripe, Vercel) y se armaron tres prototipos (`/estilo/prototipos/panel-nav`,
PR #295). gorrite eligió la opción C, con cambios.

## Decisión

- **8 secciones en la barra lateral**, con ícono y nombre, sin sub-ítems: Inicio, Puerta,
  Eventos, Ventas, Comunidad, Contenido, Estadísticas y Ajustes al pie. Las páginas de cada
  sección son pestañas arriba de la página (también en Eventos).
- **La Puerta es una sección propia**, resaltada (se usa en el celu, con gente esperando). Su URL
  sigue siendo `/admin/checkin`.
- **Sin menú «+ Crear»**. «Cargar evento» sale del menú (es una acción, no un lugar): queda como
  botón en la página de Eventos, en el buscador y con `g n`.
- **«Ir a…»** con ⌘K / Ctrl+K: el buscador que ya existía, mostrado como «Ir a… o buscar».
  Encuentra las páginas del panel y los eventos por nombre. Es un camino más, nunca el único.
- **Recientes**: las últimas páginas que abrió cada admin, las que entran en la barra, hasta 7,
  guardadas en su navegador.
- **Sin «Más»** en las pestañas de la ficha del evento: la ficha y los ajustes de mails no cambian
  en esta parte (quedan para otra decisión).
- Los modos del panel lateral de cada admin («Siempre abierto», el default; «Solo íconos»; «Se
  oculta») siguen.

## Descartado

- A (secciones y pestañas, sin la Puerta propia ni Recientes) y B (grilla de secciones con la
  lista de páginas debajo): ver la comparación en el prototipo.
- Un menú «+ Crear» para todo lo que se crea.
- Que la Puerta esté en la barra y también como pestaña de Eventos (el mismo destino dos veces).

## Consecuencias

- `nav.js`: área y grupo `puerta`, `eventos-nuevo` con `menu: false`, `sideSections` y
  `sectionTabs` también para Eventos. `SideNav.svelte` muestra las secciones y Recientes
  (`recentPlaces.js`).
- Lo que viene («Próximamente») ya no se ve en la barra de la compu; sigue en el panel «Más» del
  celu. Pendientes en la hoja de ruta.
