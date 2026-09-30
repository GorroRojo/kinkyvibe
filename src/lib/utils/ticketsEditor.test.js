import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { parseTicketConfig } from '$lib/server/tickets/config.js';
import { ticketsFileErrors } from '$lib/server/tickets/editor.js';
import { joinMarkdown } from './eventDraft.js';
import {
	applyTicketsForm,
	applyTicketsToMarkdown,
	describeTicketsForm,
	emptyTicketType,
	readTicketsForm,
	ticketsFormChanged,
	typeIdFor,
	validateTicketsForm,
	withTypeIds
} from './ticketsEditor.js';

const FM = `title: Fiesta de prueba
tags:
  - KinkyVibe # etiqueta especial #
  - AMBA
status: abierto # anunciado | abierto | agotadas | cancelado #
start: 2026-12-12T21:00-03:00
# Entradas (ver docs/tickets.md)
tickets:
  - id: general # no cambiar después de vender
    name: General
    price: 10000
    fondo: 2000
    nota_interna: algo que el editor no conoce
    capacity: 40
  - id: anticipada
    name: Anticipada
    price: 8000
    capacity: 3
payment_methods: [mercadopago, transferencia]
extra_key: se queda
`;

/** @param {string} fm */
const metaOf = (fm) => parseDocument(fm).toJS();
/** @param {string} fm */
const formOf = (fm) => readTicketsForm(metaOf(fm));

describe('readTicketsForm', () => {
	it('lee tipos, medios de pago y valores por defecto', () => {
		const f = formOf(FM);
		expect(f.enabled).toBe(true);
		expect(
			f.types.map(({ origId, id, name, mode, price, capacity }) => ({
				origId,
				id,
				name,
				mode,
				price,
				capacity
			}))
		).toEqual([
			{
				origId: 'general',
				id: 'general',
				name: 'General',
				mode: 'price',
				price: '10000',
				capacity: '40'
			},
			{
				origId: 'anticipada',
				id: 'anticipada',
				name: 'Anticipada',
				mode: 'price',
				price: '8000',
				capacity: '3'
			}
		]);
		expect(f.methods).toEqual({ mercadopago: true, transferencia: true });
		expect(f).toMatchObject({ customClose: false, modalidad: '', reminders: true, mpFee: '' });
	});

	it('un evento sin `tickets` arranca apagado, solo con Mercado Pago', () => {
		const f = formOf('title: x\n');
		expect(f).toMatchObject({
			enabled: false,
			types: [],
			methods: { mercadopago: true, transferencia: false }
		});
	});

	it('a la gorra, cierre, modalidad, recordatorios y comisión', () => {
		const f = formOf(`tickets:
  - id: gorra
    name: A la gorra
    a_la_gorra: { minimo: 0, sugerido: 5000 }
    capacity: 100
tickets_close: 2026-12-10T18:30-03:00
modalidad: Online
recordatorios: false
mp_fee_percent: 7.5
`);
		expect(f.types[0]).toMatchObject({ mode: 'gorra', min: '0', suggested: '5000', price: '' });
		expect(f).toMatchObject({
			customClose: true,
			closeAt: '2026-12-10T18:30',
			customOpen: false,
			modalidad: 'online',
			reminders: false,
			mpFee: '7.5'
		});
	});
});

