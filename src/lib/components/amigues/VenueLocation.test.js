/**
 * La ubicación de un lugar en la página de un evento y en la del lugar, en especial el nivel
 * «Sólo dirección»: la dirección y el mapa (decisión de gorrite), sin el nombre ni el link, y sin
 * el aviso de que la dirección llega con la entrada (ya se ve).
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import VenueLocation from './VenueLocation.svelte';
import { ADDRESS_FOR_BUYERS } from '$lib/utils/venues.js';

/** @type {import('$lib/utils/venues.js').VenueView} */
const addressView = {
	level: 'address',
	address: 'Calle Inventada 1',
	area: 'Barrio Inventado',
	city: 'Ciudad de Prueba',
	lat: -34.6,
	lng: -58.4
};

/** @param {import('$lib/utils/venues.js').VenueView} view @param {'event' | 'venue'} [context] */
const html = (view, context = 'event') => render(VenueLocation, { props: { view, context } }).body;

describe('VenueLocation', () => {
	it('«Sólo dirección» en el evento: la dirección, el barrio y el mapa, sin link ni aviso', () => {
		const body = html(addressView);
		expect(body).toContain('Sucede en');
		expect(body).toContain('Calle Inventada 1');
		expect(body).toContain('(Barrio Inventado, Ciudad de Prueba)');
		expect(body).toContain('openstreetmap.org');
		expect(body).toContain('aria-label="Mapa: Calle Inventada 1"');
		expect(body).not.toContain('<a href="/amigues');
		expect(body).not.toContain(ADDRESS_FOR_BUYERS);
	});

	it('«Sólo dirección» sin dirección ni barrio: "Lugar a confirmar" (como "Nombre + dirección")', () => {
		const body = html({ level: 'address' });
		expect(body).toContain('Lugar a confirmar');
		expect(body).not.toContain('openstreetmap.org');
	});

	it('los otros niveles siguen igual: el mapa solo con la dirección a la vista', () => {
		const pub = html({ ...addressView, level: 'public', name: 'Galpón Inventado', href: '/x' });
		expect(pub).toContain('Galpón Inventado');
		expect(pub).toContain('openstreetmap.org');
		expect(pub).not.toContain(ADDRESS_FOR_BUYERS);
		const name = html({ level: 'name', name: 'Galpón Inventado', href: '/x' });
		expect(name).not.toContain('openstreetmap.org');
		expect(name).toContain(ADDRESS_FOR_BUYERS);
	});

	it('"Ver en Google Maps" solo donde se ve la dirección, y sin el nombre en «Sólo dirección»', () => {
		const G = 'https://www.google.com/maps/search/?api=1&amp;query=';
		const point = html(addressView);
		expect(point).toContain(`href="${G}-34.6%2C-58.4"`);
		expect(point).toContain('>Ver en Google Maps</a>');
		const noPoint = { ...addressView, lat: undefined, lng: undefined };
		const street = html(noPoint);
		expect(street).toContain(
			`href="${G}Calle%20Inventada%201%2C%20Barrio%20Inventado%2C%20Ciudad%20de%20Prueba"`
		);
		const pub = html({ ...noPoint, level: 'public', name: 'Galpón Inventado', href: '/x' });
		expect(pub).toContain(`href="${G}Galp%C3%B3n%20Inventado%2C%20Calle%20Inventada%201`);
		// en la página del lugar, con "Nombre + dirección", también
		expect(
			html({ ...addressView, level: 'public', name: 'Galpón Inventado', href: '/x' }, 'venue')
		).toContain('Ver en Google Maps');
		for (const view of /** @type {import('$lib/utils/venues.js').VenueView[]} */ ([
			{ level: 'name', name: 'Galpón Inventado', href: '/x' },
			{ level: 'area', area: 'Barrio Inventado', city: 'Ciudad de Prueba' },
			{ level: 'hidden' }
		])) {
			expect(html(view)).not.toContain('Google Maps');
			expect(html(view, 'venue')).not.toContain('Google Maps');
		}
	});
});
