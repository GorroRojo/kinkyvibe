/**
 * Panel → Eventos por páginas: la página de entrada manda los próximos, los borradores y los
 * pasados de los últimos meses (no todos los eventos); los anteriores salen de a tandas sin
 * repetir ni perder ninguno; las cuentas, la búsqueda y el CSV son de TODOS; las ventas se piden
 * en una consulta y solo para los eventos que se mandan. Eventos inventados.
 */
import { describe, expect, it } from 'vitest';
import { firstPage, listedRows, olderPage, pastSince, withSales } from './panelList.js';
import {
	OLDER_PAGE,
	PAST_DAYS,
	filterTests,
	inFilter,
	matchesSearch,
	searchWords
} from '$lib/admin/eventList.js';

const TODAY = '2031-06-15';

/**
 * @param {Partial<import('$lib/admin/eventList.js').EventRow>} over
 * @returns {import('$lib/admin/eventList.js').EventRow}
 */
function row(over) {
	return {
		slug: 'x',
		title: 'Evento Inventado',
		start: '',
		end: '',
		status: '',
		locationName: '',
		location: '',
		place: '',
		unlisted: false,
		unpublished: false,
		online: false,
		thumb: '/img.webp',
		sellsTickets: false,
		capacity: null,
		goal: '',
		sold: 0,
		revenue: 0,
		mpFee: 0,
		transfers: 0,
		i: 0,
		...over
	};
}

/** Un evento por semana desde 2028 hasta fines de 2031, del más nuevo al más viejo. */
function manyEvents() {
	const out = [];
	const day = new Date('2031-12-28T12:00:00Z');
	for (let n = 0; n < 210; n++) {
		const d = day.toISOString().slice(0, 10);
		out.push(
			row({
				slug: `inventado-${d}`,
				title: n % 7 === 0 ? `Taller de Nudos ${n}` : `Encuentro Inventado ${n}`,
				start: `${d}T20:00-03:00`,
				// Algunos borradores viejos, algunos despublicados, algunos sin imagen.
				unlisted: n % 50 === 3,
				unpublished: n % 61 === 5,
				thumb: n % 9 === 0 ? '' : '/img.webp'
			})
		);
		day.setUTCDate(day.getUTCDate() - 7);
	}
	out.push(row({ slug: 'sin-fecha-inventado', title: 'Sin fecha' }));
	return out.map((e, i) => ({ ...e, i }));
}

describe('página de entrada de Eventos', () => {
	const all = manyEvents();
	const page = firstPage(all, TODAY);
	const since = pastSince(TODAY);

	it('manda los próximos, los pasados de los últimos meses, los borradores y los sin fecha', () => {
		expect(since).toBe('2031-03-17');
		expect(PAST_DAYS).toBe(90);
		expect(page.events.length).toBeLessThan(all.length / 2);
		for (const e of all) {
			const recent = !e.start || e.start.slice(0, 10) >= since;
			const draft = e.unlisted && !e.unpublished;
			expect(page.events.includes(e)).toBe(recent || draft);
		}
	});

	it('«Próximos», «Borradores» y «Sin imagen» quedan completos con lo que manda', () => {
		const tests = filterTests(TODAY);
		for (const f of /** @type {const} */ (['proximos', 'borradores', 'sin-imagen'])) {
			expect(inFilter(page.events, f, TODAY)).toEqual(inFilter(all, f, TODAY));
			expect(page.counts[f]).toBe(all.filter(tests[f]).length);
		}
	});

	it('las cuentas y el total son de todos los eventos', () => {
		const tests = filterTests(TODAY);
		expect(page.total).toBe(all.length);
		expect(page.counts.pasados).toBe(all.filter(tests.pasados).length);
		expect(page.older).toBe(all.length - page.events.length);
	});

	it('«Ver anteriores» trae el resto de a tandas, en orden, sin repetir ni perder ninguno', () => {
		/** @type {typeof all} */
		const got = [];
		let remaining = page.older;
		let calls = 0;
		while (remaining > 0) {
			const next = olderPage(all, TODAY, { offset: got.length });
			expect(next.events.length).toBeLessThanOrEqual(OLDER_PAGE);
			got.push(...next.events);
			remaining = next.remaining;
			calls++;
		}
		expect(calls).toBe(Math.ceil(page.older / OLDER_PAGE));
		const slugs = [...page.events, ...got].map((e) => e.slug);
		expect(new Set(slugs).size).toBe(all.length);
		expect(got.map((e) => e.i)).toEqual([...got.map((e) => e.i)].sort((a, b) => a - b));
		// Lo cargado más lo traído es la lista de Pasados completa, en el mismo orden.
		const loaded = [...page.events, ...got].sort((a, b) => a.i - b.i);
		expect(inFilter(loaded, 'pasados', TODAY)).toEqual(inFilter(all, 'pasados', TODAY));
		expect(olderPage(all, TODAY, { offset: 9999 })).toEqual({ events: [], remaining: 0 });
	});

	it('buscar (y el CSV con búsqueda) busca en todos, también en los anteriores', () => {
		const words = searchWords('taller nudos');
		const found = listedRows(all, { query: 'Taller NUDOS', filter: 'proximos', today: TODAY });
		expect(found).toEqual(all.filter((e) => matchesSearch(e, words)));
		expect(found.some((e) => !page.events.includes(e))).toBe(true);
	});

	it('el CSV sin búsqueda es el filtro entero, en el orden de la lista', () => {
		expect(listedRows(all, { filter: 'pasados', today: TODAY })).toEqual(
			inFilter(all, 'pasados', TODAY)
		);
		const next = listedRows(all, { filter: 'proximos', today: TODAY });
		expect(next[0].start <= next[next.length - 1].start).toBe(true);
	});
});

