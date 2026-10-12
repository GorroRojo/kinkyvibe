/**
 * «Lista de espera» en la sección Entradas del editor de eventos: se lee de `lista_espera`, se
 * escribe solo si cambió (una que no se entiende queda como está) y, con gente anotada, no deja
 * apagarla, cambiar el alcance ni sacar el tipo (o su cupo) de una lista por tipo. También los
 * formularios de los tiempos (Ajustes y el bloque del editor). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { parseTicketConfig } from '$lib/server/tickets/config.js';
import { ticketsFileErrors } from '$lib/server/tickets/editor.js';
import { formatARS } from './money.js';
import {
	applyTicketsForm,
	describeTicketsForm,
	formWaitlist,
	readTicketsForm,
	ticketsFormChanged,
	validateTicketsForm,
	waitlistLiveErrors
} from './ticketsEditor.js';
import {
	describeTier,
	rowsFromTiers,
	tiersFromRows,
	waitlistSettingsFromForm
} from './waitlistSettingsForm.js';

const FM = `title: Encuentro inventado
start: 2031-05-10T20:00-03:00
tickets:
  - id: general # no cambiar
    name: General
    price: 10000
    capacity: 50
  - id: vip
    name: VIP
    price: 20000
    capacity: 10
puerta: true
`;

/** @param {string} fm */
const metaOf = (fm) => parseDocument(fm).toJS();
/** @param {string} fm */
const formOf = (fm) => readTicketsForm(metaOf(fm));
/** @param {string} fm @param {(f: ReturnType<typeof formOf>) => void} change */
function edit(fm, change) {
	const initial = formOf(fm);
	const form = structuredClone(initial);
	change(form);
	return { initial, form, out: applyTicketsForm(fm, form, initial) };
}

describe('lista de espera en el formulario de entradas', () => {
	it('sin `lista_espera`: sin lista; se lee el atajo y el objeto', () => {
		expect(formOf(FM)).toMatchObject({
			waitlistScope: '',
			waitlistAll: false,
			waitlistCustom: false
		});
		expect(formOf(`${FM}lista_espera: tipo\n`).waitlistScope).toBe('tipo');
		const f = formOf(
			`${FM}lista_espera:\n  alcance: evento\n  todes_a_la_vez: true\n  reservas:\n    - { overHours: 24, holdHours: 3 }\n`
		);
		expect(f).toMatchObject({ waitlistScope: 'evento', waitlistAll: true, waitlistCustom: true });
		expect(tiersFromRows(f.waitlistTiers)).toEqual({
			ok: true,
			tiers: [{ overHours: 24, holdHours: 3 }]
		});
	});

	it('se escribe solo si cambió: el atajo, o el objeto con «todes a la vez» y tiempos propios', () => {
		expect(edit(FM, () => {}).out).toBe(FM);
		const { out } = edit(FM, (f) => (f.waitlistScope = 'evento'));
		expect(out).toContain('lista_espera: evento');
		expect(out).toContain('id: general # no cambiar');
		expect(parseTicketConfig(metaOf(out))?.waitlist).toEqual({
			scope: 'event',
			allAtOnce: false,
			tiers: null
		});

		const full = edit(FM, (f) => {
			f.waitlistScope = 'tipo';
			f.waitlistAll = true;
			f.waitlistCustom = true;
			f.waitlistTiers = [
				{ over: '48', hold: '6' },
				{ over: '', hold: '' }
			];
		}).out;
		expect(parseTicketConfig(metaOf(full))?.waitlist).toEqual({
			scope: 'type',
			allAtOnce: true,
			tiers: [{ overHours: 48, holdHours: 6 }]
		});
		// Y se puede volver a sacar.
		const off = edit(full, (f) => (f.waitlistScope = '')).out;
		expect(off).not.toContain('lista_espera');
	});

	it('una lista que no se entiende queda como está mientras no se toque', () => {
		const broken = `${FM}lista_espera: { alcance: planeta }\n`;
		expect(formOf(broken).waitlistScope).toBe('');
		expect(edit(broken, (f) => (f.types[0].price = '12000')).out).toContain(
			'lista_espera: { alcance: planeta }'
		);
	});

	it('cambiar las filas vacías no cuenta como cambio', () => {
		const initial = formOf(`${FM}lista_espera: evento\n`);
		const form = structuredClone(initial);
		form.waitlistTiers = [...form.waitlistTiers, { over: '', hold: '' }];
		expect(ticketsFormChanged(initial, form)).toBe(false);
		expect(formWaitlist(form)).toBe('evento');
	});

	it('valida los tiempos propios y avisa de los tipos sin cupo', () => {
		const f = formOf(`${FM}lista_espera: evento\n`);
		f.waitlistCustom = true;
		f.waitlistTiers = [{ over: '48', hold: '0' }];
		expect(validateTicketsForm(f).errors.join(' ')).toContain('Revisá los tiempos de reserva');
		f.waitlistTiers = [{ over: '48', hold: '6' }];
		expect(validateTicketsForm(f).errors).toEqual([]);
		f.types[1].capacity = '';
		expect(validateTicketsForm(f).warnings.join(' ')).toContain('con un tipo sin cupo');
	});

	it('el resumen dice qué lista tiene', () => {
		const f = formOf(`${FM}lista_espera: { alcance: tipo, todes_a_la_vez: true }\n`);
		expect(describeTicketsForm(f, formatARS)).toContain(
			'Lista de espera por tipo de entrada (todes a la vez)'
		);
	});
});

