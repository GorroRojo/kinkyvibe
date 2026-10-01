/**
 * Quien compra entrada para un evento en un lugar con la dirección oculta (o solo el nombre, o
 * solo el barrio) recibe la dirección completa en el mail de confirmación y la ve en la página de
 * su entrada. Con el interruptor apagado, todo como antes (lo del .md). D1 de miniflare; evento,
 * lugar y persona inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';
import { makeProfile } from './testing.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// El evento de prueba (como si fuera su .md): con el lugar escrito "a la vieja".
vi.mock('$lib/server/tickets/events.js', async () => {
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	const meta = {
		title: 'Fiesta Inventada',
		start: '2099-12-01T20:00-03:00',
		status: 'abierto',
		location_name: 'Lugar del archivo',
		location: 'Dirección del archivo',
		tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 10 }]
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventTickets: async (/** @type {string} */ _slug, /** @type {any} */ opts) =>
			parseTicketConfig(meta, opts),
		listTicketedEvents: async () => []
	};
});

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

/** Módulos con el interruptor como se pida y una clave de Resend inventada. */
async function modules(flag = '1') {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: { PERFILES_PUBLICOS_ENABLED: flag, RESEND_API_KEY: 're_inventada' }
	}));
	return {
		tickets: await import('$lib/server/tickets/index.js'),
		venues: await import('./venues.js'),
		page: await import('../../../routes/entradas/t/[token]/+page.server.js')
	};
}

const SECRET = 'Calle Secreta 742';

async function approvedOrder() {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: 'fiesta-inventada',
			type: { id: 'general', price: 8000, capacity: 10 },
			quantity: 1,
			holders: [{ name: 'Persona de Prueba', pronouns: 'elle' }],
			buyer: { name: 'Persona de Prueba', pronouns: 'elle', email: 'p@example.com', dni: '30111222' }
		})
	);
	const { order, tickets } = await applyPayment(t.db, {
		id: 1,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 8000,
		currency_id: 'ARS'
	});
	return { order, tickets };
}

/** El mail que se le mandó a Resend. */
function captureFetch() {
	/** @type {{ html: string, text: string }[]} */
	const sent = [];
	const fetch = /** @type {any} */ (
		async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
			sent.push(JSON.parse(String(init.body)));
			return new Response('{"id":"x"}', { status: 200 });
		}
	);
	return { sent, fetch };
}

/** @param {string} token */
const ticketEvent = (token) =>
	/** @type {any} */ ({
		params: { token },
		platform: t.platform,
		locals: {},
		url: new URL(`http://localhost/entradas/t/${token}`)
	});

describe('dirección completa para quien compró', () => {
	for (const privacy of ['public', 'name', 'area', 'hidden']) {
		it(`lugar con dirección «${privacy}»: el mail y la entrada la tienen completa`, async () => {
			const m = await modules('1');
			const v = await makeProfile(t.db, {
				title: 'Galpón Inventado',
				kind: 'lugar',
				data: { address: SECRET, area: 'Barrio Inventado', city: 'Ciudad Inventada', venue_privacy: privacy }
			});
			await m.venues.setEventVenue(t.db, {
				eventSlug: 'fiesta-inventada',
				venueId: v.id,
				privacy: null,
				by: 'admin-de-prueba'
			});
			const { order, tickets } = await approvedOrder();
			const { sent, fetch } = captureFetch();
			expect(await m.tickets.sendOrderEmail({ db: t.db, order, tickets, origin: 'https://kinkyvibe.ar', fetch })).toBe(true);
			expect(sent).toHaveLength(1);
			const full = `${SECRET}, Barrio Inventado, Ciudad Inventada`;
			expect(sent[0].text).toContain(full);
			expect(sent[0].text).toContain('Galpón Inventado');
			expect(sent[0].html).toContain(SECRET);
			expect(sent[0].text).not.toContain('Dirección del archivo');
			const page = /** @type {any} */ (await m.page.load(ticketEvent(tickets[0].token)));
			expect(page.event.where).toBe(`Galpón Inventado · ${full}`);
		});
	}

	it('con el interruptor apagado, lo del .md como siempre', async () => {
		const m = await modules('0');
		const v = await makeProfile(t.db, {
			title: 'Galpón Inventado',
			kind: 'lugar',
			data: { address: SECRET, venue_privacy: 'hidden' }
		});
		await m.venues.setEventVenue(t.db, { eventSlug: 'fiesta-inventada', venueId: v.id, privacy: null, by: 'a' });
		const { order, tickets } = await approvedOrder();
		const { sent, fetch } = captureFetch();
		await m.tickets.sendOrderEmail({ db: t.db, order, tickets, origin: 'https://kinkyvibe.ar', fetch });
		expect(sent[0].text).toContain('Lugar del archivo · Dirección del archivo');
		expect(sent[0].text).not.toContain(SECRET);
		const page = /** @type {any} */ (await m.page.load(ticketEvent(tickets[0].token)));
		expect(page.event.where).toBe('Lugar del archivo · Dirección del archivo');
	});
});
