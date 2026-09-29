import { describe, expect, it } from 'vitest';
import {
	MAX_TICKETS_PER_FORM,
	parseTicketConfig,
	salesState,
	validateBuyer,
	validateHolder,
	validatePurchase
} from './config.js';

const META = {
	title: 'Fiesta de prueba',
	start: '2026-10-17T21:00-03:00',
	status: 'abierto',
	tickets: [
		{ id: 'general', name: 'General', price: 8000, capacity: 40 },
		{ id: 'reducida', name: 'Reducida', price: 5000, capacity: 10 }
	]
};

describe('parseTicketConfig', () => {
	it('devuelve null si el evento no vende entradas', () => {
		expect(parseTicketConfig({ title: 'x' })).toBeNull();
		expect(parseTicketConfig(undefined)).toBeNull();
	});

	it('normaliza tipos y cierra al empezar el evento por defecto', () => {
		const c = /** @type {NonNullable<ReturnType<typeof parseTicketConfig>>} */ (
			parseTicketConfig(META)
		);
		expect(c.types).toEqual(META.tickets.map((t) => ({ ...t, fondo: 0 })));
		expect(c.closesAt).toBe(new Date('2026-10-17T21:00-03:00').getTime());
	});

	it('respeta tickets_close (string o Date de YAML)', () => {
		const s = parseTicketConfig({ ...META, tickets_close: '2026-10-16T18:00-03:00' });
		expect(s?.closesAt).toBe(Date.parse('2026-10-16T21:00Z'));
		const d = parseTicketConfig({ ...META, tickets_close: new Date('2026-10-16T21:00Z') });
		expect(d?.closesAt).toBe(Date.parse('2026-10-16T21:00Z'));
	});

	it.each([
		[[], /lista/],
		[[{ id: 'General', price: 1, capacity: 1 }], /Id de entrada/],
		[
			[
				{ id: 'a', price: 1, capacity: 1 },
				{ id: 'a', price: 1, capacity: 1 }
			],
			/repetido/
		],
		[[{ id: 'a', price: 0, capacity: 1 }], /Precio/],
		[[{ id: 'a', price: 10.5, capacity: 1 }], /Precio/],
		[[{ id: 'a', price: '8000', capacity: 'x' }], /Cupo/]
	])('rechaza configuraciones inválidas %#', (tickets, error) => {
		expect(() => parseTicketConfig({ ...META, tickets })).toThrow(error);
	});
});

describe('salesState', () => {
	const c = /** @type {NonNullable<ReturnType<typeof parseTicketConfig>>} */ (
		parseTicketConfig(META)
	);
	it('abierta antes del cierre, cerrada después', () => {
		expect(salesState(c, Date.parse('2026-10-01T00:00Z'))).toEqual({ open: true });
		expect(salesState(c, Date.parse('2026-10-18T00:00Z'))).toEqual({
			open: false,
			reason: 'closed'
		});
	});
	it('cancelado y agotadas cierran la venta', () => {
		expect(salesState({ ...c, status: 'cancelado' }, 0)).toMatchObject({ reason: 'cancelled' });
		expect(salesState({ ...c, status: 'agotadas' }, 0)).toMatchObject({ reason: 'soldout' });
	});
});

describe('payment_methods', () => {
	it('por defecto solo Mercado Pago', () => {
		expect(parseTicketConfig(META)?.paymentMethods).toEqual(['mercadopago']);
	});
	it('acepta la lista del frontmatter (sin repetidos, sin importar mayúsculas)', () => {
		const c = parseTicketConfig({
			...META,
			payment_methods: ['mercadopago', 'Transferencia', 'transferencia']
		});
		expect(c?.paymentMethods).toEqual(['mercadopago', 'transferencia']);
		expect(
			parseTicketConfig({ ...META, payment_methods: 'transferencia' })?.paymentMethods
		).toEqual(['transferencia']);
	});
	it('rechaza medios desconocidos o una lista vacía', () => {
		expect(() => parseTicketConfig({ ...META, payment_methods: ['efectivo'] })).toThrow(
			/Medio de pago/
		);
		expect(() => parseTicketConfig({ ...META, payment_methods: [] })).toThrow(/vacío/);
	});
});

