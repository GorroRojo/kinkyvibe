// Vigilante de producción (ítem `vigilante-produccion` en docs/plan.md).
//
// Lo corre `.github/workflows/vigilante-produccion.yml` cada 30 minutos, sin Claude ni Cloudflare:
// pide algunas páginas del sitio público y, si fallan dos veces seguidas (la segunda, 60 segundos
// después), abre un issue (uno solo) asignado al dueño del repo. Cuando todo vuelve a responder y
// el issue sigue abierto, lo cierra con un comentario que dice cuándo se recuperó.
//
// `decide` es pura (la prueban los tests); `checkSite` hace los pedidos (con `fetch` inyectable)
// y `run` hace las llamadas a la API desde actions/github-script. Sin dependencias.

export const LABEL = 'produccion-caida';
export const ISSUE_TITLE = 'Producción no responde';
export const DEFAULT_BASE_URL = 'https://kinkyvibe.ar';
export const RETRY_DELAY_MS = 60_000;
const REQUEST_TIMEOUT_MS = 20_000;

/** @typedef {{ name?: string } | string} Label */
/** @typedef {{ number: number, title: string, labels?: Label[], pull_request?: unknown }} Issue */
/**
 * @typedef {{ path: string, ok: boolean, skipped?: boolean, detail: string }} CheckResult
 *   `skipped`: la ruta todavía no existe (404 en `/api/health`); cuenta como bien.
 */
/**
 * @typedef {{ action: 'none', reason: string }
 *   | { action: 'open', failures: CheckResult[], reason: string }
 *   | { action: 'close', issues: number[], reason: string }} Decision
 */

/**
 * @param {{ labels?: Label[] }} item
 * @param {string} name
 */
function hasLabel(item, name) {
	return (item.labels ?? []).some((l) => (typeof l === 'string' ? l : l?.name) === name);
}

/** @param {CheckResult[]} results */
const failuresOf = (results) => results.filter((r) => !r.ok);

/**
 * Decide qué hacer con los intentos de esta corrida.
 * @param {{ attempts: CheckResult[][], openIssues: Issue[] }} input
 *   `attempts`: los resultados de cada intento, en orden (el primero y, si falló, el reintento);
 *   `openIssues`: issues abiertos (si vienen PRs mezclados, como devuelve la API, se ignoran).
 * @returns {Decision}
 */
export function decide({ attempts, openIssues }) {
	if (attempts.length === 0) throw new Error('decide: sin intentos');
	const alarms = openIssues
		.filter((i) => !i.pull_request && i.title === ISSUE_TITLE && hasLabel(i, LABEL))
		.map((i) => i.number);
	const last = failuresOf(attempts[attempts.length - 1]);

	if (last.length === 0) {
		if (alarms.length > 0) {
			return { action: 'close', issues: alarms, reason: 'todo responde de nuevo' };
		}
		const flaky = attempts.length > 1 ? ' (falló una vez y el reintento anduvo)' : '';
		return { action: 'none', reason: `todo responde${flaky}` };
	}
	// Una sola falla no alcanza: hacen falta dos intentos seguidos con fallas.
	const down = attempts.length >= 2 && failuresOf(attempts[attempts.length - 2]).length > 0;
	if (!down) return { action: 'none', reason: 'falló una vez; falta el reintento' };
	if (alarms.length > 0) {
		return { action: 'none', reason: `sigue caído; ya está abierto el issue #${alarms[0]}` };
	}
	return {
		action: 'open',
		failures: last,
		reason: `falló dos veces seguidas: ${last.map((f) => f.path).join(', ')}`
	};
}

/**
 * @typedef {{ status: number, headers: { get(name: string): string | null }, text(): Promise<string> }} FetchResponse
 * @typedef {(url: string, init?: any) => Promise<FetchResponse>} Fetch
 */

/**
 * Los chequeos: cada uno mira la respuesta y devuelve null si está bien o el problema.
 * @type {{ path: string, check: (res: FetchResponse, body: string) => string | null, skip404?: boolean }[]}
 */
export const CHECKS = [
	{
		path: '/',
		check: (res, body) =>
			res.status !== 200
				? `HTTP ${res.status}`
				: body.includes('Kinky Vibe')
					? null
					: 'la página no dice «Kinky Vibe»'
	},
	{ path: '/calendario', check: (res) => (res.status === 200 ? null : `HTTP ${res.status}`) },
	{
		path: '/calendario.ics',
		check: (res) => {
			if (res.status !== 200) return `HTTP ${res.status}`;
			const type = res.headers.get('content-type') ?? '';
			return type.startsWith('text/calendar') ? null : `content-type «${type}»`;
		}
	},
	{
		// Mientras la ruta no exista en producción, un 404 se saltea (con una línea en el log).
		path: '/api/health',
		skip404: true,
		check: (res, body) => {
			if (res.status !== 200) return `HTTP ${res.status}`;
			try {
				return JSON.parse(body)?.ok === true ? null : 'la respuesta no trae `ok: true`';
			} catch {
				return 'la respuesta no es JSON';
			}
		}
	}
];

/**
 * Pide todas las rutas de `CHECKS` una vez.
 * @param {{ baseUrl: string, fetch: Fetch }} args
 * @returns {Promise<CheckResult[]>}
 */
