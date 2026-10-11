import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { arDay } from '$lib/server/admin/inicio.js';
import {
	MAX_QUERY,
	eventTabActions,
	eventTabsLabel,
	groupResults,
	searchDatabase,
	searchEvents,
	searchTags
} from '$lib/server/admin/search.js';
import { currentSiteTags } from '$lib/utils/siteTags.js';
import { listEvents } from '$lib/server/eventos/index.js';
import { isTestEventSlug, listTicketedEvents } from '$lib/server/tickets/events.js';
import { checkinHref } from '$lib/admin/links.js';
import { hasRecordCriteria, parseSearchQuery } from '$lib/utils/searchQuery.js';

/** Búsquedas por admin por minuto (la paleta espera 150 ms entre teclas; esto sobra). */
const SEARCH_RATE_LIMIT = { limit: 120, windowSeconds: 60 };

/**
 * Buscador global del panel (la paleta de comandos). `GET /admin/buscar?q=…` →
 * `{ groups: [{ id, label, items: [{ id, icon, title, sub, href }] }], today: [...] }` (sin
 * repetir la búsqueda: puede ser un DNI).
 * `today`: los eventos de hoy que venden entradas, para la acción «Abrir la puerta de hoy».
 * Con eventos encontrados, el primero trae atajos a sus pestañas (Puerta, Órdenes…; grupo
 * `event-tabs`; con `e:latex puerta`, solo esa pestaña y primero).
 * Entiende los operadores de `$lib/utils/searchQuery.js` (`#etiqueta`, `@persona`, `hoy`…).
 * Solo admins; con límite por admin. No guarda las búsquedas.
 */
/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url, platform }) {
	const user = requireAdmin(locals, url);
	const db = getDB(platform);
	const headers = { 'cache-control': 'private, no-store' };
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY);
	const pq = parseSearchQuery(q);
	const searching = hasRecordCriteria(pq);

	if (db && searching) {
		try {
			// El bucket lleva el id de GitHub de le admin (público en auth.js), nunca una IP.
			const rl = await hitRateLimit(db, `admin-search:${user.id}`, SEARCH_RATE_LIMIT);
			if (!rl.allowed) {
				return json(
					{ error: 'Demasiadas búsquedas seguidas. Esperá un momento.' },
					{ status: 429, headers: { ...headers, 'retry-after': String(rl.retryAfter) } }
				);
			}
		} catch (error) {
			logDBError('límite del buscador', error);
		}
	}

	const [events, ticketedList] = await Promise.all([listEvents(), listTicketedEvents()]);
	const visible = events.filter((e) => dev || !isTestEventSlug(e.slug));
	const ticketed = new Set(ticketedList.map((t) => t.slug));
	const titles = new Map(events.map((e) => [e.slug, e.title]));
	const today = arDay(Date.now());
	const todayEvents = visible
		.filter((e) => !e.unpublished && e.start && arDay(e.start) === today && ticketed.has(e.slug))
		.map((e) => ({ slug: e.slug, title: e.title, href: checkinHref(e.slug) }));

	if (!searching) return json({ groups: [], today: todayEvents }, { headers });

	const tags = currentSiteTags().tagsData();
	const records = await searchDatabase(db, pq, { titles });
	const found = searchEvents(visible, pq, { ticketed, tags });
	const top = found.length ? visible.find((e) => `event:${e.slug}` === found[0].id) : undefined;
	const groups = groupResults({
		events: found,
		eventTabs: top ? eventTabActions(top, { tickets: ticketed.has(top.slug), tab: pq.tab }) : [],
		eventTabsLabel: top ? eventTabsLabel(top.title) : undefined,
		tabFirst: Boolean(pq.tab),
		...records,
		tags: searchTags(tags, pq)
	});
	return json({ groups, today: todayEvents }, { headers });
}
