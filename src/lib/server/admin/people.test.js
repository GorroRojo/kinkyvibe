import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	addNote,
	deleteNote,
	groupPeople,
	listNotes,
	matchesPerson,
	normalizeEmail,
	noteCounts,
	personId,
	seriesLabel,
	validateNote
} from './people.js';
import { computeStats, monthLabel } from './stats.js';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const events = new Map([
	['picantearla-2026-07', { title: 'Picantearla julio', start: '2026-07-11T22:00:00-03:00' }],
	['picantearla-2026-08', { title: 'Picantearla agosto', start: '2026-08-08T22:00:00-03:00' }],
	['taller-2026-09', { title: 'Taller', start: '2026-09-20T18:00:00-03:00' }],
	['picantearla-2026-10', { title: 'Picantearla octubre', start: '2026-10-10T22:00:00-03:00' }]
]);

let n = 0;
/** @param {Partial<import('./people.js').PersonOrder>} o @returns {import('./people.js').PersonOrder} */
function order(o) {
	n++;
	return {
		id: `o${n}`,
		event_slug: 'picantearla-2026-07',
		ticket_type: 'general',
		quantity: 1,
		total: 10000,
		payment_method: 'mercadopago',
		fondo_option: 'completo',
		fondo_amount: 0,
		fondo_contribution: 0,
		buyer_name: 'Sol Ejemplo',
		buyer_pronouns: 'ella',
		buyer_email: 'sol@example.com',
		status: 'approved',
		created_at: Date.parse('2026-07-01T12:00:00Z') + n,
		checked: 1,
		...o
	};
}

const orders = [
	order({}),
	// Mismo email con otra mayúscula y espacios, otro nombre: la misma persona.
	order({
		event_slug: 'picantearla-2026-08',
		buyer_email: ' SOL@Example.com ',
		buyer_name: 'Sol E.',
		created_at: Date.parse('2026-08-01T12:00:00Z'),
		payment_method: 'transferencia',
		fondo_option: 'fondo'
	}),
	// Compró y no vino.
	order({
		event_slug: 'taller-2026-09',
		checked: 0,
		created_at: Date.parse('2026-09-10T12:00:00Z')
	}),
	// Futuro: no es no-show.
	order({
		event_slug: 'picantearla-2026-10',
		checked: 0,
		created_at: Date.parse('2026-09-25T12:00:00Z')
	}),
	// Reembolsada: se cuenta aparte, no suma.
	order({ event_slug: 'taller-2026-09', status: 'refunded', checked: 0, total: 5000 }),
	// Otra persona, primera vez en agosto.
	order({
		event_slug: 'picantearla-2026-08',
		buyer_email: 'ale@example.com',
		buyer_name: 'Ale Prueba',
		buyer_pronouns: 'elle',
		quantity: 2,
		checked: 1,
		total: 20000,
		created_at: Date.parse('2026-08-02T12:00:00Z')
	})
];

describe('personas', () => {
	it('normaliza el email (espacios y mayúsculas, nada más)', () => {
		expect(normalizeEmail('  A.B+x@Example.COM ')).toBe('a.b+x@example.com');
	});

	it('agrupa por email normalizado: nombres, eventos, gasto, visitas y no-shows', () => {
		const people = groupPeople(orders, events, { now: NOW });
		expect(people).toHaveLength(2);
		const sol = people.find((p) => p.email === 'sol@example.com');
		expect(sol).toMatchObject({
			names: ['Sol Ejemplo', 'Sol E.'],
			pronouns: ['ella'],
			orders: 5,
			refunded: 1,
			spent: 40000,
			attended: ['picantearla-2026-07', 'picantearla-2026-08'],
			noShows: ['taller-2026-09'],
			series: ['picantearla', 'taller']
		});
		expect(sol?.bought).toEqual([
			'picantearla-2026-07',
			'picantearla-2026-08',
			'taller-2026-09',
			'picantearla-2026-10'
		]);
		expect(sol?.firstVisit).toBe(
			Date.parse(/** @type {string} */ (events.get('picantearla-2026-07')?.start))
		);
		expect(sol?.lastVisit).toBe(
			Date.parse(/** @type {string} */ (events.get('picantearla-2026-08')?.start))
		);
	});

	it('nombre de la serie sin la edición ni el subtítulo', () => {
		expect(seriesLabel('Picantearla (59ª Edición)')).toBe('Picantearla');
		expect(seriesLabel('Club de Hosts - Erotismo y Misterio')).toBe('Club de Hosts');
		expect(seriesLabel('Someter: cómo dominar')).toBe('Someter');
		expect(seriesLabel('Cine-debate kinky')).toBe('Cine-debate kinky');
	});

	it('busca sin tildes ni mayúsculas en nombre, email y pronombres', () => {
		const [p] = groupPeople(
			[order({ buyer_name: 'Ñandú José', buyer_email: 'x@example.com' })],
			events
		);
		expect(matchesPerson(p, 'nandu jose')).toBe(true);
		expect(matchesPerson(p, 'X@EXAMPLE')).toBe(true);
		expect(matchesPerson(p, 'ella')).toBe(true);
		expect(matchesPerson(p, 'otra')).toBe(false);
		expect(matchesPerson(p, '  ')).toBe(true);
	});

	it('el id de la URL es estable, corto y no es el email', async () => {
		const a = await personId('sol@example.com');
		expect(a).toMatch(/^[0-9a-f]{16}$/);
		expect(await personId('sol@example.com')).toBe(a);
		expect(await personId('ale@example.com')).not.toBe(a);
	});
});

