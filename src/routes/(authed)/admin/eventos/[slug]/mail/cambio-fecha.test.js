/**
 * «Avisar a les compradores» (cambio de fecha) en la ficha del evento: las acciones son solo para
 * admins, mandan solo la versión que se ve (si la fecha volvió a cambiar, no mandan), le escriben
 * una vez a cada compra aprobada, dejan registro sin mails de nadie, y «No hace falta» saca el
 * aviso de arriba sin mandar nada. D1 de miniflare; personas inventadas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';
import { runImport } from '$lib/server/contenido/importer.js';
import { seedFiles } from '$lib/server/semilla/testing.js';
import { setContentDB } from '$lib/server/contenido/repo.js';
import { dateChangeOffer, recordDateChange } from '$lib/server/tickets/dateChange.js';
import { actions } from './+page.server.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

// Evento de prueba de la semilla que vende entradas (solo en dev/tests, nunca en el sitio publicado).
const EVENT = 'prueba-entradas-2026-12';
const ADMIN = { id: 4594048, login: 'GorroRojo', name: null, avatar_url: '' };
const BEFORE = { start: '2026-12-05T21:00-03:00', end: '2026-12-06T02:00-03:00' };
const AFTER = { start: '2026-12-12T21:00-03:00', end: '2026-12-13T02:00-03:00' };

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
// El evento de la semilla de contenido (antes, su .md del repo; decisión 0032).
const source = (() => {
	const f = seedFiles('calendario').find((x) => x.legacySlug === EVENT);
	if (!f) throw new Error(`La semilla no tiene ${EVENT}`);
	return { raw: f.raw, meta: f.meta ?? {} };
})();

beforeEach(async () => {
	await resetDB(t.db);
	setContentDB(t.db);
	await runImport(t.db, 'calendario', [{ legacySlug: EVENT, ...source }], { actor: 'prueba' });
});

let payment = 1;
/** @param {string} email */
async function approvedOrder(email) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: EVENT,
			type: { id: 'general', price: 10000, capacity: 30 },
			quantity: 1,
			holders: [{ name: 'Persona de Prueba', pronouns: 'elle' }],
			buyer: { name: 'Persona de Prueba', pronouns: 'elle', email, dni: '30111222' }
		})
	);
	await applyPayment(t.db, {
		id: payment++,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 10000,
		currency_id: 'ARS'
	});
}

async function change() {
	return /** @type {any} */ (
		await recordDateChange(t.db, {
			eventSlug: EVENT,
			before: BEFORE,
			after: AFTER,
			by: 'admin',
			now: Date.now() + 1000
		})
	);
}

/**
 * @param {'dateChangeSend' | 'dateChangeDismiss'} name
 * @param {{ user?: any, version?: string | number }} [opts]
 */
function event(name, { user = ADMIN, version = '' } = {}) {
	const body = new FormData();
	body.set('version', String(version));
	const url = new URL(`https://kinkyvibe.ar/admin/eventos/${EVENT}/mail`);
	return /** @type {any} */ ({
		locals: user ? { user, user_token: 't' } : {},
		url,
		params: { slug: EVENT },
		platform: t.platform,
		request: new Request(`${url.href}?/${name}`, { method: 'POST', body }),
		fetch: vi.fn(async () => new Response('{}'))
	});
}

/** @param {() => any} fn */
async function thrown(fn) {
	try {
		await fn();
	} catch (e) {
		return e;
	}
	throw new Error('no tiró');
}

const sends = async () =>
	Number(
		/** @type {any} */ (await t.db.prepare('SELECT COUNT(*) AS n FROM date_change_sends').first())
			?.n
	);

describe('«Avisar a les compradores»', () => {
	it('sin sesión: al login; sin ser admin: 403. No manda ni pide nada', async () => {
		await approvedOrder('a@example.com');
		const c = await change();
		for (const name of /** @type {const} */ (['dateChangeSend', 'dateChangeDismiss'])) {
			const anon = await thrown(() =>
				actions[name](event(name, { user: null, version: c.version }))
			);
			expect(isRedirect(anon)).toBe(true);
			const notAdmin = await thrown(() =>
				actions[name](
					event(name, {
						user: { id: 1, login: 'otra', name: null, avatar_url: '' },
						version: c.version
					})
				)
			);
			expect(isHttpError(notAdmin) && notAdmin.status).toBe(403);
		}
		expect(await sends()).toBe(0);
		expect(await dateChangeOffer(t.db, EVENT)).toMatchObject({
			requested: false,
			dismissed: false,
			notice: true
		});
	});

	it('sin cambio anotado, o con otra versión (la fecha volvió a cambiar), no manda', async () => {
		await approvedOrder('a@example.com');
		const none = /** @type {any} */ (await actions.dateChangeSend(event('dateChangeSend')));
		expect(none.status).toBe(404);
		const c = await change();
		const stale = /** @type {any} */ (
			await actions.dateChangeSend(event('dateChangeSend', { version: c.version - 60_000 }))
		);
		expect(stale.status).toBe(409);
		expect(await sends()).toBe(0);
	});

	it('manda una vez a cada compra aprobada y deja registro sin mails de nadie', async () => {
		await approvedOrder('a@example.com');
		await approvedOrder('b@example.com');
		const c = await change();
		const first = /** @type {any} */ (
			await actions.dateChangeSend(event('dateChangeSend', { version: c.version }))
		);
		expect(first.dateChange).toMatchObject({ ok: true });
		expect(first.dateChange.message).toBe('Aviso enviado a 2 personas.');
		expect(await sends()).toBe(2);
		const again = /** @type {any} */ (
			await actions.dateChangeSend(event('dateChangeSend', { version: c.version }))
		);
		expect(again.dateChange.message).toBe('Todes ya tenían este aviso: no se mandó nada.');
		expect(await sends()).toBe(2);
		const { results } = await t.db
			.prepare('SELECT action, summary, detail FROM admin_audit WHERE target_id = ?1')
			.bind(EVENT)
			.all();
		expect(results.map((r) => r.action)).toEqual(['event.date_change.send']);
		expect(results[0].summary).toBe('Avisó el cambio de fecha a 2 personas');
		const logged = JSON.stringify(results[0]);
		expect(logged).not.toContain('a@example.com');
		expect(logged).not.toContain('b@example.com');
		expect(await dateChangeOffer(t.db, EVENT)).toMatchObject({
			requested: true,
			notified: 2,
			people: 0,
			notice: false
		});
	});

	it('«No hace falta» saca el aviso de arriba sin mandar nada', async () => {
		await approvedOrder('a@example.com');
		const c = await change();
		const r = /** @type {any} */ (
			await actions.dateChangeDismiss(event('dateChangeDismiss', { version: c.version }))
		);
		expect(r.dateChange.ok).toBe(true);
		expect(await sends()).toBe(0);
		expect(await dateChangeOffer(t.db, EVENT)).toMatchObject({
			dismissed: true,
			notice: false,
			people: 1
		});
	});
});
