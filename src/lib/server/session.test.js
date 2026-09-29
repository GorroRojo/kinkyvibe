import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearUserCache, forgetUser, getVerifiedUser } from './session.js';

const ghUser = { login: 'Tallarines333', name: null, avatar_url: 'https://a/b.png', id: 1 };

describe('getVerifiedUser', () => {
	beforeEach(() => clearUserCache());

	it('returns undefined without calling GitHub when there is no token', async () => {
		const fetchUser = vi.fn();
		expect(await getVerifiedUser('', fetchUser)).toBeUndefined();
		expect(await getVerifiedUser(undefined, fetchUser)).toBeUndefined();
		expect(fetchUser).not.toHaveBeenCalled();
	});

	it('keeps only login/name/avatar_url and normalizes empty name to null', async () => {
		const user = await getVerifiedUser('tok', async () => ({ ...ghUser, name: '' }));
		expect(user).toEqual({ login: 'Tallarines333', name: null, avatar_url: 'https://a/b.png' });
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

	it('does not cache failures and fails closed', async () => {
		const failing = vi.fn(async () => undefined);
		expect(await getVerifiedUser('bad', failing)).toBeUndefined();
		const throwing = vi.fn(async () => {
			throw new Error('network');
		});
		expect(await getVerifiedUser('bad', throwing)).toBeUndefined();
		expect(await getVerifiedUser('bad', async () => ({ login: '' }))).toBeUndefined();
		expect(await getVerifiedUser('bad', async () => ghUser)).toEqual({
			login: 'Tallarines333',
			name: null,
			avatar_url: 'https://a/b.png'
		});
	});

	it('forgetUser drops the cached entry', async () => {
		const fetchUser = vi.fn(async () => ghUser);
		await getVerifiedUser('tok', fetchUser);
		await forgetUser('tok');
		await getVerifiedUser('tok', fetchUser);
		expect(fetchUser).toHaveBeenCalledTimes(2);
	});
});
