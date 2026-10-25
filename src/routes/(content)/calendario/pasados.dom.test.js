// @vitest-environment jsdom
/**
 * /calendario en el navegador: «Mostrar eventos pasados» trae los pasados del mes que se ve, de a
 * un mes (/api/calendario/pasados?mes=…&enteros=1), y no /api/posts entero; abajo de la lista,
 * «Mostrar el mes anterior» sigue con el mes de antes (la dirección de siempre, ?viewdate=), hasta
 * el del evento más viejo. Eventos inventados.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { writable } from 'svelte/store';

const ORIGIN = 'https://sitio.test';
const pageStore = writable({ url: new URL(ORIGIN + '/calendario'), params: {}, data: {} });
const goto = vi.fn();
vi.mock('$app/stores', () => ({ page: pageStore }));
vi.mock('$app/navigation', () => ({ goto, afterNavigate: vi.fn() }));
vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false }));

const NOW = Date.parse('2026-10-12T15:00:00-03:00');

/**
 * @param {string} slug
 * @param {string} start
 * @param {Record<string, any>} [extra]
 */
const event = (slug, start, extra = {}) => ({
	path: `/calendario/${slug}`,
	meta: {
		title: `Evento ${slug}`,
		postID: slug,
		category: 'calendario',
		layout: 'calendario',
		start,
		tags: [],
		status: 'abierto',
		...extra
	}
});

const FULL = {
	'2026-10': [event('octubre-pasado', '2026-10-03T20:00-03:00', { summary: 'Resumen inventado' })],
	'2026-09': [event('septiembre-pasado', '2026-09-10T20:00-03:00', { summary: 'Otro resumen' })]
};

/** @type {import('vitest').Mock} */
let fetchSpy;
/** @type {typeof import('$lib/utils/stores.js').userConfig} */
let userConfig;
/** @type {any} */
let Calendario;

// jsdom no los tiene (la lista mide su ancho; las tarjetas miran si se ven).
class NoopObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver ??= /** @type {any} */ (NoopObserver);
globalThis.IntersectionObserver ??= /** @type {any} */ (NoopObserver);
window.matchMedia ??= /** @type {any} */ (
	() => ({ matches: false, addEventListener() {}, removeEventListener() {} })
);

Element.prototype.scrollIntoView ??= () => {};
// Las transiciones de Svelte usan Web Animations, que jsdom no tiene.
Element.prototype.animate ??= /** @type {any} */ (
	function () {
		return { cancel() {}, finished: Promise.resolve(), onfinish: null };
	}
);

beforeAll(async () => {
	vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
	({ userConfig } = await import('$lib/utils/stores.js'));
	({ default: Calendario } = await import('./+page.svelte'));
});
afterAll(() => {
	vi.useRealTimers();
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	goto.mockClear();
	userConfig.set({ display_type: 'list', show_past_events: false });
});

/** Deja que lleguen los fetch y se dibuje lo nuevo. */
async function settle() {
	for (let i = 0; i < 5; i++) {
		await Promise.resolve();
		await tick();
	}
}

function mount(path = '/calendario') {
	fetchSpy = vi.fn(async (/** @type {string} */ url) => {
		const u = new URL(url, ORIGIN);
		const month = /** @type {keyof typeof FULL} */ (u.searchParams.get('mes'));
		const body = u.searchParams.get('enteros') === '1' ? (FULL[month] ?? []) : [];
		return new Response(JSON.stringify(body), { status: 200 });
	});
	vi.stubGlobal('fetch', fetchSpy);
	pageStore.set({ url: new URL(ORIGIN + path), params: {}, data: {} });
	const data = {
		posts: [
			event('octubre-proximo', '2026-10-20T20:00-03:00', { summary: 'Próximo inventado' }),
			// el pasado del mes que se abre viene con lo de la grilla (sin resumen)
			event('octubre-pasado', '2026-10-03T20:00-03:00')
		],
		pastMonth: '2026-10',
		firstMonth: '2026-09',
		ticketStates: null
	};
	return render(Calendario, { props: { data } });
}

/** @param {HTMLElement} container */
const listText = (container) => container.querySelector('#postlist')?.textContent ?? '';
const urls = () => fetchSpy.mock.calls.map((c) => String(c[0]));

describe('/calendario: «Mostrar eventos pasados» de a un mes', () => {
	it('sin pedirlos, la lista no tiene pasados ni se pide nada entero', async () => {
		const { container } = mount();
		await settle();
		expect(urls().some((u) => u.includes('enteros=1') || u.includes('/api/posts'))).toBe(false);
		expect(listText(container)).not.toContain('Evento octubre-pasado');
		expect(container.querySelector('.prev-month')).toBeNull();
	});

	it('al pedirlos: solo los del mes que se ve, enteros; nunca /api/posts', async () => {
		const { container } = mount();
		userConfig.set({ display_type: 'list', show_past_events: true });
		await settle();
		expect(urls()).toContain('/api/calendario/pasados?mes=2026-10&enteros=1');
		expect(urls().some((u) => u.includes('/api/posts'))).toBe(false);
		expect(urls().some((u) => u.includes('mes=2026-09'))).toBe(false);
		expect(listText(container)).toContain('Evento octubre-pasado');
	});

	it('«Mostrar el mes anterior»: lleva al mes de antes y trae sus pasados; en el más viejo, no está', async () => {
		const { container, getByText } = mount();
		userConfig.set({ display_type: 'list', show_past_events: true });
		await settle();
		const link = /** @type {HTMLAnchorElement} */ (getByText('Mostrar el mes anterior'));
		expect(link.getAttribute('href')).toBe('/calendario?viewdate=2026-09');
		await fireEvent.click(link);
		expect(goto).toHaveBeenCalledWith('/calendario?viewdate=2026-09', {
			noScroll: true,
			keepFocus: true
		});
		// la navegación (goto está simulado): cambia la dirección
		pageStore.set({ url: new URL(ORIGIN + '/calendario?viewdate=2026-09'), params: {}, data: {} });
		await settle();
		expect(urls()).toContain('/api/calendario/pasados?mes=2026-09&enteros=1');
		expect(listText(container)).toContain('Evento septiembre-pasado');
		// septiembre es el mes del evento más viejo: no hay anterior
		expect(container.querySelector('.prev-month')).toBeNull();
	});
});
