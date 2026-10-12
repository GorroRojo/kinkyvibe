/**
 * Mensajes › Configuración (antes Ajustes › Mails): vuelve a Mensajes y las plantillas son un link
 * a Mensajes › Plantillas, no otra tarjeta para lo mismo.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';

const data = {
	dbAvailable: true,
	settings: {},
	reminders: [],
	remindersDefault: true,
	defaultReminders: ['2 días antes', 'el mismo día a las 9:00'],
	maxReminders: 5,
	cronConfigured: true,
	batch: { default: 40, min: 5, max: 200 },
	emailDefaults: { from: 'Ejemplo <entradas@example.com>', replyTo: 'entradas@example.com' },
	footer: {
		contact: 'Escribinos a {{contacto}}',
		signoff: 'Firma de ejemplo',
		contactEmail: 'contacto@example.com',
		limits: { mail_footer_contact: 200, mail_footer_signoff: 120 }
	}
};

describe('/admin/mensajes/configuracion', () => {
	const body = render(Page, { props: { data: /** @type {any} */ (data), form: null } }).body;

	it('sin «← Mensajes» mientras Mensajes no tenga página propia (la Bandeja es «Próximamente»)', () => {
		expect(body).not.toMatch(/<a class="back[^"]*" href="\/admin\/mensajes">/);
	});

	it('las plantillas: un link a Mensajes › Plantillas, sin tarjeta propia', () => {
		expect(body).toContain('href="/admin/mensajes/plantillas"');
		expect(body).not.toContain('Editar las plantillas');
		expect(body).not.toMatch(/<h2[^>]*>Plantillas<\/h2>/);
		// Lo que sí es de esta página sigue acá.
		for (const title of ['Remitente y respuesta', 'Pie de los mails', 'Recordatorios'])
			expect(body).toContain(title);
	});
});
