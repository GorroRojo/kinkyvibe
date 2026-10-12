import { describe, expect, it } from 'vitest';
import {
	check,
	decide,
	parseMergeCall,
	planReviewReason,
	planReviewShas,
	touchesPlan
} from './check-merge.js';

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const mcp = (tool_input) => ({ tool_name: 'mcp__github__merge_pull_request', tool_input });

const pr = (over = {}) => ({
	number: 7,
	state: 'open',
	draft: false,
	base: { ref: 'main' },
	head: { sha: 'abc123' },
	...over
});
const green = { status: { statuses: [] }, checks: { check_runs: [run('test'), run('ci-ok')] } };
function run(name, conclusion = 'success', status = 'completed') {
	return { name, status, conclusion: status === 'completed' ? conclusion : null };
}

const MAIN_SHA = '0123456789abcdef0123456789abcdef01234567';
const planFile = { filename: 'docs/plan.md' };
const codeFile = { filename: 'src/lib/x.js' };

/** Fake GitHub API: routes by path suffix. */
function fakeApi({
	pull = pr(),
	status = green.status,
	checks = green.checks,
	files = [codeFile],
	comments = [],
	main = { sha: MAIN_SHA }
} = {}) {
	const calls = [];
	const get = async (path) => {
		calls.push(path);
		if (/\/pulls\/\d+$/.test(path)) return pull;
		if (path.includes('/status')) return status;
		if (path.includes('/check-runs')) return checks;
		if (/\/pulls\/\d+\/files\?/.test(path)) return files;
		if (/\/issues\/\d+\/comments\?/.test(path)) return comments;
		if (path.endsWith('/commits/main')) return main;
		throw new Error(`unexpected ${path}`);
	};
	return { get, calls };
}

describe('parseMergeCall', () => {
	it('ignores tools and commands that are not merges', () => {
		expect(parseMergeCall({ tool_name: 'Edit', tool_input: {} })).toEqual({ merge: false });
		expect(parseMergeCall(bash('npm run lint && git push -u origin HEAD'))).toEqual({
			merge: false
		});
		expect(parseMergeCall(bash('gh pr view 5 --json baseRefName'))).toEqual({ merge: false });
		// only mentions it, e.g. in a commit message
		expect(parseMergeCall(bash('git commit -m "docs: explain gh pr merge 5"'))).toEqual({
			merge: false
		});
	});

	it('reads the MCP merge tool input', () => {
		expect(parseMergeCall(mcp({ owner: 'o', repo: 'r', pullNumber: 12 }))).toEqual({
			merge: true,
			owner: 'o',
			repo: 'r',
			number: 12,
			admin: false
		});
	});

	it('reads gh pr merge with a number, #number, URL or -R', () => {
		expect(parseMergeCall(bash('gh pr merge 64 --squash'))).toMatchObject({
			merge: true,
			owner: 'GorroRojo',
			repo: 'kinkyvibe',
			number: 64,
			admin: false
		});
		expect(parseMergeCall(bash('gh pr merge --squash --delete-branch #64'))).toMatchObject({
			number: 64
		});
		expect(
			parseMergeCall(bash('gh pr merge https://github.com/acme/site/pull/9 --merge'))
		).toMatchObject({ owner: 'acme', repo: 'site', number: 9 });
		expect(parseMergeCall(bash('gh pr merge -R acme/site 3'))).toMatchObject({
			owner: 'acme',
			repo: 'site',
			number: 3
		});
		expect(parseMergeCall(bash('cd x && GH_PROMPT_DISABLED=1 gh pr merge 5'))).toMatchObject({
			number: 5
		});
	});

	it('does not take a flag value as the PR number', () => {
		expect(parseMergeCall(bash('gh pr merge --subject 123 --squash'))).toMatchObject({
			number: null
		});
		expect(parseMergeCall(bash('gh pr merge -b "fixes 12 things" 40'))).toMatchObject({
			number: 40
		});
	});

	it('reads REST merges via curl or gh api', () => {
		expect(
			parseMergeCall(
				bash(
					'curl -X PUT -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/repos/GorroRojo/kinkyvibe/pulls/81/merge'
				)
			)
		).toMatchObject({ merge: true, number: 81 });
		expect(
			parseMergeCall(bash('gh api -X PUT repos/acme/site/pulls/4/merge -f merge_method=squash'))
		).toMatchObject({ owner: 'acme', repo: 'site', number: 4 });
	});

	it('flags --admin', () => {
		expect(parseMergeCall(bash('gh pr merge 5 --admin --squash'))).toMatchObject({ admin: true });
	});
});

