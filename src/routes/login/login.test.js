import { describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

vi.mock('$env/dynamic/private', () => ({ env: { GITHUB_CLIENT_ID: 'cliente-de-prueba' } }));

const { actions } = await import('./+page.server.js');

/** Runs the login action and returns the GitHub authorization URL it redirects to. */
async function authorizeURL() {
	const url = new URL('https://kinkyvibe.ar/login');
	const request = new Request(url, { method: 'POST', body: new FormData() });
	const cookies = { set: vi.fn() };
	try {
		// @ts-expect-error only the parts of RequestEvent the action reads
		await actions.default({ request, cookies, url });
	} catch (e) {
		if (isRedirect(e)) return new URL(e.location);
		throw e;
	}
	throw new Error('the login action should redirect to GitHub');
}

describe('login', () => {
	it('redirects to the GitHub authorization page with the client id and a state', async () => {
		const target = await authorizeURL();
		expect(target.origin + target.pathname).toBe('https://github.com/login/oauth/authorize');
		expect(target.searchParams.get('client_id')).toBe('cliente-de-prueba');
		expect(target.searchParams.get('state')).toMatch(/^[0-9a-f]{64}$/);
	});

	it('asks GitHub for no permissions (no scope, or an empty one)', async () => {
		const target = await authorizeURL();
		expect(target.searchParams.get('scope') ?? '').toBe('');
	});
});
