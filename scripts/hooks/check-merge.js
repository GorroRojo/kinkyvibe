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
//   - the PR changes docs/plan.md and has no comment «Plan revisado contra main <sha>» whose SHA
//     (full or 7+ characters) is main's current head (the plan diff must be re-read against the
//     current main before merging; see «Reglas» in docs/plan.md),
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

export const PLAN_FILE = 'docs/plan.md';
export const PLAN_REVIEW_RE = /Plan revisado contra main\s+`?([0-9a-f]{7,40})\b/gi;

// Pages of 100 read at most for a PR's files or comments (GitHub lists up to 3000 files).
const MAX_PAGES = 30;

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
 * The newest run of each check, by name. Re-running CI on the same commit (a new push of the PR
 * description re-triggers it, and `concurrency` cancels the run in flight) leaves the old,
 * cancelled or failed runs on the head commit next to the new ones; only the latest one says
 * whether that check passes. A run that hasn't started yet counts as the newest (it blocks until
 * it finishes). Ties fall back to the higher id.
 * @param {{ name?: string, id?: number, started_at?: string | null }[]} runs
 */
export function latestRuns(runs) {
	// A matrix job cancelled before GitHub expands it keeps its template name
	// («tests (${{ matrix.shard }}/3)»). No later run will ever carry that name, so a cancelled one
	// would block forever; the expanded jobs of the newer run are the ones that count.
	runs = runs.filter((r) => !(r.conclusion === 'cancelled' && /\$\{\{/.test(r.name ?? '')));
	/** @param {{ id?: number, started_at?: string | null }} r */
	const when = (r) => (r.started_at ? Date.parse(r.started_at) : Infinity);
	/** @type {Map<string, any>} */
	const byName = new Map();
	for (const r of runs) {
		const prev = byName.get(r.name ?? '');
		if (!prev || when(r) > when(prev) || (when(r) === when(prev) && (r.id ?? 0) > (prev.id ?? 0)))
			byName.set(r.name ?? '', r);
	}
	return [...byName.values()];
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
	const runs = latestRuns(checks?.check_runs ?? []);

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

/**
 * The SHAs named in «Plan revisado contra main <sha>» comments.
 * @param {{ body?: string | null }[]} comments GET /repos/{o}/{r}/issues/{n}/comments
 * @returns {string[]}
 */
export function planReviewShas(comments) {
	const shas = [];
	for (const c of comments ?? []) {
		for (const m of String(c?.body ?? '').matchAll(PLAN_REVIEW_RE)) shas.push(m[1].toLowerCase());
	}
	return shas;
}

/**
 * Does the PR change (or rename) docs/plan.md?
 * @param {{ filename?: string, previous_filename?: string }[]} files GET .../pulls/{n}/files
 */
export function touchesPlan(files) {
	return (files ?? []).some((f) => f?.filename === PLAN_FILE || f?.previous_filename === PLAN_FILE);
}

/**
 * If the PR changes docs/plan.md, it needs a «Plan revisado contra main <sha>» comment with main's
 * current head. Returns the reason to block, or null.
 * @param {number | string} n PR number
 * @param {{ filename?: string, previous_filename?: string }[]} files GET .../pulls/{n}/files
 * @param {{ body?: string | null }[]} comments GET .../issues/{n}/comments
 * @param {string} mainSha main's current head commit
 * @returns {string | null}
 */
export function planReviewReason(n, files, comments, mainSha) {
	if (!touchesPlan(files)) return null;
	const head = String(mainSha ?? '').toLowerCase();
	if (head && planReviewShas(comments).some((sha) => head.startsWith(sha))) return null;
	return (
		`PR #${n} changes ${PLAN_FILE}, and it has no comment «Plan revisado contra main ${head.slice(0, 7)}» ` +
		`for main's current head (${head}). Re-read the PR's diff of ${PLAN_FILE} against the current ` +
		`main (for example \`git fetch origin && git diff origin/main...<PR branch> -- ${PLAN_FILE}\`, and ` +
		`compare it with what main's ${PLAN_FILE} says now), fix anything stale or conflicting, then ` +
		`leave a comment on the PR with the line «Plan revisado contra main ${head}» and merge again. ` +
		`If main moves before the merge, re-read and comment again with the new SHA.`
	);
}

/**
 * GET every page of a GitHub list endpoint (per_page=100), up to MAX_PAGES.
 * @param {(path: string) => Promise<any>} get
 * @param {string} path without query string
 * @returns {Promise<any[]>}
 */
async function getAll(get, path) {
	const all = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		const batch = await get(`${path}?per_page=100&page=${page}`);
		if (!Array.isArray(batch)) break;
		all.push(...batch);
		if (batch.length < 100) break;
	}
	return all;
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
	/** @type {string | null} */
	let planReason = null;
	try {
		pr = await get(`${repoPath}/pulls/${call.number}`);
		const sha = pr?.head?.sha;
		let files;
		[status, checks, files] = await Promise.all([
			get(`${repoPath}/commits/${sha}/status?per_page=100`),
			get(`${repoPath}/commits/${sha}/check-runs?per_page=100`),
			getAll(get, `${repoPath}/pulls/${call.number}/files`)
		]);
		if (touchesPlan(files)) {
			const [main, comments] = await Promise.all([
				get(`${repoPath}/commits/${BASE_BRANCH}`),
				getAll(get, `${repoPath}/issues/${call.number}/comments`)
			]);
			planReason = planReviewReason(call.number, files, comments, main?.sha);
		}
	} catch (e) {
		return (
			`Blocked: the merge guard could not reach the GitHub API (${/** @type {Error} */ (e).message}), ` +
			`so PR #${call.number} was not verified. Check by hand that its base is main and that every ` +
			`check passed (GitHub PR page or API), and ask gorrite to merge it if you can't verify.`
		);
	}

	const { allow, reasons } = decide(pr, status, checks);
	if (planReason) reasons.push(planReason);
	if (allow && !planReason) return null;
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
