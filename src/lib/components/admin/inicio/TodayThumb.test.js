/**
 * La miniatura del recuadro «Hoy» del Inicio: tamaño fijo y carga diferida, achicada solo en
 * producción, y nada (ni un cuadrado vacío) si el evento no tiene portada.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import TodayThumb from './TodayThumb.svelte';

const cover = `/media/img/${'a'.repeat(64)}.webp`;

/** @param {Record<string, string>} props */
const html = (props) => render(TodayThumb, { props }).body;

describe('TodayThumb', () => {
	it('con portada: una imagen de 64 × 64, diferida y sin texto alternativo', () => {
		const out = html({ src: cover, host: 'localhost' });
		expect(out).toContain(`src="${cover}"`);
		expect(out).toContain('width="64"');
		expect(out).toContain('height="64"');
		expect(out).toContain('loading="lazy"');
		expect(out).toMatch(/alt=""/);
	});

	it('en producción pide la versión achicada, nunca la portada entera', () => {
		const out = html({ src: cover, host: 'kinkyvibe.ar' });
		expect(out).toContain(`src="/cdn-cgi/image/width=128,height=128,fit=cover`);
		expect(out).not.toContain(`src="${cover}"`);
	});

	it('con texto alternativo si se lo pasan', () => {
		expect(html({ src: cover, host: 'localhost', alt: 'Fiesta' })).toContain('alt="Fiesta"');
	});

	it('sin portada: nada', () => {
		expect(html({ src: '', host: 'kinkyvibe.ar' })).not.toContain('<img');
	});
});