describe('cupo opcional, «General» y entradas en la puerta', () => {
	it('el primer tipo nuevo se llama «General»; los demás, vacíos', () => {
		expect(emptyTicketType({ first: true }).name).toBe('General');
		expect(emptyTicketType().name).toBe('');
	});

	it('cupo vacío = sin límite: valida, se guarda sin `capacity` y la venta lo lee como null', () => {
		const initial = formOf(FM);
		const form = formOf(FM);
		form.types[0].capacity = '  ';
		expect(validateTicketsForm(form).errors).toEqual([]);
		const out = applyTicketsForm(FM, form, initial);
		expect(metaOf(out).tickets[0]).not.toHaveProperty('capacity');
		expect(metaOf(out).tickets[1].capacity).toBe(3);
		expect(parseTicketConfig(metaOf(out))?.types.map((t) => t.capacity)).toEqual([null, 3]);
		// Ida y vuelta: se lee vacío y sin cambios no toca nada.
		expect(formOf(out).types[0].capacity).toBe('');
		expect(applyTicketsForm(out, formOf(out), formOf(out))).toBe(out);
		// Volver a ponerle cupo.
		const again = formOf(out);
		again.types[0].capacity = '25';
		expect(metaOf(applyTicketsForm(out, again, formOf(out))).tickets[0].capacity).toBe(25);
	});

	it('cupo inválido sigue siendo error; con ventas, el mínimo solo aplica si hay cupo', () => {
		const form = formOf(FM);
		form.types[0].capacity = 'mucho';
		expect(validateTicketsForm(form).errors.join()).toMatch(/cupo/);
		form.types[0].capacity = '';
		const sales = { general: { sold: 45, held: 2 } };
		expect(validateTicketsForm(form, { sales }).errors).toEqual([]);
		form.types[0].capacity = '10';
		expect(validateTicketsForm(form, { sales }).errors.join()).toMatch(/no puede ser menor/);
	});

	it('entradas en la puerta: `puerta: true` y `puerta_precio`, y se borran al apagarlo', () => {
		const initial = formOf(FM);
		expect(initial).toMatchObject({ door: false, doorPrice: '' });
		const form = formOf(FM);
		form.door = true;
		form.doorPrice = ' $ 12.000, solo efectivo ';
		const out = applyTicketsForm(FM, form, initial);
		expect(metaOf(out)).toMatchObject({ puerta: true, puerta_precio: '$ 12.000, solo efectivo' });
		expect(parseTicketConfig(metaOf(out))?.door).toEqual({
			on: true,
			price: '$ 12.000, solo efectivo'
		});
		expect(formOf(out)).toMatchObject({ door: true, doorPrice: '$ 12.000, solo efectivo' });
		expect(describeTicketsForm(formOf(out), (n) => `$${n}`)).toMatch(
			/También en la puerta \(\$ 12\.000, solo efectivo\)$/
		);
		const off = formOf(out);
		off.door = false;
		const back = applyTicketsForm(out, off, formOf(out));
		expect(metaOf(back)).not.toHaveProperty('puerta');
		expect(metaOf(back)).not.toHaveProperty('puerta_precio');
		// Apagar la venta borra también lo de la puerta.
		const disabled = formOf(out);
		disabled.enabled = false;
		expect(metaOf(applyTicketsForm(out, disabled, formOf(out)))).not.toHaveProperty('puerta');
		// Precio muy largo.
		form.doorPrice = 'x'.repeat(121);
		expect(validateTicketsForm(form).errors.join()).toMatch(/puerta/);
	});
});

