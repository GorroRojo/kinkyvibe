/**
 * Agenda impresa: volantes para repartir en papel con los próximos eventos (docs/panel.md#agenda-impresa).
 * Solo lee; lo que se cambia en la página (ícono, subtítulo, lugar, precio, textos) no se guarda.
 */
import { requireAdmin } from '$lib/server/auth';
import { agendaImpresaRows } from '$lib/server/eventos/agendaImpresa.js';
import { qrSvg } from '$lib/server/tickets/qr.js';
import { CALENDAR_URL, parseRange } from '$lib/utils/agendaImpresa.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const range = parseRange(url.searchParams);
	return {
		range,
		events: await agendaImpresaRows(platform, range),
		// El QR opcional del pie (lleva al calendario del sitio).
		qr: qrSvg(CALENDAR_URL),
		// Pantalla propia, sin el menú del panel: así se imprime solo la hoja.
		bare: true
	};
}
