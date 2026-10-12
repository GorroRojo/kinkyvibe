import { describe, expect, it, vi } from 'vitest';
import { ISSUE_TITLE, LABEL, closeComment, decide, run } from './repaso-vigilante.js';

const now = new Date('2026-10-14T04:23:00Z');
const daysAgo = (/** @type {number} */ d) => new Date(now.getTime() - d * 86400000).toISOString();
const pr = (number, days, labels = [{ name: LABEL }]) => ({
	number,
	created_at: daysAgo(days),
	labels
});
const alarm = (number = 50) => ({ number, title: ISSUE_TITLE, labels: [{ name: LABEL }] });

describe('decide', () => {
	it('does nothing when there is a recent review PR and no open alarm', () => {
		expect(decide({ pulls: [pr(10, 2)], openIssues: [], now }).action).toBe('none');
	});

	it('counts a PR created exactly 8 days ago as recent', () => {
		expect(decide({ pulls: [pr(10, 8)], openIssues: [], now }).action).toBe('none');
	});

	it('opens an issue when the last review PR is older than 8 days', () => {
		expect(decide({ pulls: [pr(10, 8.01)], openIssues: [], now }).action).toBe('open');
	});

	it('opens an issue when there are no PRs at all', () => {
		expect(decide({ pulls: [], openIssues: [], now }).action).toBe('open');
	});

	it('ignores recent PRs without the label', () => {
		const pulls = [pr(11, 1, [{ name: 'docs' }]), pr(12, 1, [])];
		expect(decide({ pulls, openIssues: [], now }).action).toBe('open');
	});

	it('accepts labels as plain strings', () => {
		expect(decide({ pulls: [pr(10, 1, [LABEL])], openIssues: [], now }).action).toBe('none');
	});

	it('ignores PRs dated in the future and invalid dates', () => {
		const pulls = [pr(10, -1), { number: 11, created_at: 'nope', labels: [{ name: LABEL }] }];
		expect(decide({ pulls, openIssues: [], now }).action).toBe('open');
	});

	it('does not open a duplicate when the alarm issue is already open', () => {
		const d = decide({ pulls: [pr(10, 20)], openIssues: [alarm(50)], now });
		expect(d.action).toBe('none');
		expect(d.reason).toContain('#50');
	});

	it('does not count other open issues or PRs as the alarm', () => {
		const openIssues = [
			{ number: 51, title: 'Otro issue', labels: [{ name: LABEL }] },
			{ number: 52, title: ISSUE_TITLE, labels: [] },
			{ ...alarm(53), pull_request: {} }
		];
		expect(decide({ pulls: [], openIssues, now }).action).toBe('open');
	});

	it('closes every open alarm once a recent review PR exists, citing the newest PR', () => {
		const d = decide({ pulls: [pr(9, 6), pr(10, 1)], openIssues: [alarm(50), alarm(60)], now });
		expect(d).toMatchObject({ action: 'close', issues: [50, 60], pull: { number: 10 } });
	});

	it('takes a number as now and a custom window', () => {
		const d = decide({ pulls: [pr(10, 3)], openIssues: [], now: now.getTime(), maxDays: 2 });
		expect(d.action).toBe('open');
	});
});

describe('closeComment', () => {
	it('names the PR and its date', () => {
		expect(closeComment({ number: 7, created_at: '2026-10-12T12:47:00Z' })).toBe(
			'Apareció el PR de repaso #7 (creado el 2026-10-12). Cierro este issue.'
		);
	});
});

describe('run', () => {
	/** @param {any[]} items */
	function fakeGithub(items, labelExists = true) {
		const rest = {
			issues: {
				listForRepo: vi.fn(),
				getLabel: vi.fn(async () => {
					if (!labelExists) throw Object.assign(new Error('Not Found'), { status: 404 });
					return { data: {} };
				}),
				createLabel: vi.fn(async () => ({ data: {} })),
				create: vi.fn(async () => ({ data: { number: 99 } })),
				createComment: vi.fn(async () => ({ data: {} })),
				update: vi.fn(async () => ({ data: {} }))
			}
		};
		return { rest, paginate: vi.fn(async () => items) };
	}
	const context = { repo: { owner: 'o', repo: 'r' } };
	const core = { info: vi.fn(), notice: vi.fn() };

	it('opens the issue (creating the label if missing) when there is no recent PR', async () => {
		const github = fakeGithub([{ ...pr(10, 30), pull_request: {}, state: 'closed' }], false);
		await run({ github, context, core, now });
		expect(github.rest.issues.createLabel).toHaveBeenCalledWith(
			expect.objectContaining({ name: LABEL })
		);
		expect(github.rest.issues.create).toHaveBeenCalledWith(
			expect.objectContaining({ title: ISSUE_TITLE, labels: [LABEL] })
		);
	});

	it('closes the open alarm with a comment when a recent PR exists', async () => {
		const github = fakeGithub([
			{ ...pr(10, 1), pull_request: {}, state: 'open' },
			{ ...alarm(50), state: 'open' },
			{ ...alarm(40), state: 'closed' }
		]);
		await run({ github, context, core, now });
		expect(github.rest.issues.createComment).toHaveBeenCalledTimes(1);
		expect(github.rest.issues.update).toHaveBeenCalledWith(
			expect.objectContaining({ issue_number: 50, state: 'closed', state_reason: 'completed' })
		);
		expect(github.rest.issues.create).not.toHaveBeenCalled();
	});
});
