/**
 * Editor de eventos, sección Entradas: preventas (tramos) y tipos encadenados.
 */
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { parseTicketConfig } from '$lib/server/tickets/config.js';
import { ticketsFileErrors } from '$lib/server/tickets/editor.js';
import { formatARS } from './money.js';
import {
	applyTicketsForm,
	describeTicketsForm,
	doorPricePreview,
	emptyTicketType,
	readTicketsForm,
	tierPreview,
	tiersForMode,
	tiersOnlineMax,
	validateTicketsForm,
	withTypeIds
} from './ticketsEditor.js';

const FM = `title: Fiesta de prueba
start: 2026-12-12T21:00-03:00
tickets:
  - id: general
    name: General
    capacity: 40
    tiers:
      - id: preventa-1
        name: Preventa 1
        price: 8000
        quantity: 5
      - id: preventa-2
        name: Preventa 2
        price: 9000
        until: 2026-12-01T23:59-03:00
      - id: general
        name: General
        price: 10000
  - id: ultima
    name: Última tanda
    price: 12000
    after: general
puerta: true
`;

/** @param {string} fm */
const metaOf = (fm) => parseDocument(fm).toJS();
/** @param {string} fm */
const formOf = (fm) => readTicketsForm(metaOf(fm));

describe('leer y escribir tramos y encadenados', () => {
	it('lee los tramos (con la fecha en hora de Argentina) y `after` como referencia al tipo', () => {
		const f = formOf(FM);
		expect(f.types[0].mode).toBe('tiers');
		expect(
			f.types[0].tiers.map(({ origId, name, price, quantity, until }) => ({
				origId,
				name,
				price,
				quantity,
				until
			}))
		).toEqual([
			{ origId: 'preventa-1', name: 'Preventa 1', price: '8000', quantity: '5', until: '' },
			{
				origId: 'preventa-2',
				name: 'Preventa 2',
				price: '9000',
				quantity: '',
				until: '2026-12-01T23:59'
			},
			{ origId: 'general', name: 'General', price: '10000', quantity: '', until: '' }
		]);
		expect(f.types[1].after).toBe(f.types[0].key);
	});

	it('sin cambios, el archivo queda idéntico', () => {
		expect(applyTicketsForm(FM, formOf(FM), formOf(FM))).toBe(FM);
	});

	it('cambiar un tramo reescribe los tramos y sigue siendo una configuración válida', () => {
		const initial = formOf(FM);
		const form = formOf(FM);
		form.types[0].tiers[0].price = '8.500';
		form.types[0].tiers[0].quantity = '6';
		const out = applyTicketsForm(FM, form, initial);
		const meta = metaOf(out);
		expect(meta.tickets[0].tiers[0]).toEqual({
			id: 'preventa-1',
			name: 'Preventa 1',
			price: 8500,
			quantity: 6
		});
		expect(meta.tickets[0].tiers[1].until).toBe('2026-12-01T23:59-03:00');
		expect(meta.tickets[0]).not.toHaveProperty('price');
		expect(meta.tickets[1].after).toBe('general');
		expect(parseTicketConfig(meta)?.types[0].tiers).toHaveLength(3);
	});

	it('un tipo nuevo encadenado a otro tipo nuevo se guarda con el id (no la clave local)', () => {
		const initial = formOf('title: x\nstart: 2026-12-12T21:00-03:00\n');
		const form = formOf('title: x\nstart: 2026-12-12T21:00-03:00\n');
		form.enabled = true;
		const a = { ...emptyTicketType({ first: true }), price: '1000', capacity: '10' };
		const b = { ...emptyTicketType(), name: 'Segunda tanda', price: '2000', after: a.key };
		form.types = [a, b];
		const meta = metaOf(
			applyTicketsForm('title: x\nstart: 2026-12-12T21:00-03:00\n', form, initial)
		);
		expect(meta.tickets.map((/** @type {any} */ x) => [x.id, x.after])).toEqual([
			['general', undefined],
			['segunda-tanda', 'general']
		]);
		expect(parseTicketConfig(meta)?.types[1].after).toBe('general');
	});

	it('pasar a precio fijo saca los tramos; pasar a preventas saca el precio', () => {
		const initial = formOf(FM);
		const form = formOf(FM);
		form.types[0].mode = 'price';
		form.types[0].price = '10000';
		form.types[1].mode = 'tiers';
		form.types[1].tiers = tiersForMode(form.types[1]);
		form.types[1].tiers[0].price = '11000';
		form.types[1].tiers[0].quantity = '2';
		const meta = metaOf(applyTicketsForm(FM, form, initial));
		expect(meta.tickets[0]).toMatchObject({ price: 10000, capacity: 40 });
		expect(meta.tickets[0]).not.toHaveProperty('tiers');
		expect(meta.tickets[1]).not.toHaveProperty('price');
		expect(meta.tickets[1].tiers).toEqual([
			{ id: 'preventa-1', name: 'Preventa 1', price: 11000, quantity: 2 },
			{ id: 'general', name: 'General', price: 12000 }
		]);
	});

	it('un tipo que ya vendió se puede pasar a preventas: el servidor lo acepta', () => {
		const sales = { general: { sold: 7, held: 0 }, ultima: { sold: 2, held: 1 } };
		const initial = formOf(FM);
		const form = formOf(FM);
		form.types[1].mode = 'tiers';
		form.types[1].tiers = tiersForMode(form.types[1]);
		form.types[1].tiers[0].price = '11000';
		form.types[1].tiers[0].quantity = '5';
		expect(validateTicketsForm(form, { sales }).errors).toEqual([]);
		const content = `---\n${applyTicketsForm(FM, form, initial)}---\n`;
		expect(ticketsFileErrors(content, { sales })).toEqual([]);
		// (y el archivo se leyó: sacar el tipo vendido sí lo frena)
		const removed = formOf(FM);
		removed.types = [removed.types[0]];
		const without = `---\n${applyTicketsForm(FM, removed, initial)}---\n`;
		expect(ticketsFileErrors(without, { sales }).join(' ')).toMatch(
			/No se puede borrar el tipo «ultima»/
		);
	});
});

