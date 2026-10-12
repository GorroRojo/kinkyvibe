/**
 * La tabla compartida (Table.svelte): encabezados que ordenan (un botón con su flechita de
 * Lucide y `aria-sort` en la columna ordenada), filas en el orden pedido (números y fechas como
 * valores), `limit` después de ordenar, anchos de columna que conserva la tabla vacía, celdas de
 * números y códigos que no se cortan, y las clases de las filas y columnas.
 * (El orden en sí, con todos sus casos, lo prueba tableSort.test.js.)
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Table from './Table.svelte';
import { textOf, withoutComments } from '$lib/testing/html.js';
import { nextSort } from './tableSort.js';

/** @type {import('./tableSort.js').TableColumn[]} */
const COLUMNS = [
	{ key: 'orden', label: 'Orden', sort: 'text', nowrap: true, width: '8rem' },
	{ key: 'persona', label: 'Persona' },
	{
		key: 'total',
		label: 'Total',
		align: 'right',
		sort: 'number',
		sortValue: (/** @type {any} */ r) => r.pesos,
		width: '8rem'
	},
	{ key: 'fecha', label: 'Fecha', sort: 'date', class: 'hide-sm' },
	{ key: 'accion', label: 'Acción', hideLabel: true }
];
const ROWS = [
	{
		orden: 'KV-0010',
		persona: 'Persona Uno',
		total: '$ 24.000',
		pesos: 24000,
		fecha: '2026-10-02'
	},
	{ orden: 'KV-0002', persona: 'Persona Dos', total: '$ 9.000', pesos: 9000, fecha: '2026-09-12' },
	{ orden: 'KV-0003', persona: 'Persona Tres', total: '$ 120.000', pesos: 120000, fecha: null }
];

/** @param {Record<string, any>} props */
const html = (props) =>
	withoutComments(
		render(Table, { props: /** @type {any} */ ({ columns: COLUMNS, rows: ROWS, ...props }) }).body
	);
/** Los códigos de orden en el orden en que se ven. @param {string} body */
const order = (body) => [...textOf(body).matchAll(/KV-\d+/g)].map((m) => m[0]).join(' ');
/** Los <th> del encabezado. @param {string} body */
const headers = (body) =>
	body
		.split('<th ')
		.slice(1)
		.map((h) => h.slice(0, h.indexOf('</th>')));

describe('Table', () => {
	it('sin orden, las filas quedan como vienen y ningún encabezado lleva aria-sort', () => {
		const body = html({});
		expect(order(body)).toBe('KV-0010 KV-0002 KV-0003');
		expect(body).not.toContain('aria-sort');
	});

	it('las columnas con `sort` llevan un botón con la flechita; las otras, solo el nombre', () => {
		const [orden, persona, total, fecha, accion] = headers(html({}));
		for (const h of [orden, total, fecha]) {
			expect(h).toMatch(/<button type="button" class="sort/);
			expect(h).toMatch(/lucide-chevrons-up-down/);
			expect(h).toContain('aria-hidden="true"');
		}
		expect(persona).not.toContain('<button');
		expect(accion).not.toContain('<button');
		// el nombre de la columna de botones queda para lectores de pantalla
		expect(accion).toMatch(/<span class="sr-only[^"]*">Acción<\/span>/);
	});

	it('ordenada por plata de menor a mayor: por el valor, no por el texto, con aria-sort', () => {
		const body = html({ sort: { key: 'total', dir: 'asc' } });
		expect(order(body)).toBe('KV-0002 KV-0010 KV-0003');
		const total = headers(body)[2];
		expect(total).toContain('aria-sort="ascending"');
		expect(total).toMatch(/lucide-chevron-up/);
		expect(headers(body)[0]).not.toContain('aria-sort');
	});

	it('tocar el encabezado otra vez da vuelta el sentido (de mayor a menor)', () => {
		const sort = nextSort({ key: 'total', dir: 'asc' }, COLUMNS[2]);
		const body = html({ sort });
		expect(order(body)).toBe('KV-0003 KV-0010 KV-0002');
		expect(headers(body)[2]).toContain('aria-sort="descending"');
		expect(headers(body)[2]).toMatch(/lucide-chevron-down/);
	});

	it('por fecha: la más vieja primero y la vacía al final', () => {
		const body = html({ sort: { key: 'fecha', dir: 'asc' } });
		expect(order(body)).toBe('KV-0002 KV-0010 KV-0003');
		expect(headers(body)[3]).toContain('aria-sort="ascending"');
	});

	it('por código: texto con los números en orden', () => {
		expect(order(html({ sort: { key: 'orden', dir: 'asc' } }))).toBe('KV-0002 KV-0003 KV-0010');
		expect(order(html({ sort: { key: 'orden', dir: 'desc' } }))).toBe('KV-0010 KV-0003 KV-0002');
	});

	it('un orden por una columna que no se ordena no cambia nada', () => {
		const body = html({ sort: { key: 'persona', dir: 'asc' } });
		expect(order(body)).toBe('KV-0010 KV-0002 KV-0003');
		expect(body).not.toContain('aria-sort');
	});

	it('`limit` corta después de ordenar todas las filas', () => {
		const body = html({ sort: { key: 'total', dir: 'desc' }, limit: 2 });
		expect(order(body)).toBe('KV-0003 KV-0010');
	});

	it('los números y los códigos no se cortan; las clases de la columna van en sus celdas', () => {
		const body = html({});
		expect(body).toMatch(/<td class="nowrap[^"]*">KV-0010<\/td>/);
		expect(body).toMatch(/<td class="r num[^"]*">\$ 24\.000<\/td>/);
		expect(body).toMatch(/<td class="hide-sm[^"]*">2026-10-02<\/td>/);
		expect(headers(body)[3]).toMatch(/^scope="col" class="hide-sm/);
	});

	it('con anchos, la tabla vacía lleva los mismos <col> que la llena', () => {
		const cols = (/** @type {string} */ b) =>
			b.slice(b.indexOf('<colgroup'), b.indexOf('</colgroup>'));
		const full = html({});
		const empty = html({ rows: [], empty: 'Todavía no hay órdenes.' });
		expect(cols(full)).toMatch(/<col style="width: 8rem;?"/);
		expect(cols(empty)).toBe(cols(full));
		expect(textOf(empty)).toContain('Todavía no hay órdenes.');
		expect(empty).toMatch(/<td class="empty[^"]*" colspan="5">/);
	});

	it('`rowClass` pone las clases de cada fila', () => {
		const body = html({
			rowClass: (/** @type {any} */ r) => (r.pesos > 10000 ? 'code big' : 'code')
		});
		expect(body.match(/<tr class="code big/g)?.length).toBe(2);
		expect(body.match(/<tr class="code[ "]/g)?.length).toBe(3);
	});

	it('una columna de números con `nowrap: false` se puede cortar (un texto largo)', () => {
		const columns = [{ key: 'usos', label: 'Usos', align: 'right', nowrap: false }];
		const body = withoutComments(
			render(Table, {
				props: /** @type {any} */ ({ columns, rows: [{ usos: '2 aprobados de 10' }] })
			}).body
		);
		expect(body).toMatch(/<td class="r num svelte-[a-z0-9]+">2 aprobados de 10<\/td>/);
	});
});