describe('decide', () => {
	it('allows an open PR into main with all checks green', () => {
		expect(decide(pr(), green.status, green.checks)).toEqual({ allow: true, reasons: [] });
	});

	it('accepts skipped and neutral check runs and successful commit statuses', () => {
		const checks = { check_runs: [run('a'), run('b', 'skipped'), run('c', 'neutral')] };
		const status = { statuses: [{ context: 'Cloudflare Pages', state: 'success' }] };
		expect(decide(pr(), status, checks).allow).toBe(true);
	});

	it('blocks a stacked PR whose base is not main', () => {
		const d = decide(pr({ base: { ref: 'claude/parent' } }), green.status, green.checks);
		expect(d.allow).toBe(false);
		expect(d.reasons[0]).toMatch(/targets "claude\/parent", not "main"/);
	});

	it('blocks failing, cancelled or pending checks', () => {
		for (const bad of [
			run('test', 'failure'),
			run('test', 'cancelled'),
			run('e2e', null, 'in_progress')
		]) {
			const d = decide(pr(), green.status, { check_runs: [run('lint'), bad] });
			expect(d.allow).toBe(false);
			expect(d.reasons[0]).toContain(bad.name);
		}
		const d = decide(
			pr(),
			{ statuses: [{ context: 'Cloudflare Pages', state: 'pending' }] },
			green.checks
		);
		expect(d.reasons[0]).toContain('Cloudflare Pages=pending');
	});

	it('blocks when no checks reported yet', () => {
		const d = decide(pr(), { statuses: [] }, { check_runs: [] });
		expect(d.allow).toBe(false);
		expect(d.reasons[0]).toMatch(/no checks/);
	});

	it('blocks closed, merged and draft PRs', () => {
		expect(
			decide(pr({ state: 'closed', merged: true }), green.status, green.checks).reasons[0]
		).toMatch(/already merged/);
		expect(decide(pr({ draft: true }), green.status, green.checks).reasons[0]).toMatch(/draft/);
	});
});

describe('check (with a mocked GitHub API)', () => {
	it('returns null (allow) for non-merge calls without calling the API', async () => {
		const api = fakeApi();
		expect(await check(bash('ls'), api.get)).toBeNull();
		expect(api.calls).toEqual([]);
	});

	it('allows a green PR into main and queries the head commit', async () => {
		const api = fakeApi();
		expect(await check(bash('gh pr merge 7 --squash'), api.get)).toBeNull();
		// The files are read too (for the docs/plan.md rule); main and the comments only when the
		// PR touches the plan.
		expect(api.calls).toEqual([
			'/repos/GorroRojo/kinkyvibe/pulls/7',
			'/repos/GorroRojo/kinkyvibe/commits/abc123/status?per_page=100',
			'/repos/GorroRojo/kinkyvibe/commits/abc123/check-runs?per_page=100',
			'/repos/GorroRojo/kinkyvibe/pulls/7/files?per_page=100&page=1'
		]);
	});

	it('blocks --admin before calling the API', async () => {
		const api = fakeApi();
		expect(await check(bash('gh pr merge 7 --admin'), api.get)).toMatch(/--admin/);
		expect(api.calls).toEqual([]);
	});

	it('blocks a merge without an explicit PR number', async () => {
		expect(await check(bash('gh pr merge --squash'), fakeApi().get)).toMatch(/PR number/);
	});

	it('blocks the MCP tool on a stacked PR', async () => {
		const api = fakeApi({ pull: pr({ base: { ref: 'claude/tickets' } }) });
		const msg = await check(mcp({ owner: 'GorroRojo', repo: 'kinkyvibe', pullNumber: 7 }), api.get);
		expect(msg).toMatch(/stacked PR/);
	});

	it('blocks when the API cannot be reached', async () => {
		const get = async () => {
			throw new Error('HTTP 503');
		};
		const msg = await check(bash('gh pr merge 7'), get);
		expect(msg).toMatch(/could not reach the GitHub API \(HTTP 503\)/);
		expect(msg).toMatch(/by hand/);
	});
});