describe('validar tramos', () => {
	it('un tramo sin cantidad ni fecha antes del final no se vendería nunca', () => {
		const form = formOf(FM);
		form.types[0].tiers[0].quantity = '';
		expect(validateTicketsForm(form).errors.join(' ')).toMatch(
			/tramo 1 no tiene cantidad ni fecha/
		);
	});

	it('precio, cantidad y fecha mal escritos', () => {
		const form = formOf(FM);
		form.types[0].tiers[0].price = 'gratis';
		form.types[0].tiers[1].quantity = '0';
		form.types[0].tiers[1].until = '2026-12-01';
		const errors = validateTicketsForm(form).errors.join(' | ');
		expect(errors).toMatch(/tramo 1 \(«Preventa 1»\): el precio/);
		expect(errors).toMatch(/tramo 2 \(«Preventa 2»\): la cantidad/);
		expect(errors).toMatch(/tramo 2 \(«Preventa 2»\): completá el día y la hora/);
	});

	it('con ventas: no se borra un tramo vendido ni se le baja la cantidad por debajo', () => {
		const sales = { general: { sold: 4, held: 0, tiers: { 'preventa-1': 4 } } };
		const lower = formOf(FM);
		lower.types[0].tiers[0].quantity = '3';
		expect(validateTicketsForm(lower, { sales }).errors.join(' ')).toMatch(
			/ya hay 4 entradas vendidas o reservadas en este tramo/
		);
		const removed = formOf(FM);
		removed.types[0].tiers.shift();
		expect(validateTicketsForm(removed, { sales }).errors.join(' ')).toMatch(
			/no se puede borrar el tramo «preventa-1»/
		);
		// Los ids de los tramos que ya existían no cambian aunque cambie el nombre.
		const renamed = formOf(FM);
		renamed.types[0].tiers[0].name = 'Súper anticipada';
		expect(withTypeIds(renamed.types)[0].tiers[0].id).toBe('preventa-1');
		expect(validateTicketsForm(renamed, { sales }).errors).toEqual([]);
	});

	it('preventas sin tramos: error', () => {
		const form = formOf(FM);
		form.types[0].tiers = [];
		expect(validateTicketsForm(form).errors.join(' ')).toMatch(/al menos un tramo/);
	});
});

describe('validar encadenados', () => {
	it('un círculo es un error', () => {
		const form = formOf(FM);
		form.types[0].after = form.types[1].key;
		expect(validateTicketsForm(form).errors.join(' ')).toMatch(/forman un círculo/);
	});

	it('avisa si el tipo del que depende puede no agotarse ni cerrar nunca', () => {
		const form = formOf(FM);
		form.types[0].mode = 'price';
		form.types[0].price = '10000';
		form.types[0].capacity = '';
		const { errors, warnings } = validateTicketsForm(form);
		expect(errors).toEqual([]);
		expect(warnings.join(' ')).toMatch(/puede que no se habilite nunca/);
		form.types[0].capacity = '30';
		expect(validateTicketsForm(form).warnings).toEqual([]);
	});

	it('un `after` a un tipo que no existe se marca', () => {
		const form = formOf(FM.replace('after: general', 'after: otra'));
		expect(validateTicketsForm(form).errors.join(' ')).toMatch(/ya no existe/);
	});
});

