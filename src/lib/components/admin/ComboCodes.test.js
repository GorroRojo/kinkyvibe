/**
 * La tarjeta «Combo con otro evento» de la pestaña Códigos (interruptor `combo_codigos`), render
 * del servidor: el formulario (evento, tipo, valor, vencimiento), los combos con sus números, el
 * resultado de guardar y que la pestaña solo la muestra con el interruptor prendido. Datos
 * inventados.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';

vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/admin/eventos/taller-de-prueba/codigos') })
}));

const { default: ComboCodes } = await import('./ComboCodes.svelte');
const { default: CodesPage } =
	await import('../../../routes/(authed)/admin/eventos/[slug]/codigos/+page.svelte');

const TARGETS = [
	{ slug: 'fiesta-de-prueba', title: 'Fiesta de prueba' },
	{ slug: 'otra-fiesta-de-prueba', title: 'Otra fiesta de prueba' }
];
/** @type {import('$lib/server/tickets/combos.js').ComboRow} */
const COMBO = {
	target_slug: 'fiesta-de-prueba',
	target_title: 'Fiesta de prueba',
	discount: '25 % de descuento',
	ends_at: null,
	active: true,
	issued: 4,
	used: 1,
	held: 1,
	revoked: 2
};

/** @param {Record<string, any>} props */
const html = (props) => render(ComboCodes, { props: /** @type {any} */ (props) }).body;

describe('ComboCodes', () => {
	it('sin combos: explica qué hace y muestra el formulario con los eventos para elegir', () => {
		const out = html({ eventTitle: 'Taller de prueba', combos: [], targets: TARGETS });
		expect(out).toContain('Combo con otro evento');
		expect(out).toContain('Taller de prueba');
		const text = out.replace(/\s+/g, ' ');
		expect(text).toContain('de un solo uso y solo para su email');
		expect(text).toContain('(online, en la puerta o cargada a mano)');
		expect(text).toContain('Una venta sin email no genera código.');
		expect(out).toMatch(/<form[^>]*action="\?\/comboSave"/);
		expect(out).toMatch(/<select[^>]*name="target_slug"/);
		expect(out).toContain('<option value="fiesta-de-prueba">Fiesta de prueba</option>');
		expect(out).toContain('<option value="otra-fiesta-de-prueba">Otra fiesta de prueba</option>');
		expect(out).toMatch(/name="kind" value="percent"/);
		expect(out).toMatch(/name="kind" value="fixed"/);
		expect(out).toMatch(/name="value"/);
		expect(out).toMatch(/name="ends_at" type="datetime-local"/);
		expect(out).toContain('Vacío: hasta que cierre la venta de ese evento.');
		expect(out).toContain('Guardar combo');
		expect(out).not.toContain('comboToggle');
	});

	it('con un combo: el evento, el descuento, los números y Apagar', () => {
		const out = html({ eventTitle: 'Taller de prueba', combos: [COMBO], targets: TARGETS });
		expect(out).toContain('25 % de descuento');
		expect(out).toContain('Hasta que cierre su venta');
		expect(out).toContain('4');
		expect(out).toContain('códigos generados');
		expect(out).toContain('(+1 en reserva)');
		expect(out).toContain('2 anulados por reembolso');
		expect(out).toContain('Prendido');
		expect(out).toMatch(/<form[^>]*action="\?\/comboToggle"/);
		expect(out).toMatch(/name="active" value="0"/);
		expect(out).toContain('Apagar');
	});

	it('con errores de la action: los muestra y conserva lo que se escribió', () => {
		const out = html({
			eventTitle: 'Taller de prueba',
			combos: [],
			targets: TARGETS,
			result: {
				error: 'Revisá los datos marcados.',
				errors: { value: 'Un monto entero en pesos, mayor a 0.' },
				values: { target_slug: 'fiesta-de-prueba', kind: 'fixed', value: '0' }
			}
		});
		expect(out).toContain('Revisá los datos marcados.');
		expect(out).toContain('Un monto entero en pesos, mayor a 0.');
		expect(out).toContain('Monto a descontar ($)');
	});

	it('sin otros eventos a la venta: no ofrece el formulario', () => {
		const out = html({ eventTitle: 'Taller de prueba', combos: [], targets: [] });
		expect(out).toContain('No hay otros eventos con la venta abierta');
		expect(out).not.toContain('Guardar combo');
	});
});

describe('pestaña Códigos', () => {
	/** @param {Record<string, any>} extra */
	const page = (extra) =>
		render(CodesPage, {
			props: /** @type {any} */ ({
				data: {
					event: { slug: 'taller-de-prueba', title: 'Taller de prueba' },
					codes: [],
					global: [],
					comboTargets: TARGETS,
					dbAvailable: true,
					now: Date.parse('2026-10-12T12:00:00Z'),
					...extra
				},
				form: null
			})
		}).body;

	it('con el interruptor apagado (combos null) no muestra la tarjeta', () => {
		expect(page({ combos: null })).not.toContain('Combo con otro evento');
	});

	it('con el interruptor prendido, la muestra', () => {
		expect(page({ combos: [] })).toContain('Combo con otro evento');
	});
});
