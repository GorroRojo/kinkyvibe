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

/**
 * Las etiquetas (y los comentarios de Svelte) cambiadas por espacios, repitiendo hasta que no
 * quede ninguna: solo para comparar el texto en las pruebas.
 * @param {string} html
 */
function stripTags(html) {
	let out = html;
	let prev;
	do {
		prev = out;
		out = out.replace(/<[^<>]*>/g, ' ');
	} while (out !== prev);
	return out;
}

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

describe('VenueLocation compacto (la tarjeta del evento)', () => {
	/** El texto visible y los links, para comparar las dos versiones. */
	const facts = (/** @type {string} */ body) => ({
		text: stripTags(body)
			.replace(/Sucede en/g, ' ')
			.replace(/[\s:·]+/g, ' ')
			.trim(),
		hrefs: [...body.matchAll(/href="([^"]*)"/g)].map((m) => m[1])
	});
	// Todos los datos en todos los niveles: el nivel es lo único que decide qué se ve.
	const full = {
		...addressView,
		name: 'Galpón Inventado',
		href: '/amigues/galpon-inventado',
		howTo: 'Tocá el timbre de prueba',
		accessibility: 'Rampa inventada'
	};

	it('en cada nivel muestra exactamente lo mismo que la versión de siempre, sin "Sucede en"', () => {
		for (const level of /** @type {const} */ (['public', 'name', 'address', 'area', 'hidden'])) {
			const view = { ...full, level };
			const big = render(VenueLocation, { props: { view, context: 'event' } }).body;
			const small = render(VenueLocation, {
				props: { view, context: 'event', compact: true }
			}).body;
			expect(facts(small)).toEqual(facts(big));
			expect(small).not.toContain('Sucede en');
			expect(small).toContain('lucide-map-pin');
		}
	});
});

describe('el mapa de OpenStreetMap', () => {
	const pub = { ...addressView, level: 'public', name: 'Galpón Inventado', href: '/x' };

	it('con la dirección a la vista: baldosas perezosas, «Abrir en OpenStreetMap» y el crédito (sin el botón «Cómo llegar»)', () => {
		for (const view of /** @type {import('$lib/utils/venues.js').VenueView[]} */ ([
			addressView,
			pub
		])) {
			const body = html(view);
			expect(body).toMatch(/<img[^>]+src="https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png"/);
			expect(body).not.toMatch(/<img(?![^>]*loading="lazy")[^>]*tile\.openstreetmap/);
			expect(body).toContain(
				'href="https://www.openstreetmap.org/?mlat=-34.600000&amp;mlon=-58.400000#map=17/-34.600000/-58.400000"'
			);
			expect(body).toContain('>Abrir en OpenStreetMap</a>');
			// gorrite (4/10): sin el link de indicaciones de OpenStreetMap.
			expect(body).not.toContain('openstreetmap.org/directions');
			expect(body).not.toContain('>Cómo llegar</a>');
			expect(body).toContain('href="https://www.openstreetmap.org/copyright"');
			expect(stripTags(body)).toMatch(/©\s+colaboradores de OpenStreetMap/);
			// alto reservado desde el principio (no corre nada al cargar), ancho que se adapta
			expect(body).toContain('--map-h: 200px');
			// sin scripts ni iframes de afuera
			expect(body).not.toMatch(/<iframe|<script|leaflet/i);
		}
	});

	it('sin la dirección a la vista no hay mapa ni coordenadas, aunque la vista las traiga', () => {
		// Defensa extra: el servidor ya no las manda en estos niveles (venues.test.js), pero el
		// componente tampoco las usaría.
		for (const view of /** @type {import('$lib/utils/venues.js').VenueView[]} */ ([
			{ ...pub, level: 'name' },
			{ ...pub, level: 'area' },
			{ ...pub, level: 'hidden' }
		])) {
			for (const context of /** @type {const} */ (['event', 'venue'])) {
				const body = html(view, context);
				expect(body).not.toContain('openstreetmap.org');
				expect(body).not.toContain('Cómo llegar</a>');
				expect(body).not.toMatch(/-34\.6|-58\.4/);
			}
		}
	});

	it('con la dirección pero sin el punto cargado: sin mapa', () => {
		const body = html({ ...addressView, lat: undefined, lng: undefined });
		expect(body).not.toContain('openstreetmap.org');
		expect(body).toContain('Calle Inventada 1');
	});
});
