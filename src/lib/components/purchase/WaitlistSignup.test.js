/**
 * «Anotate en la lista de espera» (render del servidor): por evento, solo el mail; por tipo, el
 * tipo agotado; el resultado de `?/waitlist`. Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import WaitlistSignup from './WaitlistSignup.svelte';

/** @param {Record<string, unknown>} props */
const html = (props) => render(WaitlistSignup, { props }).body;

describe('WaitlistSignup', () => {
	it('por evento: el mail (con el de la cuenta puesto) y manda a ?/waitlist', () => {
		const h = html({ waitlist: { scope: 'event', types: [], email: 'persona@example.com' } });
		expect(h).toMatch(/<form[^>]*action="\?\/waitlist"/);
		expect(h).toMatch(/<input[^>]*type="email"[^>]*value="persona@example.com"/);
		expect(h).not.toContain('<select');
	});

	it('por tipo: elige entre los tipos agotados', () => {
		const h = html({
			waitlist: {
				scope: 'type',
				types: [
					{ id: 'general', name: 'General' },
					{ id: 'vip', name: 'VIP' }
				],
				email: ''
			}
		});
		expect(h).toMatch(/<select[^>]*name="tipo"/);
		expect(h).toContain('<option value="vip"');
	});

	it('el resultado: mail para confirmar, ya en la fila, o el error con el formulario', () => {
		expect(html({ waitlist: null, result: { ok: true, status: 'pending' } })).toContain(
			'Te mandamos un mail para confirmar'
		);
		expect(html({ waitlist: null, result: { ok: true, status: 'waiting' } })).toContain(
			'ya estás en la lista de espera'
		);
		const h = html({
			waitlist: { scope: 'event', types: [], email: '' },
			result: { error: 'Revisá el mail: no parece una dirección válida.', email: 'x' }
		});
		expect(h).toContain('role="alert"');
		expect(h).toMatch(/<input[^>]*value="x"/);
	});
});
