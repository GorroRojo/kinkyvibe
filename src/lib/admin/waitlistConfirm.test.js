/**
 * «Terminar la reserva y pasar a la siguiente» (Ventas › Lista de espera): el diálogo pregunta si
 * le avisamos por mail, con la casilla marcada de entrada, y sin casilla si la lista está apagada.
 * El render es el del diálogo compartido (ConfirmDialog) con la pregunta de verdad. Mail inventado.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
import { withoutComments } from '$lib/testing/html.js';
import { registerConfirm } from './confirm.js';
import { endHoldQuestion, endHoldSubmit } from './waitlistConfirm.js';

const EMAIL = 'persona@example.com';

afterEach(() => registerConfirm(null));

/** @param {import('./confirm.js').ConfirmOptions} preview */
const html = (preview) => withoutComments(render(ConfirmDialog, { props: { preview } }).body);

describe('el diálogo de «Terminar la reserva»', () => {
	it('con la lista prendida: pregunta si le avisamos, con «Mandarle un mail» marcada', () => {
		const body = html(endHoldQuestion({ email: EMAIL, mailsOn: true }));
		expect(body).toContain('¿Terminar su reserva?');
		expect(body).toContain('¿Le avisamos por mail?');
		expect(body).toContain('«Se terminó tu lugar»');
		expect(body).toMatch(
			/<label class="kv-confirm-check[^"]*"><input type="checkbox"[^>]*checked[^>]*\/?>\s*Mandarle un mail a persona@example\.com\s*<\/label>/
		);
		expect(body).toContain('Terminar y pasar a la siguiente');
		expect(body).toContain('Cancelar');
	});

	it('con la lista apagada: sin casilla, y dice que no le llega un mail', () => {
		const body = html(endHoldQuestion({ email: EMAIL, mailsOn: false }));
		expect(body).not.toContain('type="checkbox"');
		expect(body).not.toContain(EMAIL);
		expect(body).toContain('No le llega un mail: la lista de espera está apagada.');
	});
});

describe('el envío del form', () => {
	/** @param {boolean} ok @param {boolean} checked */
	async function submit(ok, checked) {
		registerConfirm(async () => ({ ok, checked }));
		const formData = new FormData();
		formData.set('id', 'x');
		formData.set('mail', '1');
		const cancel = vi.fn();
		const after = await endHoldSubmit({ email: EMAIL, mailsOn: true })(
			/** @type {any} */ ({ formData, cancel })
		);
		return { formData, cancel, after };
	}

	it('con la casilla marcada va mail=1', async () => {
		const { formData, cancel, after } = await submit(true, true);
		expect(formData.get('mail')).toBe('1');
		expect(cancel).not.toHaveBeenCalled();
		expect(after).toBeTypeOf('function');
	});

	it('destildada, va sin mail', async () => {
		const { formData, cancel } = await submit(true, false);
		expect(formData.has('mail')).toBe(false);
		expect(cancel).not.toHaveBeenCalled();
	});

	it('cancelar no manda nada', async () => {
		const { cancel } = await submit(false, true);
		expect(cancel).toHaveBeenCalledOnce();
	});
});
