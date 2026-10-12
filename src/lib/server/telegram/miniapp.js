/**
 * La Mini App del calendario (decisión 0034, docs/telegram.md): `/telegram/app`, el calendario
 * del sitio en formato compacto para abrir adentro de Telegram, **sin login**. Muestra lo mismo
 * que `/calendario` le muestra a cualquiera: los próximos eventos públicos (la capa compartida,
 * `sitePosts`), el lugar según su nivel de privacidad (`withVenuePlaces`, como las listas) y el
 * estado de la venta (`ticketStatesFor` + `ticketCta`). Comprar y todo lo demás se abre en el
 * navegador, afuera de Telegram (Mercado Pago no va adentro).
 */
import { sitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { withVenuePlaces } from '$lib/server/amigues/venues.js';
import { ticketStatesFor } from '$lib/server/tickets/listStates.js';
import { argDateTimeLong, argTime, toArgentina, parseSiteDate } from '$lib/utils/dates.js';
import { placeShort } from '$lib/utils/eventPlace.js';
import { ticketCta } from '$lib/utils/ticketCta.js';

/**
 * @typedef {{ slug: string, title: string, time: string, place: string, image: string | null,
 *   href: string, ticket: { text: string, href: string | null } | null, cancelled: boolean }} AppEvent
 * @typedef {{ day: string, events: AppEvent[] }} AppDay
 */

/** Cuántos eventos muestra, como mucho (el resto, en el sitio). */
export const APP_MAX_EVENTS = 40;

/**
 * Los próximos eventos agrupados por día (hora de Argentina). Pura (para los tests).
 *
 * @param {{ meta: Record<string, any> }[]} posts ya con el lugar público (`withVenuePlaces`)
 * @param {import('$lib/utils/ticketCta.js').TicketStates | null} states
 * @param {{ now: number, origin: string }} ctx
 * @returns {AppDay[]}
 */
export function groupByDay(posts, states, { now, origin }) {
	/** @type {AppDay[]} */
	const days = [];
	const upcoming = posts
		.filter((p) => p.meta?.category === 'calendario' && p.meta?.postID)
		.filter((p) => parseSiteDate(p.meta.start).getTime() > now)
		.sort((a, b) => parseSiteDate(a.meta.start).getTime() - parseSiteDate(b.meta.start).getTime())
		.slice(0, APP_MAX_EVENTS);
	for (const p of upcoming) {
		const m = p.meta;
		const slug = String(m.postID);
		// «jueves 9 de enero» (con el año solo si no es el de ahora).
		const long = argDateTimeLong(m.start, { time: false });
		const sameYear = toArgentina(m.start).getFullYear() === toArgentina(now).getFullYear();
		const day = sameYear ? long.replace(/ de \d{4}$/, '') : long;
		const cta = ticketCta(m, states);
		/** @type {AppEvent} */
		const ev = {
			slug,
			title: String(m.title ?? slug),
			time: argTime(m.start),
			place: placeShort(m),
			image: m.featured ? new URL(String(m.featured), origin).href : null,
			href: `${origin}/calendario/${encodeURIComponent(slug)}`,
			ticket:
				cta?.kind === 'buy'
					? { text: 'Comprar en el sitio', href: `${origin}${cta.href}` }
					: cta?.kind === 'note'
						? { text: cta.text, href: null }
						: null,
			cancelled: m.status === 'cancelado'
		};
		const last = days[days.length - 1];
		if (last && last.day === day) last.events.push(ev);
		else days.push({ day, events: [ev] });
	}
	return days;
}

/**
 * Lo que necesita la página.
 *
 * @param {App.Platform | undefined} platform
 * @param {string} origin
 * @param {number} [now]
 */
export async function miniAppData(platform, origin, now = Date.now()) {
	const posts = (await sitePosts(platform)).filter(
		(p) => p.meta?.category === 'calendario' && parseSiteDate(p.meta.start).getTime() > now
	);
	const [withPlaces, states] = await Promise.all([
		withVenuePlaces(getDB(platform), posts),
		ticketStatesFor(platform, posts)
	]);
	return { days: groupByDay(withPlaces, states, { now, origin }) };
}
