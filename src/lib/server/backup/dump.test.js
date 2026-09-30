import { describe, expect, it } from 'vitest';
import { quoteIdent, quoteText, sqlLiteral, virtualTableStrategy } from './dump.js';

describe('quoteIdent / quoteText', () => {
	it('cita identificadores duplicando las comillas dobles', () => {
		expect(quoteIdent('orders')).toBe('"orders"');
		expect(quoteIdent('raro"nombre')).toBe('"raro""nombre"');
	});

	it('cita textos duplicando las comillas simples', () => {
		expect(quoteText("it's")).toBe("'it''s'");
		expect(quoteText("''")).toBe("''''''");
	});
});

describe('sqlLiteral', () => {
	it('NULL', () => {
		expect(sqlLiteral('null', null)).toBe('NULL');
	});

	it('INTEGER tal cual (llega como texto para no perder precisión)', () => {
		expect(sqlLiteral('integer', '42')).toBe('42');
		expect(sqlLiteral('integer', '-7')).toBe('-7');
		expect(sqlLiteral('integer', '9007199254740993')).toBe('9007199254740993');
		expect(() => sqlLiteral('integer', '1; DROP TABLE x')).toThrow();
	});

	it('REAL conserva el punto decimal y la precisión', () => {
		expect(sqlLiteral('real', 1)).toBe('1.0');
		expect(sqlLiteral('real', 0.1)).toBe('0.1');
		expect(sqlLiteral('real', -2.5)).toBe('-2.5');
		expect(sqlLiteral('real', 1e21)).toBe('1e+21');
		expect(sqlLiteral('real', 0.1 + 0.2)).toBe('0.30000000000000004');
		expect(sqlLiteral('real', Infinity)).toBe('9e999');
		expect(sqlLiteral('real', -Infinity)).toBe('-9e999');
		expect(sqlLiteral('real', -0)).toBe('-0.0');
	});

	it('TEXT con comillas, punto y coma, comentarios, saltos de línea y unicode', () => {
		const tricky = 'a\'b; -- c\n/* d */ ñandú 🦄 "e"';
		expect(sqlLiteral('text', tricky)).toBe(`'a''b; -- c\n/* d */ ñandú 🦄 "e"'`);
		expect(sqlLiteral('text', '')).toBe("''");
	});

	it('TEXT con NUL va en hexadecimal (UTF-8)', () => {
		expect(sqlLiteral('text', 'a\0b')).toBe("CAST(X'610062' AS TEXT)");
	});

	it('BLOB en hexadecimal, venga como array (D1) o como bytes', () => {
		expect(sqlLiteral('blob', [0, 255, 16])).toBe("X'00FF10'");
		expect(sqlLiteral('blob', new Uint8Array([1, 2]))).toBe("X'0102'");
		expect(sqlLiteral('blob', new Uint8Array([171, 205]).buffer)).toBe("X'ABCD'");
		expect(sqlLiteral('blob', [])).toBe("X''");
	});

	it('tipo desconocido: error (mejor fallar que guardar un backup roto)', () => {
		expect(() => sqlLiteral('otro', 1)).toThrow();
	});
});

describe('virtualTableStrategy', () => {
	it('FTS con contenido propio: se copian las filas', () => {
		expect(virtualTableStrategy('CREATE VIRTUAL TABLE f USING fts5(a, b)')).toBe('rows');
	});

	it('FTS con contenido externo: rebuild', () => {
		expect(
			virtualTableStrategy(
				"CREATE VIRTUAL TABLE f USING fts5(a, content='posts', content_rowid='id')"
			)
		).toBe('rebuild');
		expect(virtualTableStrategy('CREATE VIRTUAL TABLE f USING fts5(a, content=posts)')).toBe(
			'rebuild'
		);
	});

	it("FTS sin contenido (content=''): no hay filas que copiar", () => {
		expect(virtualTableStrategy("CREATE VIRTUAL TABLE f USING fts5(a, content='')")).toBe('skip');
	});
});
