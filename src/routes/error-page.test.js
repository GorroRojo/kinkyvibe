/**
 * La página de error del sitio (+error.svelte): en castellano, sin el mensaje de SvelteKit en
 * inglés, y en un 404 «Volver» (atrás en el historial), «Ver calendario» y «Buscar».
 */
import { describe, expect, it, vi } from 'vitest';
import { readable } from 'svelte/store';
import { render } from 'svelte/server';

const pageStore = vi.hoisted(() => ({
	/** @type {any} */
	value: null
}));

vi.mock('$app/stores', () => ({
	page: {
		subscribe: (/** @type {(v: any) => void} */ fn) => readable(pageStore.value).subscribe(fn)
	}
}));

// Como en producción: los detalles de un 5xx solo se ven en desarrollo.
vi.mock('$app/environment', () => ({ dev: false, browser: false, building: false }));

describe('+error.svelte', () => {
	it('404: in Spanish, without «Not Found», with «Volver», «Ver calendario» and «Buscar»', async () => {
		pageStore.value = {
			status: 404,
			error: { message: 'Not Found: Not found: /cosa-rara' },
			url: new URL('https://kinkyvibe.ar/cosa-rara')
		};
		const { default: ErrorPage } = await import('./+error.svelte');
		const body = render(ErrorPage).body;
		expect(body).toContain('Esta página se escapó');
		expect(body).not.toMatch(/not found/i);
		expect(body).toContain('Volver');
		expect(body).toContain('href="/calendario"');
		expect(body).toContain('Buscar');
	});

	it('500: «Probar de nuevo» and «Ir al inicio», no internals', async () => {
		pageStore.value = {
			status: 500,
			error: { message: 'D1_ERROR: algo interno' },
			url: new URL('https://kinkyvibe.ar/calendario')
		};
		const { default: ErrorPage } = await import('./+error.svelte');
		const body = render(ErrorPage).body;
		expect(body).toContain('Probar de nuevo');
		expect(body).toContain('Ir al inicio');
		expect(body).not.toContain('D1_ERROR');
	});
});