describe('textos de ayuda', () => {
	it('tierPreview explica el orden de los tramos', () => {
		expect(tierPreview(formOf(FM).types[0].tiers)).toBe(
			`Quien compra ve solo el tramo vigente: Preventa 1 (${formatARS(8000)}, las primeras 5) → Preventa 2 (${formatARS(9000)}, hasta el 1/12) → General (${formatARS(10000)}, el resto).`
		);
		expect(tierPreview([])).toBe('');
	});

	it('tiersForMode arranca con «Preventa 1» y «General» (con el precio que tenía)', () => {
		const tiers = tiersForMode({ tiers: [], price: '10000' });
		expect(tiers.map((x) => [x.name, x.price])).toEqual([
			['Preventa 1', ''],
			['General', '10000']
		]);
		const existing = formOf(FM).types[0];
		expect(tiersForMode(existing)).toBe(existing.tiers);
	});

	it('describeTicketsForm resume los tramos y el encadenado', () => {
		expect(describeTicketsForm(formOf(FM), formatARS)).toBe(
			`General: Preventa 1 ${formatARS(8000)} (5) → Preventa 2 ${formatARS(9000)} (hasta 01/12) → General ${formatARS(10000)}, cupo 40 · Última tanda: ${formatARS(12000)}, sin cupo (cuando se agote «General»)`
		);
	});
});

describe('editor: precio en puerta por tipo', () => {
	const tiered = () => ({
		...emptyTicketType({ first: true }),
		mode: /** @type {const} */ ('tiers'),
		tiers: [
			{
				key: 'a',
				origId: null,
				id: 'p1',
				name: 'Preventa 1',
				price: '8000',
				quantity: '5',
				until: ''
			},
			{
				key: 'b',
				origId: null,
				id: 'general',
				name: 'General',
				price: '10.000',
				quantity: '',
				until: ''
			}
		]
	});

	it('vista previa: vacío = el último tramo o el precio fijo; con valor, ese; a la gorra, nada', () => {
		expect(doorPricePreview(tiered())).toBe(
			`En la puerta: ${formatARS(10000)} (el del último tramo).`
		);
		expect(doorPricePreview({ ...emptyTicketType(), price: '7000' })).toBe(
			`En la puerta: ${formatARS(7000)} (el precio fijo).`
		);
		expect(doorPricePreview({ ...tiered(), doorPrice: '12.000' })).toBe(
			`En la puerta: ${formatARS(12000)}.`
		);
		expect(doorPricePreview({ ...emptyTicketType(), mode: 'gorra', doorPrice: '5000' })).toBe('');
	});

	it('lee, valida y escribe `door_price` en cada tipo (y lo saca si se vacía)', () => {
		const fm = `title: Fiesta de prueba
start: 2026-12-12T21:00-03:00
puerta: true
tickets:
  - id: general
    name: General
    price: 10000
    door_price: 12000
  - id: pareja
    name: Pareja
    price: 18000
`;
		const meta = /** @type {any} */ (parseDocument(fm).toJS());
		const initial = readTicketsForm(meta);
		expect(initial.types.map((t) => t.doorPrice)).toEqual(['12000', '']);
		const form = readTicketsForm(meta);
		form.types[0].doorPrice = '';
		form.types[1].doorPrice = '20.000';
		expect(validateTicketsForm(form).errors).toEqual([]);
		const out = /** @type {any} */ (parseDocument(applyTicketsForm(fm, form, initial)).toJS());
		expect(out.tickets[0].door_price).toBeUndefined();
		expect(out.tickets[1].door_price).toBe(20000);
		const config = parseTicketConfig(out);
		expect(config?.types.map((t) => t.door?.price ?? null)).toEqual([null, 20000]);
		// Sin cambios no toca el archivo.
		expect(applyTicketsForm(fm, readTicketsForm(meta), initial)).toBe(fm);
	});

	it('un precio en puerta que no es un monto es un error', () => {
		const form = readTicketsForm(
			/** @type {any} */ ({ tickets: [{ id: 'general', name: 'General', price: 10000 }] })
		);
		form.types[0].doorPrice = 'doce mil';
		expect(validateTicketsForm(form).errors.join(' ')).toContain('precio en puerta');
	});

	it('un precio en puerta de $ 0 no se guarda (la puerta no vende sin cargo)', () => {
		const form = readTicketsForm(
			/** @type {any} */ ({ tickets: [{ id: 'general', name: 'General', price: 10000 }] })
		);
		form.types[0].doorPrice = '0';
		expect(validateTicketsForm(form).errors.join(' ')).toContain(
			'el precio en puerta no puede ser $ 0'
		);
		// Al guardar, el servidor usa la misma validación.
		const file = `---
title: Fiesta de prueba
start: 2026-12-12T21:00-03:00
tickets:
  - id: general
    name: General
    price: 10000
    door_price: 0
---
`;
		expect(ticketsFileErrors(file).join(' ')).toContain('el precio en puerta no puede ser $ 0');
		// Vacío sigue valiendo: se cobra el precio de siempre.
		form.types[0].doorPrice = '';
		expect(validateTicketsForm(form).errors).toEqual([]);
	});
});

