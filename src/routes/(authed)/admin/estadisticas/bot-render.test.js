/**
 * Estadísticas → Bot de Telegram renderizada con datos inventados: la línea de privacidad, la
 * tabla de personas (con la cuenta vinculada si hay), los totales por semana, el detalle con
 * «otras (menos de 5 veces)» y, en una semana con pocas personas, sin detalle.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { textOf } from '$lib/testing/html.js';
import Bot from './bot/+page.svelte';

/** @param {string} html */
const text = (html) => textOf(html).replace(/\s+/g, ' ').trim();

const tipos = [
	{ id: 'pantalla', label: 'Pantallas', detalle: false },
	{ id: 'busqueda', label: 'Búsquedas en el bot', detalle: true },
	{ id: 'objeto', label: 'Cosas abiertas en el bot', detalle: true }
];

/** @param {any} detail */
const usage = (detail) => ({
	available: true,
	people: [
		{
			name: 'Persona Inventada',
			username: 'inventade',
			account: null,
			admin: null,
			total: 12,
			lastDay: '2031-02-11'
		},
		{
			name: 'Otra',
			username: '',
			account: { label: 'cuenta@example.com', href: '/admin/comunidad/cuentas/x' },
			admin: null,
			total: 3,
			lastDay: '2031-02-10'
		}
	],
	weeks: [
		{
			week: '2031-W07',
			from: '2031-02-10',
			to: '2031-02-16',
			people: 6,
			totals: { pantalla: 40, busqueda: 9 }
		}
	],
	week: '2031-W07',
	tipos,
	detail
});

describe('Estadísticas → Bot de Telegram', () => {
	it('personas, semanas y el detalle con «otras»', () => {
		const { body } = render(Bot, {
			props: {
				data: /** @type {any} */ ({
					period: '30d',
					enabled: true,
					usage: usage({
						hidden: false,
						people: 6,
						plain: { pantalla: [{ clave: 'home', n: 40, title: 'Inicio' }] },
						lists: {
							busqueda: { items: [{ clave: 'cuerdas', n: 6 }], otherN: 3, otherKeys: 2 },
							objeto: {
								items: [
									{
										clave: 'material:cuerdas',
										n: 5,
										title: 'Cuerdas inventadas',
										href: '/material/cuerdas'
									}
								],
								otherN: 0,
								otherKeys: 0
							}
						}
					})
				})
			}
		});
		const t = text(body);
		expect(t).toContain('Lo que buscó o miró cada persona nunca se guarda');
		expect(t).toContain('Persona Inventada @inventade');
		expect(t).toContain('cuenta@example.com');
		expect(t).toContain('10/2 al 16/2');
		expect(t).toContain('Inicio');
		expect(t).toContain('cuerdas');
		expect(t).toContain('Otras (menos de 5 veces cada una, 2 distintas)');
		expect(t).toContain('Cuerdas inventadas');
		expect(t).not.toContain('está apagado');
		expect(body).toContain('href="/admin/estadisticas/bot?periodo=30d&amp;semana=2031-W07"');
	});

	it('una semana con pocas personas: sin detalle; apagado, lo dice', () => {
		const { body } = render(Bot, {
			props: {
				data: /** @type {any} */ ({
					period: '7d',
					enabled: false,
					usage: usage({ hidden: true, people: 2 })
				})
			}
		});
		const t = text(body);
		expect(t).toContain(
			'Esa semana usaron el bot 2 personas: con menos de 5, el detalle no se muestra'
		);
		expect(t).toContain('«Telegram: estadísticas de uso» está apagado');
	});

	it('sin la migración: qué falta', () => {
		const { body } = render(Bot, {
			props: {
				data: /** @type {any} */ ({ period: '30d', enabled: false, usage: { available: false } })
			}
		});
		expect(text(body)).toContain('Falta aplicar la migración 0057');
	});
});
