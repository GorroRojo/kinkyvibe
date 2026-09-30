import { describe, expect, it } from 'vitest';
import { POST } from './+server.js';

describe('POST /api/preview-seed', () => {
	it('does not exist outside preview deploys, even for an admin', async () => {
		// In vitest (as in the production build) PREVIEW_BUILD is false.
		const event = /** @type {any} */ ({
			platform: { env: {} },
			locals: { user: { id: -1, login: 'demo', name: 'Admin de prueba' } }
		});
		await expect(POST(event)).rejects.toMatchObject({ status: 404 });
	});
});
