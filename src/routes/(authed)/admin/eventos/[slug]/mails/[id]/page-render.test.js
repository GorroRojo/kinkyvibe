/**
 * Editor de la plantilla de un mail de un evento: los campos vacíos muestran lo que sale si no se
 * cambian (la plantilla general o el texto de siempre), y el editor general sigue con sus textos.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import { TEMPLATE_LIMITS, templateDef } from '$lib/utils/emailTemplates.js';

vi.mock('$app/stores', () => ({
	page: readable({
		url: new URL('http://localhost/admin/eventos/fiesta-inventada/mails/tickets'),
		params: { slug: 'fiesta-inventada', id: 'tickets' }
	})
}));

const { default: EventPage } = await import('./+page.svelte');
const { default: GeneralPage } = await import('../../../../mensajes/plantillas/[id]/+page.svelte');

const def = /** @type {NonNullable<ReturnType<typeof templateDef>>} */ (templateDef('tickets'));

describe('editor de plantillas de mails', () => {
	it('por evento: todo vacío, con lo heredado de placeholder', () => {
		const body = render(EventPage, {
			props: {
				data: /** @type {any} */ ({
					dbAvailable: true,
					def,
					limits: TEMPLATE_LIMITS,
					saved: { heading: 'Título del evento', updatedAt: 1, updatedBy: 'alguien' },
					hasGeneral: true,
					inherited: { subject: 'Asunto general', label: 'Etiqueta general' },
					recipients: []
				}),
				form: null
			}
		}).body;
		expect(body).toContain('href="/admin/eventos/fiesta-inventada/mails"');
		expect(body).toContain('propio de este evento');
		expect(body).toMatch(/name="subject"[^>]*placeholder="Asunto general"/);
		expect(body).toMatch(/name="heading"[^>]*value="Título del evento"/);
		expect(body).toMatch(/name="label"[^>]*placeholder="Etiqueta general"/);
		// Todas las partes de este mail.
		for (const k of ['subject', 'heading', 'body', 'label', 'button', 'help', 'why'])
			expect(body).toContain(`name="${k}"`);
		expect(body).toContain('Volver a la plantilla general');
	});

	it('general: asunto, título y texto con el original; las opcionales vacías', () => {
		const body = render(GeneralPage, {
			props: {
				data: /** @type {any} */ ({
					dbAvailable: true,
					def,
					limits: TEMPLATE_LIMITS,
					saved: null,
					recipients: []
				}),
				form: null
			}
		}).body;
		expect(body).toMatch(/name="subject"[^>]*value="Tus entradas para \{\{evento\}\}"/);
		expect(body).toMatch(/name="label"[^>]*placeholder="Tus entradas"/);
		expect(body).toMatch(/name="button"[^>]*placeholder="Ver mis entradas"/);
		expect(body).not.toContain('Volver a la plantilla general');
	});
});
