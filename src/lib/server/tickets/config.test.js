import { describe, expect, it } from 'vitest';
import { computePrice } from '$lib/utils/tickets.js';
import {
	MAX_TICKETS_PER_FORM,
	isKinkyVibeEvent,
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
	// El Fondo solo aplica a eventos con la etiqueta KinkyVibe (ver "solo eventos KinkyVibe").
	tags: ['KinkyVibe', 'AMBA'],
	tickets: [
		{ id: 'general', name: 'General', price: 8000, capacity: 40 },
		{ id: 'anticipada', name: 'Anticipada', price: 5000, capacity: 10 }
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
		expect(c.types).toEqual(
			META.tickets.map((t) => ({ ...t, fondo: 0, gorra: null, closesAt: null }))
		);
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

describe('cupo opcional y entradas en la puerta', () => {
	it('sin `capacity` (o vacío) el tipo no tiene cupo: capacity null', () => {
		const config = parseTicketConfig({
			...META,
			tickets: [
				{ id: 'general', price: 8000 },
				{ id: 'vacio', price: 8000, capacity: '' },
				{ id: 'nulo', price: 8000, capacity: null },
				{ id: 'cero', price: 8000, capacity: 0 },
				{ id: 'gorra', a_la_gorra: { minimo: 0, sugerido: 3000 } }
			]
		});
		expect(config?.types.map((t) => [t.id, t.capacity])).toEqual([
			['general', null],
			['vacio', null],
			['nulo', null],
			['cero', 0],
			['gorra', null]
		]);
		expect(() =>
			parseTicketConfig({ ...META, tickets: [{ id: 'a', price: 1, capacity: -1 }] })
		).toThrow(/Cupo/);
		expect(() =>
			parseTicketConfig({ ...META, tickets: [{ id: 'a', price: 1, capacity: 2.5 }] })
		).toThrow(/Cupo/);
	});

	it('puerta: sin la clave se vende sin aviso; true avisa (con precio); false no vende', () => {
		expect(parseTicketConfig(META)?.door).toEqual({ on: true, explicit: false, price: '' });
		// El precio solo cuenta con `puerta: true`.
		expect(parseTicketConfig({ ...META, puerta_precio: '$ 1' })?.door).toEqual({
			on: true,
			explicit: false,
			price: ''
		});
		expect(parseTicketConfig({ ...META, puerta: true })?.door).toEqual({
			on: true,
			explicit: true,
			price: ''
		});
		expect(
			parseTicketConfig({ ...META, puerta: true, puerta_precio: ' $ 12.000, solo efectivo ' })?.door
		).toEqual({ on: true, explicit: true, price: '$ 12.000, solo efectivo' });
		expect(parseTicketConfig({ ...META, puerta: false, puerta_precio: '$ 1' })?.door).toEqual({
			on: false,
			explicit: true,
			price: ''
		});
		// Solo un número: se muestra como plata.
		const door = parseTicketConfig({ ...META, puerta: true, puerta_precio: 12000 })?.door;
		expect(door?.price).toMatch(/^\$\s?12\.000$/);
		// "no" como texto no cuenta: tiene que ser el booleano de YAML (si no, como si faltara).
		expect(parseTicketConfig({ ...META, puerta: 'no' })?.door).toMatchObject({
			on: true,
			explicit: false
		});
		// Evento online: no hay puerta.
		expect(parseTicketConfig({ ...META, puerta: true, modalidad: 'online' })?.door).toBeNull();
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
		const r = validateBuyer({ name: 'Ale', pronouns: 'elle', email: 'a@example.com', dni: raw });
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

	it('quien compra: nombre, pronombres (obligatorios), email normalizado y DNI', () => {
		expect(
			validateBuyer({
				name: '  Ale   Prueba ',
				pronouns: ' elle ',
				email: ' Ale@Example.COM ',
				dni: '12.345.678'
			})
		).toEqual({
			ok: true,
			buyer: { name: 'Ale Prueba', pronouns: 'elle', email: 'ale@example.com', dni: '12345678' }
		});
		expect(
			Object.keys(
				/** @type {any} */ (validateBuyer({ name: 'A', email: 'no', dni: '1' })).errors
			).sort()
		).toEqual(['dni', 'email', 'name', 'pronouns']);
		expect(
			/** @type {any} */ (
				validateBuyer({
					name: 'Ale',
					pronouns: 'x'.repeat(41),
					email: 'a@example.com',
					dni: '12345678'
				})
			).errors
		).toEqual({ pronouns: 'Hasta 40 letras.' });
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
	it('el fondo es siempre el porcentaje global (fondo.js): `fondo_percent` y `fondo` por tipo se ignoran', () => {
		const c = parseTicketConfig(
			{
				...META,
				fondo_percent: 0,
				tickets: [
					{ id: 'general', price: 10000, capacity: 5 },
					{ id: 'anticipada', price: 4999, capacity: 5 },
					{ id: 'fija', price: 8000, fondo: 1000, capacity: 5 },
					{ id: 'sin', price: 8000, fondo: 0, capacity: 5 },
					{ id: 'rara', price: 8000, fondo: 'mucho', capacity: 5 }
				]
			},
			{ fondoPercent: 15 }
		);
		expect(c?.fondoPercent).toBe(15);
		// 4999 × 15 % = 749,85 → 750
		expect(c?.types.map((t) => t.fondo)).toEqual([1500, 750, 1200, 1200, 1200]);
		expect(parseTicketConfig(META)?.fondoPercent).toBeNull();
		expect(parseTicketConfig(META)?.types[0].fondo).toBe(0);
		// 100 %: la entrada queda gratis con el descuento del fondo.
		expect(parseTicketConfig(META, { fondoPercent: 100 })?.types[0].fondo).toBe(8000);
		// Valores inválidos tampoco rompen nada: se ignoran.
		expect(parseTicketConfig({ ...META, fondo_percent: 'mucho' })).not.toBeNull();
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
		type: 'anticipada',
		quantity: '3',
		buyer: { name: 'Ale Prueba', pronouns: 'elle', email: ' Ale@Example.COM ', dni: '20.111.222' },
		accept: 'on',
		holders: people(3)
	};

	it('normaliza quien compra y cada entrada (sin precios del form)', () => {
		const r = validatePurchase(c, /** @type {any} */ ({ ...ok, price: 1 }));
		expect(r).toMatchObject({
			ok: true,
			quantity: 3,
			buyer: { name: 'Ale Prueba', pronouns: 'elle', email: 'ale@example.com', dni: '20111222' },
			method: 'mercadopago',
			option: 'completo',
			unitPrice: 5000
		});
		expect(/** @type {any} */ (r).holders).toEqual(people(3));
	});

	it('la entrada 1 sin nombre usa el de quien compra (formulario sin JavaScript)', () => {
		const holders = people(2);
		holders[0] = { name: '', pronouns: 'ella' };
		const r = validatePurchase(c, { ...ok, quantity: '2', holders });
		expect(/** @type {any} */ (r).holders[0]).toEqual({ name: 'Ale Prueba', pronouns: 'ella' });
	});

	it('la entrada 1 sin pronombres usa los de quien compra; las demás no', () => {
		const holders = people(2).map((h) => ({ ...h, pronouns: '' }));
		const r = /** @type {any} */ (validatePurchase(c, { ...ok, quantity: '2', holders }));
		expect(r.ok).toBe(false);
		expect(Object.keys(r.errors)).toEqual(['holder_pronouns_1']);
		holders[1].pronouns = 'él';
		const r2 = /** @type {any} */ (validatePurchase(c, { ...ok, quantity: '2', holders }));
		expect(r2.holders).toEqual([
			{ name: 'Persona 1', pronouns: 'elle' },
			{ name: 'Persona 2', pronouns: 'él' }
		]);
	});

	it('sin máximo fijo por compra: hasta el límite del formulario', () => {
		expect(
			validatePurchase(c, { ...ok, quantity: String(MAX_TICKETS_PER_FORM), holders: people(20) }).ok
		).toBe(true);
		const r = validatePurchase(c, { ...ok, quantity: '21', holders: people(21) });
		expect(/** @type {any} */ (r).errors.quantity).toMatch(/hasta 20/);
	});

	it('marca errores por entrada con el índice del formulario', () => {
		const holders = people(3);
		holders[1] = { name: 'B', pronouns: 'él' };
		holders[2] = { name: 'Persona Tres', pronouns: 'x'.repeat(41) };
		const r = /** @type {any} */ (validatePurchase(c, { ...ok, holders }));
		expect(r.ok).toBe(false);
		expect(Object.keys(r.errors).sort()).toEqual(['holder_name_1', 'holder_pronouns_2']);
	});

	it('opción del fondo: por defecto con fondo si hay porcentaje; si no, precio completo', () => {
		const tickets = [{ id: 'general', price: 10000, capacity: 5 }];
		const withFondo = /** @type {NonNullable<ReturnType<typeof parseTicketConfig>>} */ (
			parseTicketConfig({ ...META, tickets }, { fondoPercent: 20 })
		);
		const noPercent = /** @type {NonNullable<ReturnType<typeof parseTicketConfig>>} */ (
			parseTicketConfig({ ...META, tickets }, { fondoPercent: 0 })
		);
		/** @param {any} config @param {Record<string, unknown>} o */
		const buyIn = (config, o) => /** @type {any} */ (validatePurchase(config, { ...ok, ...o }));
		expect(buyIn(withFondo, { type: 'general' }).option).toBe('fondo');
		expect(buyIn(withFondo, { type: 'general', option: '' }).option).toBe('fondo');
		expect(buyIn(noPercent, { type: 'general' }).option).toBe('completo');
		// "Con el descuento del fondo" con 0 % = precio completo.
		expect(buyIn(noPercent, { type: 'general', option: 'fondo' }).option).toBe('completo');
		for (const option of ['completo', 'solidaria', 'muy-solidaria', 'sugar']) {
			expect(buyIn(withFondo, { type: 'general', option }).option).toBe(option);
			expect(buyIn(noPercent, { type: 'general', option }).option).toBe(option);
		}
		// "gorra" no es una opción de un tipo con precio.
		expect(buyIn(withFondo, { type: 'general', option: 'gorra' }).errors.option).toBeTruthy();
		expect(buyIn(withFondo, { type: 'general', option: 'mitad' }).errors.option).toBeTruthy();
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
		[{ buyer: { ...ok.buyer, pronouns: '  ' } }, 'pronouns'],
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

describe('a la gorra', () => {
	const GORRA = {
		...META,
		payment_methods: ['mercadopago', 'transferencia'],
		tickets: [
			{ id: 'general', name: 'General', price: 8000, capacity: 40 },
			{
				id: 'gorra',
				name: 'A la gorra',
				a_la_gorra: { minimo: 1000, sugerido: 5000 },
				capacity: 100
			},
			{ id: 'libre', name: 'Libre', a_la_gorra: { minimo: 0, sugerido: 3000 }, capacity: 100 }
		]
	};
	const c = /** @type {NonNullable<ReturnType<typeof parseTicketConfig>>} */ (
		parseTicketConfig(GORRA, { fondoPercent: 20 })
	);
	const ok = {
		type: 'gorra',
		quantity: '2',
		buyer: { name: 'Ale Prueba', pronouns: 'elle', email: 'ale@example.com', dni: '20111222' },
		accept: 'on',
		holders: [
			{ name: 'Ale Prueba', pronouns: 'elle' },
			{ name: 'Otra Persona', pronouns: 'ella' }
		]
	};
	/** @param {Record<string, unknown>} o */
	const buy = (o) => /** @type {any} */ (validatePurchase(c, { ...ok, ...o }));

	it('parsea mínimo y sugerido; sin fondo aunque haya porcentaje del Fondo', () => {
		expect(c.types[1]).toEqual({
			id: 'gorra',
			name: 'A la gorra',
			price: 5000,
			fondo: 0,
			capacity: 100,
			gorra: { min: 1000, suggested: 5000 },
			closesAt: null
		});
		expect(c.types[0].fondo).toBe(1600);
		expect(c.types[2].gorra).toEqual({ min: 0, suggested: 3000 });
	});

	it.each([
		[{ minimo: -1, sugerido: 10 }, /minimo/],
		[{ minimo: 1.5, sugerido: 10 }, /minimo/],
		[{ minimo: 'x', sugerido: 10 }, /minimo/],
		[{ minimo: 5000, sugerido: 4000 }, /sugerido/],
		[{ minimo: 0 }, /sugerido/],
		[{ minimo: 0, sugerido: 100000001 }, /sugerido/]
	])('rechaza a_la_gorra inválido %#', (a_la_gorra, error) => {
		expect(() =>
			parseTicketConfig({ ...META, tickets: [{ id: 'g', a_la_gorra, capacity: 5 }] })
		).toThrow(error);
	});

	it('no se puede tener price y a_la_gorra a la vez', () => {
		expect(() =>
			parseTicketConfig({
				...META,
				tickets: [{ id: 'g', price: 100, a_la_gorra: { minimo: 0, sugerido: 1 }, capacity: 5 }]
			})
		).toThrow(/price/);
	});

	it('el monto vacío es el sugerido; la opción es siempre "gorra"', () => {
		expect(buy({})).toMatchObject({ ok: true, option: 'gorra', unitPrice: 5000 });
		expect(buy({ amount: '' })).toMatchObject({ ok: true, unitPrice: 5000 });
		// La opción del fondo que mande el formulario se ignora.
		expect(buy({ option: 'sugar' })).toMatchObject({ ok: true, option: 'gorra' });
	});

	it.each([
		['1000', 1000],
		['1.000', 1000],
		['$ 7.500', 7500],
		['12000,00', 12000],
		[' 20000 ', 20000]
	])('acepta el monto %j → %i', (amount, unitPrice) => {
		expect(buy({ amount })).toMatchObject({ ok: true, unitPrice });
	});

	it.each(['999', '-5', 'mucho', '10,5', '1.5', '1e5'])(
		'rechaza el monto %j (mínimo 1000, entero)',
		(amount) => {
			const r = buy({ amount });
			expect(r.ok).toBe(false);
			expect(r.errors.amount).toBeTruthy();
		}
	);

	it('con mínimo 0 se puede pagar 0 (entrada sin cargo)', () => {
		expect(buy({ type: 'libre', amount: '0' })).toMatchObject({ ok: true, unitPrice: 0 });
	});

	it('sin tope de producto: montos altos pasan (la gorra es lo que cada quien quiera)', () => {
		expect(buy({ amount: '500001' })).toMatchObject({ ok: true, unitPrice: 500001 });
		expect(buy({ amount: '2.500.000' })).toMatchObject({ ok: true, unitPrice: 2500000 });
		// 2 entradas × 50.000.000 = justo el tope técnico de la orden.
		expect(buy({ amount: '50000000' })).toMatchObject({ ok: true, unitPrice: 50000000 });
	});

	it('tope técnico: el total de la orden no pasa de $ 100.000.000 (error de tipeo)', () => {
		const r = buy({ amount: '50000001' }); // × 2 entradas
		expect(r.ok).toBe(false);
		expect(r.errors.amount).toMatch(/error de tipeo.*100\.000\.000/);
		expect(buy({ amount: '100000000000' }).errors.amount).toMatch(/error de tipeo/);
		// Una sola entrada: hasta el tope.
		expect(buy({ quantity: '1', holders: [ok.holders[0]], amount: '100000000' })).toMatchObject({
			ok: true,
			unitPrice: 100000000
		});
	});
});

describe('eventos online', () => {
	it('modalidad manda; si falta, la etiqueta Online sin location', () => {
		expect(parseTicketConfig({ ...META, modalidad: 'online' })?.online).toBe(true);
		expect(parseTicketConfig({ ...META, modalidad: 'Presencial', tags: ['Online'] })?.online).toBe(
			false
		);
		expect(parseTicketConfig({ ...META, tags: ['español', 'Online'] })?.online).toBe(true);
		expect(
			parseTicketConfig({ ...META, tags: ['Online'], location: 'Calle Falsa 123' })?.online
		).toBe(false);
		expect(parseTicketConfig({ ...META, tags: ['AMBA'] })?.online).toBe(false);
	});
});

describe('el Fondo solo aplica a eventos con la etiqueta KinkyVibe', () => {
	const tickets = [
		{ id: 'general', name: 'General', price: 10000, capacity: 40 },
		{ id: 'fija', name: 'Fija', price: 8000, fondo: 2000, capacity: 40 }
	];
	const tagged = /** @type {NonNullable<ReturnType<typeof parseTicketConfig>>} */ (
		parseTicketConfig({ ...META, tags: ['KinkyVibe'], tickets }, { fondoPercent: 20 })
	);
	const untagged = /** @type {NonNullable<ReturnType<typeof parseTicketConfig>>} */ (
		parseTicketConfig({ ...META, tags: ['AMBA', 'pago'], tickets }, { fondoPercent: 20 })
	);
	const ok = {
		type: 'general',
		quantity: '1',
		buyer: { name: 'Ale Prueba', pronouns: 'elle', email: 'ale@example.com', dni: '20111222' },
		accept: 'on',
		holders: [{ name: 'Ale Prueba', pronouns: 'elle' }]
	};

	it.each([['KinkyVibe'], ['Kinkyvibe'], ['kinkyvibe']])('etiqueta %j (alias incluidos)', (tag) => {
		expect(isKinkyVibeEvent({ tags: ['AMBA', tag] })).toBe(true);
	});

	it.each([[['AMBA']], [[]], [undefined], [['KinkyVibe-no']], [['Kinky Vibe']], ['KinkyVibe']])(
		'sin la etiqueta: %j',
		(tags) => {
			expect(isKinkyVibeEvent({ tags })).toBe(false);
		}
	);

	it('con la etiqueta: descuento del Fondo y las opciones', () => {
		expect(tagged.fondoEnabled).toBe(true);
		expect(tagged.fondoPercent).toBe(20);
		// El `fondo` en pesos de "Fija" se ignora: 20 % de 8000.
		expect(tagged.types.map((t) => t.fondo)).toEqual([2000, 1600]);
		const r = /** @type {any} */ (validatePurchase(tagged, { ...ok, option: 'sugar' }));
		expect(r).toMatchObject({ ok: true, option: 'sugar' });
		expect(/** @type {any} */ (validatePurchase(tagged, ok)).option).toBe('fondo');
	});

	it('sin la etiqueta: sin fondo', () => {
		expect(untagged.fondoEnabled).toBe(false);
		expect(untagged.fondoPercent).toBeNull();
		expect(untagged.types.map((t) => t.fondo)).toEqual([0, 0]);
	});

	it.each(['fondo', 'solidaria', 'muy-solidaria', 'sugar', 'completo', '', 'cualquiera'])(
		'sin la etiqueta, un POST con option=%j queda en precio de lista',
		(option) => {
			for (const type of ['general', 'fija']) {
				const r = /** @type {any} */ (validatePurchase(untagged, { ...ok, type, option }));
				expect(r).toMatchObject({ ok: true, option: 'completo' });
				const price = r.type.price;
				const p = computePrice({
					price,
					fondo: r.type.fondo,
					option: r.option,
					quantity: 1,
					method: 'transferencia'
				});
				expect(p).toMatchObject({ fondo: 0, contribution: 0, total: price });
			}
		}
	);
});
