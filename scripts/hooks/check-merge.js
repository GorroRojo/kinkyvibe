#!/usr/bin/env node
// Claude Code PreToolUse hook: blocks pull request merges that would go wrong.
//
// Wired up in .claude/settings.json for the Bash tool and the GitHub MCP merge tool. It reads the
// hook input (JSON on stdin: { tool_name, tool_input, ... }) and, when the call is a merge, asks the
// GitHub API for the PR. It blocks (exit code 2, reason on stderr, which Claude sees) when:
//   - `--admin` is used (it bypasses branch protection),
//   - the PR number can't be read from the command,
//   - the PR's base branch is not `main` (a stacked PR: merge its parent first),
//   - the PR is closed or a draft,
//   - the head commit's checks/statuses are not all successful (or none reported yet),
//   - the GitHub API can't be reached (so nothing is verified).
// Anything that is not a merge exits 0 right away (no decision; the normal permission flow runs).
//
// This guards against mistakes, not against someone determined to get around it: text matching on
// Bash commands can be evaded. The real enforcement is branch protection on `main` (`ci-ok`).
// No dependencies. Uses `curl` (it honors HTTPS_PROXY, which Node's fetch does not) with a fetch
// fallback, and GH_TOKEN / GITHUB_TOKEN from the environment when present.

import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DEFAULT_OWNER = 'GorroRojo';
export const DEFAULT_REPO = 'kinkyvibe';
export const BASE_BRANCH = 'main';

const OK_CONCLUSIONS = ['success', 'neutral', 'skipped'];

