import { describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_BASE_URL,
	ISSUE_TITLE,
	LABEL,
	RETRY_DELAY_MS,
	checkSite,
	closeComment,
	decide,
	issueBody,
	run
} from './vigilante-produccion.js';

const good = () => [
	{ path: '/', ok: true, detail: 'HTTP 200' },
	{ path: '/calendario', ok: true, detail: 'HTTP 200' }
];
const bad = () => [
	{ path: '/', ok: false, detail: 'HTTP 502' },
	{ path: '/calendario', ok: true, detail: 'HTTP 200' }
];
const alarm = (number = 50) => ({ number, title: ISSUE_TITLE, labels: [{ name: LABEL }] });

describe('decide', () => {
	it('does nothing when everything answers on the first try', () => {
		expect(decide({ attempts: [good()], openIssues: [] }).action).toBe('none');
	});

	it('opens an issue after two consecutive failures', () => {
		const d = decide({ attempts: [bad(), bad()], openIssues: [] });
		expect(d).toMatchObject({ action: 'open', failures: [{ path: '/' }] });
	});

	it('does nothing when it fails once and the retry is good', () => {
		const d = decide({ attempts: [bad(), good()], openIssues: [] });
		expect(d.action).toBe('none');
		expect(d.reason).toContain('reintento');
	});

	it('does not open on a single failed attempt', () => {
		expect(decide({ attempts: [bad()], openIssues: [] }).action).toBe('none');
	});

	it('closes every open alarm when everything answers again', () => {
		const d = decide({ attempts: [good()], openIssues: [alarm(50), alarm(60)] });
		expect(d).toMatchObject({ action: 'close', issues: [50, 60] });
	});

	it('also closes the alarm when the retry is good', () => {
		expect(decide({ attempts: [bad(), good()], openIssues: [alarm()] }).action).toBe('close');
	});

	it('does not open a duplicate while the alarm is open', () => {
		const d = decide({ attempts: [bad(), bad()], openIssues: [alarm(50)] });
		expect(d.action).toBe('none');
		expect(d.reason).toContain('#50');
	});

	it('does not count other open issues or PRs as the alarm', () => {
		const openIssues = [
			{ number: 51, title: 'Otro issue', labels: [{ name: LABEL }] },
			{ number: 52, title: ISSUE_TITLE, labels: [] },
			{ ...alarm(53), pull_request: {} }
		];
		expect(decide({ attempts: [bad(), bad()], openIssues }).action).toBe('open');
		expect(decide({ attempts: [good()], openIssues }).action).toBe('none');
	});

	it('accepts labels as plain strings', () => {
		const openIssues = [{ number: 54, title: ISSUE_TITLE, labels: [LABEL] }];
		expect(decide({ attempts: [good()], openIssues }).action).toBe('close');
	});

	it('counts skipped checks as good', () => {
		const skipped = [{ path: '/api/health', ok: true, skipped: true, detail: 'HTTP 404' }];
		expect(decide({ attempts: [skipped], openIssues: [alarm()] }).action).toBe('close');
	});

	it('throws without attempts', () => {
		expect(() => decide({ attempts: [], openIssues: [] })).toThrow();
	});
});

/**
 * @param {Record<string, { status?: number, body?: string, type?: string } | Error>} routes
 */
function fakeFetch(routes) {
	return vi.fn(async (/** @type {string} */ url) => {
		const r = routes[new URL(url).pathname] ?? { status: 404, body: 'no' };
		if (r instanceof Error) throw r;
		const { status = 200, body = '', type = 'text/html' } = r;
		return { status, headers: { get: () => type }, text: async () => body };
	});
}
const healthy = {
	'/': { body: '<title>Kinky Vibe</title>' },
	'/calendario': { body: 'ok' },
	'/calendario.ics': { body: 'BEGIN:VCALENDAR', type: 'text/calendar; charset=utf-8' },
	'/api/health': { body: '{"ok":true}', type: 'application/json' }
};
/** @param {any[]} results */
const byPath = (results) => Object.fromEntries(results.map((r) => [r.path, r]));

describe('checkSite', () => {
	it('passes every check on a healthy site', async () => {
		const fetch = fakeFetch(healthy);
		const results = await checkSite({ baseUrl: 'https://example.test/', fetch });
		expect(results.every((r) => r.ok && !r.skipped)).toBe(true);
		expect(fetch).toHaveBeenCalledWith('https://example.test/calendario.ics', expect.anything());
	});

	it('skips /api/health while it answers 404', async () => {
		const routes = { ...healthy };
		delete routes['/api/health'];
		const r = byPath(
			await checkSite({ baseUrl: 'https://example.test', fetch: fakeFetch(routes) })
		);
		expect(r['/api/health']).toMatchObject({ ok: true, skipped: true });
	});

	it('fails /api/health when it exists but is not ok', async () => {
		for (const health of [
			{ status: 500, body: '{"ok":true}' },
			{ body: '{"ok":false}' },
			{ body: '<html>' }
		]) {
			const fetch = fakeFetch({ ...healthy, '/api/health': health });
			const r = byPath(await checkSite({ baseUrl: 'https://example.test', fetch }));
			expect(r['/api/health'].ok).toBe(false);
		}
	});

	it('fails the home page without «Kinky Vibe» or with a bad status', async () => {
		for (const home of [{ body: 'Error 1101' }, { status: 503, body: 'Kinky Vibe' }]) {
			const fetch = fakeFetch({ ...healthy, '/': home });
			const r = byPath(await checkSite({ baseUrl: 'https://example.test', fetch }));
			expect(r['/'].ok).toBe(false);
		}
	});

	it('fails the calendar feed with the wrong content-type', async () => {
		const fetch = fakeFetch({ ...healthy, '/calendario.ics': { body: 'x', type: 'text/html' } });
		const r = byPath(await checkSite({ baseUrl: 'https://example.test', fetch }));
		expect(r['/calendario.ics']).toMatchObject({
			ok: false,
			detail: expect.stringContaining('text/html')
		});
	});

	it('fails a route that does not answer at all', async () => {
		const fetch = fakeFetch({ ...healthy, '/calendario': new Error('timeout') });
		const r = byPath(await checkSite({ baseUrl: 'https://example.test', fetch }));
		expect(r['/calendario']).toMatchObject({
			ok: false,
			detail: expect.stringContaining('timeout')
		});
	});
});

