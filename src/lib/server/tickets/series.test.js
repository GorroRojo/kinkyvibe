import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import tagsFactory from '$lib/utils/tags';
import { fakeEvent } from '$lib/server/series/fixtures.js';
import { doorSeries, isFirstTime, priorAttendance } from './series.js';
import { sellAtDoor } from './door.js';

// La serie de un evento son sus etiquetas hijas (o nietas) de «evento recurrente», ya no el
// comienzo del slug. Árbol y eventos inventados.
const tree = () =>
	tagsFactory(
		/** @type {any} */ ([
			{ id: 'root', children: ['calendario'] },
			{ id: 'calendario', children: ['evento recurrente', 'tipo de evento'] },
			{ id: 'evento recurrente', children: ['Serie A', 'Serie B'] },
			{ id: 'Serie A' },
			{ id: 'Serie B', children: ['Serie B Deluxe'] },
			{ id: 'tipo de evento', children: ['fiesta'] }
		])
	);
const at = (/** @type {string} */ iso) => new Date(iso).getTime();

describe('doorSeries (serie por etiqueta y ediciones anteriores)', () => {
	const posts = [
		fakeEvent('fiesta-a-2026-08', at('2026-08-10T21:00:00-03:00'), ['Serie A']),
		// Misma serie con otro comienzo de slug: cuenta igual.
		fakeEvent('nombre-raro-2026-07', at('2026-07-01T21:00:00-03:00'), ['Serie A', 'fiesta']),
		fakeEvent('fiesta-a-2026-10', at('2026-10-10T21:00:00-03:00'), ['Serie A']),
		fakeEvent('fiesta-a-2026-12', at('2026-12-10T21:00:00-03:00'), ['Serie A']),
		// Slug parecido, otra serie: no cuenta.
		fakeEvent('fiesta-a-2026-09-b', at('2026-09-01T21:00:00-03:00'), ['Serie B']),
		// Nieta de «evento recurrente»: también es serie.
		fakeEvent('deluxe-1', at('2026-05-01T21:00:00-03:00'), ['Serie B Deluxe']),
		fakeEvent('deluxe-2', at('2026-06-01T21:00:00-03:00'), ['Serie B Deluxe', 'Serie A']),
		// Sin etiqueta de serie (aunque el slug parezca de una).
		fakeEvent('fiesta-a-2027-01', at('2027-01-10T21:00:00-03:00'), ['fiesta'])
	];

	it('misma serie con otro comienzo de slug = edición anterior; las posteriores no', () => {
		const { series, earlier } = doorSeries(posts, tree(), 'fiesta-a-2026-10');
		expect(series).toEqual({ ids: ['Serie A'], label: 'Serie A' });
		expect(earlier.sort()).toEqual(['deluxe-2', 'fiesta-a-2026-08', 'nombre-raro-2026-07']);
	});

	it('otra serie con slug parecido no cuenta', () => {
		const { earlier } = doorSeries(posts, tree(), 'fiesta-a-2026-12');
		expect(earlier).not.toContain('fiesta-a-2026-09-b');
		expect(doorSeries(posts, tree(), 'fiesta-a-2026-09-b').earlier).toEqual([]);
	});

	it('las nietas de «evento recurrente» son series; con dos series se juntan las anteriores', () => {
		const { series, earlier } = doorSeries(posts, tree(), 'deluxe-2');
		expect(series.ids.sort()).toEqual(['Serie A', 'Serie B Deluxe']);
		expect(earlier).toEqual(['deluxe-1']);
	});

	it('sin etiqueta de serie: no hay serie ni ediciones anteriores (no se adivina por el slug)', () => {
		expect(doorSeries(posts, tree(), 'fiesta-a-2027-01')).toEqual({
			series: { ids: [], label: '' },
			earlier: []
		});
		// Un evento que no está entre los posts, tampoco.
		expect(doorSeries(posts, tree(), 'no-existe').series.ids).toEqual([]);
	});
});

