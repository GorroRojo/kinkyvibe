/**
 * Server-side cache of GitHub users verified from their OAuth token.
 * Identity is only ever taken from GitHub's /user response for the token in
 * the httpOnly cookie, never from client-writable cookies. The cache avoids
 * calling GitHub on every request; on Cloudflare Workers isolates are
 * ephemeral, so this is best-effort and a miss just means one extra call.
 */

const TTL_MS = 5 * 60 * 1000;
/** Tokens GitHub rejected are remembered this long, so a bad cookie costs one GitHub call. */
export const FAILED_TTL_MS = 60 * 1000;
const MAX_ENTRIES = 200;
const MAX_FAILED_ENTRIES = 500;

/** @typedef {{ id: number, login: string, name: string|null, avatar_url: string }} SessionUser */

/** @type {Map<string, { user: SessionUser, expires: number }>} */
const cache = new Map();
/** Hashes of tokens that failed verification, with their expiry. @type {Map<string, number>} */
const failed = new Map();

/**
 * @template V
 * @param {Map<string, V>} map
 * @param {number} max
 */
function makeRoom(map, max) {
	if (map.size >= max) {
		// Drop the oldest entry (Map keeps insertion order).
		const oldest = map.keys().next().value;
		if (oldest !== undefined) map.delete(oldest);
	}
}

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
	const failedUntil = failed.get(key);
	if (failedUntil !== undefined) {
		if (failedUntil > now) return undefined;
		failed.delete(key);
	}

	let ghUser;
	try {
		ghUser = await fetchUser(token);
	} catch (e) {
		// Network trouble, not a verdict on the token: don't remember it.
		console.log('Error verifying GitHub token: ' + e);
		return undefined;
	}
	if (
		!ghUser ||
		typeof ghUser.login !== 'string' ||
		ghUser.login === '' ||
		!Number.isSafeInteger(ghUser.id)
	) {
		makeRoom(failed, MAX_FAILED_ENTRIES);
		failed.set(key, now + FAILED_TTL_MS);
		return undefined;
	}

	/** @type {SessionUser} */
	const user = {
		id: ghUser.id,
		login: ghUser.login,
		name: typeof ghUser.name === 'string' && ghUser.name !== '' ? ghUser.name : null,
		avatar_url: typeof ghUser.avatar_url === 'string' ? ghUser.avatar_url : ''
	};
	makeRoom(cache, MAX_ENTRIES);
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
	failed.clear();
}
