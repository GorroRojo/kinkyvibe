import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { eventSeries, isFirstTime, priorAttendance, seriesFromSlug } from './series.js';
import { sellAtDoor } from './door.js';

describe('seriesFromSlug', () => {
	it.each([
		['picantearla-2026-10', 'picantearla'],
		['cine-para-sucixs-2024-01-montevideo', 'cine-para-sucixs'],
		['cine-para-sucixs-octubre-2023', 'cine-para-sucixs'],
		['cine-para-sucixs', 'cine-para-sucixs'],
		['antipunitivismo-y-afectos-sep-2023', 'antipunitivismo-y-afectos'],
		['aberraciones-2024-09-50-sombras-de-grey', 'aberraciones'],
		['cuirdas-sudacas-2025-06-dia-1', 'cuirdas-sudacas'],
		['club-de-hosts-2026-10-halloween', 'club-de-hosts'],
		['acuerdos-en-no-monogamias', 'acuerdos-en-no-monogamias'],
		// Un número que no es año no corta ("50-sombras" al comienzo es parte del nombre).
		['50-sombras-2025-03', '50-sombras'],
		// El primer pedazo nunca se toma como fecha.
		['2024-fiesta', '2024-fiesta']
	])('%s → %s', (slug, key) => {
		expect(seriesFromSlug(slug)).toBe(key);
	});
});

describe('eventSeries', () => {
	it('usa `serie` del frontmatter si está', () => {
		expect(eventSeries('fiesta-rara-2026-10', { serie: 'Picantearla' })).toEqual({
			key: 'picantearla',
			label: 'Picantearla'
		});
		expect(eventSeries('x-2026', { series: 'Cine para Súcixs' }).key).toBe('cine-para-sucixs');
	});
	it('si no, la regla del slug, con un nombre para mostrar', () => {
		expect(eventSeries('cine-para-sucixs-2024-01', { title: 'Cine' })).toEqual({
			key: 'cine-para-sucixs',
			label: 'Cine para sucixs'
		});
		expect(eventSeries('picantearla-2026-10', { serie: '  ' }).key).toBe('picantearla');
	});
});

describe('isFirstTime', () => {
	const prior = {
		known: true,
		series: { key: 's', label: 'S' },
		events: ['s-2025'],
		names: new Set(['noa t.']),
		emails: new Set(['juli@example.com'])
	};
	it('no se sabe si la serie no tiene ediciones anteriores con entradas', () => {
		expect(
			isFirstTime(
				{ holder: 'Ana', buyerName: 'Ana', buyerEmail: 'a@example.com' },
				{ ...prior, known: false }
			)
		).toBeNull();
	});
	it('mismo nombre de entrada (sin tildes ni mayúsculas) = ya vino', () => {
		expect(isFirstTime({ holder: 'NÓA  T.', buyerName: 'X', buyerEmail: '' }, prior)).toBe(false);
	});
	it('mismo email solo cuenta si la entrada es de quien compró', () => {
		expect(
			isFirstTime(
				{ holder: 'Juli M.', buyerName: 'juli m.', buyerEmail: 'JULI@example.com' },
				prior
			)
		).toBe(false);
		// Acompañante de alguien que ya vino: sí es su primera vez.
		expect(
			isFirstTime(
				{ holder: 'Fran L.', buyerName: 'Juli M.', buyerEmail: 'juli@example.com' },
				prior
			)
		).toBe(true);
	});
	it('nadie coincide = primera vez', () => {
		expect(
			isFirstTime({ holder: 'Nueve', buyerName: 'Nueve', buyerEmail: 'n@example.com' }, prior)
		).toBe(true);
	});
});

describe('priorAttendance (D1)', () => {
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

	/** @type {Record<string, Record<string, any>>} */
	const metas = {
		'picantearla-2026-10': { start: '2026-10-10T21:00:00-03:00' },
		'picantearla-2026-08': { start: '2026-08-10T21:00:00-03:00' },
		'picantearla-2026-12': { start: '2026-12-10T21:00:00-03:00' },
		'otra-fiesta-2026-08': { start: '2026-08-01T21:00:00-03:00' },
		'nombre-raro-2026-07': { start: '2026-07-01T21:00:00-03:00', serie: 'Picantearla' }
	};
	/** @param {string} slug */
	const metaOf = async (slug) => metas[slug] ?? null;
	const type = { id: 'general', name: 'General', price: 1000, fondo: 0, capacity: 50, gorra: null };

	/**
	 * @param {string} eventSlug
	 * @param {string} buyer
	 * @param {string} email
	 * @param {string[]} [holders]
	 */
	async function sold(eventSlug, buyer, email, holders = [buyer]) {
		const r = await sellAtDoor(t.db, {
			eventSlug,
			door: { on: true },
			type,
			quantity: holders.length,
			holders: holders.map((name) => ({ name, pronouns: '' })),
			buyer: { name: buyer, email },
			method: 'efectivo',
			by: 'gorrite'
		});
		if (!r.ok) throw new Error('no se vendió');
	}

	it('junta nombres y emails de ediciones ANTERIORES de la misma serie', async () => {
		await sold('picantearla-2026-08', 'Juli M.', 'juli@example.com', ['Juli M.', 'Noa T.']);
		await sold('nombre-raro-2026-07', 'Pau', 'pau@example.com');
		await sold('picantearla-2026-12', 'Future', 'futuro@example.com'); // posterior: no cuenta
		await sold('otra-fiesta-2026-08', 'Otre', 'otre@example.com'); // otra serie
		await sold('picantearla-2026-10', 'Juli M.', 'juli@example.com'); // este evento

		const prior = await priorAttendance(t.db, { slug: 'picantearla-2026-10', metaOf });
		expect(prior.known).toBe(true);
		expect(prior.series.key).toBe('picantearla');
		expect(prior.events.sort()).toEqual(['nombre-raro-2026-07', 'picantearla-2026-08']);
		expect([...prior.names].sort()).toEqual(['juli m.', 'noa t.', 'pau']);
		expect(prior.emails.has('juli@example.com')).toBe(true);
		expect(prior.emails.has('futuro@example.com')).toBe(false);
		expect(prior.emails.has('otre@example.com')).toBe(false);

		expect(
			isFirstTime(
				{ holder: 'Juli M.', buyerName: 'Juli M.', buyerEmail: 'juli@example.com' },
				prior
			)
		).toBe(false);
		expect(
			isFirstTime({ holder: 'Fran', buyerName: 'Juli M.', buyerEmail: 'juli@example.com' }, prior)
		).toBe(true);
	});

	it('las órdenes no aprobadas no cuentan; sin ediciones anteriores, no se sabe', async () => {
		await sold('picantearla-2026-08', 'Juli M.', 'juli@example.com');
		await t.db.prepare("UPDATE orders SET status = 'refunded'").run();
		const prior = await priorAttendance(t.db, { slug: 'picantearla-2026-10', metaOf });
		expect(prior.known).toBe(false);
		expect(
			isFirstTime({ holder: 'Juli M.', buyerName: 'Juli M.', buyerEmail: '' }, prior)
		).toBeNull();
	});

	it('un evento sin frontmatter (despublicado) cuenta si se vendió antes', async () => {
		await sold('picantearla-2025-01', 'Vieje', 'vieje@example.com');
		const prior = await priorAttendance(t.db, {
			slug: 'picantearla-2026-10',
			metaOf,
			now: Date.now() + 1000
		});
		expect(prior.events).toEqual(['picantearla-2025-01']);
		expect(prior.names.has('vieje')).toBe(true);
	});
});
