/**
 * Mi rincón → un lugar: «Buscar en el mapa» (VenueGeocoder, compartido con el panel) está al lado
 * de la dirección, busca en `/mi-rincon/geocodificar` y la explicación de las coordenadas ya no
 * manda a copiar números de openstreetmap.org. En un perfil que no es lugar no aparece. Render del
 * servidor, datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

const { default: Page } = await import('./[slug]/+page.svelte');
const { default: VenueCoordinates } =
	await import('$lib/components/amigues/VenueCoordinates.svelte');

/** @param {'lugar' | 'persona'} kind */
function page(kind) {
	return render(Page, {
		props: /** @type {any} */ ({
			data: {
				profile: {
					slug: 'lugar-inventado',
					title: 'Lugar Inventado',
					kind,
					visibility: 'public',
					version: 1,
					bio: '',
					pronouns: '',
					links: '',
					show_members: false,
					venue:
						kind === 'lugar'
							? {
									address: 'Calle Inventada 123',
									area: 'Barrio Falso',
									city: 'CABA',
									accessibility: '',
									how_to_get_there: '',
									venue_privacy: '',
									lat: '-34.6',
									lng: '-58.4'
								}
							: null
				},
				avatar: null,
				pending: false,
				rejection: null,
				role: 'owner',
				isNew: false,
				managers: [],
				invites: [],
				members: [],
				pendingMembers: [],
				memberships: [],
				organizes: []
			},
			form: null
		})
	}).body;
}

describe('Mi rincón: «Buscar en el mapa» en el formulario del lugar', () => {
	it('un lugar tiene el botón, al lado de la dirección y antes de las coordenadas', () => {
		const html = page('lugar');
		expect(html).toContain('Buscar en el mapa');
		expect(html).toMatch(/<button[^>]*class="pill-btn ghost[^"]*"[^>]*>\s*Buscar en el mapa/);
		const address = html.indexOf('name="address"');
		const button = html.indexOf('Buscar en el mapa');
		const lat = html.indexOf('name="lat"');
		expect(address).toBeGreaterThan(-1);
		expect(button).toBeGreaterThan(address);
		expect(lat).toBeGreaterThan(button);
		// Lo guardado sigue en los campos (enlazados para que el botón los lea y los complete).
		expect(html).toContain('value="Calle Inventada 123"');
		expect(html).toContain('value="-34.6"');
		expect(html).toContain('value="-58.4"');
	});

	it('la explicación habla del botón, no de copiar números de openstreetmap.org', () => {
		const html = page('lugar');
		expect(html).toContain('Con «Buscar en el mapa» se completan solos');
		expect(html).not.toContain('copiá los dos números');
	});

	it('un perfil de persona no tiene el botón', () => {
		const html = page('persona');
		expect(html).not.toContain('Buscar en el mapa');
		expect(html).not.toContain('name="lat"');
	});

	it('sin botón al lado, VenueCoordinates sigue explicando cómo sacar los números a mano', () => {
		const html = render(VenueCoordinates, { props: { lat: '', lng: '' } }).body;
		expect(html).toContain('copiá los dos números');
		expect(html).not.toContain('Buscar en el mapa');
	});
});
