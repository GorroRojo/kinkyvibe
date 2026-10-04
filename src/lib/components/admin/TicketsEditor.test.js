/**
 * «Entradas» del editor de eventos: si «Transferencia» está tildada y no hay datos para transferir
 * (Ajustes → Cobros vacío y sin TICKETS_TRANSFER_INFO), avisa que por ahora no se ofrece, con link
 * a Ajustes → Cobros. El componente solo recibe sí/no (`transferReady`), nunca los datos.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import TicketsEditor from './TicketsEditor.svelte';
import { readTicketsForm } from '$lib/utils/ticketsEditor.js';

const WARNING =
	'Activaste transferencia pero faltan los datos en <a href="/admin/ajustes/cobros" target="_blank" rel="noopener">Ajustes → Cobros</a>: por ahora no se ofrece.';

/** @param {string[]} methods @param {boolean | null} [transferReady] */
const html = (methods, transferReady) =>
	render(TicketsEditor, {
		props: {
			state: readTicketsForm({
				tickets: [{ id: 'general', name: 'General', price: 10000 }],
				payment_methods: methods
			}),
			...(transferReady === undefined ? {} : { transferReady })
		}
	}).body;

describe('TicketsEditor: transferencia sin datos para transferir', () => {
	it('tildada y sin datos: avisa, con link a Ajustes → Cobros', () => {
		const body = html(['mercadopago', 'transferencia'], false);
		expect(body).toContain(WARNING);
		expect(body).toContain('id="ev-transfer-missing"');
		expect(body).toContain('role="status"');
	});

	it('con datos, sin saber (null) o sin transferencia tildada: no avisa', () => {
		expect(html(['mercadopago', 'transferencia'], true)).not.toContain('faltan los datos');
		expect(html(['mercadopago', 'transferencia'])).not.toContain('faltan los datos');
		expect(html(['mercadopago', 'transferencia'], null)).not.toContain('faltan los datos');
		expect(html(['mercadopago'], false)).not.toContain('faltan los datos');
		// Con datos sigue la ayuda de siempre.
		expect(html(['transferencia'], true)).toContain('se configuran en');
	});
});
