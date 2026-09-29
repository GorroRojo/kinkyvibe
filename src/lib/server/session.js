/**
 * Server-side cache of GitHub users verified from their OAuth token.
 * Identity is only ever taken from GitHub's /user response for the token in
 * the httpOnly cookie, never from client-writable cookies. The cache avoids
 * calling GitHub on every request; on Cloudflare Workers isolates are
 * ephemeral, so this is best-effort and a miss just means one extra call.
 */

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 200;

/** @typedef {{ login: string, name: string|null, avatar_url: string }} SessionUser */

/** @type {Map<string, { user: SessionUser, expires: number }>} */
const cache = new Map();

/**
 * @param {string} token
 * @returns {Promise<string>}
 */
async function hashToken(token) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {string|undefined} token
 * @param {(token: string) => Promise<any>} fetchUser calls GitHub GET /user
 * @param {number} [now]
 * @returns {Promise<SessionUser|undefined>}
 */
export async function getVerifiedUser(token, fetchUser, now = Date.now()) {
	if (!token) return undefined;
	const key = await hashToken(token);
	const hit = cache.get(key);
	if (hit && hit.expires > now) return hit.user;
	if (hit) cache.delete(key);

	let ghUser;
	try {
		ghUser = await fetchUser(token);
	} catch (e) {
		console.log('Error verifying GitHub token: ' + e);
		return undefined;
	}
	if (!ghUser || typeof ghUser.login !== 'string' || ghUser.login === '') return undefined;

	/** @type {SessionUser} */
	const user = {
		login: ghUser.login,
		name: typeof ghUser.name === 'string' && ghUser.name !== '' ? ghUser.name : null,
		avatar_url: typeof ghUser.avatar_url === 'string' ? ghUser.avatar_url : ''
	};
	if (cache.size >= MAX_ENTRIES) {
		// Drop the oldest entry (Map keeps insertion order).
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	cache.set(key, { user, expires: now + TTL_MS });
	return user;
}

/**
 * Removes a token from the cache (on logout).
 * @param {string|undefined} token
 */
export async function forgetUser(token) {
	if (token) cache.delete(await hashToken(token));
}

/** For tests. */
export function clearUserCache() {
	cache.clear();
}