export async function checkSite({ baseUrl, fetch }) {
	const base = baseUrl.replace(/\/+$/, '');
	return Promise.all(
		CHECKS.map(async ({ path, check, skip404 }) => {
			try {
				const res = await fetch(base + path, {
					redirect: 'follow',
					headers: { 'user-agent': 'kinkyvibe-vigilante-produccion' },
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
				});
				const body = await res.text();
				if (skip404 && res.status === 404) {
					return { path, ok: true, skipped: true, detail: 'HTTP 404 (todavía no existe)' };
				}
				const problem = check(res, body);
				return { path, ok: problem === null, detail: problem ?? `HTTP ${res.status}` };
			} catch (/** @type {any} */ e) {
				return { path, ok: false, detail: `sin respuesta (${e?.name ?? 'Error'}: ${e?.message})` };
			}
		})
	);
}

/**
 * @param {string} baseUrl
 * @param {CheckResult[]} failures
 * @param {Date} when
 */
export function issueBody(baseUrl, failures, when) {
	const list = failures.map((f) => `- \`${f.path}\`: ${f.detail}`).join('\n');
	return `El vigilante de producción no pudo usar ${baseUrl} dos veces seguidas (con 60 segundos entre una y otra), la última el ${formatWhen(when)}:

${list}

Qué hacer:

- Abrí ${baseUrl} y fijate si anda.
- Revisá el Worker \`kinkyvibe\` en el dashboard de Cloudflare (último deploy, registros, errores) y el estado de Cloudflare.
- Si el último deploy lo rompió, volvé a la versión anterior desde Workers → kinkyvibe → Deployments.

Este issue se cierra solo cuando todo vuelva a responder. Lo abrió \`.github/workflows/vigilante-produccion.yml\`.`;
}

/** @param {Date} when */
export function formatWhen(when) {
	return `${when.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** @param {Date} when */
export function closeComment(when) {
	return `Producción volvió a responder (chequeado el ${formatWhen(when)}). Cierro este issue.`;
}

/**
 * Corre el vigilante desde actions/github-script.
 * @param {{ github: any, context: any, core: any, baseUrl?: string, fetch?: Fetch,
 *   sleep?: (ms: number) => Promise<void>, now?: () => Date }} args
 *   Con una `baseUrl` distinta de la de producción (corrida a mano contra un preview) solo
 *   informa: no abre ni cierra issues.
 */
export async function run({
	github,
	context,
	core,
	baseUrl = DEFAULT_BASE_URL,
	fetch = globalThis.fetch,
	sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
	now = () => new Date()
}) {
	const url = new URL(baseUrl);
	if (url.protocol !== 'https:') throw new Error(`La URL tiene que ser https: ${baseUrl}`);
	const base = url.origin;

	/** @type {CheckResult[][]} */
	const attempts = [await checkSite({ baseUrl: base, fetch })];
	if (failuresOf(attempts[0]).length > 0) {
		core.info(`Falló: ${summarize(failuresOf(attempts[0]))}. Reintento en 60 segundos.`);
		await sleep(RETRY_DELAY_MS);
		attempts.push(await checkSite({ baseUrl: base, fetch }));
	}
	for (const r of attempts[attempts.length - 1]) {
		core.info(`${r.ok ? (r.skipped ? 'saltea' : 'bien') : 'MAL'} ${r.path}: ${r.detail}`);
	}

	const { owner, repo } = context.repo;
	const items = await github.paginate(github.rest.issues.listForRepo, {
		owner,
		repo,
		labels: LABEL,
		state: 'open',
		per_page: 100
	});
	const decision = decide({ attempts, openIssues: items });
	core.info(`${decision.action}: ${decision.reason}`);

	if (base !== DEFAULT_BASE_URL) {
		if (decision.action !== 'none') core.notice(`No toco issues: ${base} no es producción.`);
		return decision;
	}

	if (decision.action === 'open') {
		try {
			await github.rest.issues.getLabel({ owner, repo, name: LABEL });
		} catch (/** @type {any} */ e) {
			if (e?.status !== 404) throw e;
			await github.rest.issues.createLabel({
				owner,
				repo,
				name: LABEL,
				color: 'b60205',
				description: 'El vigilante de producción no pudo usar el sitio'
			});
		}
		const { data } = await github.rest.issues.create({
			owner,
			repo,
			title: ISSUE_TITLE,
			body: issueBody(base, decision.failures, now()),
			labels: [LABEL]
		});
		core.warning(`Abrí el issue #${data.number}: ${ISSUE_TITLE}`);
		// Se asigna al dueño del repo (le llega la notificación). Aparte, para que el issue quede
		// abierto aunque la asignación falle.
		try {
			await github.rest.issues.addAssignees({
				owner,
				repo,
				issue_number: data.number,
				assignees: [owner]
			});
		} catch (/** @type {any} */ e) {
			core.warning(`No pude asignar el issue #${data.number}: ${e?.message}`);
		}
	} else if (decision.action === 'close') {
		for (const issue_number of decision.issues) {
			await github.rest.issues.createComment({
				owner,
				repo,
				issue_number,
				body: closeComment(now())
			});
			await github.rest.issues.update({
				owner,
				repo,
				issue_number,
				state: 'closed',
				state_reason: 'completed'
			});
			core.notice(`Cerré el issue #${issue_number}`);
		}
	}
	return decision;
}

/** @param {CheckResult[]} results */
function summarize(results) {
	return results.map((r) => `${r.path} (${r.detail})`).join(', ');
}
