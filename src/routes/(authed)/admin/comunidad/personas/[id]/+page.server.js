/**
 * Ficha de una persona: todas sus compras y entradas, y notas internas. Solo admins (el `load`
 * y cada action llaman a `requireAdmin`). Sin DNI. Las notas quedan en el registro de actividad.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB } from '$lib/server/db';
import {
	addNote,
	deleteNote,
	groupPeople,
	listNotes,
	loadEventInfo,
	loadPeopleOrders,
	normalizeEmail,
	personId,
	validateNote
} from '$lib/server/admin/people.js';
import { orderReference } from '$lib/utils/tickets.js';

/**
 * El email de la persona con ese id, o `null`.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} id
 */
async function findPerson(db, id) {
	if (!/^[0-9a-f]{16}$/.test(id)) return null;
	const orders = await loadPeopleOrders(db);
	for (const email of new Set(orders.map((o) => normalizeEmail(o.buyer_email)))) {
		if ((await personId(email)) === id) return { email, orders };
	}
	return null;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const found = await findPerson(db, params.id);
	if (!found) error(404, 'No encontramos a esa persona.');
	const mine = found.orders.filter((o) => normalizeEmail(o.buyer_email) === found.email);
	const events = await loadEventInfo(mine);
	const now = Date.now();
	const [person] = groupPeople(mine, events, { now });
	// Entradas de sus órdenes (nombre, pronombres, código, check-in; nunca el token).
	/** @type {Record<string, { name: string, pronouns: string, code: string, checkedInAt: number | null }[]>} */
	const tickets = {};
	const { results } = await db
		.prepare(
			`SELECT t.order_id, t.holder_name, t.holder_pronouns, t.code, t.checked_in_at
			FROM tickets t JOIN orders o ON o.id = t.order_id
			WHERE lower(trim(o.buyer_email)) = ?1`
		)
		.bind(found.email)
		.all();
	for (const r of results) {
		(tickets[String(r.order_id)] ??= []).push({
			name: String(r.holder_name),
			pronouns: String(r.holder_pronouns ?? ''),
			code: String(r.code ?? ''),
			checkedInAt: r.checked_in_at === null ? null : Number(r.checked_in_at)
		});
	}
	return {
		now,
		person,
		orders: mine
			.map((o) => ({
				id: o.id,
				reference: orderReference(o.id),
				slug: o.event_slug,
				event: events.get(o.event_slug)?.title ?? o.event_slug,
				start: events.get(o.event_slug)?.start ?? null,
				name: o.buyer_name,
				quantity: o.quantity,
				total: o.total,
				method: o.payment_method,
				status: o.status,
				createdAt: o.created_at,
				tickets: tickets[o.id] ?? []
			}))
			.reverse(),
		notes: await listNotes(db, found.email)
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	addNote: async ({ locals, url, params, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { note: { ok: false, message: 'Sin base de datos.' } });
		const found = await findPerson(db, params.id);
		if (!found) return fail(404, { note: { ok: false, message: 'No encontramos a esa persona.' } });
		const v = validateNote(String((await request.formData()).get('body') ?? '').slice(0, 3000));
		if (!v.ok) return fail(400, { note: { ok: false, message: v.error } });
		await addNote(db, { email: found.email, body: v.body, by: admin.login });
		// El texto de la nota no va al registro (puede ser sensible): solo que se agregó.
		await logAdminAction(db, locals, {
			action: 'person.note.add',
			targetType: 'person',
			targetId: params.id,
			summary: 'Agregó una nota a una persona'
		});
		return { note: { ok: true, message: 'Nota guardada.' } };
	},

	deleteNote: async ({ locals, url, params, platform, request }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { note: { ok: false, message: 'Sin base de datos.' } });
		const found = await findPerson(db, params.id);
		if (!found) return fail(404, { note: { ok: false, message: 'No encontramos a esa persona.' } });
		const id = Number((await request.formData()).get('id'));
		if (!Number.isSafeInteger(id) || !(await deleteNote(db, { email: found.email, id }))) {
			return fail(404, { note: { ok: false, message: 'Esa nota ya no está.' } });
		}
		await logAdminAction(db, locals, {
			action: 'person.note.delete',
			targetType: 'person',
			targetId: params.id,
			summary: 'Borró una nota de una persona'
		});
		return { note: { ok: true, message: 'Nota borrada.' } };
	}
};
