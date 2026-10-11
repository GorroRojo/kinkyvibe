/**
 * «Entradas» del editor de eventos: si «Transferencia» está tildada y no hay datos para transferir
 * (Ajustes → Cobros vacío y sin TICKETS_TRANSFER_INFO), avisa que por ahora no se ofrece, con link
 * a Ajustes → Cobros. El componente solo recibe sí/no (`transferReady`), nunca los datos.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import TicketsEditor from './TicketsEditor.svelte';
import { readTicketsForm } from '$lib/utils/ticketsEditor.js';
import { noticeBefore } from '$lib/testing/html.js';

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

describe('TicketsEditor: cuándo se muestran los errores', () => {
	/** @param {Record<string, unknown>} props */
	const body = (props) =>
		render(TicketsEditor, {
			props: {
				state: readTicketsForm({ tickets: [{ id: 'general', name: 'General', price: 10000 }] }),
				errors: ['General: falta el precio.'],
				...props
			}
		}).body;

	it('recién prendida la venta (sin salir de ningún campo): todavía no', () => {
		expect(body({})).not.toContain('falta el precio');
	});
	it('después de salir de un campo o al guardar: sí', () => {
		expect(body({ touched: true })).toContain('falta el precio');
		expect(body({ showErrors: true })).toContain('id="ev-tickets-errors"');
	});
});

describe('TicketsEditor: modalidad automática con la regla de la página', () => {
	/** @param {Record<string, unknown>} props @param {string} [modalidad] */
	const body = (props, modalidad) =>
		render(TicketsEditor, {
			props: {
				state: readTicketsForm({
					tickets: [{ id: 'general', name: 'General', price: 10000 }],
					...(modalidad ? { modalidad } : {})
				}),
				...props
			}
		}).body;

	it('el «Dónde» y la etiqueta Online deciden; un lugar elegido, presencial', () => {
		expect(body({ tags: ['Online'] })).toContain('Automática: online');
		expect(body({ tags: ['Online'], locationName: 'Galpón Inventado' })).toContain(
			'Automática: presencial'
		);
		expect(body({ location: 'Zoom' })).toContain('Automática: online');
		expect(body({ tags: ['Online'], hasVenue: true })).toContain('Automática: presencial');
	});

	it('modalidad online con un lugar elegido: avisa que es presencial', () => {
		const withVenue = body({ hasVenue: true }, 'online');
		expect(withVenue).toContain('id="ev-modalidad-venue"');
		// el aviso amarillo compartido, en línea dentro del label (sin «⚠️» en el texto)
		const text = 'Tiene un lugar elegido, así que es presencial';
		expect(withVenue).toContain(text);
		const tag = noticeBefore(withVenue, text);
		expect(tag.startsWith('<span ')).toBe(true);
		expect(tag).toContain('class="kv-notice warn');
		expect(tag).toContain(' inline');
		expect(withVenue).not.toContain('⚠️');
		expect(body({}, 'online')).not.toContain('id="ev-modalidad-venue"');
	});
});
