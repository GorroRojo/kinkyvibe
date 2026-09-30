import { describe, expect, it } from 'vitest';
import { check, decide, parseMergeCall } from './check-merge.js';

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

/** Fake GitHub API: routes by path suffix. */
function fakeApi({ pull = pr(), status = green.status, checks = green.checks } = {}) {
	const calls = [];
	const get = async (path) => {
		calls.push(path);
		if (/\/pulls\/\d+$/.test(path)) return pull;
		if (path.includes('/status')) return status;
		if (path.includes('/check-runs')) return checks;
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
		expect(api.calls).toEqual([
			'/repos/GorroRojo/kinkyvibe/pulls/7',
			'/repos/GorroRojo/kinkyvibe/commits/abc123/status?per_page=100',
			'/repos/GorroRojo/kinkyvibe/commits/abc123/check-runs?per_page=100'
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