const GH_MERGE_RE = /(?:^|[;&|(\n]|\$\()\s*(?:\w+=\S*\s+)*gh\s+pr\s+merge\b/;

// `gh pr merge` flags that take a separate value (so the value isn't read as the PR number).
const FLAGS_WITH_VALUE = [
	'-t',
	'--subject',
	'-b',
	'--body',
	'-F',
	'--body-file',
	'-A',
	'--author-email',
	'--match-head-commit'
];

/**
 * The arguments after `gh pr merge`, up to the end of that shell command. Quote-aware enough for
 * `--body "text with spaces"`; not a full shell parser.
 * @param {string} cmd
 * @returns {string[]}
 */
function ghMergeArgs(cmd) {
	const m0 = cmd.match(GH_MERGE_RE);
	const rest = m0 ? cmd.slice(/** @type {number} */ (m0.index) + m0[0].length) : '';
	const tokens = [];
	const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(&&|\|\||[;|&\n])|([^\s"';|&]+)/g;
	let m;
	while ((m = re.exec(rest))) {
		if (m[3]) break; // end of this command
		tokens.push(m[1] ?? m[2] ?? m[4]);
	}
	return tokens;
}

/**
 * Work out whether a tool call is a PR merge and which PR it targets.
 * @param {{ tool_name?: string, tool_input?: Record<string, any> }} input hook input
 * @returns {{ merge: false } | { merge: true, owner: string, repo: string, number: number | null, admin: boolean }}
 */
export function parseMergeCall(input) {
	const tool = input?.tool_name ?? '';
	const args = input?.tool_input ?? {};

	if (/^mcp__.+__merge_pull_request$/.test(tool)) {
		const number = Number(args.pullNumber);
		return {
			merge: true,
			owner: args.owner || DEFAULT_OWNER,
			repo: args.repo || DEFAULT_REPO,
			number: Number.isInteger(number) && number > 0 ? number : null,
			admin: false
		};
	}

	if (tool !== 'Bash') return { merge: false };
	const cmd = String(args.command ?? '');

	// `gh pr merge` in command position (start, after ; && || | ( $( or a newline, optionally after
	// VAR=value prefixes), so a commit message that merely mentions it doesn't trigger the guard.
	const ghMerge = GH_MERGE_RE.test(cmd);
	const apiMerge = /\/pulls\/\d+\/merge\b/.test(cmd) && /\b(curl|wget|gh\s+api)\b/.test(cmd);
	if (!ghMerge && !apiMerge) return { merge: false };

	let owner = DEFAULT_OWNER;
	let repo = DEFAULT_REPO;
	let number = null;

	// REST: .../repos/<owner>/<repo>/pulls/<n>/merge (curl or `gh api`)
	const rest = cmd.match(/repos\/([\w.-]+)\/([\w.-]+)\/pulls\/(\d+)\/merge\b/);
	if (rest) {
		[owner, repo] = [rest[1], rest[2]];
		number = Number(rest[3]);
	} else if (ghMerge) {
		// gh pr merge <n | url> [-R owner/repo] [flags]
		const tokens = ghMergeArgs(cmd);
		for (let i = 0; i < tokens.length; i++) {
			const t = tokens[i];
			if (/^(-R|--repo)$/.test(t) || /^--repo=/.test(t)) {
				const value = t.includes('=') ? t.slice(t.indexOf('=') + 1) : tokens[++i];
				const m = String(value ?? '').match(/^(?:github\.com\/)?([\w.-]+)\/([\w.-]+)$/);
				if (m) [owner, repo] = [m[1], m[2]];
			} else if (FLAGS_WITH_VALUE.includes(t)) {
				i++; // skip the flag's value
			} else if (!t.startsWith('-') && number === null) {
				const url = t.match(/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/);
				if (url) {
					[owner, repo] = [url[1], url[2]];
					number = Number(url[3]);
				} else if (/^#?\d+$/.test(t)) {
					number = Number(t.replace('#', ''));
				}
			}
		}
	} else {
		const any = cmd.match(/\/pulls\/(\d+)\/merge\b/);
		number = any ? Number(any[1]) : null;
	}

	return { merge: true, owner, repo, number, admin: /(^|\s)--admin\b/.test(cmd) };
}

/**
 * Decide whether a merge may go ahead, from GitHub API responses.
 * @param {object} pr        GET /repos/{o}/{r}/pulls/{n}
 * @param {object} status    GET /repos/{o}/{r}/commits/{sha}/status  (combined commit status)
 * @param {object} checks    GET /repos/{o}/{r}/commits/{sha}/check-runs
 * @returns {{ allow: boolean, reasons: string[] }}
 */
export function decide(pr, status, checks) {
	const reasons = [];
	const n = pr?.number ?? '?';

	const base = pr?.base?.ref;
	if (base !== BASE_BRANCH) {
		reasons.push(
			`PR #${n} targets "${base}", not "${BASE_BRANCH}". It is a stacked PR: merge its parent into ` +
				`main first (bottom-up), then retarget this PR to main and wait for its CI to pass.`
		);
	}
	if (pr?.state !== 'open')
		reasons.push(`PR #${n} is ${pr?.merged ? 'already merged' : pr?.state}.`);
	if (pr?.draft) reasons.push(`PR #${n} is a draft.`);

	const statuses = status?.statuses ?? [];
	const runs = checks?.check_runs ?? [];

	const badStatuses = statuses
		.filter((s) => s.state !== 'success')
		.map((s) => `${s.context}=${s.state}`);
	const badRuns = runs
		.filter((c) => c.status !== 'completed' || !OK_CONCLUSIONS.includes(c.conclusion))
		.map((c) => `${c.name}=${c.status === 'completed' ? c.conclusion : c.status}`);

	if (statuses.length === 0 && runs.length === 0) {
		reasons.push(`PR #${n}: no checks have reported on the head commit yet. Wait for CI.`);
	} else if (badStatuses.length || badRuns.length) {
		reasons.push(
			`PR #${n}: checks are not all successful (${[...badRuns, ...badStatuses].join(', ')}). ` +
				`Wait for them to finish or fix the failures; never skip or weaken tests to get green.`
		);
	}

	return { allow: reasons.length === 0, reasons };
}

function curlJson(url, token) {
	// The token goes in through stdin (`-H @-`), not argv, so it never shows up in `ps` or in
	// error messages.
	const args = ['-sS', '-L', '--max-time', '15', '-H', 'Accept: application/vnd.github+json'];
	args.push('-H', 'X-GitHub-Api-Version: 2022-11-28', '-w', '\n%{http_code}');
	if (token) args.push('-H', '@-');
	args.push(url);
	return new Promise((resolve, reject) => {
		const child = execFile('curl', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
			if (err) {
				if (/** @type {any} */ (err).code === 'ENOENT') return reject(err);
				const detail = String(stderr).trim().split('\n').pop() || 'curl failed';
				return reject(new Error(detail.replace(/Bearer\s+\S+/g, 'Bearer ***')));
			}
			const cut = stdout.lastIndexOf('\n');
			const code = Number(stdout.slice(cut + 1));
			if (code < 200 || code >= 300) return reject(new Error(`HTTP ${code} for ${url}`));
			try {
				resolve(JSON.parse(stdout.slice(0, cut)));
			} catch {
				reject(new Error(`invalid JSON from ${url}`));
			}
		});
		child.stdin?.on('error', () => {}); // curl may exit before reading stdin
		child.stdin?.end(token ? `Authorization: Bearer ${token}\n` : '');
	});
}

async function fetchJson(url, token) {
	const headers = { Accept: 'application/vnd.github+json' };
	if (token) headers.Authorization = `Bearer ${token}`;
	const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
	return res.json();
}

/** GET a GitHub API path; curl first, fetch if curl isn't installed. */
export async function githubGet(path, token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
	const url = `https://api.github.com${path}`;
	try {
		return await curlJson(url, token);
	} catch (e) {
		if (/** @type {any} */ (e).code === 'ENOENT') return fetchJson(url, token);
		throw e;
	}
}

/**
 * Full check for one hook input. Returns null to allow, or a message to block with.
 * @param {object} input hook input
 * @param {(path: string) => Promise<any>} get GitHub API GET (injectable for tests)
 * @returns {Promise<string | null>}
 */
export async function check(input, get = githubGet) {
	const call = parseMergeCall(input);
	if (!call.merge) return null;

	if (call.admin) {
		return 'Blocked: never merge with --admin. It bypasses branch protection and the required checks.';
	}
	if (!call.number) {
		return (
			'Blocked: write the PR number explicitly (e.g. `gh pr merge 123 --squash`) so the merge ' +
			'guard can check its base branch and CI status.'
		);
	}

	const repoPath = `/repos/${call.owner}/${call.repo}`;
	let pr, status, checks;
	try {
		pr = await get(`${repoPath}/pulls/${call.number}`);
		const sha = pr?.head?.sha;
		[status, checks] = await Promise.all([
			get(`${repoPath}/commits/${sha}/status?per_page=100`),
			get(`${repoPath}/commits/${sha}/check-runs?per_page=100`)
		]);
	} catch (e) {
		return (
			`Blocked: the merge guard could not reach the GitHub API (${/** @type {Error} */ (e).message}), ` +
			`so PR #${call.number} was not verified. Check by hand that its base is main and that every ` +
			`check passed (GitHub PR page or API), and ask gorrite to merge it if you can't verify.`
		);
	}

	const { allow, reasons } = decide(pr, status, checks);
	if (allow) return null;
	return ['Blocked by the merge guard (scripts/hooks/check-merge.js):', ...reasons].join('\n- ');
}

async function readStdin() {
	let s = '';
	for await (const chunk of process.stdin) s += chunk;
	return s;
}

async function main() {
	let input;
	try {
		input = JSON.parse(await readStdin());
	} catch {
		process.exit(0); // not a hook invocation we understand: no decision
	}
	const message = await check(input);
	if (message) {
		process.stderr.write(message + '\n');
		process.exit(2);
	}
	process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