describe('ventas de la lista', () => {
	/** Una base de mentira que guarda cada consulta y sus parámetros. */
	function fakeDb() {
		/** @type {{ sql: string, params: unknown[] }[]} */
		const calls = [];
		const db = /** @type {any} */ ({
			prepare: (/** @type {string} */ sql) => ({
				bind: (/** @type {unknown[]} */ ...params) => ({
					all: async () => {
						calls.push({ sql, params });
						const slugs = JSON.parse(String(params[1]));
						return {
							results: slugs
								.filter((/** @type {string} */ s) => s !== 'sin-ventas')
								.map((/** @type {string} */ s) => ({
									event_slug: s,
									sold: 3,
									revenue: 30000,
									mp_fee: 600,
									transfers: 1
								}))
						};
					}
				})
			})
		});
		return { db, calls };
	}

	it('una sola consulta, solo con los eventos que se mandan', async () => {
		const { db, calls } = fakeDb();
		const rows = [row({ slug: 'uno', i: 0 }), row({ slug: 'sin-ventas', i: 1 })];
		const out = await withSales(db, rows, 123);
		expect(calls.length).toBe(1);
		expect(calls[0].sql).toMatch(/json_each/);
		expect(calls[0].params).toEqual([123, JSON.stringify(['uno', 'sin-ventas'])]);
		expect(out.map((e) => [e.slug, e.sold, e.transfers])).toEqual([
			['uno', 3, 1],
			['sin-ventas', 0, 0]
		]);
		// Lo recaudado (para el avance contra una meta de venta en plata), en la misma consulta.
		expect(calls[0].sql).toMatch(/THEN total ELSE 0 END\) AS revenue/);
		expect(out.map((e) => e.revenue)).toEqual([30000, 0]);
		// Y la comisión de Mercado Pago (solo de lo pagado con MP), para lo neto de la meta.
		expect(calls[0].sql).toMatch(
			/THEN CASE WHEN payment_method = 'mercadopago' THEN surcharge_amount ELSE 0 END ELSE 0 END\) AS mp_fee/
		);
		expect(out.map((e) => e.mpFee)).toEqual([600, 0]);
	});

	it('sin eventos o sin base no consulta nada', async () => {
		const { db, calls } = fakeDb();
		expect(await withSales(db, [], 1)).toEqual([]);
		expect(calls.length).toBe(0);
		const rows = [row({ slug: 'uno' })];
		expect(await withSales(null, rows, 1)).toBe(rows);
	});
});
