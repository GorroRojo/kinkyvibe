import { afterEach, describe, expect, it, vi } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { TOKEN_COOKIE } from '$lib/server/auth';
import { GET } from './+server.js';

/**
 * A minimal `cookies` stand-in that records what the handler does.
 * @param {Record<string, string>} initial
 */
function fakeCookies(initial = {}) {
	const jar = new Map(Object.entries(initial));
	/** @type {string[]} */
	const deleted = [];
	return {
		jar,
		deleted,
		get: (/** @type {string} */ name) => jar.get(name),
		set: (/** @type {string} */ name, /** @type {string} */ value) => void jar.set(name, value),
		delete: (/** @type {string} */ name) => {
			deleted.push(name);
			jar.delete(name);
		}
	};
}

/**
 * Runs GET and returns what it threw (SvelteKit's error()/redirect() throw).
 * @param {string} search
 * @param {ReturnType<typeof fakeCookies>} cookies
 * @returns {Promise<any>}
 */
async function run(search, cookies) {
	const url = new URL('https://kinkyvibe.ar/callback' + search);
	try {
		// @ts-expect-error only the parts of RequestEvent the handler reads
		await GET({ url, cookies });
	} catch (e) {
		return e;
	}
	throw new Error('GET should always end in error() or redirect()');
}

/** @param {unknown} body */
const githubReplies = (body) =>
	vi.fn(
		async () =>
			new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
	);

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('/callback (GitHub OAuth)', () => {
	it('rejects a missing or mismatched state with 400, and clears the state cookies', async () => {
		const fetchMock = githubReplies({ access_token: 'x' });
		vi.stubGlobal('fetch', fetchMock);
		/** @type {[string, string | undefined][]} */
		const cases = [
			['?code=c&state=abc', undefined],
			['?code=c', 'abc'],
			['?code=c&state=other', 'abc']
		];
		for (const [search, cookie] of cases) {
			const cookies = fakeCookies(cookie ? { oauthState: cookie } : {});
			const e = await run(search, cookies);
			expect(isHttpError(e, 400)).toBe(true);
			expect(cookies.deleted).toEqual(expect.arrayContaining(['oauthState', 'oauthRedirectTo']));
			expect(cookies.jar.has(TOKEN_COOKIE)).toBe(false);
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('sends the user back to /login, keeping where they were going, when there is no code', async () => {
		const fetchMock = githubReplies({ access_token: 'x' });
		vi.stubGlobal('fetch', fetchMock);
		const cookies = fakeCookies({ oauthState: 'abc', oauthRedirectTo: '/admin?x=1' });
		const e = await run('?state=abc&error=access_denied', cookies);
		expect(isRedirect(e)).toBe(true);
		expect(e.status).toBe(302);
		expect(e.location).toBe('/login?redirectTo=' + encodeURIComponent('/admin?x=1'));
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('answers 502 and sets no token when GitHub returns an error', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.stubGlobal('fetch', githubReplies({ error: 'bad_verification_code' }));
		const cookies = fakeCookies({ oauthState: 'abc' });
		const e = await run('?code=c&state=abc', cookies);
		expect(isHttpError(e, 502)).toBe(true);
		expect(cookies.jar.has(TOKEN_COOKIE)).toBe(false);
	});

	it('answers 502 when the token request itself fails', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('network down');
			})
		);
		const e = await run('?code=c&state=abc', fakeCookies({ oauthState: 'abc' }));
		expect(isHttpError(e, 502)).toBe(true);
	});

	it('answers 502 when GitHub replies without a token', async () => {
		vi.stubGlobal('fetch', githubReplies({}));
		const e = await run('?code=c&state=abc', fakeCookies({ oauthState: 'abc' }));
		expect(isHttpError(e, 502)).toBe(true);
	});

	it('stores the token and redirects to a safe same-origin target', async () => {
		const fetchMock = githubReplies({ access_token: 'gho_token' });
		vi.stubGlobal('fetch', fetchMock);
		const cookies = fakeCookies({ oauthState: 'abc', oauthRedirectTo: '/edit/calendario/x' });
		const e = await run('?code=the-code&state=abc', cookies);
		expect(isRedirect(e)).toBe(true);
		expect(e.location).toBe('/edit/calendario/x');
		expect(cookies.jar.get(TOKEN_COOKIE)).toBe('gho_token');
		const init = /** @type {any[]} */ (fetchMock.mock.calls[0])[1];
		expect(JSON.parse(init.body).code).toBe('the-code');
	});

	it('ignores an off-site redirect target', async () => {
		vi.stubGlobal('fetch', githubReplies({ access_token: 't' }));
		const cookies = fakeCookies({ oauthState: 'abc', oauthRedirectTo: 'https://evil.example/' });
		const e = await run('?code=c&state=abc', cookies);
		expect(e.location).toBe('/');
	});
});
