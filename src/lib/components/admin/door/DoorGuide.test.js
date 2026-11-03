/**
 * La guía «Cómo hacer la puerta» del modo puerta: las partes que tiene que cubrir (escanear,
 * buscar, vender, sin conexión, problemas) y la de vender solo si el evento vende en la puerta.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import DoorGuide from './DoorGuide.svelte';

/** @param {Record<string, unknown>} props */
const html = (props) => render(DoorGuide, { props: /** @type {any} */ (props) }).body;

describe('DoorGuide', () => {
	it('cubre escanear, buscar, sin conexión y qué hacer con un problema', () => {
		const out = html({ canSell: true });
		for (const heading of [
			'Antes de abrir',
			'Escanear',
			'Escribir código y buscar',
			'Vender en la puerta',
			'Sin conexión',
			'Si hay un problema'
		]) {
			expect(out).toContain(`>${heading}</h3>`);
		}
		// Los estados del resultado, con los mismos nombres que DoorResult.
		for (const state of ['Adelante', 'Ya ingresó', 'Anulada', 'De otro evento', 'QR inválido']) {
			expect(out).toContain(state);
		}
		expect(out).toContain('Sincronizar');
		expect(out).toContain('persona de cuidado');
	});

	it('sin venta en la puerta no habla de vender', () => {
		const out = html({ canSell: false });
		expect(out).not.toContain('Vender en la puerta');
		expect(out).not.toContain('y vender');
		expect(out).toContain('Sin conexión');
	});

	it('usa voseo, no tú ni usted', () => {
		const out = html({ canSell: true });
		expect(out).not.toMatch(/\b(tú|usted|puedes|tienes)\b/i);
	});
});
