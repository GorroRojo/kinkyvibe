import { describe, expect, it } from 'vitest';
import { csvCell, csvFilename, csvResponse, toCsv } from './csv.js';

describe('csvCell', () => {
	it('deja los valores simples tal cual', () => {
		expect(csvCell('hola')).toBe('hola');
		expect(csvCell(12)).toBe('12');
		expect(csvCell(-5)).toBe('-5');
		expect(csvCell(null)).toBe('');
		expect(csvCell(undefined)).toBe('');
		expect(csvCell(true)).toBe('sí');
		expect(csvCell(false)).toBe('no');
		expect(csvCell(NaN)).toBe('');
	});
	it('cita comas, comillas, punto y coma y saltos de línea', () => {
		expect(csvCell('a,b')).toBe('"a,b"');
		expect(csvCell('dijo "hola"')).toBe('"dijo ""hola"""');
		expect(csvCell('a\nb')).toBe('"a\nb"');
		expect(csvCell('a;b')).toBe('"a;b"');
	});
	it('neutraliza fórmulas (inyección de CSV)', () => {
		expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
		expect(csvCell('+54 11')).toBe("'+54 11");
		expect(csvCell('-1')).toBe("'-1");
		expect(csvCell('@a')).toBe("'@a");
	});
	it('fechas en hora de Argentina y objetos en JSON', () => {
		// Antes salían en ISO UTC (2026-10-03T01:30:00.000Z): una compra de las 22:30 del 2/10
		// parecía del día siguiente.
		expect(csvCell(new Date(Date.UTC(2026, 9, 3, 1, 30)))).toBe('2026-10-02 22:30');
		expect(csvCell(new Date(Date.UTC(2026, 9, 2, 12)))).toBe('2026-10-02 09:00');
		expect(csvCell(new Date(NaN))).toBe('');
		expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
	});
});

describe('toCsv', () => {
	const rows = [
		{ name: 'Persona Uno', total: 1000, email: 'uno@ejemplo.com' },
		{ name: 'Dos, Tres', total: 0, email: null }
	];
	it('arma encabezado y filas con key o value()', () => {
		const csv = toCsv(
			rows,
			[
				{ key: 'name', label: 'Nombre' },
				{ label: 'Total ($)', value: (r) => r.total / 100 },
				{ key: 'email', label: 'Email' }
			],
			{ bom: false }
		);
		expect(csv).toBe(
			'Nombre,Total ($),Email\r\nPersona Uno,10,uno@ejemplo.com\r\n"Dos, Tres",0,\r\n'
		);
	});
	it('empieza con BOM por defecto (acentos en Excel)', () => {
		expect(toCsv([], [{ label: 'Año' }]).startsWith('\uFEFFAño')).toBe(true);
	});
	it('sin filas: solo el encabezado', () => {
		expect(toCsv([], [{ label: 'A' }, { label: 'B' }], { bom: false })).toBe('A,B\r\n');
	});
});

describe('csvFilename', () => {
	it('arma un nombre seguro sin acentos', () => {
		expect(csvFilename('Picantearla 2026-10', 'órdenes')).toBe('picantearla-2026-10-ordenes.csv');
		expect(csvFilename('', null, undefined)).toBe('export.csv');
		expect(csvFilename('../../etc/passwd')).toBe('etc-passwd.csv');
	});
});

describe('csvResponse', () => {
	it('descarga privada y sin caché', async () => {
		const res = csvResponse('a\r\n', 'x"y.csv');
		expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
		expect(res.headers.get('content-disposition')).toBe('attachment; filename="xy.csv"');
		expect(res.headers.get('cache-control')).toBe('private, no-store');
		expect(await res.text()).toBe('a\r\n');
	});
});
