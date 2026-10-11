/**
 * ReadingTime.svelte: el reloj y «X min de lectura», la explicación con el link para ajustar la
 * velocidad, las opciones (Más despacio, Normal, Más rápido, Otro) y el recálculo con la velocidad
 * elegida. Lo que se toca (abrir, elegir) se prueba en el navegador; acá, lo que se dibuja.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import { withoutComments } from '$lib/testing/html.js';
import { readingSpeed } from '$lib/utils/readingSpeed.js';

vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/material/x'), data: { member: false } })
}));

const { default: ReadingTime } = await import('./ReadingTime.svelte');

/** @param {Record<string, unknown>} props */
const html = (props) =>
	withoutComments(render(ReadingTime, { props: /** @type {any} */ (props) }).body);

afterEach(() => readingSpeed.set(null));

describe('ReadingTime', () => {
	it('la explicación trae el link para ajustar la velocidad (cerrado al principio)', () => {
		const body = html({ minutes: 4, words: 650 });
		expect(body).toContain('4 min de lectura');
		expect(body).toMatch(
			/<button[^>]*class="adjust[^"]*"[^>]*aria-expanded="false"[^>]*aria-controls="kv-tiempo-de-lectura-velocidad"[^>]*>¿Leés más rápido o más lento\? Ajustalo<\/button>/
		);
		// Sin abrir, las opciones no están.
		expect(body).not.toContain('Tu velocidad de lectura');
		// La explicación sigue unida al botón del tiempo, sin el texto del link adentro.
		expect(body).toMatch(
			/<span(?=[^>]*\bid="kv-tiempo-de-lectura")(?=[^>]*\brole="note")[^>]*>Calculado a unas 200 palabras por minuto, sin contar imágenes ni código<\/span>/
		);
	});

	it('abiertas: las tres velocidades (Normal elegida) y «Otro» de 80 a 600', () => {
		const body = html({ minutes: 4, words: 650, open: true, adjusting: true });
		expect(body).toMatch(/class="adjust[^"]*"[^>]*aria-expanded="true"/);
		expect(body).toMatch(
			/<span[^>]*id="kv-tiempo-de-lectura-velocidad"[\s\S]*role="group"[^>]*aria-label="Tu velocidad de lectura"/
		);
		for (const [label, wpm, pressed] of [
			['Más despacio', 150, false],
			['Normal', 200, true],
			['Más rápido', 280, false]
		]) {
			expect(body).toMatch(
				new RegExp(
					`<button[^>]*aria-pressed="${pressed}"[^>]*title="${wpm} palabras por minuto"[^>]*>${label}</button>`
				)
			);
		}
		expect(body).toMatch(/<label for="kv-tiempo-de-lectura-otro"[^>]*>Otro:<\/label>/);
		expect(body).toMatch(
			/<input(?=[^>]*id="kv-tiempo-de-lectura-otro")(?=[^>]*type="number")(?=[^>]*min="80")(?=[^>]*max="600")[^>]*>/
		);
		expect(body).toContain('palabras por minuto');
		expect(body).toMatch(/<button[^>]*class="use[^"]*"[^>]*disabled[^>]*>Usar<\/button>/);
	});

	it('con una velocidad elegida: recalcula los minutos y la explicación dice «a tu velocidad»', () => {
		readingSpeed.set(150);
		const body = html({ minutes: 4, words: 650, open: true, adjusting: true });
		expect(body).toContain('5 min de lectura');
		expect(body).not.toContain('4 min de lectura');
		expect(body).toContain(
			'Calculado a tu velocidad (150 palabras por minuto), sin contar imágenes ni código'
		);
		expect(body).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Más despacio<\/button>/);
		expect(body).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Normal<\/button>/);
	});

	it('más rápido: menos minutos; sin palabras, quedan los del servidor', () => {
		readingSpeed.set(280);
		expect(html({ minutes: 4, words: 650 })).toContain('3 min de lectura');
		expect(html({ minutes: 4 })).toContain('4 min de lectura');
	});

	it('sin velocidad elegida: los minutos del servidor tal cual (nada se mueve al hidratar)', () => {
		expect(html({ minutes: 4, words: 650 })).toContain('4 min de lectura');
		expect(html({ minutes: 0, words: 0 })).toBe('');
	});
});
