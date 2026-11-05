// Aviso «Cada deploy» por Telegram (ítem `avisos-deploy` en docs/plan.md; docs/telegram.md,
// «Cada deploy»). Lo corre .github/workflows/aviso-deploy.yml en cada push a `main`:
//
// 1. Busca el PR de cada commit del push (REST `commits/{sha}/pulls`, solo los mergeados a main).
// 2. Espera que termine el check «Workers Builds: kinkyvibe» del último commit del push (el build
//    de producción de Cloudflare), hasta 20 minutos.
// 3. Le manda a producción `POST /api/interno/deploy` con el header `x-deploy-secret`, el resultado
//    y los PRs. El sitio arma el texto y lo manda a les admins que prendieron «Cada deploy».
//
// Si el build se canceló (Workers Builds lo cancela cuando llega un push más nuevo), no avisa: el
// build del push siguiente es el que publica. Sin dependencias; `run` usa el `github` y el `core`
// de actions/github-script.

/** El nombre del check del build de producción (Workers Builds). */
export const CHECK_NAME = 'Workers Builds: kinkyvibe';
/** Cuánto esperar el check, como mucho. */
export const WAIT_MS = 20 * 60 * 1000;
/** Cada cuánto mirarlo. */
export const POLL_MS = 30 * 1000;
/** Hasta cuántos commits del push se miran (el evento `push` trae hasta 20). */
export const COMMITS_MAX = 20;

/**
 * @typedef {{ number: number, title: string, body: string | null, merged_at?: string | null,
 *   base?: { ref?: string } }} PullRequest
 * @typedef {{ status: string, conclusion: string | null, started_at?: string | null,
 *   name?: string }} CheckRun
 */

/**
 * Los PRs de un commit que se mergearon a `main`, con lo que necesita el aviso.
 *
 * @param {PullRequest[]} prs
 * @returns {{ number: number, title: string, body: string }[]}
 */
export function mergedPrs(prs) {
	return prs
		.filter((p) => p.merged_at && p.base?.ref === 'main')
		.map((p) => ({ number: p.number, title: p.title, body: p.body ?? '' }));
}

/**
 * La corrida más nueva del check (puede haber varias si se reintentó el build).
 *
 * @param {CheckRun[]} runs
 * @returns {CheckRun | null}
 */
export function latestRun(runs) {
	const mine = runs.filter((r) => !r.name || r.name === CHECK_NAME);
	if (mine.length === 0) return null;
	return [...mine].sort((a, b) =>
		String(b.started_at ?? '').localeCompare(String(a.started_at ?? ''))
	)[0];
}

/**
 * Qué hacer con el estado del check: seguir esperando, avisar con un resultado o no avisar.
 *
 * @param {CheckRun | null} run
 * @returns {{ action: 'wait' } | { action: 'skip', reason: string }
 *   | { action: 'notify', conclusion: string }}
 */
export function decide(run) {
	if (!run || run.status !== 'completed') return { action: 'wait' };
	if (
		run.conclusion === 'cancelled' ||
		run.conclusion === 'skipped' ||
		run.conclusion === 'neutral'
	) {
		return { action: 'skip', reason: `el build terminó como «${run.conclusion}»` };
	}
	return { action: 'notify', conclusion: run.conclusion === 'success' ? 'success' : 'failure' };
}

/**
 * @param {{ github: any, context: any, core: any, siteUrl: string, secret: string | undefined,
 *   fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>, now?: () => number }} input
 */
export async function run({
	github,
	context,
	core,
	siteUrl,
	secret,
	fetch: fetchFn = fetch,
	sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
	now = Date.now
}) {
	if (!secret) {
		core.notice('Sin el secreto DEPLOY_NOTIFY_SECRET: no hay aviso de deploy.');
		return { action: 'skip', reason: 'sin secreto' };
	}
	const { owner, repo } = context.repo;
	const head = String(context.payload.after ?? context.sha);
	/** @type {{ id: string, message: string }[]} */
	const pushed = (context.payload.commits ?? []).slice(-COMMITS_MAX);
	const list = pushed.length
		? pushed
		: [{ id: head, message: context.payload.head_commit?.message ?? '' }];

	const commits = [];
	for (const c of list) {
		const { data } = await github.rest.repos.listPullRequestsAssociatedWithCommit({
			owner,
			repo,
			commit_sha: c.id
		});
		commits.push({ sha: c.id, message: c.message ?? '', prs: mergedPrs(data) });
	}

	const deadline = now() + WAIT_MS;
	/** @type {ReturnType<typeof decide>} */
	let decision = { action: 'wait' };
	while (now() < deadline) {
		const { data } = await github.rest.checks.listForRef({
			owner,
			repo,
			ref: head,
			check_name: CHECK_NAME,
			filter: 'latest'
		});
		decision = decide(latestRun(data.check_runs ?? []));
		if (decision.action !== 'wait') break;
		await sleep(POLL_MS);
	}
	if (decision.action === 'skip') {
		core.notice(`Sin aviso: ${decision.reason}.`);
		return decision;
	}
	const conclusion = decision.action === 'notify' ? decision.conclusion : 'timed_out';

	const url = `${siteUrl.replace(/\/+$/, '')}/api/interno/deploy`;
	// El cuerpo que lee parseDeploy (src/lib/server/deploy/aviso.js).
	const body = JSON.stringify({ sha: head, conclusion, commits });
	/** @type {Response | null} */
	let res = null;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			res = await fetchFn(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-deploy-secret': secret },
				body
			});
			if (res.status < 500) break;
		} catch (/** @type {any} */ e) {
			core.warning(`Intento ${attempt}: ${e?.message ?? e}`);
		}
		if (attempt < 3) await sleep(10_000);
	}
	if (!res || !res.ok) {
		core.setFailed(
			`El aviso de deploy no salió: ${res ? `HTTP ${res.status} ${await res.text()}` : 'sin respuesta'}`
		);
		return { action: 'failed', conclusion };
	}
	core.notice(`Aviso de deploy (${conclusion}): ${await res.text()}`);
	return { action: 'notified', conclusion };
}