describe('applyTicketsForm: ida y vuelta', () => {
	it('sin cambios, el archivo queda idéntico', () => {
		expect(applyTicketsForm(FM, formOf(FM), formOf(FM))).toBe(FM);
		const md = joinMarkdown(FM, 'Texto\n');
		expect(applyTicketsToMarkdown(md, formOf(FM), formOf(FM))).toBe(md);
	});

	it('cambiar un precio toca solo ese tipo y conserva comentarios, orden y claves desconocidas', () => {
		const initial = formOf(FM);
		const form = formOf(FM);
		form.types[1].price = '9.000';
		const out = applyTicketsForm(FM, form, initial);
		expect(out).toContain('    price: 9000\n');
		expect(out).not.toContain('price: 8000');
		// Lo demás sigue igual, con sus comentarios.
		expect(out).toContain('  - KinkyVibe # etiqueta especial #');
		expect(out).toContain('status: abierto # anunciado | abierto | agotadas | cancelado #');
		expect(out).toContain('# Entradas (ver docs/tickets.md)');
		expect(out).toContain('  - id: general # no cambiar después de vender');
		expect(out).toContain('nota_interna: algo que el editor no conoce');
		expect(out).toContain('payment_methods: [mercadopago, transferencia]\n');
		expect(out.trimEnd().endsWith('extra_key: se queda')).toBe(true);
		// El orden de las claves de primer nivel no cambia.
		const keys = Object.keys(metaOf(out));
		expect(keys).toEqual(Object.keys(metaOf(FM)));
		// El tipo que no se tocó mantiene su `fondo` viejo (se ignora); el editado lo pierde.
		expect(metaOf(out).tickets[0].fondo).toBe(2000);
		expect(metaOf(out).tickets[1]).toEqual({
			id: 'anticipada',
			name: 'Anticipada',
			price: 9000,
			capacity: 3
		});
		expect(parseTicketConfig(metaOf(out))).not.toBeNull();
	});

	it('editar un tipo le borra el `fondo` en pesos (ya no existe) y deja sus claves extra', () => {
		const initial = formOf(FM);
		const form = formOf(FM);
		form.types[0].capacity = '50';
		const t = metaOf(applyTicketsForm(FM, form, initial)).tickets[0];
		expect(t).toEqual({
			id: 'general',
			name: 'General',
			price: 10000,
			nota_interna: 'algo que el editor no conoce',
			capacity: 50
		});
	});

	it('agregar, reordenar y quitar tipos; el id de los existentes no cambia', () => {
		const initial = formOf(FM);
		const form = formOf(FM);
		form.types[0].name = 'General (nuevo nombre)';
		const nuevo = { ...emptyTicketType(), name: 'Anticipada', price: '6000', capacity: '10' };
		form.types = [nuevo, form.types[0]]; // se quita "anticipada" y se agrega otra con el mismo nombre
		const out = metaOf(applyTicketsForm(FM, form, initial));
		expect(out.tickets.map((/** @type {any} */ t) => [t.id, t.name, t.price])).toEqual([
			['anticipada', 'Anticipada', 6000],
			['general', 'General (nuevo nombre)', 10000]
		]);
	});

	it('el id de un tipo nuevo sale del nombre y no pisa uno existente', () => {
		expect(typeIdFor('Anticipada 2×1 ¡Promo!', [])).toBe('anticipada-2-1-promo');
		expect(typeIdFor('General', ['general'])).toBe('general-2');
		expect(typeIdFor('', [])).toBe('entrada');
		const types = withTypeIds([
			{ ...emptyTicketType(), name: 'General' },
			{ ...formOf(FM).types[0] }
		]);
		expect(types.map((t) => t.id)).toEqual(['general-2', 'general']);
	});

	it('pasar a la gorra: sin `price`, con `a_la_gorra` en una línea', () => {
		const initial = formOf(FM);
		const form = formOf(FM);
		Object.assign(form.types[1], { mode: 'gorra', min: '1.000', suggested: '$ 5.000' });
		const out = applyTicketsForm(FM, form, initial);
		expect(out).toContain('a_la_gorra: { minimo: 1000, sugerido: 5000 }');
		expect(metaOf(out).tickets[1]).toEqual({
			id: 'anticipada',
			name: 'Anticipada',
			a_la_gorra: { minimo: 1000, sugerido: 5000 },
			capacity: 3
		});
		expect(parseTicketConfig(metaOf(out))?.types[1].gorra).toEqual({ min: 1000, suggested: 5000 });
	});

	it('prender la venta en un evento sin entradas: los valores por defecto no se escriben', () => {
		const fm = 'title: Nuevo\nstart: 2026-12-12T21:00-03:00\n';
		const initial = formOf(fm);
		const form = formOf(fm);
		form.enabled = true;
		form.types = [
			{ ...emptyTicketType(), name: 'General', price: '10000', capacity: '40' },
			{
				...emptyTicketType(),
				name: 'A la gorra',
				mode: 'gorra',
				min: '',
				suggested: '5000',
				capacity: '100'
			}
		];
		const out = applyTicketsForm(fm, form, initial);
		expect(metaOf(out)).toEqual({
			title: 'Nuevo',
			start: '2026-12-12T21:00-03:00',
			tickets: [
				{ id: 'general', name: 'General', price: 10000, capacity: 40 },
				{
					id: 'a-la-gorra',
					name: 'A la gorra',
					a_la_gorra: { minimo: 0, sugerido: 5000 },
					capacity: 100
				}
			]
		});
		expect(parseTicketConfig(metaOf(out))?.types).toHaveLength(2);
	});

	it('medios de pago, cierre, modalidad, recordatorios y comisión', () => {
		const initial = formOf(FM);
		const form = formOf(FM);
		form.methods.transferencia = false;
		Object.assign(form, {
			customClose: true,
			closeAt: '2026-12-11T20:00',
			customOpen: true,
			openAt: '2026-12-01T12:00',
			modalidad: 'presencial',
			reminders: false,
			mpFee: '7,73'
		});
		let out = applyTicketsForm(FM, form, initial);
		expect(metaOf(out)).toMatchObject({
			tickets_close: '2026-12-11T20:00-03:00',
			tickets_open: '2026-12-01T12:00-03:00',
			modalidad: 'presencial',
			recordatorios: false,
			mp_fee_percent: 7.73
		});
		// Solo Mercado Pago es el valor por defecto: la clave se borra.
		expect(metaOf(out).payment_methods).toBeUndefined();
		const cfg = parseTicketConfig(metaOf(out));
		expect(cfg).toMatchObject({
			paymentMethods: ['mercadopago'],
			online: false,
			reminders: false,
			mpFeeBasisPoints: 773
		});
		// Y de vuelta a los valores por defecto: se borran las claves.
		const back = formOf(out);
		Object.assign(back, {
			customClose: false,
			customOpen: false,
			modalidad: '',
			reminders: true,
			mpFee: ''
		});
		back.methods.transferencia = true;
		out = applyTicketsForm(out, back, formOf(out));
		const m = metaOf(out);
		expect(m.tickets_close).toBeUndefined();
		expect(m.tickets_open).toBeUndefined();
		expect(m.modalidad).toBeUndefined();
		expect(m.recordatorios).toBeUndefined();
		expect(m.mp_fee_percent).toBeUndefined();
		expect(m.payment_methods).toEqual(['mercadopago', 'transferencia']);
	});

	it('apagar la venta borra todas las claves de entradas y deja el resto', () => {
		const form = formOf(FM);
		form.enabled = false;
		const out = applyTicketsForm(FM, form, formOf(FM));
		expect(Object.keys(metaOf(out))).toEqual(['title', 'tags', 'status', 'start', 'extra_key']);
		expect(out).toContain('status: abierto # anunciado | abierto | agotadas | cancelado #');
	});

	it('ticketsFormChanged ignora formatos equivalentes ("10.000" = 10000)', () => {
		const form = formOf(FM);
		form.types[0].price = '$ 10.000';
		expect(ticketsFormChanged(formOf(FM), form)).toBe(false);
		form.types[0].price = '10001';
		expect(ticketsFormChanged(formOf(FM), form)).toBe(true);
	});

	it('describeTicketsForm (paso de revisión)', () => {
		/** @param {number} n */
		const ars = (n) => `$${n}`;
		expect(describeTicketsForm(formOf(FM), ars)).toBe(
			'General: $10000, cupo 40 · Anticipada: $8000, cupo 3'
		);
		expect(describeTicketsForm(formOf('title: x\n'), ars)).toMatch(/Sin venta/);
	});
});

