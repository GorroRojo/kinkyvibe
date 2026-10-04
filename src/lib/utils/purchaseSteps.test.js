import { describe, expect, it } from 'vitest';
import {
	PURCHASE_STEPS,
	STEP_BUYER,
	STEP_PAY,
	STEP_TICKETS,
	buyerStepErrors,
	cheapestAvailableType,
	errorsOutsideStep,
	firstStepWithErrors,
	furthestReachable,
	gorraAmountFor,
	payStepErrors,
	purchaseSummary,
	stepFromParams,
	stepHref,
	stepOfField,
	ticketsStepErrors
} from './purchaseSteps.js';
import { ORDER_MAX_MESSAGE, computePrice } from './tickets.js';

/**
 * `formatARS` separa "$" del número con un espacio duro: acá se compara con espacios comunes.
 * @template T
 * @param {T} value
 * @returns {T}
 */
const plain = (value) => JSON.parse(JSON.stringify(value).replaceAll('\u00a0', ' '));
/** @param {Parameters<typeof purchaseSummary>[0]} input */
const summary = (input) => plain(purchaseSummary(input));

const general = { name: 'General', available: 20, closed: false, gorra: null, tier: null };
const gorra = {
	name: 'A la gorra',
	available: 20,
	closed: false,
	gorra: { min: 1000, suggested: 5000 }
};
// Datos inventados.
const buyer = {
	name: 'Persona Prueba',
	pronouns: 'elle',
	email: 'prueba@example.com',
	dni: '12.345.678'
};

describe('pasos', () => {
	it('son tres: Entradas → Tus datos → Pagar', () => {
		expect(PURCHASE_STEPS.map((s) => s.label)).toEqual(['Entradas', 'Tus datos', 'Pagar']);
	});

	it('cada campo del formulario (y su error) está en un paso', () => {
		for (const f of ['type', 'tier', 'option', 'amount', 'quantity', 'code']) {
			expect(stepOfField(f)).toBe(STEP_TICKETS);
		}
		for (const f of ['name', 'pronouns', 'email', 'dni', 'holder_name_2', 'campo_7', 'campo_7_1']) {
			expect(stepOfField(f)).toBe(STEP_BUYER);
		}
		for (const f of ['method', 'accept', 'otra-cosa']) expect(stepOfField(f)).toBe(STEP_PAY);
	});

	it('el primer paso con errores (los mensajes vacíos no cuentan)', () => {
		expect(firstStepWithErrors(null)).toBe(null);
		expect(firstStepWithErrors({})).toBe(null);
		expect(firstStepWithErrors({ accept: 'x', dni: 'y' })).toBe(STEP_BUYER);
		expect(firstStepWithErrors({ accept: 'x', type: 'El precio cambió' })).toBe(STEP_TICKETS);
		expect(firstStepWithErrors({ type: '', method: 'x' })).toBe(STEP_PAY);
	});

	it('reemplazar los errores de un paso deja los de los otros', () => {
		expect(errorsOutsideStep({ dni: 'a', code: 'b', accept: 'c' }, STEP_BUYER)).toEqual({
			code: 'b',
			accept: 'c'
		});
	});

	it('hasta dónde se puede ir: el primer paso anterior con errores', () => {
		expect(furthestReachable([{}, {}, {}], 2)).toBe(2);
		expect(furthestReachable([{}, { dni: 'x' }, {}], 2)).toBe(1);
		expect(furthestReachable([{ type: 'x' }, { dni: 'x' }], 2)).toBe(0);
		// Los errores del paso de destino no frenan llegar a él.
		expect(furthestReachable([{}, { dni: 'x' }], 1)).toBe(1);
		expect(furthestReachable([], 0)).toBe(0);
	});
});

