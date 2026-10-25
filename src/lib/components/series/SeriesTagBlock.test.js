/**
 * Lo de series y «Seguir» en la página de una etiqueta, render del servidor: con lo que trae la
 * carga de la página (`info`), el bloque y el botón ya salen en el HTML (no llegan después y la
 * página no se mueve); con `null` (no hay nada / «Lo que sigo» apagado), nada. Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SeriesTagBlock from './SeriesTagBlock.svelte';
import FollowButton from '../FollowButton.svelte';

const edition = {
	slug: 'picantearla-3',
	title: 'Picantearla #3',
	start: '2099-12-01T20:00-03:00',
	status: 'abierto',
	path: '/calendario/picantearla-3',
	number: 3
};

/** @param {Record<string, unknown>} account */
const seriesInfo = (account = {}) => ({
	series: { id: 'Picantearla', name: 'Picantearla', total: 1, upcoming: [edition], past: [] },
	feed: '/wiki/Picantearla/calendario.ics',
	account: { member: false, subscribed: false, sigo: true, invite: true, ...account }
});

describe('SeriesTagBlock con lo que trae la página', () => {
	it('sale en el HTML del servidor: ediciones, aviso, calendario con link absoluto e invitación', () => {
		const h = render(SeriesTagBlock, {
			props: {
				tag: 'Picantearla',
				info: seriesInfo(),
				path: '/wiki/Picantearla',
				origin: 'https://kinkyvibe.example'
			}
		}).body;
		expect(h).toContain('aria-label="Ediciones de Picantearla"');
		expect(h).toContain('Próximas ediciones');
		expect(h).toContain('href="/calendario/picantearla-3"');
		expect(h).toContain('Avisame de las próximas ediciones');
		expect(h).toContain('webcal://kinkyvibe.example/wiki/Picantearla/calendario.ics');
		expect(h).toContain('href="/ingresar?next=%2Fwiki%2FPicantearla"');
	});

	it('con `null` (sin nada de series) o sin pasar (se pide en el navegador): nada en el HTML', () => {
		for (const info of [null, undefined]) {
			const h = render(SeriesTagBlock, { props: { tag: 'Picantearla', info } }).body;
			expect(h).not.toContain('series-block');
		}
	});
});

describe('FollowButton con lo que trae la página', () => {
	it('sin sesión: «Seguir» lleva a /ingresar y vuelve a la página', () => {
		const h = render(FollowButton, {
			props: {
				kind: 'etiqueta',
				key: 'Picantearla',
				name: 'Picantearla',
				info: { member: false },
				path: '/wiki/Picantearla'
			}
		}).body;
		expect(h).toContain('href="/ingresar?next=%2Fwiki%2FPicantearla"');
		expect(h).toContain('Entrá con tu cuenta para seguir Picantearla.');
	});

	it('con sesión: el formulario, ya con si lo sigue', () => {
		const info = { member: true, kind: 'perfil', key: '7', following: true };
		const h = render(FollowButton, {
			props: { kind: 'perfil', key: '7', info, path: '/amigues/persona-inventada' }
		}).body;
		expect(h).toContain('action="/mi-rincon/sigo?/dejar"');
		expect(h).toContain('Dejar de seguir');
		expect(h).toMatch(/name="volver"[^>]*value="\/amigues\/persona-inventada"/);
	});

	it('con `null` («Lo que sigo» apagado o nada que seguir): nada', () => {
		const h = render(FollowButton, { props: { kind: 'etiqueta', key: 'x', info: null } }).body;
		expect(h).not.toContain('class="follow');
	});
});