describe('validateHolder / validateBuyer', () => {
	it.each([
		['12345678', '12345678'],
		['12.345.678', '12345678'],
		[' 1.234.567 ', '1234567'],
		['123456789', '123456789'],
		['12 345 678', '12345678']
	])('DNI de quien compra %s → %s', (raw, digits) => {
		const r = validateBuyer({ name: 'Ale', email: 'a@example.com', dni: raw });
		expect(r).toMatchObject({ ok: true, buyer: { dni: digits } });
	});

	it.each(['123456', '1234567890', '12-345-678', 'AB123456', '', '12.345.67a'])(
		'DNI inválido: "%s"',
		(raw) => {
			const r = validateBuyer({ name: 'Ale', email: 'a@example.com', dni: raw });
			expect(r.ok).toBe(false);
			expect(/** @type {any} */ (r).errors.dni).toBeTruthy();
		}
	);

	it('quien compra: nombre, email normalizado y DNI', () => {
		expect(
			validateBuyer({ name: '  Ale   Prueba ', email: ' Ale@Example.COM ', dni: '12.345.678' })
		).toEqual({
			ok: true,
			buyer: { name: 'Ale Prueba', email: 'ale@example.com', dni: '12345678' }
		});
		expect(
			Object.keys(
				/** @type {any} */ (validateBuyer({ name: 'A', email: 'no', dni: '1' })).errors
			).sort()
		).toEqual(['dni', 'email', 'name']);
	});

	it('cada entrada: nombre como le conocen (2–80), pronombres obligatorios (hasta 40), sin DNI', () => {
		expect(validateHolder({ name: '  Ale   Prueba ', pronouns: ' elle ' })).toEqual({
			ok: true,
			holder: { name: 'Ale Prueba', pronouns: 'elle' }
		});
		expect(validateHolder({ name: 'A', pronouns: 'ella' }).ok).toBe(false);
		expect(validateHolder({ name: 'Ale', pronouns: 'x'.repeat(40) }).ok).toBe(true);
		expect(validateHolder({ name: 'Ale', pronouns: 'x'.repeat(41) })).toEqual({
			ok: false,
			errors: { pronouns: 'Hasta 40 letras.' }
		});
	});

	it.each([undefined, '', '   ', null])('pronombres obligatorios: %j no vale', (pronouns) => {
		expect(validateHolder({ name: 'Ale', pronouns })).toEqual({
			ok: false,
			errors: { pronouns: 'Poné los pronombres de esta persona.' }
		});
	});
});

describe('fondo y mp_fee_percent', () => {
	it('fondo opcional por tipo, entre 0 y el precio', () => {
		const c = parseTicketConfig({
			...META,
			tickets: [{ id: 'general', price: 10000, fondo: 2000, capacity: 5 }]
		});
		expect(c?.types[0]).toMatchObject({ price: 10000, fondo: 2000 });
		expect(parseTicketConfig(META)?.types[0].fondo).toBe(0);
		// 100 %: la entrada queda gratis con el descuento del fondo.
		expect(
			parseTicketConfig({
				...META,
				tickets: [{ id: 'general', price: 10000, fondo: 10000, capacity: 5 }]
			})?.types[0].fondo
		).toBe(10000);
		for (const fondo of [-1, 10001, 12000, 1.5, 'mucho']) {
			expect(() =>
				parseTicketConfig({
					...META,
					tickets: [{ id: 'general', price: 10000, fondo, capacity: 5 }]
				})
			).toThrow(/Fondo/);
		}
	});
	it('fondo_percent por evento: vale para todos los tipos, redondeado al peso; `fondo` lo pisa', () => {
		const c = parseTicketConfig({
			...META,
			fondo_percent: 15,
			tickets: [
				{ id: 'general', price: 10000, capacity: 5 },
				{ id: 'reducida', price: 4999, capacity: 5 },
				{ id: 'fija', price: 8000, fondo: 1000, capacity: 5 },
				{ id: 'sin', price: 8000, fondo: 0, capacity: 5 }
			]
		});
		expect(c?.fondoPercent).toBe(15);
		// 4999 × 15 % = 749,85 → 750
		expect(c?.types.map((t) => t.fondo)).toEqual([1500, 750, 1000, 0]);
		expect(parseTicketConfig(META)?.fondoPercent).toBeNull();
		for (const fondo_percent of [-1, 101, 12.5, 'mucho']) {
			expect(() => parseTicketConfig({ ...META, fondo_percent })).toThrow(/fondo_percent/);
		}
	});

	it('mp_fee_percent por evento', () => {
		expect(parseTicketConfig(META)?.mpFeeBasisPoints).toBeNull();
		expect(parseTicketConfig({ ...META, mp_fee_percent: 7.73 })?.mpFeeBasisPoints).toBe(773);
		expect(parseTicketConfig({ ...META, mp_fee_percent: '6,5' })?.mpFeeBasisPoints).toBe(650);
		expect(() => parseTicketConfig({ ...META, mp_fee_percent: 80 })).toThrow(/mp_fee_percent/);
	});
});

