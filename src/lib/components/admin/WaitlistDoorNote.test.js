/**
 * La nota de la lista de espera en «Vender en puerta» y en «Cargar entradas a mano» (render del
 * servidor): no frena nada, solo avisa. Sin nadie en la fila, no se muestra.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import WaitlistDoorNote from './WaitlistDoorNote.svelte';

/** @param {Record<string, unknown>} props */
const html = (props) => render(WaitlistDoorNote, { props }).body;
const text = (/** @type {string} */ h) =>
	h
		.replace(/<[^>]+>/g, '')
		.replace(/\s+/g, ' ')
		.trim();

describe('WaitlistDoorNote', () => {
	it('sin fila (o sin datos), nada', () => {
		expect(text(html({ summary: null }))).toBe('');
		expect(text(html({ summary: { waiting: 0, offered: 0, nextHoldUntil: null } }))).toBe('');
	});

	it('cuenta a quien espera y a quien tiene un lugar guardado, con la hora (Argentina)', () => {
		const h = html({
			// 21:30 en Argentina (UTC−3).
			summary: { waiting: 3, offered: 1, nextHoldUntil: Date.UTC(2026, 9, 12, 0, 30) }
		});
		expect(h).toContain('role="note"');
		expect(text(h)).toBe(
			'Hay 4 personas en la lista de espera (1 con lugar guardado hasta las 21:30). Podés vender igual; si vendés ese lugar, esa persona puede quedarse sin entrada.'
		);
	});

	it('en la carga a mano habla de cargar; una sola persona, en singular', () => {
		const t = text(
			html({ summary: { waiting: 1, offered: 0, nextHoldUntil: null }, action: 'cargar' })
		);
		expect(t).toBe(
			'Hay 1 persona en la lista de espera. Podés cargar igual; si cargás ese lugar, esa persona puede quedarse sin entrada.'
		);
	});
});
