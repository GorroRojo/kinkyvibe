/**
 * Talleres en varias partes con una sola entrada (docs/talleres-partes.md): la lista «Las N partes
 * del taller» que va en los mails de entradas, transferencia y recordatorios, y en la página de
 * cada entrada. Una línea por parte, con su fecha y su lugar.
 *
 * Si el taller vende una entrada por parte («Entradas por parte»), o el evento no es un taller,
 * no hay lista (`null`): esos mails y páginas salen como siempre.
 */
import { readWorkshop } from '../eventos/partes.js';
import { buyerLocation } from '../amigues/venues.js';
import { getEventMeta } from './events.js';
import { partLine, partsListTitle } from '../../utils/partes.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ title: string, lines: string[] }} PartsList */

/**
 * La lista de partes del taller `slug` (la dirección del evento que vende la entrada), o `null`
 * si no es un taller con una sola entrada para todas las partes. Las partes son las que ve
 * cualquiera (como los recordatorios). Si algo falla, `null`: la lista nunca frena un mail.
 *
 * @param {D1Database | null | undefined} db
 * @param {string} slug
 * @param {{ online?: boolean, buyer?: boolean }} [options]
 * `online`: el lugar de cada parte es «Online». `buyer`: quien mira compró (con la compra
 * aprobada), así que ve el lugar completo aunque en el sitio no se muestre (como en el mail).
 * @returns {Promise<PartsList | null>}
 */
export async function workshopPartsList(db, slug, { online = false, buyer = true } = {}) {
	try {
		const ws = await readWorkshop(db, slug);
		if (!ws || ws.total < 2 || ws.workshop.perPart || ws.workshop.slug !== slug) return null;
		const lines = [];
		for (const p of ws.parts) {
			lines.push(partLine({ ...p, where: online ? 'Online' : await placeOf(db, p.slug, buyer) }));
		}
		return { title: partsListTitle(ws.total), lines };
	} catch (e) {
		console.error(`[entradas] no se pudo leer las partes del taller ${slug}:`, e);
		return null;
	}
}

/**
 * «Nombre · dirección» del lugar de una parte: el de quien compró si corresponde; si no, el de
 * la ficha del evento.
 *
 * @param {D1Database | null | undefined} db
 * @param {string} slug
 * @param {boolean} buyer
 */
async function placeOf(db, slug, buyer) {
	const place = (buyer ? await buyerLocation(db, slug) : null) ?? (await getEventMeta(slug));
	return [place?.location_name, place?.location].filter(Boolean).join(' · ');
}