describe('aviso: los tramos suman menos que el cupo', () => {
	const TIERED = `title: Fiesta de prueba
start: 2026-12-12T21:00-03:00
tickets:
  - id: general
    name: General
    capacity: 40
    tiers:
      - id: preventa-1
        name: Preventa 1
        price: 8000
        quantity: 10
      - id: preventa-2
        name: Preventa 2
        price: 9000
        quantity: 20
        until: 2026-12-01T23:59-03:00
puerta: true
`;
	/** @param {string[]} warnings */
	const tierWarning = (warnings) => warnings.find((w) => w.includes('los tramos suman'));

	it('avisa cuántas se venden online y qué pasa con el resto (puerta o a mano), sin bloquear', () => {
		const form = formOf(TIERED);
		expect(tiersOnlineMax(form.types[0])).toBe(30);
		const { errors, warnings } = validateTicketsForm(form);
		expect(errors).toEqual([]);
		expect(tierWarning(warnings)).toBe(
			'Entrada 1 («General»): los tramos suman 30 entradas y el cupo es de 40. Online se venden como mucho 30: cuando se terminan los tramos, el tipo figura «Agotado» en la página aunque queden lugares. Las otras 10 solo se venden en la puerta o cargándolas a mano. Si es a propósito (para guardar lugares para la puerta), está bien; si no, subí la cantidad de un tramo o dejá el último sin cantidad.'
		);
		// El servidor arma la misma configuración (no es un error).
		expect(parseTicketConfig(metaOf(TIERED))?.types[0].capacity).toBe(40);
	});

	it('sin puerta (o en un evento online), el resto solo se carga a mano; una sola entrada en singular', () => {
		const noDoor = formOf(TIERED.replace('puerta: true', 'puerta: false'));
		noDoor.types[0].capacity = '31';
		expect(tierWarning(validateTicketsForm(noDoor).warnings)).toContain(
			'La entrada que queda solo se puede cargar a mano (no hay venta en la puerta).'
		);
		const online = formOf(TIERED);
		online.modalidad = 'online';
		expect(tierWarning(validateTicketsForm(online).warnings)).toContain(
			'Las otras 10 solo se pueden cargar a mano (no hay venta en la puerta).'
		);
	});

	it('no avisa: tramos que llegan al cupo, un tramo sin cantidad («el resto»), sin cupo, o precio fijo', () => {
		const exact = formOf(TIERED);
		exact.types[0].capacity = '30';
		expect(tierWarning(validateTicketsForm(exact).warnings)).toBeUndefined();
		const more = formOf(TIERED);
		more.types[0].capacity = '25';
		expect(tierWarning(validateTicketsForm(more).warnings)).toBeUndefined();
		const rest = formOf(TIERED);
		rest.types[0].tiers[1].quantity = '';
		expect(tiersOnlineMax(rest.types[0])).toBeNull();
		expect(tierWarning(validateTicketsForm(rest).warnings)).toBeUndefined();
		const unlimited = formOf(TIERED);
		unlimited.types[0].capacity = '';
		expect(tierWarning(validateTicketsForm(unlimited).warnings)).toBeUndefined();
		const fixed = formOf(FM);
		expect(tiersOnlineMax(fixed.types[1])).toBeNull();
		// El evento de arriba: su último tramo no tiene cantidad.
		expect(tierWarning(validateTicketsForm(fixed).warnings)).toBeUndefined();
	});
});
