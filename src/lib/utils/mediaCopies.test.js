/**
 * Las copias chicas de las tarjetas (docs/imagenes.md): claves, medidas, `srcset` y qué copias le
 * faltan al bucket (la pasada única). Hashes inventados.
 */
import { describe, expect, it } from 'vitest';
import {
	cardSrcset,
	copyKey,
	copySize,
	copyUrl,
	missingCopies,
	parseCopyKey,
	posterSrcset,
	smallSrcset
} from './mediaCopies.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

describe('copyKey y parseCopyKey', () => {
	it('la copia se nombra por el original y el lado, siempre WEBP', () => {
		expect(copyKey(`img/${A}.jpg`, 360)).toBe(`img/${A}-360.webp`);
		expect(copyKey(`img/${A}.webp`, 720)).toBe(`img/${A}-720.webp`);
		expect(parseCopyKey(`img/${A}-720.webp`)).toEqual({ hash: A, side: 720 });
	});
	it('sin copias: un GIF, un lado que no es de la lista, un archivo, una copia', () => {
		expect(copyKey(`img/${A}.gif`, 360)).toBeNull();
		expect(copyKey(`img/${A}.jpg`, 500)).toBeNull();
		expect(copyKey(`file/${A}.pdf`, 360)).toBeNull();
		expect(copyKey(`img/${A}-360.webp`, 360)).toBeNull();
		expect(parseCopyKey(`img/${A}.webp`)).toBeNull();
		expect(parseCopyKey(`img/${A}-500.webp`)).toBeNull();
	});
});

describe('copySize', () => {
	it('el lado más corto queda en el pedido, con la misma proporción', () => {
		expect(copySize(1080, 1350, 360)).toEqual({ width: 360, height: 450 });
		expect(copySize(2000, 1000, 360)).toEqual({ width: 720, height: 360 });
		expect(copySize(1500, 1500, 720)).toEqual({ width: 720, height: 720 });
	});
	it('nunca agranda', () => {
		expect(copySize(300, 500, 360)).toEqual({ width: 300, height: 500 });
		expect(copySize(360, 360, 360)).toEqual({ width: 360, height: 360 });
	});
});

describe('srcset de las tarjetas y las listas', () => {
	it('una imagen de la biblioteca: sus copias (360 para 1x, 720 para 2x)', () => {
		expect(copyUrl(`/media/img/${A}.jpg`, 360)).toBe(`/media/img/${A}-360.webp`);
		expect(cardSrcset(`/media/img/${A}.jpg`)).toBe(
			`/media/img/${A}-360.webp 1x, /media/img/${A}-720.webp 2x`
		);
		expect(smallSrcset(`/media/img/${A}.webp`)).toBe(`/media/img/${A}-360.webp 1x`);
	});
	it('sin copias: un GIF, una dirección de otro sitio o vieja, nada', () => {
		for (const src of [
			`/media/img/${A}.gif`,
			// la del sitio público desde local o un preview: ese sitio puede no tener la copia
			`https://kinkyvibe.ar/media/img/${A}.jpg`,
			'https://example.com/foto.jpg',
			'/media/file/' + A + '.pdf',
			`/media/img/${A}-360.webp`,
			'undefined',
			'',
			undefined,
			null,
			3
		]) {
			expect(cardSrcset(src)).toBe('');
			expect(smallSrcset(src)).toBe('');
			expect(posterSrcset(src, { width: 1080, height: 1350 })).toBe('');
		}
	});
});

describe('srcset del afiche de un evento', () => {
	const src = `/media/img/${A}.webp`;
	it('las copias y el original, anotados por su lado corto (el cuadrado recorta al centro)', () => {
		// vertical: el lado corto es el ancho
		expect(posterSrcset(src, { width: 1080, height: 1350 })).toBe(
			`/media/img/${A}-360.webp 360w, /media/img/${A}-720.webp 720w, ${src} 1080w`
		);
		// apaisada: el lado corto es el alto
		expect(posterSrcset(src, { width: 2000, height: 1125 })).toBe(
			`/media/img/${A}-360.webp 360w, /media/img/${A}-720.webp 720w, ${src} 1125w`
		);
	});
	it('un original chico: nunca anota más que lo que mide y no repite un lado', () => {
		expect(posterSrcset(src, { width: 600, height: 800 })).toBe(
			`/media/img/${A}-360.webp 360w, /media/img/${A}-720.webp 600w`
		);
		expect(posterSrcset(src, { width: 300, height: 300 })).toBe(`/media/img/${A}-360.webp 300w`);
	});
	it('sin medidas (portada vieja): solo las copias', () => {
		const copies = `/media/img/${A}-360.webp 360w, /media/img/${A}-720.webp 720w`;
		expect(posterSrcset(src)).toBe(copies);
		expect(posterSrcset(src, null)).toBe(copies);
		expect(posterSrcset(src, { width: null, height: 900 })).toBe(copies);
	});
});

describe('missingCopies (la pasada única)', () => {
	it('solo las copias que faltan; nunca una clave que ya está', () => {
		const keys = [
			`img/${A}.jpg`,
			`img/${A}-360.webp`, // ya tiene la de 360
			`img/${B}.png`,
			`img/${C}.gif`, // un GIF no tiene copias
			`file/${A}.pdf`,
			'img/otra-cosa.txt'
		];
		const plan = missingCopies(keys);
		expect(plan).toEqual([
			{ original: `img/${A}.jpg`, key: `img/${A}-720.webp`, side: 720 },
			{ original: `img/${B}.png`, key: `img/${B}-360.webp`, side: 360 },
			{ original: `img/${B}.png`, key: `img/${B}-720.webp`, side: 720 }
		]);
		for (const p of plan) expect(keys).not.toContain(p.key);
	});
	it('con todo hecho, nada (idempotente)', () => {
		const keys = [`img/${A}.jpg`, `img/${A}-360.webp`, `img/${A}-720.webp`];
		expect(missingCopies(keys)).toEqual([]);
		expect(missingCopies([])).toEqual([]);
	});
});