describe('validateTicketsForm', () => {
	const ok = () => formOf(FM);

	it('un formulario válido no tiene errores', () => {
		expect(validateTicketsForm(ok())).toEqual({ errors: [], warnings: [] });
	});

	it.each([
		[(/** @type {any} */ f) => (f.types[0].price = '10000,50'), /pesos enteros/],
		[(/** @type {any} */ f) => (f.types[0].price = '0'), /mayor a 0/],
		[(/** @type {any} */ f) => (f.types[0].price = '1000000000'), /demasiado alto/],
		[(/** @type {any} */ f) => (f.types[0].name = '  '), /falta el nombre/],
		[(/** @type {any} */ f) => (f.types[0].capacity = '-1'), /cupo/],
		[(/** @type {any} */ f) => (f.types[0].capacity = '2.5'), /cupo/],
		[
			(/** @type {any} */ f) =>
				Object.assign(f.types[0], { mode: 'gorra', min: '6000', suggested: '5000' }),
			/sugerido no puede ser menor/
		],
		[
			(/** @type {any} */ f) =>
				Object.assign(f.types[0], { mode: 'gorra', min: '0', suggested: '' }),
			/sugerido/
		],
		[
			(/** @type {any} */ f) =>
				Object.assign(f.types[0], { mode: 'gorra', min: '-5', suggested: '10' }),
			/mínimo/
		],
		[(/** @type {any} */ f) => (f.types = []), /al menos un tipo/],
		[
			(/** @type {any} */ f) => (f.methods = { mercadopago: false, transferencia: false }),
			/medio de pago/
		],
		[
			(/** @type {any} */ f) => Object.assign(f, { customClose: true, closeAt: '' }),
			/cierra la venta/
		],
		[(/** @type {any} */ f) => (f.mpFee = '60'), /comisión/]
	])('marca errores %#', (patch, error) => {
		const f = ok();
		patch(f);
		const { errors } = validateTicketsForm(f);
		expect(errors.join(' ')).toMatch(error);
	});

	it('con ventas: no se puede bajar el cupo por debajo de lo vendido ni borrar un tipo vendido', () => {
		const sales = { general: { sold: 30, held: 5 }, anticipada: { sold: 0, held: 0 } };
		const f = ok();
		f.types[0].capacity = '34';
		expect(validateTicketsForm(f, { sales }).errors.join(' ')).toMatch(/ya hay 35 entradas/);
		f.types[0].capacity = '35';
		expect(validateTicketsForm(f, { sales }).errors).toEqual([]);
		// Quitar "anticipada" (sin ventas) está bien; "general" no.
		f.types = [f.types[0]];
		expect(validateTicketsForm(f, { sales }).errors).toEqual([]);
		const g = ok();
		g.types = [g.types[1]];
		expect(validateTicketsForm(g, { sales }).errors.join(' ')).toMatch(
			/No se puede borrar el tipo «general»: ya tiene 35/
		);
	});

	it('con ventas: no se puede apagar la venta; cambiar precios solo avisa', () => {
		const sales = { general: { sold: 2, held: 0 } };
		const off = ok();
		off.enabled = false;
		expect(validateTicketsForm(off, { sales }).errors.join(' ')).toMatch(/No se puede apagar/);
		expect(validateTicketsForm(off, { sales: {} }).errors).toEqual([]);
		const f = ok();
		f.types[0].price = '12000';
		const r = validateTicketsForm(f, { sales });
		expect(r.errors).toEqual([]);
		expect(r.warnings.join(' ')).toMatch(/mantienen el precio/);
	});
});