describe('isFirstTime', () => {
	const prior = {
		known: true,
		series: { ids: ['Serie A'], label: 'Serie A' },
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

	const posts = [
		fakeEvent('picantearla-2026-10', at('2026-10-10T21:00:00-03:00'), ['Serie A']),
		fakeEvent('picantearla-2026-08', at('2026-08-10T21:00:00-03:00'), ['Serie A']),
		fakeEvent('picantearla-2026-12', at('2026-12-10T21:00:00-03:00'), ['Serie A']),
		fakeEvent('otra-fiesta-2026-08', at('2026-08-01T21:00:00-03:00'), ['Serie B']),
		fakeEvent('nombre-raro-2026-07', at('2026-07-01T21:00:00-03:00'), ['Serie A']),
		// Slug de la "serie" pero sin la etiqueta: antes contaba por el slug, ahora no.
		fakeEvent('picantearla-2026-09', at('2026-09-01T21:00:00-03:00'), ['fiesta']),
		fakeEvent('sin-serie-2026-11', at('2026-11-01T21:00:00-03:00'), ['fiesta'])
	];
	const input = (/** @type {string} */ slug) => ({ slug, posts, tags: tree() });
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
		await sold('picantearla-2026-09', 'Sinta G.', 'sinta@example.com'); // sin la etiqueta
		await sold('picantearla-2026-10', 'Juli M.', 'juli@example.com'); // este evento

		const prior = await priorAttendance(t.db, input('picantearla-2026-10'));
		expect(prior.known).toBe(true);
		expect(prior.series).toEqual({ ids: ['Serie A'], label: 'Serie A' });
		expect(prior.events.sort()).toEqual(['nombre-raro-2026-07', 'picantearla-2026-08']);
		expect([...prior.names].sort()).toEqual(['juli m.', 'noa t.', 'pau']);
		expect(prior.emails.has('juli@example.com')).toBe(true);
		expect(prior.emails.has('futuro@example.com')).toBe(false);
		expect(prior.emails.has('otre@example.com')).toBe(false);
		expect(prior.names.has('sinta g.')).toBe(false);

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

	it('las órdenes no aprobadas sin ingreso no cuentan; sin ediciones anteriores, no se sabe', async () => {
		await sold('picantearla-2026-08', 'Juli M.', 'juli@example.com');
		await t.db.prepare("UPDATE orders SET status = 'refunded'").run();
		// La venta en puerta marca el ingreso; sin ingreso y sin orden aprobada, no cuenta.
		await t.db.prepare('UPDATE tickets SET checked_in_at = NULL, checked_in_by = NULL').run();
		const prior = await priorAttendance(t.db, input('picantearla-2026-10'));
		expect(prior.known).toBe(false);
		expect(
			isFirstTime({ holder: 'Juli M.', buyerName: 'Juli M.', buyerEmail: '' }, prior)
		).toBeNull();
	});

	it('una entrada con ingreso marcado cuenta aunque la orden ya no esté aprobada', async () => {
		await sold('picantearla-2026-08', 'Juli M.', 'juli@example.com');
		await t.db.prepare("UPDATE orders SET status = 'refunded'").run(); // el ingreso queda marcado
		const prior = await priorAttendance(t.db, input('picantearla-2026-10'));
		expect(prior.known).toBe(true);
		expect(isFirstTime({ holder: 'Juli M.', buyerName: 'Juli M.', buyerEmail: '' }, prior)).toBe(
			false
		);
	});

	it('otra serie con slug parecido no cuenta', async () => {
		await sold('picantearla-2026-09', 'Juli M.', 'juli@example.com'); // etiqueta `fiesta`
		await sold('otra-fiesta-2026-08', 'Noa T.', 'noa@example.com'); // Serie B
		const prior = await priorAttendance(t.db, input('picantearla-2026-10'));
		expect(prior.known).toBe(false);
		expect(prior.events).toEqual([]);
	});

	it('un evento sin etiqueta de serie no muestra nada (aunque el slug sea de una serie)', async () => {
		await sold('picantearla-2026-08', 'Juli M.', 'juli@example.com');
		const prior = await priorAttendance(t.db, input('picantearla-2026-09'));
		expect(prior.series).toEqual({ ids: [], label: '' });
		expect(prior.known).toBe(false);
		expect(
			isFirstTime({ holder: 'Nueve', buyerName: 'Nueve', buyerEmail: 'n@example.com' }, prior)
		).toBeNull();
	});
});
