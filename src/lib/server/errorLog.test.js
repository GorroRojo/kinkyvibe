import { describe, expect, it, vi } from 'vitest';
import { buildHandleError } from './errorLog.js';

/**
 * Un evento de SvelteKit mínimo.
 * @param {string} path
 */
function fakeEvent(path) {
	return /** @type {any} */ ({
		request: new Request(`https://kinkyvibe.ar${path}?token=secreto`, {
			method: 'POST',
			headers: { 'cf-ray': '0000000000000000-EZE' }
		}),
		url: new URL(`https://kinkyvibe.ar${path}?token=secreto`)
	});
}

/** @param {{ preview?: boolean, previewDeploy?: boolean }} [o] */
function setup({ preview = false, previewDeploy = false } = {}) {
	const log = { error: vi.fn() };
	const handleError = buildHandleError({ preview, isPreview: () => previewDeploy, log });
	return { log, handleError };
}

describe('buildHandleError', () => {
	it('404: does not log and returns only the message', () => {
		const { log, handleError } = setup();
		const out = handleError({
			error: new Error('Not found: /cosa-rara'),
			event: fakeEvent('/cosa-rara'),
			status: 404,
			message: 'Not Found'
		});
		expect(out).toEqual({ message: 'Not Found' });
		expect(log.error).not.toHaveBeenCalled();
	});

	it('500: logs one parseable JSON line with the same id it returns', () => {
		const { log, handleError } = setup();
		const out = handleError({
			error: new Error('D1_ERROR: algo interno'),
			event: fakeEvent('/calendario'),
			status: 500,
			message: 'Internal Error'
		});
		expect(out).toEqual({ message: 'Internal Error', id: expect.stringMatching(/^[0-9a-f]{8}$/) });
		expect(log.error).toHaveBeenCalledTimes(1);
		const line = log.error.mock.calls[0][0];
		expect(typeof line).toBe('string');
		expect(line).not.toContain('\n');
		const entry = JSON.parse(line);
		expect(entry).toMatchObject({
			area: 'error',
			id: /** @type {any} */ (out).id,
			status: 500,
			method: 'POST',
			path: '/calendario',
			ray: '0000000000000000-EZE',
			message: 'D1_ERROR: algo interno'
		});
		expect(entry.stack).toContain('D1_ERROR');
		expect(entry.stack.split('\n').length).toBeLessThanOrEqual(8);
		// La ruta, sin la query (puede traer tokens).
		expect(line).not.toContain('secreto');
	});

	it('each error gets its own id', () => {
		const { handleError } = setup();
		const args = {
			error: new Error('x'),
			event: fakeEvent('/'),
			status: 500,
			message: 'Internal Error'
		};
		const a = /** @type {any} */ (handleError(args)).id;
		const b = /** @type {any} */ (handleError(args)).id;
		expect(a).not.toBe(b);
	});

	it('production build: the generic message, without the error detail', () => {
		const { handleError } = setup({ preview: false, previewDeploy: true });
		const out = /** @type {any} */ (
			handleError({
				error: new Error('D1_ERROR: algo interno'),
				event: fakeEvent('/'),
				status: 500,
				message: 'Internal Error'
			})
		);
		expect(out.message).toBe('Internal Error');
	});

	it('preview deploy: adds the error detail in the shape errorPage.js expects', () => {
		const { handleError } = setup({ preview: true, previewDeploy: true });
		const out = /** @type {any} */ (
			handleError({
				error: new Error('demo: falta la tabla'),
				event: fakeEvent('/admin/demo'),
				status: 500,
				message: 'Internal Error'
			})
		);
		expect(out.message).toBe('Internal Error: demo: falta la tabla');
		expect(out.id).toMatch(/^[0-9a-f]{8}$/);
	});

	it('preview build on a non-preview deploy: no detail', () => {
		const { handleError } = setup({ preview: true, previewDeploy: false });
		const out = /** @type {any} */ (
			handleError({
				error: new Error('demo: falta la tabla'),
				event: fakeEvent('/'),
				status: 500,
				message: 'Internal Error'
			})
		);
		expect(out.message).toBe('Internal Error');
	});

	it('a thrown non-Error value still logs', () => {
		const { log, handleError } = setup();
		handleError({
			error: 'algo raro',
			event: fakeEvent('/'),
			status: 500,
			message: 'Internal Error'
		});
		const entry = JSON.parse(log.error.mock.calls[0][0]);
		expect(entry.message).toBe('algo raro');
		expect(entry.stack).toBeUndefined();
	});
});