describe('paso «Entradas»', () => {
	it('sin tipo elegido, o agotado o cerrado, no se avanza', () => {
		const base = { count: 1, maxQuantity: 10, amount: '' };
		expect(ticketsStepErrors({ ...base, type: undefined })).toEqual({
			type: 'Elegí un tipo de entrada.'
		});
		expect(ticketsStepErrors({ ...base, type: { ...general, available: 0 } }).type).toBeTruthy();
		expect(ticketsStepErrors({ ...base, type: { ...general, closed: true } }).type).toBeTruthy();
		expect(ticketsStepErrors({ ...base, type: general })).toEqual({});
	});

	it('cantidad entre 1 y el máximo', () => {
		const base = { type: general, maxQuantity: 3, amount: '' };
		expect(ticketsStepErrors({ ...base, count: 3 })).toEqual({});
		expect(ticketsStepErrors({ ...base, count: 4 }).quantity).toBe(
			'Elegí cuántas entradas querés.'
		);
		expect(ticketsStepErrors({ ...base, count: 0 }).quantity).toBeTruthy();
	});

	it('a la gorra: vacío es el sugerido; menos que el mínimo o de más, no', () => {
		expect(gorraAmountFor(null, '500', 1)).toEqual({ value: null, tooHigh: false });
		expect(gorraAmountFor(gorra.gorra, '', 1)).toEqual({ value: 5000, tooHigh: false });
		expect(gorraAmountFor(gorra.gorra, '7.000', 2)).toEqual({ value: 7000, tooHigh: false });
		expect(gorraAmountFor(gorra.gorra, '500', 1)).toEqual({ value: null, tooHigh: false });
		expect(gorraAmountFor(gorra.gorra, '1000000000', 1)).toEqual({ value: null, tooHigh: true });
		const base = { type: gorra, count: 1, maxQuantity: 10 };
		expect(ticketsStepErrors({ ...base, amount: '' })).toEqual({});
		expect(plain(ticketsStepErrors({ ...base, amount: '500' }).amount)).toBe(
			'Escribí un monto en pesos (sin centavos), desde $ 1.000.'
		);
		expect(plain(ticketsStepErrors({ ...base, amount: 'mucho' }).amount)).toMatch(
			/desde \$ 1\.000/
		);
		expect(ticketsStepErrors({ ...base, amount: '1000000000' }).amount).toBe(ORDER_MAX_MESSAGE);
	});
});

describe('paso «Tus datos»', () => {
	const base = { count: 1, fields: [], typeId: 'general', answers: {} };

	it('con los datos completos se avanza (la entrada 1 toma los de quien compra)', () => {
		expect(buyerStepErrors({ ...base, buyer, holders: [{ name: '', pronouns: '' }] })).toEqual({});
	});

	it('mismos mensajes que el servidor, con la clave del campo', () => {
		const errors = buyerStepErrors({
			...base,
			count: 2,
			buyer: { name: 'Persona Uno', pronouns: '', email: 'no-es-un-mail', dni: '12.345' },
			holders: [
				{ name: '', pronouns: '' },
				{ name: 'Persona Dos', pronouns: '' }
			]
		});
		expect(errors).toEqual({
			pronouns: 'Poné tus pronombres.',
			email: 'Revisá el email: ahí te mandamos las entradas.',
			dni: 'Revisá el DNI: tiene que tener entre 7 y 9 números.',
			holder_pronouns_0: 'Poné los pronombres de esta persona.',
			holder_pronouns_1: 'Poné los pronombres de esta persona.'
		});
	});

	it('solo cuenta las entradas que se compran', () => {
		const holders = [
			{ name: '', pronouns: '' },
			{ name: '', pronouns: '' }
		];
		expect(buyerStepErrors({ ...base, buyer, holders, count: 1 })).toEqual({});
		expect(Object.keys(buyerStepErrors({ ...base, buyer, holders, count: 2 }))).toEqual([
			'holder_name_1',
			'holder_pronouns_1'
		]);
	});

	it('preguntas de inscripción: solo las del tipo elegido, y por entrada las de cada entrada', () => {
		/** @type {import('./signupFields.js').SignupField[]} */
		const fields = [
			{ id: 1, label: '¿Algo que debamos saber?', kind: 'text', required: true, options: [] },
			{
				id: 2,
				label: 'Talle de remera',
				kind: 'choice',
				required: true,
				options: ['S', 'M'],
				perTicket: true
			},
			{
				id: 3,
				label: 'Solo VIP',
				kind: 'checkbox',
				required: true,
				options: [],
				ticketTypes: ['vip']
			}
		];
		const holders = [
			{ name: '', pronouns: '' },
			{ name: 'Persona Dos', pronouns: 'ella' }
		];
		const input = { ...base, buyer, holders, count: 2, fields };
		expect(buyerStepErrors({ ...input, answers: {} })).toEqual({
			campo_1: 'Completá esta respuesta.',
			campo_2_0: 'Elegí una opción.',
			campo_2_1: 'Elegí una opción.'
		});
		expect(
			buyerStepErrors({
				...input,
				answers: { campo_1: 'Nada', campo_2_0: 'S', campo_2_1: 'M' }
			})
		).toEqual({});
		expect(
			buyerStepErrors({
				...input,
				typeId: 'vip',
				answers: { campo_1: 'Nada', campo_2_0: 'S', campo_2_1: 'M' }
			})
		).toEqual({ campo_3: 'Marcá esta casilla para seguir.' });
	});
});