describe('ticketsFileErrors (servidor)', () => {
	const md = (/** @type {string} */ fm) => joinMarkdown(fm, '');

	it('sin entradas o con entradas válidas: nada', () => {
		expect(ticketsFileErrors(md('title: x\n'))).toEqual([]);
		expect(ticketsFileErrors(md(FM))).toEqual([]);
	});

	it('las mismas reglas que el formulario, y las de la venta', () => {
		expect(ticketsFileErrors(md(FM.replace('price: 8000', 'price: 8000.5'))).join(' ')).toMatch(
			/pesos enteros/
		);
		expect(
			ticketsFileErrors(
				md(
					FM.replace('payment_methods: [mercadopago, transferencia]', 'payment_methods: [efectivo]')
				)
			).join(' ')
		).toMatch(/medio de pago/i);
	});

	it('con ventas: borrar un tipo vendido o apagar la venta', () => {
		const sales = { anticipada: { sold: 3, held: 0 } };
		const sinAnticipada = FM.replace(/ {2}- id: anticipada\n(?: {4}.*\n)+/, '');
		expect(ticketsFileErrors(md(sinAnticipada), { sales }).join(' ')).toMatch(
			/borrar el tipo «anticipada»/
		);
		expect(ticketsFileErrors(md('title: x\n'), { sales }).join(' ')).toMatch(/apagar la venta/);
	});
});

describe('horarios de venta en el editor', () => {
	it('una fecha sola (formato viejo) se lee como el fin de ese día en Argentina y no se reescribe', () => {
		const fm = FM.replace('extra_key: se queda', 'tickets_close: 2026-12-10\nextra_key: se queda');
		const f = formOf(fm);
		expect(f).toMatchObject({ customClose: true, closeAt: '2026-12-10T23:59' });
		// Tocar otra cosa no reescribe el cierre.
		f.types[0].price = '11000';
		expect(applyTicketsForm(fm, f, formOf(fm))).toContain('tickets_close: 2026-12-10\n');
	});

	it('los horarios se guardan con la zona de Argentina', () => {
		const f = formOf(FM);
		Object.assign(f, { customOpen: true, openAt: '2026-10-01T09:30' });
		f.types[1].close = '2026-10-15T23:00';
		const m = metaOf(applyTicketsForm(FM, f, formOf(FM)));
		expect(m.tickets_open).toBe('2026-10-01T09:30-03:00');
		expect(m.tickets[1].close).toBe('2026-10-15T23:00-03:00');
		const cfg = /** @type {any} */ (parseTicketConfig(m));
		expect(cfg.opensAt).toBe(Date.UTC(2026, 9, 1, 12, 30));
		expect(cfg.types[1].closesAt).toBe(Date.UTC(2026, 9, 16, 2, 0));
		// Y se vuelve a leer igual.
		expect(formOf(applyTicketsForm(FM, f, formOf(FM))).types[1].close).toBe('2026-10-15T23:00');
		// Vaciar el cierre propio lo borra.
		const g = formOf(applyTicketsForm(FM, f, formOf(FM)));
		g.types[1].close = '';
		expect(
			metaOf(
				applyTicketsForm(
					applyTicketsForm(FM, f, formOf(FM)),
					g,
					formOf(applyTicketsForm(FM, f, formOf(FM)))
				)
			).tickets[1].close
		).toBeUndefined();
	});

	it('valida: abre antes de cerrar y horarios completos', () => {
		const f = formOf(FM);
		Object.assign(f, {
			customOpen: true,
			openAt: '2026-12-10T20:00',
			customClose: true,
			closeAt: '2026-12-10T20:00'
		});
		expect(validateTicketsForm(f).errors.join(' ')).toMatch(/abrir antes de cerrar/);
		f.openAt = '2026-12-10T19:59';
		expect(validateTicketsForm(f).errors).toEqual([]);
		f.types[0].close = '2026-12-10';
		expect(validateTicketsForm(f).errors.join(' ')).toMatch(/cierre propio/);
		f.types[0].close = '';
		f.openAt = '';
		expect(validateTicketsForm(f).errors.join(' ')).toMatch(/abre la venta/);
	});
});
