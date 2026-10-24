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
import { stripHtmlComments, stripHtmlTags } from '$lib/utils/htmlStrip.js';
import { textOf } from '$lib/testing/html.js';
import { expiryMoment } from '$lib/utils/expiry.js';
import { ticketsAfterBuy, withFondoPercent } from '$lib/utils/tickets.js';

/** @type {import('$lib/server/tickets/checkout.js').TicketsView} */
const tickets = {
	open: true,
	reason: null,
	opensAt: null,
	closesAt: null,
	maxQuantity: 20,
	mock: true,
	methods: ['mercadopago', 'transferencia'],
	transferUntil: Date.parse('2026-10-14T20:00-03:00'),
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

describe('PurchaseSummary en el celu: una línea y el recargo siempre a la vista', () => {
	const base = {
		item: { name: 'General', tier: null },
		countText: '1 entrada',
		option: null,
		surchargePlaceholder: null,
		total: '$ 15.300'
	};

	it('la barra dice cuántas entradas y el total en una línea, y despliega el detalle', () => {
		const { body } = render(PurchaseSummary, {
			props: {
				summary: {
					...base,
					lines: [{ id: 'entradas', label: 'Entradas (1 × $ 15.000)', amount: '$ 15.000' }]
				}
			}
		});
		const bar = body.match(/<button[^>]*class="bar[^"]*"[\s\S]*?<\/button>/)?.[0] ?? '';
		expect(bar).toContain('aria-expanded="false"');
		expect(bar).toContain('aria-controls="resumen-detalle"');
		expect(stripHtmlTags(bar).replace(/\s+/g, ' ')).toContain('1 entrada · $ 15.300');
	});

	it('con recargo de Mercado Pago, la línea va afuera del detalle plegado', () => {
		const { body } = render(PurchaseSummary, {
			props: {
				summary: {
					...base,
					lines: [
						{ id: 'entradas', label: 'Entradas (1 × $ 15.000)', amount: '$ 15.000' },
						{ id: 'recargo', label: 'Recargo Mercado Pago', amount: '+$ 300' }
					]
				}
			}
		});
		const fee = body.indexOf('class="fee');
		expect(fee).toBeGreaterThan(0);
		expect(fee).toBeLessThan(body.indexOf('id="resumen-detalle"'));
		expect(body.slice(fee, body.indexOf('</p>', fee))).toContain('+$ 300');
	});

	it('con transferencia elegida, la línea guarda su lugar (invisible) para que nada salte', () => {
		const { body } = render(PurchaseSummary, {
			props: { summary: { ...base, lines: [], surchargePlaceholder: '+$ 300' } }
		});
		expect(body).toMatch(/<p class="fee placeholder[^"]*" aria-hidden="true">/);
		expect(body).not.toContain('>Incluye el recargo');
	});

	it('sin recargo (transferencia, gratis), no hay línea', () => {
		const { body } = render(PurchaseSummary, {
			props: { summary: { ...base, lines: [] } }
		});
		expect(body).not.toContain('class="fee');
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

	it('arranca elegida la entrada más barata de las que se pueden comprar', () => {
		const types = [
			{ ...tickets.types[0], id: 'general', name: 'General', price: 15000, fondo: 0 },
			{ ...tickets.types[0], id: 'anticipada', name: 'Anticipada', price: 12000, fondo: 0 },
			{ ...tickets.types[0], id: 'agotada', name: 'Agotada', price: 9000, fondo: 0, available: 0 }
		];
		const { body } = render(TicketPurchase, { props: { tickets: { ...tickets, types } } });
		const checked = [...body.matchAll(/<input[^>]*name="type"[^>]*>/g)]
			.map((m) => m[0])
			.filter((i) => /\schecked(=|\s|>|\/)/.test(i));
		expect(checked).toHaveLength(1);
		expect(checked[0]).toContain('value="anticipada"');
	});

	it('manda el porcentaje del Fondo que se ve solo con el descuento del fondo elegido', () => {
		const hidden = (/** @type {string} */ body) =>
			body.match(/<input[^>]*name="fondo_percent"[^>]*>/)?.[0] ?? null;
		// Por defecto, con el descuento del fondo (el servidor avisa si cambió antes de cobrar).
		expect(hidden(render(TicketPurchase, { props: { tickets } }).body)).toContain('value="20"');
		// Con el porcentaje que contestó el servidor (withFondoPercent), el nuevo y sus precios.
		const updated = render(TicketPurchase, {
			props: { tickets: withFondoPercent(tickets, 10) }
		}).body;
		expect(hidden(updated)).toContain('value="10"');
		expect(textOf(updated)).toMatch(/el fondo cubre \$\s1\.000 de cada entrada/);
		// Precio completo o solidaria: el Fondo no cambia lo que se cobra, no se manda.
		const full = render(TicketPurchase, {
			props: {
				tickets,
				result: { error: null, errors: {}, values: { type: 'general', option: 'completo' } }
			}
		}).body;
		expect(hidden(full)).toBeNull();
		// Sin Fondo (evento que no es de KinkyVibe), tampoco.
		const noFondo = { ...tickets, fondoEnabled: false, fondoPercent: null };
		const types = [{ ...tickets.types[0], fondo: 0 }];
		expect(
			hidden(render(TicketPurchase, { props: { tickets: { ...noFondo, types } } }).body)
		).toBeNull();
	});

	it('después de «El precio cambió», muestra y manda el tramo que contestó el servidor', () => {
		const hidden = (/** @type {string} */ body) =>
			body.match(/<input[^>]*name="tier"[^>]*>/)?.[0] ?? null;
		const withTiers = {
			...tickets,
			types: [
				{
					...tickets.types[0],
					price: 8000,
					fondo: 1600,
					tier: { id: 'p1', name: 'Preventa 1', until: null }
				}
			]
		};
		expect(hidden(render(TicketPurchase, { props: { tickets: withTiers } }).body)).toContain(
			'value="p1"'
		);
		// Lo que contesta `?/buy` con el 409 (SvelteKit no vuelve a cargar la página).
		const buy = {
			error: 'El precio cambió',
			errors: { type: 'El precio cambió' },
			values: { type: 'general', tier: 'p1', quantity: '1' },
			tier: { type: 'general', id: 'p2', name: 'Preventa 2', until: null, price: 9000, fondo: 1800 }
		};
		const after = render(TicketPurchase, {
			props: { tickets: ticketsAfterBuy(withTiers, buy), result: buy }
		}).body;
		expect(hidden(after)).toContain('value="p2"');
		expect(textOf(after)).toContain('Preventa 2');
		expect(textOf(after)).toMatch(/\$\s9\.000/);
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

describe('PayStep: la transferencia dice hasta cuándo se guarda el lugar (decisión 0031)', () => {
	it('con la fecha y la hora exactas, sin paso de confirmar', async () => {
		const { default: PayStep } = await import('./PayStep.svelte');
		const until = Date.now() + 3 * 24 * 3600_000;
		const { body } = render(PayStep, {
			props: { tickets: { ...tickets, transferUntil: until }, method: 'transferencia' }
		});
		const text = textOf(body).replace(/\s+/g, ' ');
		const when = expiryMoment(until, Date.now(), {
			timeZone: 'America/Argentina/Buenos_Aires',
			until: true
		});
		expect(text).toContain(
			`Sin recargo. Te guardamos el lugar ${when}, hora de Argentina y Uruguay. Transferí y mandanos el comprobante antes de esa hora; si no llega, la reserva se libera.`
		);
		expect(text).not.toMatch(/confirm(ando|á) la reserva/i);
		expect(text).not.toMatch(/\d+ horas/);
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