describe('docs/plan.md review rule', () => {
	it('finds the SHAs in «Plan revisado contra main <sha>» comments', () => {
		expect(
			planReviewShas([
				{ body: 'Plan revisado contra main 0123456' },
				{ body: 'LGTM' },
				{ body: 'Releí.\n\nplan revisado contra main `ABCDEF0123`' },
				{ body: 'Plan revisado contra main 12345' }, // too short
				{ body: null }
			])
		).toEqual(['0123456', 'abcdef0123']);
	});

	it('only applies to PRs that change or rename docs/plan.md', () => {
		expect(touchesPlan([codeFile])).toBe(false);
		expect(touchesPlan([codeFile, planFile])).toBe(true);
		expect(touchesPlan([{ filename: 'docs/plan-2.md', previous_filename: 'docs/plan.md' }])).toBe(
			true
		);
		expect(planReviewReason(7, [codeFile], [], MAIN_SHA)).toBeNull();
	});

	it("allows a comment with main's current head, full or 7+ characters", () => {
		for (const sha of [MAIN_SHA, MAIN_SHA.slice(0, 7), MAIN_SHA.slice(0, 12).toUpperCase()]) {
			expect(
				planReviewReason(7, [planFile], [{ body: `Plan revisado contra main ${sha}` }], MAIN_SHA)
			).toBeNull();
		}
	});

	it('blocks without the comment, or with an old main SHA, and says exactly what to do', () => {
		const none = planReviewReason(7, [planFile], [{ body: 'LGTM' }], MAIN_SHA);
		expect(none).toMatch(/PR #7 changes docs\/plan.md/);
		expect(none).toContain(`Plan revisado contra main ${MAIN_SHA}`);
		expect(none).toMatch(/git diff origin\/main/);
		const old = planReviewReason(
			7,
			[planFile],
			[{ body: 'Plan revisado contra main fedcba9876' }],
			MAIN_SHA
		);
		expect(old).toMatch(/no comment/);
	});

	it('check blocks a green PR that changes the plan without the comment', async () => {
		const api = fakeApi({ files: [codeFile, planFile] });
		const msg = await check(bash('gh pr merge 7 --merge'), api.get);
		expect(msg).toMatch(/^Blocked by the merge guard/);
		expect(msg).toContain(`Plan revisado contra main ${MAIN_SHA}`);
		expect(api.calls).toEqual(
			expect.arrayContaining([
				'/repos/GorroRojo/kinkyvibe/commits/main',
				'/repos/GorroRojo/kinkyvibe/issues/7/comments?per_page=100&page=1'
			])
		);
	});

	it("check allows it once the comment names main's current head", async () => {
		const api = fakeApi({
			files: [planFile],
			comments: [{ body: `Plan revisado contra main ${MAIN_SHA.slice(0, 9)}` }]
		});
		expect(await check(bash('gh pr merge 7 --merge'), api.get)).toBeNull();
	});

	it('check keeps the other reasons next to the plan one', async () => {
		const api = fakeApi({ files: [planFile], pull: pr({ draft: true }) });
		const msg = await check(bash('gh pr merge 7'), api.get);
		expect(msg).toMatch(/draft/);
		expect(msg).toMatch(/changes docs\/plan.md/);
	});

	it('check reads every page of files and comments', async () => {
		const many = Array.from({ length: 100 }, (_, i) => ({ filename: `src/f${i}.js` }));
		const calls = [];
		const get = async (path) => {
			calls.push(path);
			if (/\/pulls\/\d+$/.test(path)) return pr();
			if (path.includes('/status')) return green.status;
			if (path.includes('/check-runs')) return green.checks;
			if (path.includes('/files?')) return path.endsWith('page=1') ? many : [planFile];
			if (path.includes('/comments?')) return [];
			if (path.endsWith('/commits/main')) return { sha: MAIN_SHA };
			throw new Error(`unexpected ${path}`);
		};
		expect(await check(bash('gh pr merge 7'), get)).toMatch(/changes docs\/plan.md/);
		expect(calls).toContain('/repos/GorroRojo/kinkyvibe/pulls/7/files?per_page=100&page=2');
	});

	it('blocks when the files, comments or main cannot be read', async () => {
		const get = async (path) => {
			if (path.includes('/comments?')) throw new Error('HTTP 502');
			return fakeApi({ files: [planFile] }).get(path);
		};
		expect(await check(bash('gh pr merge 7'), get)).toMatch(/could not reach the GitHub API/);
	});
});
