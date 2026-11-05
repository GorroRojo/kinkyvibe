// scripts/aviso-deploy.js: qué PRs toma, cómo lee el check de Workers Builds y qué le manda al
// sitio. Con un `github` y un `fetch` de mentira; PRs y SHAs INVENTADOS.
import { describe, expect, it } from 'vitest';
import { CHECK_NAME, WAIT_MS, decide, latestRun, mergedPrs, run } from './aviso-deploy.js';

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

describe('mergedPrs', () => {
	it('solo los mergeados a main, con número, título y cuerpo', () => {
		expect(
			mergedPrs([
				{
					number: 1,
					title: 'Uno',
					body: 'B',
					merged_at: '2031-01-01T00:00:00Z',
					base: { ref: 'main' }
				},
				{ number: 2, title: 'Abierto', body: null, merged_at: null, base: { ref: 'main' } },
				{
					number: 3,
					title: 'Apilado',
					body: null,
					merged_at: '2031-01-01T00:00:00Z',
					base: { ref: 'otra' }
				},
				{
					number: 4,
					title: 'Sin cuerpo',
					body: null,
					merged_at: '2031-01-01T00:00:00Z',
					base: { ref: 'main' }
				}
			])
		).toEqual([
			{ number: 1, title: 'Uno', body: 'B' },
			{ number: 4, title: 'Sin cuerpo', body: '' }
		]);
	});
});

describe('latestRun y decide', () => {
	it('la corrida más nueva del check', () => {
		const r = latestRun([
			{
				name: CHECK_NAME,
				status: 'completed',
				conclusion: 'failure',
				started_at: '2031-01-01T00:00:00Z'
			},
			{
				name: CHECK_NAME,
				status: 'completed',
				conclusion: 'success',
				started_at: '2031-01-01T00:05:00Z'
			},
			{
				name: 'Otro',
				status: 'completed',
				conclusion: 'failure',
				started_at: '2031-01-01T00:09:00Z'
			}
		]);
		expect(r?.conclusion).toBe('success');
		expect(latestRun([])).toBeNull();
	});

	it('espera mientras no terminó; avisa éxito o falla; no avisa si se canceló', () => {
		expect(decide(null)).toEqual({ action: 'wait' });
		expect(decide({ status: 'in_progress', conclusion: null })).toEqual({ action: 'wait' });
		expect(decide({ status: 'completed', conclusion: 'success' })).toEqual({
			action: 'notify',
			conclusion: 'success'
		});
		expect(decide({ status: 'completed', conclusion: 'timed_out' })).toEqual({
			action: 'notify',
			conclusion: 'failure'
		});
		expect(decide({ status: 'completed', conclusion: 'cancelled' }).action).toBe('skip');
	});
});

/**
 * @param {{ checks: any[][], status?: number }} o una lista de check runs por cada vuelta
 */
function fakes({ checks, status = 200 }) {
	/** @type {{ url: string, init: any }[]} */
	const posts = [];
	/** @type {string[]} */
	const notes = [];
	let polls = 0;
	let clock = 0;
	const github = {
		rest: {
			repos: {
				listPullRequestsAssociatedWithCommit: async (/** @type {any} */ { commit_sha }) => ({
					data:
						commit_sha === SHA
							? [
									{
										number: 629,
										title: 'Evento: afiche',
										body: 'Cuerpo.',
										merged_at: 'x',
										base: { ref: 'main' }
									}
								]
							: []
				})
			},
			checks: {
				listForRef: async (/** @type {any} */ q) => {
					expect(q).toMatchObject({ ref: SHA, check_name: CHECK_NAME });
					const runs = checks[Math.min(polls, checks.length - 1)];
					polls += 1;
					return { data: { check_runs: runs } };
				}
			}
		}
	};
	const core = {
		notice: (/** @type {string} */ m) => notes.push(`notice: ${m}`),
		warning: (/** @type {string} */ m) => notes.push(`warning: ${m}`),
		setFailed: (/** @type {string} */ m) => notes.push(`failed: ${m}`)
	};
	const context = {
		repo: { owner: 'GorroRojo', repo: 'kinkyvibe' },
		sha: SHA,
		payload: { after: SHA, commits: [{ id: SHA, message: 'Evento: afiche (#629)' }] }
	};
	const fetchFn = /** @type {typeof fetch} */ (
		async (url, init) => {
			posts.push({ url: String(url), init });
			return new Response('{"sent":1}', { status });
		}
	);
	return {
		posts,
		notes,
		get polls() {
			return polls;
		},
		input: {
			github,
			core,
			context,
			siteUrl: 'https://kinkyvibe.ar/',
			fetch: fetchFn,
			sleep: async (/** @type {number} */ ms) => {
				clock += ms;
			},
			now: () => clock
		}
	};
}

