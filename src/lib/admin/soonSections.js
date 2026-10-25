/**
 * Las URLs de las secciones «Próximamente» del panel (`soon: true` en $lib/admin/nav.js), sin
 * íconos ni nada más. La usa el matcher `src/params/soon.js`, que va en el JavaScript de todas las
 * páginas del sitio: importar nav.js desde ahí sumaba el menú del panel entero, con sus íconos.
 *
 * nav.js sigue mandando: nav.test.js controla que esta lista sea exactamente la de sus secciones
 * con `soon: true`. Al sumar, construir o sacar una sección «Próximamente», cambiá las dos.
 */
export const SOON_HREFS = Object.freeze([
	'/admin/ventas/tienda',
	'/admin/mensajes',
	'/admin/contenido/colecciones',
	'/admin/contenido/videos'
]);
