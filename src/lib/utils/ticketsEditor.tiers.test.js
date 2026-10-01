/**
 * Editor de eventos, sección Entradas: preventas (tramos) y tipos encadenados.
 */
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { parseTicketConfig } from '$lib/server/tickets/config.js';
import { formatARS } from './money.js';
import {
	applyTicketsForm,
	describeTicketsForm,
	emptyTicketType,
	readTicketsForm,
	tierPreview,
	tiersForMode,
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
