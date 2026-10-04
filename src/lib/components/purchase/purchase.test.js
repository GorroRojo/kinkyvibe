/**
 * Compra en tres pasos, renderizada en el servidor (lo que ve quien entra, antes del
 * JavaScript): indicador de pasos, resumen y qué paso se muestra.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import TicketPurchase from '../TicketPurchase.svelte';
import StepIndicator from './StepIndicator.svelte';
import PurchaseSummary from './PurchaseSummary.svelte';
import { PURCHASE_STEPS } from '$lib/utils/purchaseSteps.js';
import { stripHtmlComments } from '$lib/utils/htmlStrip.js';

/** @type {import('$lib/server/tickets/checkout.js').TicketsView} */
const tickets = {
	open: true,
	reason: null,
	opensAt: null,
	closesAt: null,
	maxQuantity: 20,
	mock: true,
	methods: ['mercadopago', 'transferencia'],
	transferHoldHours: 48,
	feeBasisPoints: 200,
	contactEmail: 'contacto@example.com',
	online: false,
	fondoEnabled: true,
	fondoPercent: 20,
	door: null,
	types: [
		{
			id: 'general',
			name: 'General',
			price: 10000,
			fondo: 2000,
			available: 20,
			left: null,
			gorra: null,
			closesAt: null,
			closed: false
		}
	]
};

/** Los `<section class="purchase-step">` en orden, con si están ocultos. */
const steps = (/** @type {string} */ body) =>
	[...body.matchAll(/<section class="purchase-step[^"]*"[^>]*>/g)].map((m) => ({
		id: m[0].match(/id="([^"]+)"/)?.[1],
		hidden: /\shidden(=|\s|>)/.test(m[0])
	}));

describe('StepIndicator', () => {
	it('marca el paso actual con aria-current="step" y deja volver a los anteriores', () => {
		const { body } = render(StepIndicator, {
			props: { steps: PURCHASE_STEPS, current: 1, reachable: 1 }
		});
		expect(body).toContain('aria-label="Pasos de la compra"');
		expect(body.match(/aria-current="step"/g)).toHaveLength(1);
		const current = body.slice(body.indexOf('aria-current="step"'));
		expect(current.slice(0, current.indexOf('</li>'))).toContain('Tus datos');
		// «Entradas» (hecho) es un botón; «Pagar» (todavía no) no.
		expect(body.match(/<button/g)).toHaveLength(1);
		expect(body).toContain('(listo)');
	});
});

describe('PurchaseSummary', () => {
	it('muestra el total una sola vez y el detalle de la compra', () => {
		const { body } = render(PurchaseSummary, {
			props: {
				summary: {
					item: { name: 'General', tier: 'Preventa 1' },
					countText: '2 entradas',
					option: 'Con el descuento del fondo',
					lines: [{ id: 'entradas', label: 'Entradas (2 × $ 8.000)', amount: '$ 16.000' }],
					surchargePlaceholder: '+$ 320',
					total: '$ 16.000'
				},
				closesText: 'La venta cierra el sábado 10/10 a las 20:00.'
			}
		});
		expect(body.match(/Total:/g)).toHaveLength(1);
		expect(body).toContain('Preventa 1');
		expect(body).toContain('Entradas (2 × $ 8.000)');
		expect(body).toContain('aria-expanded="false"');
		expect(body).toContain('La venta cierra el sábado');
		// El recargo "de muestra" no es texto de la página (va en ::before).
		expect(body).not.toContain('>Recargo Mercado Pago<');
	});
});

