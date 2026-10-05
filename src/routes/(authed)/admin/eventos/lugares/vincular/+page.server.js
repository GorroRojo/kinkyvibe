/**
 * Eventos → Lugares → «Vincular lugares»: los eventos sin lugar que tienen el «Dónde» escrito a
 * mano, juntados por lugar, con el perfil de lugar que probablemente es cada grupo (decisión de
 * gorrite: sugerir y confirmar de a muchos). Nada se guarda hasta «Vincular». Solo admins (las
 * acciones de formulario de SvelteKit ya revisan el origen del pedido: CSRF); cada vínculo y cada
 * «Dejar como texto» queda en el registro. Ver src/lib/server/amigues/venueLinking.js.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import {
	dismissEvents,
	importableEvents,
	loadVenueLinkPlan,
	readLinkChoices,
	runVenueLinks,
	undismissEvents
} from '$lib/server/amigues/venueLinking.js';

/** @param {number} n */
const eventos = (n) => `${n} ${n === 1 ? 'evento' : 'eventos'}`;

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const events = await importableEvents(platform);
	return { ...(await loadVenueLinkPlan(db, events)), total: events.length };
}

/** @type {import('./$types').Actions} */
export const actions = {
	// Un grupo («Vincular») o los marcados («Vincular todas las marcadas»), de a tandas: la página
	// repite el pedido con los que faltan (`remaining`).
	vincular: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { linkResult: null, error: 'Sin base de datos.' });
		const choices = readLinkChoices(await request.formData());
		if (!choices.length) {
			return fail(400, { linkResult: null, error: 'Elegí al menos un lugar para vincular.' });
		}
		const events = await importableEvents(platform);
		const { results, remaining } = await runVenueLinks(db, events, choices, {
			actor: admin.login
		});
		for (const r of results) {
			if (!r.linked.length) continue;
			await logAdminAction(db, locals, {
				action: 'venue.bulk_link',
				targetType: 'profile',
				targetId: r.venueId,
				summary: `Vinculó ${eventos(r.linked.length)} al lugar «${r.title}» (Vincular lugares)`,
				detail: {
					events: r.linked.map((l) => l.slug),
					privacy: r.linked.map((l) => l.privacy ?? 'lugar')
				}
			});
		}
		return { linkResult: { results, remaining } };
	},

	// «Dejar como texto»: los eventos de un grupo no se vuelven a sugerir.
	dejar: async ({ locals, url, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { dismiss: { ok: false, message: 'Sin base de datos.' } });
		const form = await request.formData();
		const key = String(form.get('dejar') ?? '');
		const slugs = form.getAll(`evento:${key}`).map(String);
		const title = String(form.get(`titulo:${key}`) ?? '').slice(0, 200);
		const events = await importableEvents(platform);
		const done = await dismissEvents(db, events, slugs, { actor: admin.login });
		if (!done.length) {
			return fail(400, {
				dismiss: { ok: false, message: 'Esos eventos ya no están para vincular.' }
			});
		}
		await logAdminAction(db, locals, {
			action: 'venue.link_dismiss',
			targetType: 'event',
			targetId: done[0],
			summary: `Dejó como texto «${title}» (${eventos(done.length)}, Vincular lugares)`,
			detail: { events: done }
		});
		return {
			dismiss: {
				ok: true,
				message: `Listo: «${title}» queda como texto en ${eventos(done.length)}.`
			}
		};
	},

	// «Volver a sugerir»: borra el «Dejar como texto» de un grupo.
	volver: async ({ locals, url, platform, request }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { dismiss: { ok: false, message: 'Sin base de datos.' } });
		const form = await request.formData();
		const key = String(form.get('volver') ?? '');
		const slugs = form.getAll(`dejado:${key}`).map(String);
		const title = String(form.get(`titulo:${key}`) ?? '').slice(0, 200);
		const n = await undismissEvents(db, slugs);
		if (!n) return fail(400, { dismiss: { ok: false, message: 'No había nada para volver.' } });
		await logAdminAction(db, locals, {
			action: 'venue.link_undismiss',
			targetType: 'event',
			targetId: slugs[0],
			summary: `Volvió a sugerir lugar para «${title}» (${eventos(n)}, Vincular lugares)`,
			detail: { events: slugs }
		});
		return { dismiss: { ok: true, message: `Listo: «${title}» vuelve a tener sugerencias.` } };
	}
};