describe('texts', () => {
	it('lists the failures in the issue body', () => {
		const body = issueBody(
			DEFAULT_BASE_URL,
			[{ path: '/', ok: false, detail: 'HTTP 502' }],
			new Date('2026-10-25T03:17:00Z')
		);
		expect(body).toContain('- `/`: HTTP 502');
		expect(body).toContain('2026-10-25 03:17 UTC');
	});

	it('says when it recovered', () => {
		expect(closeComment(new Date('2026-10-25T03:47:30Z'))).toBe(
			'Producción volvió a responder (chequeado el 2026-10-25 03:47 UTC). Cierro este issue.'
		);
	});
});

describe('run', () => {
	/** @param {any[]} openIssues */
	function fakeGithub(openIssues = [], labelExists = true) {
		const rest = {
			issues: {
				listForRepo: vi.fn(),
				getLabel: vi.fn(async () => {
					if (!labelExists) throw Object.assign(new Error('Not Found'), { status: 404 });
					return { data: {} };
				}),
				createLabel: vi.fn(async () => ({ data: {} })),
				create: vi.fn(async () => ({ data: { number: 99 } })),
				addAssignees: vi.fn(async () => ({ data: {} })),
				createComment: vi.fn(async () => ({ data: {} })),
				update: vi.fn(async () => ({ data: {} }))
			}
		};
		return { rest, paginate: vi.fn(async () => openIssues) };
	}
	const context = { repo: { owner: 'dueñe', repo: 'r' } };
	const core = { info: vi.fn(), notice: vi.fn(), warning: vi.fn() };
	const down = { ...healthy, '/': { status: 502, body: 'Bad gateway' } };

	it('retries after 60 s and opens an assigned issue (creating the label) when still down', async () => {
		const github = fakeGithub([], false);
		const sleep = vi.fn(async () => {});
		const fetch = fakeFetch(down);
		const d = await run({ github, context, core, fetch, sleep });
		expect(d.action).toBe('open');
		expect(sleep).toHaveBeenCalledWith(RETRY_DELAY_MS);
		expect(fetch).toHaveBeenCalledTimes(8);
		expect(github.rest.issues.createLabel).toHaveBeenCalledWith(
			expect.objectContaining({ name: LABEL })
		);
		expect(github.rest.issues.create).toHaveBeenCalledWith(
			expect.objectContaining({ title: ISSUE_TITLE, labels: [LABEL] })
		);
		expect(github.rest.issues.addAssignees).toHaveBeenCalledWith(
			expect.objectContaining({ issue_number: 99, assignees: ['dueñe'] })
		);
	});

	it('keeps the issue open even if assigning fails', async () => {
		const github = fakeGithub();
		github.rest.issues.addAssignees.mockRejectedValueOnce(new Error('nope'));
		const d = await run({ github, context, core, fetch: fakeFetch(down), sleep: async () => {} });
		expect(d.action).toBe('open');
		expect(github.rest.issues.createLabel).not.toHaveBeenCalled();
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('No pude asignar'));
	});

	it('does not retry or touch issues when everything is fine', async () => {
		const github = fakeGithub();
		const sleep = vi.fn(async () => {});
		const d = await run({ github, context, core, fetch: fakeFetch(healthy), sleep });
		expect(d.action).toBe('none');
		expect(sleep).not.toHaveBeenCalled();
		expect(github.rest.issues.create).not.toHaveBeenCalled();
	});

	it('closes the open alarm with a comment saying when it recovered', async () => {
		const github = fakeGithub([alarm(50)]);
		const now = () => new Date('2026-10-25T03:47:00Z');
		await run({ github, context, core, fetch: fakeFetch(healthy), now });
		expect(github.rest.issues.createComment).toHaveBeenCalledWith(
			expect.objectContaining({ issue_number: 50, body: expect.stringContaining('03:47 UTC') })
		);
		expect(github.rest.issues.update).toHaveBeenCalledWith(
			expect.objectContaining({ issue_number: 50, state: 'closed', state_reason: 'completed' })
		);
	});

	it('only reports when run against another URL', async () => {
		const github = fakeGithub();
		const d = await run({
			github,
			context,
			core,
			baseUrl: 'https://preview.example.test/algo',
			fetch: fakeFetch(down),
			sleep: async () => {}
		});
		expect(d.action).toBe('open');
		expect(github.rest.issues.create).not.toHaveBeenCalled();
	});

	it('rejects a non-https URL', async () => {
		await expect(
			run({ github: fakeGithub(), context, core, baseUrl: 'http://x.test' })
		).rejects.toThrow();
	});
});
