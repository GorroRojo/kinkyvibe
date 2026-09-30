import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FAILED_TTL_MS, clearUserCache, forgetUser, getVerifiedUser } from './session.js';

const ghUser = { login: 'Tallarines333', name: null, avatar_url: 'https://a/b.png', id: 1 };

describe('getVerifiedUser', () => {
	beforeEach(() => clearUserCache());

	it('returns undefined without calling GitHub when there is no token', async () => {
		const fetchUser = vi.fn();
		expect(await getVerifiedUser('', fetchUser)).toBeUndefined();
		expect(await getVerifiedUser(undefined, fetchUser)).toBeUndefined();
		expect(fetchUser).not.toHaveBeenCalled();
	});

	it('keeps only id/login/name/avatar_url and normalizes empty name to null', async () => {
		const user = await getVerifiedUser('tok', async () => ({ ...ghUser, name: '', email: 'x' }));
		expect(user).toEqual({
			id: 1,
			login: 'Tallarines333',
			name: null,
			avatar_url: 'https://a/b.png'
		});
	});

	it('caches per token until the TTL expires', async () => {
		const fetchUser = vi.fn(async () => ghUser);
		await getVerifiedUser('tok', fetchUser, 0);
		await getVerifiedUser('tok', fetchUser, 60_000);
		expect(fetchUser).toHaveBeenCalledTimes(1);
		await getVerifiedUser('other', fetchUser, 60_000);
		expect(fetchUser).toHaveBeenCalledTimes(2);
		await getVerifiedUser('tok', fetchUser, 10 * 60_000);
		expect(fetchUser).toHaveBeenCalledTimes(3);
	});

	it('fails closed on bad answers', async () => {
		expect(await getVerifiedUser('a', async () => undefined)).toBeUndefined();
		expect(await getVerifiedUser('b', async () => ({ login: '', id: 1 }))).toBeUndefined();
		expect(await getVerifiedUser('c', async () => ({ login: 'x' }))).toBeUndefined();
		expect(await getVerifiedUser('d', async () => ({ login: 'x', id: '1' }))).toBeUndefined();
	});

	it('remembers rejected tokens briefly, keyed by the token', async () => {
		const rejecting = vi.fn(async () => undefined);
		expect(await getVerifiedUser('bad', rejecting, 0)).toBeUndefined();
		expect(await getVerifiedUser('bad', rejecting, FAILED_TTL_MS - 1)).toBeUndefined();
		expect(rejecting).toHaveBeenCalledTimes(1);
		// Another token is still checked.
		expect(await getVerifiedUser('good', async () => ghUser, 10)).toMatchObject({ id: 1 });
		// After the TTL the token is checked again.
		const accepting = vi.fn(async () => ghUser);
		expect(await getVerifiedUser('bad', accepting, FAILED_TTL_MS)).toMatchObject({ id: 1 });
		expect(accepting).toHaveBeenCalledTimes(1);
	});

	it('does not remember network errors', async () => {
		const throwing = vi.fn(async () => {
			throw new Error('network');
		});
		expect(await getVerifiedUser('tok', throwing, 0)).toBeUndefined();
		expect(await getVerifiedUser('tok', async () => ghUser, 1)).toMatchObject({ id: 1 });
	});

	it('forgetUser drops the cached entry', async () => {
		const fetchUser = vi.fn(async () => ghUser);
		await getVerifiedUser('tok', fetchUser);
		await forgetUser('tok');
		await getVerifiedUser('tok', fetchUser);
		expect(fetchUser).toHaveBeenCalledTimes(2);
	});
});