describe('paso «Pagar»', () => {
	const methods = ['mercadopago', 'transferencia'];

	it('pide aceptar las condiciones', () => {
		expect(payStepErrors({ method: 'mercadopago', methods, free: false, accept: true })).toEqual(
			{}
		);
		expect(payStepErrors({ method: 'mercadopago', methods, free: false, accept: false })).toEqual({
			accept: 'Tenés que confirmar que tenés 18 años o más y aceptar las condiciones.'
		});
	});

	it('el medio de pago, solo si hay que elegir y no es sin cargo', () => {
		expect(payStepErrors({ method: '', methods, free: false, accept: true })).toEqual({
			method: 'Elegí un medio de pago.'
		});
		expect(payStepErrors({ method: '', methods, free: true, accept: true })).toEqual({});
		expect(
			payStepErrors({ method: '', methods: ['mercadopago'], free: false, accept: true })
		).toEqual({});
	});
});

describe('resumen de la compra', () => {
	const base = {
		gorra: false,
		showOption: true,
		discountCode: null,
		free: false,
		feeBasisPoints: 200,
		methods: ['mercadopago', 'transferencia']
	};

	it('sin tipo elegido: total $ 0 y nada más', () => {
		const prices = computePrice({ price: 0, quantity: 0 });
		const s = summary({ ...base, type: undefined, count: 1, prices });
		expect(s).toMatchObject({ item: null, countText: '', option: null, lines: [], total: '$ 0' });
		expect(s.surchargePlaceholder).toBe(null);
	});

	it('con fondo, código y recargo: las líneas salen de computePrice', () => {
		const discount = { kind: /** @type {const} */ ('percent'), value: 20 };
		const prices = computePrice({
			price: 10000,
			fondo: 2000,
			quantity: 2,
			discount,
			method: 'mercadopago',
			feeBasisPoints: 200
		});
		const s = summary({
			...base,
			type: { name: 'Fiesta', tier: { name: 'Preventa 1' } },
			count: 2,
			prices,
			discountCode: 'E2E20'
		});
		expect(s.item).toEqual({ name: 'Fiesta', tier: 'Preventa 1' });
		expect(s.countText).toBe('2 entradas');
		expect(s.option).toBe('Con el descuento del fondo');
		expect(s.lines).toEqual([
			{ id: 'entradas', label: 'Entradas (2 × $ 8.000)', amount: '$ 16.000' },
			{ id: 'fondo', label: '💜 Ya descontado: el Fondo Kinky Vibe cubre $ 4.000', note: true },
			{
				id: 'codigo',
				label: 'Código E2E20',
				amount: `−$ ${prices.discount.toLocaleString('es-AR')}`
			},
			{
				id: 'recargo',
				label: 'Recargo Mercado Pago',
				amount: `+$ ${prices.surcharge.toLocaleString('es-AR')}`
			}
		]);
		expect(s.total).toBe(`$ ${prices.total.toLocaleString('es-AR')}`);
		expect(s.surchargePlaceholder).toBe(null);
	});

	it('con transferencia reserva el lugar del recargo (sin cambiar el total)', () => {
		const prices = computePrice({
			price: 10000,
			fondo: 2000,
			quantity: 1,
			method: 'transferencia',
			feeBasisPoints: 200
		});
		const s = summary({ ...base, type: general, count: 1, prices });
		expect(s.lines.map((l) => l.id)).toEqual(['entradas', 'fondo']);
		expect(s.total).toBe('$ 8.000');
		// El mismo recargo que se sumaría con Mercado Pago.
		const mp = computePrice({
			price: 10000,
			fondo: 2000,
			quantity: 1,
			method: 'mercadopago',
			feeBasisPoints: 200
		});
		expect(s.surchargePlaceholder).toBe(`+$ ${mp.surcharge}`);
	});

	it('aporte al fondo, a la gorra y sin fondo', () => {
		const solidaria = computePrice({ price: 10000, fondo: 2000, option: 'solidaria', quantity: 2 });
		const s = summary({ ...base, type: general, count: 2, prices: solidaria });
		expect(s.option).toBe('Entrada solidaria (+10 %)');
		expect(s.lines[1]).toEqual({
			id: 'aporte',
			label: '💜 Incluye $ 2.000 de aporte al Fondo Kinky Vibe',
			note: true
		});

		const g = computePrice({ price: 7000, option: 'gorra', quantity: 2 });
		const sg = summary({ ...base, gorra: true, type: gorra, count: 2, prices: g });
		expect(sg.option).toBe(null);
		expect(sg.lines[0].label).toBe('Entradas (2 × $ 7.000) a la gorra');

		const list = computePrice({ price: 6000, option: 'completo', quantity: 1 });
		const sl = summary({
			...base,
			showOption: false,
			type: general,
			count: 1,
			prices: list
		});
		expect(sl.option).toBe(null);
		expect(JSON.stringify(sl)).not.toContain('Fondo');
		expect(sl.countText).toBe('1 entrada');
	});

	it('sin cargo: no reserva el lugar del recargo', () => {
		const prices = computePrice({ price: 0, option: 'gorra', quantity: 1, method: 'mercadopago' });
		const s = summary({ ...base, gorra: true, free: true, type: gorra, count: 1, prices });
		expect(s.surchargePlaceholder).toBe(null);
		expect(s.total).toBe('$ 0');
	});
});