describe('validatePurchase', () => {
	const c = /** @type {NonNullable<ReturnType<typeof parseTicketConfig>>} */ (
		parseTicketConfig({ ...META, payment_methods: ['mercadopago', 'transferencia'] })
	);
	/** @param {number} n */
	const people = (n) =>
		Array.from({ length: n }, (_, i) => ({
			name: `Persona ${i + 1}`,
			pronouns: i === 0 ? 'elle' : 'ella'
		}));
	const ok = {
		type: 'reducida',
		quantity: '3',
		buyer: { name: 'Ale Prueba', email: ' Ale@Example.COM ', dni: '20.111.222' },
		accept: 'on',
		holders: people(3)
	};

	it('normaliza quien compra y cada entrada (sin precios del form)', () => {
		const r = validatePurchase(c, /** @type {any} */ ({ ...ok, price: 1 }));
		expect(r).toMatchObject({
			ok: true,
			quantity: 3,
			buyer: { name: 'Ale Prueba', email: 'ale@example.com', dni: '20111222' },
			method: 'mercadopago'
		});
		expect(/** @type {any} */ (r).holders).toEqual(people(3));
	});

	it('la entrada 1 sin nombre usa el de quien compra (formulario sin JavaScript)', () => {
		const holders = people(2);
		holders[0] = { name: '', pronouns: 'ella' };
		const r = validatePurchase(c, { ...ok, quantity: '2', holders });
		expect(/** @type {any} */ (r).holders[0]).toEqual({ name: 'Ale Prueba', pronouns: 'ella' });
	});

	it('sin máximo fijo por compra: hasta el límite del formulario', () => {
		expect(
			validatePurchase(c, { ...ok, quantity: String(MAX_TICKETS_PER_FORM), holders: people(20) }).ok
		).toBe(true);
		const r = validatePurchase(c, { ...ok, quantity: '21', holders: people(21) });
		expect(/** @type {any} */ (r).errors.quantity).toMatch(/escribinos/);
	});

	it('marca errores por entrada con el índice del formulario', () => {
		const holders = people(3);
		holders[1] = { name: 'B', pronouns: 'él' };
		holders[2] = { name: 'Persona Tres', pronouns: 'x'.repeat(41) };
		const r = /** @type {any} */ (validatePurchase(c, { ...ok, holders }));
		expect(r.ok).toBe(false);
		expect(Object.keys(r.errors).sort()).toEqual(['holder_name_1', 'holder_pronouns_2']);
	});

	it('opción del fondo: por defecto con fondo si el tipo tiene fondo; si no, precio completo', () => {
		const withFondo = /** @type {NonNullable<ReturnType<typeof parseTicketConfig>>} */ (
			parseTicketConfig({
				...META,
				tickets: [
					{ id: 'general', price: 10000, fondo: 2000, capacity: 5 },
					{ id: 'reducida', price: 5000, capacity: 5 }
				]
			})
		);
		const buy = (/** @type {Record<string, unknown>} */ o) =>
			/** @type {any} */ (validatePurchase(withFondo, { ...ok, ...o }));
		expect(buy({ type: 'general' }).option).toBe('fondo');
		expect(buy({ type: 'general', option: '' }).option).toBe('fondo');
		expect(buy({ type: 'reducida' }).option).toBe('completo');
		// "Con el descuento del fondo" en un tipo sin fondo = precio completo.
		expect(buy({ type: 'reducida', option: 'fondo' }).option).toBe('completo');
		for (const option of ['completo', 'solidaria', 'muy-solidaria', 'sugar']) {
			expect(buy({ type: 'general', option }).option).toBe(option);
			expect(buy({ type: 'reducida', option }).option).toBe(option);
		}
		expect(buy({ type: 'general', option: 'mitad' }).errors.option).toBeTruthy();
	});

	it('medio de pago: solo los que habilita el evento', () => {
		expect(validatePurchase(c, { ...ok, method: 'transferencia' })).toMatchObject({
			ok: true,
			method: 'transferencia'
		});
		const onlyMp = { ...c, paymentMethods: /** @type {any} */ (['mercadopago']) };
		expect(
			/** @type {any} */ (validatePurchase(onlyMp, { ...ok, method: 'transferencia' })).errors
				.method
		).toBeTruthy();
	});

	it.each([
		[{ type: 'vip' }, 'type'],
		[{ quantity: '0' }, 'quantity'],
		[{ quantity: '1.5' }, 'quantity'],
		[{ buyer: { ...ok.buyer, email: 'no-es-mail' } }, 'email'],
		[{ buyer: { ...ok.buyer, dni: '123' } }, 'dni'],
		[{ buyer: { ...ok.buyer, name: 'A' } }, 'name'],
		[{ accept: null }, 'accept'],
		[{ holders: people(2) }, 'holder_name_2'],
		[{ holders: [...people(2), { name: 'Persona 3', pronouns: '' }] }, 'holder_pronouns_2'],
		[{ option: 'gratis' }, 'option']
	])('marca errores %#', (patch, field) => {
		const r = validatePurchase(c, { ...ok, ...patch });
		expect(r.ok).toBe(false);
		expect(/** @type {any} */ (r).errors[field]).toBeTruthy();
	});
});