describe('run', () => {
	it('sin el secreto: no hace nada', async () => {
		const f = fakes({ checks: [[]] });
		expect(await run({ ...f.input, secret: undefined })).toMatchObject({ action: 'skip' });
		expect(f.posts).toHaveLength(0);
		expect(f.polls).toBe(0);
	});

	it('espera el check y le manda al sitio el resultado y los PRs, con el secreto', async () => {
		const f = fakes({
			checks: [
				[],
				[{ name: CHECK_NAME, status: 'in_progress', conclusion: null }],
				[{ name: CHECK_NAME, status: 'completed', conclusion: 'success' }]
			]
		});
		expect(await run({ ...f.input, secret: 'el-secreto' })).toEqual({
			action: 'notified',
			conclusion: 'success'
		});
		expect(f.polls).toBe(3);
		expect(f.posts).toHaveLength(1);
		expect(f.posts[0].url).toBe('https://kinkyvibe.ar/api/interno/deploy');
		expect(f.posts[0].init.headers['x-deploy-secret']).toBe('el-secreto');
		expect(JSON.parse(f.posts[0].init.body)).toEqual({
			sha: SHA,
			conclusion: 'success',
			commits: [
				{
					sha: SHA,
					message: 'Evento: afiche (#629)',
					prs: [{ number: 629, title: 'Evento: afiche', body: 'Cuerpo.' }]
				}
			]
		});
	});

	it('si el build falló, lo manda como falla', async () => {
		const f = fakes({
			checks: [[{ name: CHECK_NAME, status: 'completed', conclusion: 'failure' }]]
		});
		await run({ ...f.input, secret: 's' });
		expect(JSON.parse(f.posts[0].init.body).conclusion).toBe('failure');
	});

	it('si el check no termina en 20 minutos, avisa «timed_out»', async () => {
		const f = fakes({ checks: [[{ name: CHECK_NAME, status: 'queued', conclusion: null }]] });
		await run({ ...f.input, secret: 's' });
		expect(f.polls).toBeGreaterThan(10);
		expect(f.polls).toBeLessThanOrEqual(WAIT_MS / 30_000 + 1);
		expect(JSON.parse(f.posts[0].init.body).conclusion).toBe('timed_out');
	});

	it('si el build se canceló, no avisa', async () => {
		const f = fakes({
			checks: [[{ name: CHECK_NAME, status: 'completed', conclusion: 'cancelled' }]]
		});
		expect((await run({ ...f.input, secret: 's' })).action).toBe('skip');
		expect(f.posts).toHaveLength(0);
	});

	it('si el sitio contesta mal, el job falla', async () => {
		const f = fakes({
			checks: [[{ name: CHECK_NAME, status: 'completed', conclusion: 'success' }]],
			status: 401
		});
		expect((await run({ ...f.input, secret: 's' })).action).toBe('failed');
		expect(f.notes.some((n) => n.startsWith('failed: El aviso de deploy no salió: HTTP 401'))).toBe(
			true
		);
	});
});
