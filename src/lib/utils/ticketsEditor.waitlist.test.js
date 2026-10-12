/**
 * «Lista de espera» en la sección Entradas del editor de eventos: se lee de `lista_espera`, se
 * escribe solo si cambió (una que no se entiende queda como está) y, con gente anotada, no deja
 * apagarla, cambiar el alcance ni sacar el tipo (o su cupo) de una lista por tipo. Los tiempos de
 * reserva no se eligen por evento ni en el panel (gorrite, 12/10: son fijos, en el código). Datos
 * inventados.
 */
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { parseTicketConfig } from '$lib/server/tickets/config.js';
import { ticketsFileErrors } from '$lib/server/tickets/editor.js';
import { formatARS } from './money.js';
import {
	applyTicketsForm,
	describeTicketsForm,
	markdownWithoutWaitlist,
	readTicketsForm,
	validateTicketsForm,
	waitlistLiveErrors
} from './ticketsEditor.js';

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
	it('sin `lista_espera`: sin lista; se lee el atajo y el objeto (sin tiempos propios)', () => {
		expect(formOf(FM)).toMatchObject({ waitlistScope: '', waitlistAll: false });
		expect(formOf(`${FM}lista_espera: tipo\n`).waitlistScope).toBe('tipo');
		const f = formOf(
			`${FM}lista_espera:\n  alcance: evento\n  todes_a_la_vez: true\n  reservas:\n    - { overHours: 24, holdHours: 3 }\n`
		);
		expect(f).toMatchObject({ waitlistScope: 'evento', waitlistAll: true });
		// Los tiempos propios de antes no llegan al formulario: valen los de Ajustes.
		expect(
			Object.keys(f)
				.filter((k) => k.startsWith('waitlist'))
				.sort()
		).toEqual(['waitlistAll', 'waitlistScope']);
	});

	it('se escribe solo si cambió: el atajo, o el objeto con «todes a la vez»', () => {
		expect(edit(FM, () => {}).out).toBe(FM);
		const { out } = edit(FM, (f) => (f.waitlistScope = 'evento'));
		expect(out).toContain('lista_espera: evento');
		expect(out).toContain('id: general # no cambiar');
		expect(parseTicketConfig(metaOf(out))?.waitlist).toEqual({
			scope: 'event',
			allAtOnce: false
		});

		const full = edit(FM, (f) => {
			f.waitlistScope = 'tipo';
			f.waitlistAll = true;
		}).out;
		expect(full).toContain('lista_espera:\n  alcance: tipo\n  todes_a_la_vez: true\n');
		expect(parseTicketConfig(metaOf(full))?.waitlist).toEqual({
			scope: 'type',
			allAtOnce: true
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

	it('unos tiempos propios de antes: quedan en el archivo mientras no se toque la lista', () => {
		const old = `${FM}lista_espera:\n  alcance: evento\n  reservas:\n    - { overHours: 24, holdHours: 3 }\n`;
		expect(edit(old, (f) => (f.types[0].price = '12000')).out).toContain('overHours: 24');
		// Si se cambia la lista, se escribe sin ellos.
		const changed = edit(old, (f) => (f.waitlistAll = true)).out;
		expect(changed).toContain('lista_espera:\n  alcance: evento\n  todes_a_la_vez: true\n');
		expect(changed).not.toContain('reservas');
	});

	it('avisa de los tipos sin cupo', () => {
		const f = formOf(`${FM}lista_espera: evento\n`);
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
			'Hay 3 personas en la lista de espera del evento: para apagarla o cambiarla a «por tipo de entrada», cerrá la lista primero (Ventas › Lista de espera, en la ficha).'
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
			'«VIP» tiene una persona en su lista de espera: no puede quedar sin cupo; cerrá la lista primero (Ventas › Lista de espera, en la ficha).'
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

describe('«Cerrar la lista» la apaga: markdownWithoutWaitlist', () => {
	it('saca solo `lista_espera` (con sus comentarios, el resto y el texto igual)', () => {
		const raw = `---\ntitle: Encuentro inventado # no tocar\nlista_espera:\n  alcance: tipo\n  todes_a_la_vez: true\ntickets:\n  - id: general\n    price: 10000\n---\nTexto del evento.\n`;
		expect(markdownWithoutWaitlist(raw)).toBe(
			`---\ntitle: Encuentro inventado # no tocar\ntickets:\n  - id: general\n    price: 10000\n---\nTexto del evento.\n`
		);
		expect(markdownWithoutWaitlist(`---\ntitle: X\nlista_espera: evento\n---\n`)).toBe(
			`---\ntitle: X\n---\n`
		);
	});

	it('mantiene el fin de línea del archivo y da null si no tenía lista', () => {
		expect(
			markdownWithoutWaitlist('---\r\ntitle: X\r\nlista_espera: tipo\r\n---\r\nHola\r\n')
		).toBe('---\r\ntitle: X\r\n---\r\nHola\r\n');
		expect(markdownWithoutWaitlist('---\ntitle: X\n---\nHola\n')).toBeNull();
	});
});