describe('con gente anotada, el editor no cambia el alcance', () => {
	it('lista por evento con gente: no se puede apagar ni pasar a por tipo (ni apagar la venta)', () => {
		const f = formOf(`${FM}lista_espera: evento\n`);
		const live = { '': 3 };
		expect(validateTicketsForm(f, { waitlistLive: live }).errors).toEqual([]);
		f.waitlistScope = 'tipo';
		expect(validateTicketsForm(f, { waitlistLive: live }).errors).toEqual([
			'Hay 3 personas en la lista de espera del evento: para apagarla o cambiarla a «por tipo de entrada», cerrá la lista primero (pestaña «Lista de espera» de la ficha).'
		]);
		f.waitlistScope = '';
		expect(validateTicketsForm(f, { waitlistLive: live }).errors).toHaveLength(1);
		f.waitlistScope = 'evento';
		f.enabled = false;
		expect(validateTicketsForm(f, { waitlistLive: live }).errors).toHaveLength(1);
	});

	it('lista por tipo con gente: el tipo no se borra ni queda sin cupo, el alcance no cambia', () => {
		const f = formOf(`${FM}lista_espera: tipo\n`);
		const live = { vip: 1 };
		expect(waitlistLiveErrors(f, live)).toEqual([]);
		f.types[1].capacity = '';
		expect(waitlistLiveErrors(f, live)).toEqual([
			'«VIP» tiene una persona en su lista de espera: no puede quedar sin cupo; cerrá la lista primero (pestaña «Lista de espera» de la ficha).'
		]);
		f.types = [f.types[0]];
		expect(waitlistLiveErrors(f, live)[0]).toContain('No se puede borrar el tipo «vip»');
		const g = formOf(`${FM}lista_espera: tipo\n`);
		g.waitlistScope = 'evento';
		expect(waitlistLiveErrors(g, live)[0]).toContain(
			'Hay una persona en la lista de espera de «VIP»'
		);
		// Sin gente, todo vale.
		expect(waitlistLiveErrors(g, { vip: 0 })).toEqual([]);
		expect(waitlistLiveErrors(g, undefined)).toEqual([]);
	});

	it('al guardar (ticketsFileErrors): un archivo que cambia el alcance con gente anotada no pasa', () => {
		const saved = `---\n${FM}lista_espera: evento\n---\nTexto.\n`;
		expect(ticketsFileErrors(saved, { waitlistLive: { '': 2 } })).toEqual([]);
		const changed = `---\n${FM}lista_espera: tipo\n---\nTexto.\n`;
		expect(ticketsFileErrors(changed, { waitlistLive: { '': 2 } })[0]).toMatch(
			/^Entradas: Hay 2 personas en la lista de espera del evento/
		);
		expect(ticketsFileErrors(changed, { waitlistLive: null })).toEqual([]);
	});
});

describe('los formularios de los tiempos', () => {
	it('tramos de las filas: ignora las vacías, ordena y rechaza lo raro', () => {
		expect(
			tiersFromRows([
				{ over: '6', hold: '2' },
				{ over: '', hold: '' },
				{ over: '168', hold: '24' }
			])
		).toEqual({
			ok: true,
			tiers: [
				{ overHours: 168, holdHours: 24 },
				{ overHours: 6, holdHours: 2 }
			]
		});
		expect(tiersFromRows([{ over: '', hold: '' }]).ok).toBe(false);
		expect(tiersFromRows([{ over: '6', hold: '1.5' }]).ok).toBe(false);
		expect(tiersFromRows([{ over: '6', hold: '200' }]).ok).toBe(false);
		expect(
			tiersFromRows([
				{ over: '6', hold: '2' },
				{ over: '6', hold: '3' }
			]).ok
		).toBe(false);
		expect(rowsFromTiers([{ overHours: 24, holdHours: 3 }])).toEqual([
			{ over: '24', hold: '3' },
			{ over: '', hold: '' }
		]);
		expect(describeTier({ overHours: 168, holdHours: 24 })).toBe(
			'Si faltan 7 días o más: se guarda 24 h'
		);
	});

	it('Ajustes: el JSON, vacío si son los de por defecto', () => {
		const base = {
			mode: 'one',
			broadcast_under: '6',
			end_before: '30',
			tier_over_0: '168',
			tier_hold_0: '24',
			tier_over_1: '48',
			tier_hold_1: '12',
			tier_over_2: '6',
			tier_hold_2: '2'
		};
		expect(waitlistSettingsFromForm(base)).toEqual({ ok: true, json: '' });
		expect(waitlistSettingsFromForm({ ...base, defaults: '1', mode: 'all' })).toEqual({
			ok: true,
			json: ''
		});
		const r = waitlistSettingsFromForm({ ...base, end_before: '60' });
		expect(r.ok && JSON.parse(r.json).endBeforeStartMinutes).toBe(60);
		expect(waitlistSettingsFromForm({ ...base, broadcast_under: '-1' }).ok).toBe(false);
		expect(waitlistSettingsFromForm({ ...base, end_before: '9999' }).ok).toBe(false);
	});
});
