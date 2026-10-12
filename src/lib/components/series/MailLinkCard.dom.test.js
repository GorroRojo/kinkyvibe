// @vitest-environment jsdom
/**
 * La página de un link de mail en el navegador (jsdom + @testing-library/svelte): con `auto`, el
 * formulario de confirmar se manda solo una vez al abrir (gorrite, 12/10); sin `auto`, con un
 * error o ya hecho, no. Un segundo envío no sale (doble toque o envío automático más un toque).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import MailLinkCard from './MailLinkCard.svelte';

/** @type {import('vitest').MockInstance} */
let submit;

beforeEach(() => {
	sessionStorage.clear();
	// jsdom no navega: alcanza con ver que se pidió el envío.
	submit = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {});
});

afterEach(() => {
	cleanup();
	submit.mockRestore();
});

const base = { title: 'Confirmá', text: 'Tocá el botón.', button: 'Confirmar' };

describe('MailLinkCard: envío automático', () => {
	it('con `auto`, manda el formulario una sola vez por pestaña y link', () => {
		render(MailLinkCard, { props: { ...base, auto: true } });
		expect(submit).toHaveBeenCalledTimes(1);
		cleanup();
		// Vuelve a la misma página (sin la de «Atrás» congelada): que toque el botón.
		render(MailLinkCard, { props: { ...base, auto: true } });
		expect(submit).toHaveBeenCalledTimes(1);
	});

	it('sin `auto` (salir, darse de baja), con error, ya hecho o con el link vencido: no', () => {
		render(MailLinkCard, { props: base });
		cleanup();
		render(MailLinkCard, { props: { ...base, auto: true, error: 'El link venció.' } });
		cleanup();
		render(MailLinkCard, { props: { ...base, auto: true, done: 'Listo.' } });
		cleanup();
		render(MailLinkCard, { props: { ...base, auto: true, valid: false, error: 'No vale.' } });
		expect(submit).not.toHaveBeenCalled();
	});

	it('un segundo envío no sale y el botón queda apagado', async () => {
		const { container, getByRole } = render(MailLinkCard, { props: base });
		const form = /** @type {HTMLFormElement} */ (container.querySelector('form'));
		const first = new Event('submit', { cancelable: true });
		form.dispatchEvent(first);
		expect(first.defaultPrevented).toBe(false);
		const second = new Event('submit', { cancelable: true });
		form.dispatchEvent(second);
		expect(second.defaultPrevented).toBe(true);
		await Promise.resolve();
		expect(getByRole('button')).toHaveProperty('disabled', true);
	});
});
