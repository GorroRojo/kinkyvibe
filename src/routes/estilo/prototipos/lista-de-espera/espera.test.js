import { describe, expect, it } from 'vitest';
import { comprar, liberarLugar, numero, ofrecer, vencerOfertas } from './espera.js';

/** @param {'de-a-une' | 'todes'} modo */
const cola = (modo, libres = 0) => ({
	modo,
	libres,
	filas: /** @type {import('./espera.js').Fila[]} */ ([
		{ id: 'a', estado: 'esperando' },
		{ id: 'b', estado: 'esperando' },
		{ id: 'c', estado: 'esperando' }
	])
});
const estados = (/** @type {{ filas: { estado: string }[] }} */ c) => c.filas.map((f) => f.estado);

describe('de a une', () => {
	it('un lugar libre se le guarda a la primera persona que espera', () => {
		const c = liberarLugar(cola('de-a-une'));
		expect(estados(c)).toEqual(['ofrecido', 'esperando', 'esperando']);
		expect(c.libres).toBe(0);
	});

	it('si vence, pasa a la siguiente', () => {
		const c = vencerOfertas(liberarLugar(cola('de-a-une')));
		expect(estados(c)).toEqual(['vencio', 'ofrecido', 'esperando']);
		expect(c.libres).toBe(0);
	});

	it('si compra, el lugar es suyo y nadie más recibe aviso', () => {
		const c = comprar(liberarLugar(cola('de-a-une')), 'a');
		expect(estados(c)).toEqual(['compro', 'esperando', 'esperando']);
		expect(c.libres).toBe(0);
	});

	it('sin nadie esperando, el lugar queda libre', () => {
		let c = cola('de-a-une');
		c = { ...c, filas: [] };
		expect(liberarLugar(c).libres).toBe(1);
	});
});

describe('a todes a la vez', () => {
	it('avisa a todes sin guardar el lugar; compra quien llega primero', () => {
		const avisades = liberarLugar(cola('todes'));
		expect(estados(avisades)).toEqual(['avisade', 'avisade', 'avisade']);
		expect(avisades.libres).toBe(1);
		const c = comprar(avisades, 'c');
		expect(estados(c)).toEqual(['esperando', 'esperando', 'compro']);
		expect(c.libres).toBe(0);
	});

	it('quien llega tarde no compra (no hay lugar)', () => {
		const c = comprar(comprar(liberarLugar(cola('todes')), 'c'), 'a');
		expect(estados(c)).toEqual(['esperando', 'esperando', 'compro']);
	});
});

describe('ofrecer lugar (panel)', () => {
	it('con un lugar libre lo usa, sin pasar el cupo', () => {
		const { cola: c, pasaCupo } = ofrecer(cola('todes', 1), 'b');
		expect(pasaCupo).toBe(false);
		expect(c.libres).toBe(0);
		expect(estados(c)).toEqual(['esperando', 'ofrecido', 'esperando']);
	});

	it('sin lugares libres avisa que pasa el cupo', () => {
		const { cola: c, pasaCupo } = ofrecer(cola('de-a-une'), 'c');
		expect(pasaCupo).toBe(true);
		expect(c.libres).toBe(0);
	});

	it('no se le ofrece a quien ya compró', () => {
		const base = comprar(liberarLugar(cola('de-a-une')), 'a');
		expect(ofrecer(base, 'a').cola).toBe(base);
	});
});

describe('numero', () => {
	it('cuenta solo a quienes siguen en la lista', () => {
		const c = comprar(liberarLugar(cola('de-a-une')), 'a');
		expect(numero(c.filas, 'a')).toBeNull();
		expect(numero(c.filas, 'b')).toBe(1);
		expect(numero(c.filas, 'c')).toBe(2);
	});
});
