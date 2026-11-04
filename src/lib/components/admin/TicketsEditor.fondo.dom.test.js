// @vitest-environment jsdom
/**
 * «Entradas» del editor de eventos con el Fondo: debajo de cada precio (fijo, de cada tramo y en
 * puerta) cuánto sale con el Fondo, que cambia mientras se escribe; el resumen de los tramos con
 * el aviso de que el porcentaje puede cambiar, y «Copiar precios» (con el texto a la vista si el
 * portapapeles no anda). Sin la etiqueta KinkyVibe o con 0 %, nada. Precios inventados.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/svelte';
import TicketsEditor from './TicketsEditor.svelte';
import { readTicketsForm } from '$lib/utils/ticketsEditor.js';
import { formatARS } from '$lib/utils/money.js';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const meta = {
	tickets: [
		{
			id: 'general',
			name: 'General',
			door_price: 20000,
			tiers: [
				{ id: 'preventa-1', name: 'Preventa 1', price: 14000, until: '2026-11-07T23:59-03:00' },
				{ id: 'general', name: 'General', price: 18000 }
			]
		},
		{ id: 'amigue', name: 'Amigue', price: 10000 }
	]
};

/** Texto visible con los espacios normalizados (formatARS usa un espacio duro). */
const norm = (/** @type {string | null | undefined} */ s) => (s ?? '').replace(/\s+/g, ' ').trim();
const ars = (/** @type {number} */ n) => norm(formatARS(n));
/** @param {string} id */
const byId = (id) => document.getElementById(id);

/** @param {Record<string, unknown>} [props] */
const setup = (props = {}) =>
	render(TicketsEditor, {
		props: {
			state: readTicketsForm(meta),
			tags: ['KinkyVibe'],
			fondoPercent: 20,
			idPrefix: 'edit',
			...props
		}
	});

describe('TicketsEditor: precios con el Fondo', () => {
	it('debajo de cada precio, cuánto sale con el Fondo; el resumen lo dice y avisa que puede cambiar', () => {
		setup();
		expect(norm(byId('edit-tier-0-price-fondo-0')?.textContent)).toBe(
			`Con el Fondo (20 %): ${ars(11200)}`
		);
		expect(norm(byId('edit-tier-0-price-fondo-1')?.textContent)).toBe(
			`Con el Fondo (20 %): ${ars(14400)}`
		);
		expect(norm(byId('edit-ticket-door-fondo-0')?.textContent)).toBe(
			`Con el Fondo (20 %): ${ars(16000)}`
		);
		expect(norm(byId('edit-ticket-price-fondo-1')?.textContent)).toBe(
			`Con el Fondo (20 %): ${ars(8000)}`
		);
		const preview = norm(byId('edit-tier-0-preview')?.textContent);
		expect(preview).toContain(
			`Preventa 1 (${ars(14000)}; con el Fondo ${ars(11200)}, hasta el 7/11)`
		);
		expect(preview).toContain('El descuento del Fondo hoy es 20 %: puede cambiar.');
	});

	it('cambia mientras se escribe el precio', async () => {
		setup();
		const input = /** @type {HTMLInputElement} */ (byId('edit-tier-0-price-0'));
		await fireEvent.input(input, { target: { value: '15000' } });
		expect(norm(byId('edit-tier-0-price-fondo-0')?.textContent)).toBe(
			`Con el Fondo (20 %): ${ars(12000)}`
		);
		expect(norm(byId('edit-tier-0-preview')?.textContent)).toContain(
			`Preventa 1 (${ars(15000)}; con el Fondo ${ars(12000)}`
		);
		await fireEvent.input(input, { target: { value: '' } });
		expect(byId('edit-tier-0-price-fondo-0')).toBeNull();
	});

	it('sin la etiqueta KinkyVibe, con 0 % o sin porcentaje: nada del Fondo', () => {
		for (const props of [{ tags: [] }, { fondoPercent: 0 }, { fondoPercent: null }]) {
			setup(props);
			expect(document.querySelector('.t-fondo, .fondo-price')).toBeNull();
			expect(norm(byId('edit-tier-0-preview')?.textContent)).not.toContain('Fondo');
			// «Copiar precios» sigue estando (sin la parte del Fondo).
			expect(byId('edit-tier-0-copy')).toBeTruthy();
			cleanup();
		}
	});

	it('«Copiar precios» copia una línea por tramo y la de la puerta, y dice «Copiado»', async () => {
		const writeText = vi.fn(async () => {});
		Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
		setup();
		const button = /** @type {HTMLButtonElement} */ (byId('edit-tier-0-copy'));
		expect(norm(button.textContent)).toBe('Copiar precios');
		await fireEvent.click(button);
		await vi.waitFor(() => expect(norm(button.textContent)).toBe('Copiado'));
		expect(writeText).toHaveBeenCalledWith(
			[
				`Preventa 1: ${formatARS(14000)} (${formatARS(11200)} con el Fondo) hasta el 7/11`,
				`General: ${formatARS(18000)} (${formatARS(14400)} con el Fondo)`,
				`En la puerta: ${formatARS(20000)} (${formatARS(16000)} con el Fondo)`
			].join('\n')
		);
		expect(byId('edit-tier-0-copy-text')).toBeNull();
	});

	it('si el portapapeles no anda, deja el texto a la vista y seleccionado', async () => {
		const writeText = vi.fn(async () => {
			throw new Error('sin permiso');
		});
		Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
		setup();
		await fireEvent.click(/** @type {HTMLElement} */ (byId('edit-tier-0-copy')));
		const box = /** @type {HTMLTextAreaElement} */ (
			await vi.waitFor(() => {
				const el = byId('edit-tier-0-copy-text');
				if (!el) throw new Error('todavía no');
				return el;
			})
		);
		expect(box.value.split('\n')[0]).toBe(
			`Preventa 1: ${formatARS(14000)} (${formatARS(11200)} con el Fondo) hasta el 7/11`
		);
		expect(document.activeElement).toBe(box);
		const label = /** @type {HTMLElement} */ (box.closest('label'));
		expect(
			within(label).getByText('No se pudo copiar: seleccioná el texto y copialo.')
		).toBeTruthy();
	});
});
