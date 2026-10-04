/**
 * «Meta de venta» en la sección Entradas del editor de eventos: se lee de `meta_venta`, se valida
 * con el resto de la venta y se escribe solo si cambió (sin tocar lo demás). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { parseTicketConfig } from '$lib/server/tickets/config.js';
import { formatARS } from './money.js';
import {
	applyTicketsForm,
	describeTicketsForm,
	formGoal,
	readTicketsForm,
	ticketsFormChanged,
	validateTicketsForm
} from './ticketsEditor.js';

const FM = `title: Encuentro inventado
start: 2031-05-10T20:00-03:00
tickets:
  - id: general # no cambiar
    name: General
    price: 10000
    capacity: 50
puerta: true
`;

/** @param {string} fm */
const metaOf = (fm) => parseDocument(fm).toJS();
/** @param {string} fm */
const formOf = (fm) => readTicketsForm(metaOf(fm));

describe('meta de venta en el formulario de entradas', () => {
	it('sin `meta_venta`: sin meta', () => {
		const f = formOf(FM);
		expect(f.goalKind).toBe('');
		expect(f.goalValue).toBe('');
		expect(formGoal(f)).toBe('');
	});

	it('lee la meta guardada (y la forma de mapa escrita a mano)', () => {
		expect(formOf(`${FM}meta_venta: plata:250000\n`)).toMatchObject({
			goalKind: 'plata',
			goalValue: '250000'
		});
		expect(formOf(`${FM}meta_venta: { entradas: 30 }\n`)).toMatchObject({
			goalKind: 'entradas',
			goalValue: '30'
		});
		// Una meta rota se lee como sin meta (y no frena la venta).
		expect(formOf(`${FM}meta_venta: muchísima\n`).goalKind).toBe('');
		expect(parseTicketConfig(metaOf(`${FM}meta_venta: muchísima\n`))?.goal).toBeNull();
	});

	it('la venta lleva la meta (EventTickets.goal)', () => {
		expect(parseTicketConfig(metaOf(`${FM}meta_venta: entradas:30\n`))?.goal).toEqual({
			kind: 'entradas',
			value: 30
		});
		expect(parseTicketConfig(metaOf(FM))?.goal).toBeNull();
	});

	it('valida el número según la medida', () => {
		const f = formOf(FM);
		f.goalKind = 'plata';
		f.goalValue = '';
		expect(validateTicketsForm(f).errors).toContain(
			'Meta: escribí cuánta plata querés juntar, en pesos enteros (mayor a 0).'
		);
		f.goalValue = '250.000';
		expect(validateTicketsForm(f).errors).toEqual([]);
		f.goalKind = 'entradas';
		f.goalValue = '0';
		expect(validateTicketsForm(f).errors).toContain(
			'Meta: escribí cuántas entradas querés vender (un número entero mayor a 0).'
		);
	});

	it('poner una meta escribe solo `meta_venta` (lo demás queda igual)', () => {
		const initial = formOf(FM);
		const form = formOf(FM);
		form.goalKind = 'plata';
		form.goalValue = '250.000';
		expect(ticketsFormChanged(initial, form)).toBe(true);
		const out = applyTicketsForm(FM, form, initial);
		expect(out).toBe(`${FM}meta_venta: plata:250000\n`);
		expect(metaOf(out).meta_venta).toBe('plata:250000');
	});

	it('cambiar de plata a entradas y sacarla', () => {
		const fm = `${FM}meta_venta: plata:250000\n`;
		const initial = formOf(fm);
		const form = formOf(fm);
		form.goalKind = 'entradas';
		form.goalValue = '30';
		const out = applyTicketsForm(fm, form, initial);
		expect(metaOf(out).meta_venta).toBe('entradas:30');
		expect(out).toContain('  - id: general # no cambiar');

		const none = formOf(fm);
		none.goalKind = '';
		const removed = applyTicketsForm(fm, none, initial);
		expect(removed).toBe(FM);
	});

	it('el mismo número escrito distinto («250.000» y «250000») no cambia el archivo', () => {
		const fm = `${FM}meta_venta: plata:250000\n`;
		const form = formOf(fm);
		form.goalValue = '250.000';
		expect(ticketsFormChanged(formOf(fm), form)).toBe(false);
		expect(applyTicketsForm(fm, form, formOf(fm))).toBe(fm);
	});

	it('con la venta apagada, la meta no se escribe', () => {
		const fm = 'title: Sin venta\nstart: 2031-05-10T20:00-03:00\n';
		const form = formOf(fm);
		form.goalKind = 'entradas';
		form.goalValue = '30';
		expect(ticketsFormChanged(formOf(fm), form)).toBe(false);
		expect(applyTicketsForm(fm, form, formOf(fm))).toBe(fm);
	});

	it('un borrador viejo (sin los campos de la meta) se lee como sin meta', () => {
		const old = /** @type {any} */ ({ ...formOf(FM) });
		delete old.goalKind;
		delete old.goalValue;
		expect(formGoal(old)).toBe('');
		expect(validateTicketsForm(old).errors).toEqual([]);
		expect(ticketsFormChanged(formOf(FM), old)).toBe(false);
	});

	it('el resumen de la revisión dice la meta', () => {
		const form = formOf(`${FM}meta_venta: plata:250000\n`);
		expect(describeTicketsForm(form, formatARS)).toMatch(
			new RegExp(` · Meta: ${formatARS(250000).replace(/[$.]/g, '\\$&')}$`)
		);
		const tickets = formOf(`${FM}meta_venta: entradas:30\n`);
		expect(describeTicketsForm(tickets, formatARS)).toMatch(/ · Meta: 30 entradas$/);
		expect(describeTicketsForm(formOf(FM), formatARS)).not.toMatch(/Meta/);
	});
});
