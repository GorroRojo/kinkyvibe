/**
 * Agenda impresa: volantes para repartir en papel con los próximos eventos (docs/panel.md#agenda-impresa),
 * y con `?modo=instagram`, los posts de la agenda del mes para Instagram (docs/panel.md#instagram).
 * Solo lee; lo que se cambia en la página (ícono, subtítulo, lugar, precio, textos) no se guarda.
 */
import { requireAdmin } from '$lib/server/auth';
import { agendaImpresaRows } from '$lib/server/eventos/agendaImpresa.js';
import { qrSvg } from '$lib/server/tickets/qr.js';
import { resolveFondoPercent } from '$lib/server/tickets/fondo.js';
import { getDB } from '$lib/server/db';
import { CALENDAR_URL, parseRange } from '$lib/utils/agendaImpresa.js';
import { instagramRange } from '$lib/utils/agendaInstagram.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const mode = url.searchParams.get('modo') === 'instagram' ? 'instagram' : 'volantes';
	// Instagram, sin rango elegido: la agenda del mes (lo que queda de este o el que viene).
	const range =
		mode === 'instagram' ? instagramRange(url.searchParams) : parseRange(url.searchParams);
	const [events, fondo] = await Promise.all([
		agendaImpresaRows(platform, range),
		// La placa del Fondo arranca con el porcentaje de este mes (el mismo que descuentan las
		// entradas); si no se sabe, null y la página lo deja para escribir.
		mode === 'instagram'
			? resolveFondoPercent({ db: getDB(platform) })
					.then((f) => f.percent)
					.catch(() => null)
			: null
	]);
	return {
		mode,
		range,
		events,
		fondoPercent: fondo,
		// El QR opcional del pie (lleva al calendario del sitio).
		qr: qrSvg(CALENDAR_URL),
		// Pantalla propia, sin el menú del panel: así se imprime solo la hoja.
		bare: true
	};
}
