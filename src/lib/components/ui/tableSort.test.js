/**
 * El orden de las columnas de la tabla compartida (tableSort.js): números, fechas y plata como
 * valores (no como texto), texto en castellano, vacías al final, estable, y el encabezado que da
 * vuelta el sentido.
 */
import { describe, expect, it } from 'vitest';
import { ariaSort, nextSort, sortKey, sortRows, sortType } from './tableSort.js';

const ROWS = [
	{ id: 'a', code: 'KV-10', total: 24000, when: '2026-10-02T22:00:00Z', name: 'Ñandú' },
	{ id: 'b', code: 'KV-2', total: 9000, when: '2026-09-12T20:00:00Z', name: 'ana' },
	{ id: 'c', code: 'KV-0001', total: 120000, when: null, name: 'Álvaro' },
	{ id: 'd', code: '', total: 9000, when: '2026-01-05T10:00:00Z', name: 'Beto' }
];
/** @param {Record<string, any>[]} rows */
const ids = (rows) => rows.map((r) => r.id).join('');

describe('sortRows', () => {
	it('los números se ordenan como números («9.000» antes que «24.000» y «120.000»)', () => {
		const col = { key: 'total', sort: /** @type {const} */ ('number') };
		expect(ids(sortRows(ROWS, col, 'asc'))).toBe('bdac');
		expect(ids(sortRows(ROWS, col, 'desc'))).toBe('cabd');
	});

	it('la plata se ordena por su valor aunque la celda muestre texto', () => {
		const rows = [
			{ id: 'x', shown: '$ 24.000', cents: 24000 },
			{ id: 'y', shown: '$ 9.000', cents: 9000 },
			{ id: 'z', shown: '$ 120.000', cents: 120000 }
		];
		const col = {
			key: 'shown',
			sort: /** @type {const} */ ('number'),
			sortValue: (/** @type {any} */ r) => r.cents
		};
		expect(ids(sortRows(rows, col, 'asc'))).toBe('yxz');
		expect(ids(sortRows(rows, col, 'desc'))).toBe('zxy');
	});

	it('las fechas se ordenan por fecha (texto ISO, milisegundos o Date) y las vacías al final', () => {
		const col = { key: 'when', sort: /** @type {const} */ ('date') };
		expect(ids(sortRows(ROWS, col, 'asc'))).toBe('dbac');
		expect(ids(sortRows(ROWS, col, 'desc'))).toBe('abdc');
		const mixed = [
			{ id: 'm', when: Date.UTC(2026, 5, 1) },
			{ id: 'n', when: new Date(Date.UTC(2025, 0, 1)) },
			{ id: 'o', when: '2027-01-01' }
		];
		expect(ids(sortRows(mixed, col, 'asc'))).toBe('nmo');
	});

	it('el texto va en castellano: sin mayúsculas ni tildes, y con los números adentro en orden', () => {
		expect(ids(sortRows(ROWS, { key: 'name', sort: true }, 'asc'))).toBe('cbda');
		// «KV-0001» < «KV-2» < «KV-10»; la vacía al final
		expect(ids(sortRows(ROWS, { key: 'code', sort: 'text' }, 'asc'))).toBe('cbad');
		expect(ids(sortRows(ROWS, { key: 'code', sort: 'text' }, 'desc'))).toBe('abcd');
	});

	it('es estable: las filas con el mismo valor quedan como venían, en los dos sentidos', () => {
		const col = { key: 'total', sort: /** @type {const} */ ('number') };
		const asc = ids(sortRows(ROWS, col, 'asc'));
		const desc = ids(sortRows(ROWS, col, 'desc'));
		expect(asc.indexOf('b')).toBeLessThan(asc.indexOf('d'));
		expect(desc.indexOf('b')).toBeLessThan(desc.indexOf('d'));
	});

	it('no cambia las filas que recibe, y sin `sort` deja el orden como está', () => {
		const copy = ROWS.map((r) => r.id).join('');
		sortRows(ROWS, { key: 'total', sort: 'number' }, 'desc');
		expect(ids(ROWS)).toBe(copy);
		expect(ids(sortRows(ROWS, { key: 'total' }, 'desc'))).toBe(copy);
	});
});

describe('sortKey y sortType', () => {
	it('vacías o inválidas son null', () => {
		expect(sortKey('', 'text')).toBeNull();
		expect(sortKey(null, 'number')).toBeNull();
		expect(sortKey('no es un número', 'number')).toBeNull();
		expect(sortKey('no es una fecha', 'date')).toBeNull();
		expect(sortKey('12', 'number')).toBe(12);
		expect(sortKey(0, 'number')).toBe(0);
	});

	it('`true` es texto; sin `sort`, la columna no se ordena', () => {
		expect(sortType({ key: 'x', sort: true })).toBe('text');
		expect(sortType({ key: 'x', sort: 'date' })).toBe('date');
		expect(sortType({ key: 'x' })).toBeNull();
		expect(sortType({ key: 'x', sort: false })).toBeNull();
	});
});

describe('nextSort y ariaSort', () => {
	const total = { key: 'total', sort: /** @type {const} */ ('number') };
	const name = { key: 'name', sort: /** @type {const} */ ('text') };

	it('tocar un encabezado ordena de menor a mayor; tocarlo otra vez da vuelta el sentido', () => {
		let s = nextSort(null, total);
		expect(s).toEqual({ key: 'total', dir: 'asc' });
		s = nextSort(s, total);
		expect(s).toEqual({ key: 'total', dir: 'desc' });
		s = nextSort(s, total);
		expect(s).toEqual({ key: 'total', dir: 'asc' });
		// otra columna arranca de nuevo de menor a mayor
		expect(nextSort({ key: 'total', dir: 'desc' }, name)).toEqual({ key: 'name', dir: 'asc' });
	});

	it('aria-sort solo en la columna ordenada', () => {
		expect(ariaSort({ key: 'total', dir: 'asc' }, total)).toBe('ascending');
		expect(ariaSort({ key: 'total', dir: 'desc' }, total)).toBe('descending');
		expect(ariaSort({ key: 'total', dir: 'asc' }, name)).toBeUndefined();
		expect(ariaSort(null, total)).toBeUndefined();
		expect(ariaSort({ key: 'x', dir: 'asc' }, { key: 'x' })).toBeUndefined();
	});
});
