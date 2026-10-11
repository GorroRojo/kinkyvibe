/**
 * Mensajes › Plantillas: el link de arriba vuelve a Mensajes (su área en el mapa del panel), no a
 * Mensajes › Configuración.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';

describe('/admin/mensajes/plantillas', () => {
	it('sin «← Mensajes» mientras Mensajes no tenga página propia (la Bandeja es «Próximamente»)', () => {
		const body = render(Page, {
			props: { data: /** @type {any} */ ({ dbAvailable: true, templates: [] }) }
		}).body;
		// Antes llevaba a /admin/mensajes, la Bandeja que todavía no existe (gorrite, 11/10).
		expect(body).not.toMatch(/<a class="back[^"]*" href="\/admin\/mensajes">/);
		expect(body).not.toContain('href="/admin/ajustes/mails"');
	});
});