describe('estadísticas', () => {
	const s = computeStats(orders, events, { now: NOW, months: 4 });
	it('ventas por mes (compra), con los meses vacíos', () => {
		expect(s.byMonth.map((m) => [m.month, m.tickets])).toEqual([
			['2026-06', 0],
			['2026-07', 1],
			['2026-08', 3],
			['2026-09', 2]
		]);
		expect(monthLabel('2026-09')).toBe('sept 26');
	});
	it('por serie, medio de pago y fondo (sin las reembolsadas)', () => {
		expect(s.bySeries[0]).toMatchObject({ series: 'picantearla', tickets: 5, events: 3 });
		expect(s.byMethod.map((m) => [m.key, m.orders])).toEqual([
			['mercadopago', 4],
			['transferencia', 1]
		]);
		expect(s.byFondo.find((f) => f.key === 'fondo')?.orders).toBe(1);
		expect(s.kpis.refunded).toBe(1);
		expect(s.kpis.people).toBe(2);
	});
	it('asistencia, primera vez en la serie y quiénes vuelven', () => {
		// Más reciente primero; el evento futuro no está.
		expect(s.perEvent.map((e) => e.slug)).toEqual([
			'taller-2026-09',
			'picantearla-2026-08',
			'picantearla-2026-07'
		]);
		const ago = s.perEvent.find((e) => e.slug === 'picantearla-2026-08');
		expect(ago).toMatchObject({ sold: 3, checked: 2, attendees: 2, firstTimers: 1 });
		expect(s.perEvent.find((e) => e.slug === 'taller-2026-09')?.rate).toBe(0);
		const pica = s.retention.find((r) => r.series === 'picantearla');
		expect(pica).toMatchObject({ people: 2, returning: 1, rate: 0.5 });
		expect(s.kpis.returningRate).toBe(0.5);
	});
});

describe('notas', () => {
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

	it('valida el texto', () => {
		expect(validateNote('  hola\r\n\u0007chau ')).toEqual({ ok: true, body: 'hola\nchau' });
		expect(validateNote('   ').ok).toBe(false);
		expect(validateNote('x'.repeat(2001)).ok).toBe(false);
	});

	it('agrega, lista (la más nueva primero), cuenta y borra solo la de esa persona', async () => {
		const a = await addNote(t.db, { email: 'sol@example.com', body: 'uno', by: 'x', now: 1 });
		await addNote(t.db, { email: 'sol@example.com', body: 'dos', by: 'y', now: 2 });
		await addNote(t.db, { email: 'ale@example.com', body: 'otra', by: 'x', now: 3 });
		expect((await listNotes(t.db, 'sol@example.com')).map((x) => x.body)).toEqual(['dos', 'uno']);
		expect(Object.fromEntries(await noteCounts(t.db))).toEqual({
			'sol@example.com': 2,
			'ale@example.com': 1
		});
		expect(await deleteNote(t.db, { email: 'ale@example.com', id: a })).toBe(false);
		expect(await deleteNote(t.db, { email: 'sol@example.com', id: a })).toBe(true);
		expect((await listNotes(t.db, 'sol@example.com')).map((x) => x.body)).toEqual(['dos']);
	});

	it('sin la tabla o sin base: vacío, sin romper', async () => {
		const bare = await createTestDB({ migrate: false });
		try {
			expect(await listNotes(bare.db, 'a@example.com')).toEqual([]);
			expect((await noteCounts(bare.db)).size).toBe(0);
		} finally {
			await bare.dispose();
		}
		expect(await listNotes(null, 'a')).toEqual([]);
	});
});
