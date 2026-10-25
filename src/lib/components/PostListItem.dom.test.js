// @vitest-environment jsdom
/**
 * «Añadir al calendario» en la tarjeta de la lista, en el navegador (jsdom +
 * @testing-library/svelte): la librería del menú (add-to-calendar-button, ~60 KB comprimida) no se
 * baja al montar cada tarjeta, sino al tocar el botón; ahí abre el menú con los datos de
 * calendarButtonEvent, y el clic no llega al link de la tarjeta.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';

const loaded = vi.fn();
const atcb_action = vi.fn();
vi.mock('add-to-calendar-button', () => {
	loaded();
	return { atcb_action };
});

const { default: PostListItem } = await import('./PostListItem.svelte');

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const post = {
	path: '/calendario/evento-inventado',
	meta: {
		title: 'Taller inventado',
		summary: 'Un evento de prueba.',
		tags: [],
		category: 'calendario',
		layout: 'calendario',
		postID: 'evento-inventado',
		status: 'abierto',
		start: '2099-12-01T20:00-03:00',
		end: '2099-12-01T22:00-03:00',
		link: 'https://example.com/inscripcion'
	}
};

describe('PostListItem: «Añadir al calendario» se baja al tocarlo', () => {
	it('al montar no importa la librería; al tocar, sí, y abre el menú', async () => {
		const { getByRole } = render(PostListItem, { props: { post } });
		await tick();
		expect(loaded).not.toHaveBeenCalled();

		const button = getByRole('button', { name: 'Añadir al calendario' });
		const card = /** @type {HTMLAnchorElement} */ (button.closest('a'));
		const cardClick = vi.fn();
		card.addEventListener('click', cardClick);

		const click = new MouseEvent('click', { bubbles: true, cancelable: true });
		button.dispatchEvent(click);
		// el clic no navega ni le llega a la tarjeta
		expect(click.defaultPrevented).toBe(true);
		expect(cardClick).not.toHaveBeenCalled();
		await tick();
		expect(button.getAttribute('aria-busy')).toBe('true');

		await vi.waitFor(() => expect(atcb_action).toHaveBeenCalledTimes(1));
		expect(loaded).toHaveBeenCalledTimes(1);
		const [config, trigger] = atcb_action.mock.calls[0];
		expect(trigger).toBe(button);
		expect(config).toMatchObject({
			name: 'Taller inventado',
			startDate: '2099-12-01',
			startTime: '20:00',
			endTime: '22:00',
			timeZone: 'America/Buenos_Aires',
			language: 'es'
		});
		await vi.waitFor(() => expect(button.hasAttribute('aria-busy')).toBe(false));

		// un segundo toque reusa la librería ya bajada
		await fireEvent.click(button);
		await vi.waitFor(() => expect(atcb_action).toHaveBeenCalledTimes(2));
		expect(loaded).toHaveBeenCalledTimes(1);
	});
});