describe('cada paso con su dirección (?paso=)', () => {
	it('lee el paso de la dirección (1, 2, 3); cualquier otra cosa es ninguno', () => {
		const p = (/** @type {string} */ q) => stepFromParams(new URLSearchParams(q));
		expect(p('')).toBe(null);
		expect(p('paso=1')).toBe(STEP_TICKETS);
		expect(p('paso=2')).toBe(STEP_BUYER);
		expect(p('paso=3')).toBe(STEP_PAY);
		for (const q of ['paso=0', 'paso=4', 'paso=2a', 'paso=-1', 'paso=', 'paso=10']) {
			expect(p(q)).toBe(null);
		}
	});

	it('arma la dirección de cada paso sin tocar lo demás; el primero, sin ?paso', () => {
		const url = new URL('http://localhost/calendario/x/entradas?utm=a&paso=3#entradas');
		expect(stepHref(url, STEP_TICKETS)).toBe('/calendario/x/entradas?utm=a#entradas');
		expect(stepHref(url, STEP_BUYER)).toBe('/calendario/x/entradas?utm=a&paso=2#entradas');
		expect(stepHref(new URL('http://localhost/e/entradas'), STEP_PAY)).toBe('/e/entradas?paso=3');
	});
});

describe('cheapestAvailableType: el tipo que arranca elegido', () => {
	/** @param {{ id: string } & Record<string, any>} t */
	const type = (t) => ({ price: 0, fondo: 0, available: 10, closed: false, gorra: null, ...t });

	it('el más barato de los que se pueden comprar (precio menos el fondo), como el «desde»', () => {
		expect(
			cheapestAvailableType([
				type({ id: 'general', price: 15000, fondo: 3000 }),
				type({ id: 'anticipada', price: 12000 }),
				type({ id: 'solidaria', price: 14000, fondo: 4000 })
			])
		).toBe('solidaria');
	});

	it('saltea los agotados y cerrados; con empate, el primero; a la gorra, el sugerido', () => {
		expect(
			cheapestAvailableType([
				type({ id: 'agotada', price: 1000, available: 0 }),
				type({ id: 'cerrada', price: 1000, closed: true }),
				type({ id: 'primera', price: 5000 }),
				type({ id: 'segunda', price: 5000 }),
				type({ id: 'gorra', gorra: { suggested: 6000 } })
			])
		).toBe('primera');
		expect(cheapestAvailableType([type({ id: 'agotada', available: 0 })])).toBe('');
	});
});
