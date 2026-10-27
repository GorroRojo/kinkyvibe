/**
 * La pantalla del modo puerta en sus dos entradas: el panel (con los links al panel y «ver el DNI
 * completo») y la puerta con link (`doorLink`: nada del panel). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render } from 'svelte/server';
import DoorScreen from './DoorScreen.svelte';

/** @param {Record<string, unknown>} extra */
const data = (extra) => ({
	bare: true,
	slug: 'fiesta-inventada',
	title: 'Fiesta inventada',
	start: '2099-12-01T20:00-03:00',
	doorBase: '/admin/eventos/fiesta-inventada/ingreso',
	doorLink: null,
	part: null,
	series: '',
	autoOpened: false,
	login: 'admin-de-prueba',
	counts: { inside: 0, total: 0, byType: {} },
	waitlist: null,
	fondoEnabled: false,
	fondoPercent: 0,
	noteMax: 300,
	doorSales: false,
	doorPrice: '',
	maxOrder: 100,
	maxPerSale: 10,
	types: [],
	...extra
});

/** @param {Record<string, unknown>} extra */
const html = (extra) =>
	render(DoorScreen, { props: /** @type {any} */ ({ data: data(extra), form: null }) }).body;

describe('DoorScreen', () => {
	it('en el panel: volver a la ficha, órdenes, cargar a mano y otro evento', () => {
		const out = html({});
		expect(out).toContain('href="/admin/eventos/fiesta-inventada"');
		expect(out).toContain('/admin/eventos/fiesta-inventada/ordenes');
		expect(out).toContain('Cargar entradas a mano');
		expect(out).toContain('Vender igual (pasa un límite)');
		expect(out).not.toContain('Cerrar la puerta en este celu');
	});

	it('con un link de puerta: ningún link al panel, sin pasar límites y con su vencimiento', () => {
		const out = html({
			doorBase: '/puerta/fiesta-inventada',
			doorLink: { label: 'voluntarie 1', expiresAt: Date.parse('2099-12-02T05:59:59-03:00') },
			login: 'puerta: voluntarie 1'
		});
		expect(out).not.toMatch(/href="\/admin/);
		expect(out).not.toContain('Cargar entradas a mano');
		expect(out).not.toContain('Vender igual (pasa un límite)');
		expect(out).toContain('que lo haga une admin');
		expect(out).toContain('Link de puerta «voluntarie 1»');
		expect(out).toContain('Cerrar la puerta en este celu');
		// La guía, en su versión para el link.
		expect(out).toContain('no lo reenvíes');
	});

	it('la puerta con link nunca borra lo guardado de la puerta del panel (kv-door:)', () => {
		for (const f of [
			'src/lib/components/admin/door/DoorScreen.svelte',
			'src/routes/puerta/+page.svelte'
		]) {
			const src = fs.readFileSync(path.resolve(f), 'utf8');
			expect(src, f).not.toMatch(/removeItem\([^)]*kv-door/);
			expect(src, f).not.toMatch(/startsWith\('kv-door/);
		}
	});
});
