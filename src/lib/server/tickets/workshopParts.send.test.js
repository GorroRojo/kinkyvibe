/**
 * Talleres en varias partes con una sola entrada: los mails que de verdad salen (entradas,
 * transferencia y recordatorio de cada parte) llevan «Las N partes del taller»; un taller con
 * «Entradas por parte» no. Lo que se le manda a Resend se captura (no sale nada). D1 de miniflare;
 * taller, lugares y persona inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { setPerPartTickets, setWorkshopParts } from '$lib/server/eventos/partes.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const START = '2099-10-02T22:00-03:00';

// El taller como lo lee la venta de entradas (como si fuera su .md), y la ficha de cada parte.
vi.mock('$lib/server/tickets/events.js', async () => {
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	/** @type {Record<string, Record<string, any>>} */
	const metas = {
		'taller-inventado': {
			title: 'Taller inventado',
			start: '2099-10-02T22:00-03:00',
			status: 'abierto',
			location_name: 'Espacio Inventado',
			payment_methods: ['mercadopago', 'transferencia'],
			tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 10 }]
		},
		'taller-inventado-parte-2': {
			title: 'Taller inventado (parte 2)',
			start: '2099-10-09T22:00-03:00',
			location_name: 'Otro Lugar Inventado'
		}
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventMeta: async (/** @type {string} */ slug) => metas[slug] ?? null,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			metas[slug]?.tickets ? parseTicketConfig(metas[slug], opts) : null,
		listTicketedEvents: async () => [
			{ slug: 'taller-inventado', config: parseTicketConfig(metas['taller-inventado'], {}) }
		]
	};
});
vi.mock('$env/dynamic/private', () => ({
	env: {
		RESEND_API_KEY: 're_inventada',
		TICKETS_TRANSFER_INFO: 'Alias: EJEMPLO.PRUEBA'
	}
}));

const tickets = await import('./index.js');

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
	vi.restoreAllMocks();
});

const BY = 'admin-de-prueba';

async function workshop() {
	for (const [slug, start] of [
		['taller-inventado', START],
		['taller-inventado-parte-2', '2099-10-09T22:00-03:00']
	]) {
		await saveObject(
			t.db,
			{ type: 'evento', slug, title: slug, data: { start }, visibility: 'public' },
			{ actor: BY }
		);
	}
	expect(
		await setWorkshopParts(t.db, {
			eventSlug: 'taller-inventado',
			partSlugs: ['taller-inventado-parte-2'],
			by: BY
		})
	).toEqual({ ok: true });
}

/** @param {'mercadopago' | 'transferencia'} method */
async function order(method = 'mercadopago') {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: 'taller-inventado',
			type: { id: 'general', price: 8000, capacity: 10 },
			quantity: 1,
			method,
			holders: [{ name: 'Persona de Prueba', pronouns: 'elle' }],
			buyer: {
				name: 'Persona de Prueba',
				pronouns: 'elle',
				email: 'p@example.com',
				dni: '30111222'
			}
		})
	);
	if (method === 'transferencia') return { order: r.order, tickets: [] };
	const { order, tickets } = await applyPayment(t.db, {
		id: 1,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 8000,
		currency_id: 'ARS'
	});
	return { order: /** @type {any} */ (order), tickets };
}

function captureFetch() {
	/** @type {{ subject: string, html: string, text: string }[]} */
	const sent = [];
	const fetch = /** @type {any} */ (
		async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
			sent.push(JSON.parse(String(init.body)));
			return new Response('{"id":"x"}', { status: 200 });
		}
	);
	return { sent, fetch };
}

const LINES = [
	'Parte 1 · vie 2 oct · 22:00 · Espacio Inventado',
	'Parte 2 · vie 9 oct · 22:00 · Otro Lugar Inventado'
];

/** @param {{ html: string, text: string }} mail */
function expectParts(mail) {
	expect(mail.html).toContain('Las 2 partes del taller');
	expect(mail.html).toContain(LINES.join('<br>'));
	expect(mail.text).toContain(['Las 2 partes del taller', ...LINES].join('\n'));
}

describe('los mails de un taller con una sola entrada', () => {
	it('entradas', async () => {
		await workshop();
		const o = await order();
		const { sent, fetch } = captureFetch();
		expect(
			await tickets.sendOrderEmail({ db: t.db, ...o, origin: 'https://kv.example', fetch })
		).toBe(true);
		expect(sent).toHaveLength(1);
		expectParts(sent[0]);
	});

	it('transferencia', async () => {
		await workshop();
		const o = await order('transferencia');
		const { sent, fetch } = captureFetch();
		expect(
			await tickets.sendTransferEmail({
				db: t.db,
				order: o.order,
				origin: 'https://kv.example',
				fetch
			})
		).toBe(true);
		expect(sent).toHaveLength(1);
		expectParts(sent[0]);
	});

	it('recordatorios: el de cada parte lleva la lista', async () => {
		await workshop();
		await order();
		const { sent, fetch } = captureFetch();
		// Un día antes de la parte 2 (el taller ya empezó): toca el recordatorio de la parte 2.
		const now = Date.parse('2099-10-08T22:00-03:00');
		await tickets.sendReminderEmails({ db: t.db, origin: 'https://kv.example', fetch, now });
		expect(sent.map((m) => m.subject)).toEqual([
			'Recordatorio: taller-inventado-parte-2 se acerca'
		]);
		expectParts(sent[0]);
	});

	it('«Entradas por parte»: sin lista', async () => {
		await workshop();
		expect(
			await setPerPartTickets(t.db, { eventSlug: 'taller-inventado', perPart: true, by: BY })
		).toEqual({ ok: true });
		const o = await order();
		const { sent, fetch } = captureFetch();
		await tickets.sendOrderEmail({ db: t.db, ...o, origin: 'https://kv.example', fetch });
		expect(sent).toHaveLength(1);
		expect(sent[0].html).not.toContain('partes del taller');
		expect(sent[0].text).not.toContain('partes del taller');
	});
});
