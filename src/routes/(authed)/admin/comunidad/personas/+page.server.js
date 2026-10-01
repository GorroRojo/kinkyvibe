/**
 * Personas: quienes compraron, agrupades por email (ver $lib/server/admin/people.js). Solo
 * admins. Sin DNI.
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import {
	groupPeople,
	loadEventInfo,
	loadPeopleOrders,
	noteCounts,
	personId,
	seriesLabel
} from '$lib/server/admin/people.js';
import { seriesOf } from '$lib/utils/sheetImport.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const db = getDB(platform);
	if (!db) return { dbAvailable: false, people: [], series: [], now: Date.now() };
	try {
		const orders = await loadPeopleOrders(db);
		const events = await loadEventInfo(orders);
		const notes = await noteCounts(db);
		const now = Date.now();
		const people = await Promise.all(
			groupPeople(orders, events, { now }).map(async (p) => ({
				id: await personId(p.email),
				name: p.names[0] ?? p.email,
				otherNames: p.names.slice(1),
				pronouns: p.pronouns,
				email: p.email,
				bought: p.bought.length,
				attended: p.attended.length,
				noShows: p.noShows.length,
				series: p.series,
				spent: p.spent,
				firstVisit: p.firstVisit,
				lastVisit: p.lastVisit,
				lastPurchase: p.lastPurchase,
				notes: notes.get(p.email) ?? 0
			}))
		);
		// Series con el título de su evento más reciente, la más grande primero.
		/** @type {Map<string, { id: string, title: string, start: number, people: number }>} */
		const series = new Map();
		for (const [slug, info] of events) {
			const id = seriesOf(slug);
			const start = info.start ? Date.parse(info.start) : 0;
			const s = series.get(id);
			const title = seriesLabel(info.title);
			if (!s || start > s.start) series.set(id, { id, title, start, people: 0 });
		}
		for (const p of people) {
			for (const id of p.series) {
				const s = series.get(id);
				if (s) s.people++;
			}
		}
		return {
			dbAvailable: true,
			now,
			people,
			series: [...series.values()]
				.sort((a, b) => b.people - a.people)
				.map(({ id, title, people }) => ({ id, title, people }))
		};
	} catch (error) {
		logDBError('personas', error);
		return { dbAvailable: false, people: [], series: [], now: Date.now() };
	}
}
