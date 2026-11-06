import { describe, expect, it } from 'vitest';
import {
	CARRUSEL_ESTILOS,
	ROTAR,
	carruselModo,
	estiloDeDiapositiva,
	estiloDelEvento,
	estilosDelCarrusel,
	nombreDelEstilo
} from './carruselEstilos.js';

/** @param {Record<string, unknown>} [meta] */
const post = (meta = {}) => ({ meta });

describe('los estilos', () => {
	it('son cinco, A a E, con nombre y explicación', () => {
		expect(CARRUSEL_ESTILOS.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
		expect(CARRUSEL_ESTILOS.map((e) => e.nombre)).toEqual([
			'Pila de flyers',
			'Franja cruzada',
			'Mesa de stickers',
			'Diagonal',
			'Mesa de zines'
		]);
		for (const e of CARRUSEL_ESTILOS) expect(e.texto.length).toBeGreaterThan(10);
		expect(nombreDelEstilo(ROTAR)).toBe('Rotar');
		expect(nombreDelEstilo('d')).toBe('Diagonal');
	});
});

describe('carruselModo (lo guardado en Ajustes)', () => {
	it('sin nada o con algo raro, rotar', () => {
		expect(carruselModo(null)).toBe(ROTAR);
		expect(carruselModo(undefined)).toBe(ROTAR);
		expect(carruselModo('')).toBe(ROTAR);
		expect(carruselModo('f')).toBe(ROTAR);
		expect(carruselModo('<script>')).toBe(ROTAR);
		expect(carruselModo(3)).toBe(ROTAR);
	});
	it('un estilo, ese (sin importar mayúsculas ni espacios)', () => {
		expect(carruselModo('c')).toBe('c');
		expect(carruselModo(' E ')).toBe('e');
		expect(carruselModo('rotar')).toBe(ROTAR);
	});
});

describe('estiloDelEvento', () => {
	it('lee `carrusel_estilo` del evento; si no hay o no vale, null', () => {
		expect(estiloDelEvento({ carrusel_estilo: 'b' })).toBe('b');
		expect(estiloDelEvento({ carrusel_estilo: 'B' })).toBe('b');
		expect(estiloDelEvento({ carrusel_estilo: 'rotar' })).toBeNull();
		expect(estiloDelEvento({ carrusel_estilo: 'z' })).toBeNull();
		expect(estiloDelEvento({})).toBeNull();
		expect(estiloDelEvento(null)).toBeNull();
	});
});

describe('qué estilo le toca a cada diapositiva', () => {
	it('rotar: A, B, C, D, E y de vuelta', () => {
		const posts = Array.from({ length: 7 }, () => post());
		expect(estilosDelCarrusel(posts, ROTAR)).toEqual(['a', 'b', 'c', 'd', 'e', 'a', 'b']);
		// sin nada guardado es lo mismo
		expect(estilosDelCarrusel(posts, null)).toEqual(['a', 'b', 'c', 'd', 'e', 'a', 'b']);
	});
	it('un estilo fijo: todas iguales', () => {
		expect(estilosDelCarrusel([post(), post(), post()], 'd')).toEqual(['d', 'd', 'd']);
	});
	it('el del evento manda sobre Ajustes, rote o no; las demás siguen su lugar', () => {
		const posts = [post(), post({ carrusel_estilo: 'e' }), post(), post({ carrusel_estilo: 'a' })];
		expect(estilosDelCarrusel(posts, ROTAR)).toEqual(['a', 'e', 'c', 'a']);
		expect(estilosDelCarrusel(posts, 'c')).toEqual(['c', 'e', 'c', 'a']);
	});
	it('estiloDeDiapositiva directo', () => {
		expect(estiloDeDiapositiva(ROTAR, null, 4)).toBe('e');
		expect(estiloDeDiapositiva(ROTAR, null, 5)).toBe('a');
		expect(estiloDeDiapositiva('b', null, 4)).toBe('b');
		expect(estiloDeDiapositiva('b', 'c', 0)).toBe('c');
	});
});