describe('TicketPurchase', () => {
	it('arranca en «Entradas», con los otros pasos ocultos pero en el formulario', () => {
		const { body, head } = render(TicketPurchase, { props: { tickets } });
		expect(steps(body)).toEqual([
			{ id: 'paso-entradas', hidden: false },
			{ id: 'paso-datos', hidden: true },
			{ id: 'paso-pagar', hidden: true }
		]);
		// Todo lo que se manda sigue en el mismo formulario.
		for (const name of ['type', 'quantity', 'code', 'name', 'dni', 'holder_name_0', 'accept']) {
			expect(body).toContain(`name="${name}"`);
		}
		expect(body.match(/<form/g)).toHaveLength(1);
		expect(body).toContain('Paso 1 de 3');
		expect(body).toContain('Tu compra');
		expect(body.match(/Total:/g)).toHaveLength(1);
		// Sin JavaScript se ven los tres pasos juntos.
		expect(head).toContain('<noscript>');
	});

	it('si el servidor devolvió errores, abre el primer paso que los tiene', () => {
		const { body } = render(TicketPurchase, {
			props: {
				tickets,
				result: {
					error: 'Revisá los datos marcados.',
					errors: { dni: 'Revisá el DNI: tiene que tener entre 7 y 9 números.', accept: 'x' },
					values: { type: 'general', quantity: '1', name: 'Persona Prueba', dni: '12' }
				}
			}
		});
		expect(steps(body).map((s) => s.hidden)).toEqual([true, false, true]);
		expect(body).toContain('Revisá los datos marcados.');
		expect(body).toContain('Revisá el DNI');
	});

	it('venta cerrada: sin formulario ni pasos', () => {
		const { body } = render(TicketPurchase, {
			props: { tickets: { ...tickets, open: false, reason: 'soldout' } }
		});
		expect(body).toMatch(/<p class="closed[^"]*"[^>]*>Agotadas\.<\/p>/);
		expect(body).not.toContain('<form');
		expect(body).not.toContain('Pasos de la compra');
	});
});

describe('TicketPurchase con cuenta (datos guardados)', () => {
	// Datos inventados.
	const account = {
		name: 'Persona Prueba',
		pronouns: 'elle',
		email: 'cuenta@example.com',
		dni: '30111222',
		remember: true,
		rememberDni: false
	};
	/** El `<input>` con este `name`. */
	const input = (/** @type {string} */ body, /** @type {string} */ name) =>
		body.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? '';

	it('sin cuenta: ni datos completados ni casillas, como siempre', () => {
		const { body } = render(TicketPurchase, { props: { tickets } });
		expect(body).not.toContain('Guardar mis datos para la próxima');
		expect(body).not.toContain('Recordar mi DNI');
		expect(input(body, 'datos_cuenta')).toBe('');
		expect(input(body, 'name')).not.toContain('value="Persona');
	});

	it('con cuenta: nombre, pronombres, mail y DNI completados; las casillas como arrancan', () => {
		const { body } = render(TicketPurchase, { props: { tickets, account } });
		expect(input(body, 'name')).toContain('value="Persona Prueba"');
		expect(input(body, 'pronouns')).toContain('value="elle"');
		expect(input(body, 'email')).toContain('value="cuenta@example.com"');
		expect(input(body, 'dni')).toContain('value="30111222"');
		expect(input(body, 'datos_cuenta')).toContain('value="1"');
		expect(input(body, 'guardar_datos')).toMatch(/\schecked/);
		expect(input(body, 'recordar_dni')).not.toMatch(/\schecked/);
		// La entrada 1 copia a quien compra.
		expect(input(body, 'holder_name_0')).toContain('value="Persona Prueba"');
	});

	it('si el servidor devolvió el formulario, mandan sus valores y casillas', () => {
		const result = {
			error: 'Revisá los datos marcados.',
			errors: { dni: 'Revisá el DNI: tiene que tener entre 7 y 9 números.' },
			values: {
				name: 'Otro Nombre',
				pronouns: 'ella',
				email: 'otra@example.com',
				dni: '12',
				accountForm: true,
				remember: false,
				rememberDni: true
			}
		};
		const { body } = render(TicketPurchase, { props: { tickets, account, result } });
		expect(input(body, 'name')).toContain('value="Otro Nombre"');
		expect(input(body, 'dni')).toContain('value="12"');
		expect(input(body, 'guardar_datos')).not.toMatch(/\schecked/);
		expect(input(body, 'recordar_dni')).toMatch(/\schecked/);
	});
});

describe('TicketsStep', () => {
	it('un tipo sin lugar dice «Agotadas» (aunque sea un solo tipo), nunca «Agotada»', async () => {
		const { default: TicketsStep } = await import('./TicketsStep.svelte');
		const soldOut = { ...tickets, types: [{ ...tickets.types[0], available: 0, left: 0 }] };
		const { body } = render(TicketsStep, { props: { tickets: soldOut } });
		// Sin los comentarios que deja Svelte al renderizar.
		const html = stripHtmlComments(body);
		expect(html).toMatch(/<small class="type-left[^"]*">\s*Agotadas\s*<\/small>/);
		expect(body).not.toMatch(/Agotada(?!s)/);
	});
});
