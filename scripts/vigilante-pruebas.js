// Vigilante de las pruebas programadas (docs/pruebas-y-ci.md, «Corridas programadas»).
//
// Algunas pruebas no corren en cada PR (son lentas o miran el futuro) y corren solas, fuera de
// `ci-ok`: las E2E de entradas y puerta todas las noches (.github/workflows/entradas-nocturno.yml)
// y la suite de vitest con el reloj adelantado los domingos (.github/workflows/reloj-adelantado.yml).
// Al terminar, el workflow llama a `run` con el resultado:
// - si falló y no hay issue abierto de esa corrida, abre uno (con la etiqueta `pruebas-programadas`);
// - si falló y ya hay uno, le suma un comentario con el link a la corrida nueva;
// - si pasó y hay uno abierto, lo cierra con un comentario.
// El issue lleva solo el link a la corrida: nunca trazas ni datos de las pruebas.
//
// `decide` es pura; `run` hace las llamadas a la API desde actions/github-script. Sin dependencias.

export const LABEL = 'pruebas-programadas';

/**
 * Las corridas que vigila: el título del issue (es la clave para encontrarlo) y qué hacer.
 * @type {Record<string, { title: string, body: string }>}
 */
export const SUITES = {
	entradas: {
		title: 'Las pruebas E2E de entradas y puerta fallaron',
		body: `La corrida nocturna de \`npx playwright test -c playwright.tickets.config.js\` (entradas, puerta, panel de ventas, lista de espera) falló. Esas pruebas no corren en cada PR.

Qué hacer:

- Abrí la corrida (link abajo) y bajá el artifact \`playwright-tickets\` con lo que dejó Playwright.
- Reproducilo en local: \`node scripts/semilla.js\` y \`npx playwright test -c playwright.tickets.config.js\`.
- Si una prueba quedó vieja porque la pantalla cambió a propósito, actualizala en un PR y decilo; no se saltea ni se afloja.`
	},
	reloj: {
		title: 'Las pruebas fallan con el reloj adelantado',
		body: `La corrida semanal de vitest con el reloj adelantado 30 días (\`SHIFT_DAYS=30\`, ver \`scripts/vitest/shift-clock.js\`) falló: alguna prueba depende de la fecha real y va a fallar sola dentro de unos días, en todos los PRs y en main.

Qué hacer:

- Abrí la corrida (link abajo) y mirá qué pruebas fallaron.
- Reproducilo en local: \`SHIFT_DAYS=30 npx vitest run <archivo>\`.
- Arreglo: que la prueba pase un \`now\` fijo o use \`vi.useFakeTimers()\` con \`vi.setSystemTime()\`; no mover fechas al futuro lejano ni aflojar la prueba.`
	}
};

/** @typedef {{ name?: string } | string} Label */
/** @typedef {{ number: number, title: string, labels?: Label[], pull_request?: unknown }} Issue */
/**
 * @typedef {{ action: 'none', reason: string }
 *   | { action: 'open', reason: string }
 *   | { action: 'comment', issue: number, reason: string }
 *   | { action: 'close', issues: number[], reason: string }} Decision
 */

/**
 * @param {{ labels?: Label[] }} item
 * @param {string} name
 */
function hasLabel(item, name) {
	return (item.labels ?? []).some((l) => (typeof l === 'string' ? l : l?.name) === name);
}

/**
 * Decide qué hacer con el issue de una corrida.
 * @param {{ suite: string, ok: boolean, openIssues: Issue[] }} input
 * @returns {Decision}
 */
export function decide({ suite, ok, openIssues }) {
	const spec = SUITES[suite];
	if (!spec) throw new Error(`vigilante-pruebas: corrida desconocida «${suite}»`);
	const alarms = openIssues
		.filter((i) => !i.pull_request && i.title === spec.title && hasLabel(i, LABEL))
		.map((i) => i.number)
		.sort((a, b) => a - b);
	if (!ok) {
		if (alarms.length > 0) {
			return { action: 'comment', issue: alarms[0], reason: `sigue fallando (#${alarms[0]})` };
		}
		return { action: 'open', reason: 'falló' };
	}
	if (alarms.length > 0) return { action: 'close', issues: alarms, reason: 'volvió a pasar' };
	return { action: 'none', reason: 'pasó' };
}

/**
 * Corre el vigilante desde actions/github-script.
 * @param {{ github: any, context: any, core: any, suite: string, ok: boolean }} args
 */
export async function run({ github, context, core, suite, ok }) {
	const { owner, repo } = context.repo;
	const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
	const openIssues = await github.paginate(github.rest.issues.listForRepo, {
		owner,
		repo,
		labels: LABEL,
		state: 'open',
		per_page: 100
	});
	const decision = decide({ suite, ok, openIssues });
	core.info(`${decision.action}: ${decision.reason}`);
	const spec = SUITES[suite];

	if (decision.action === 'open') {
		try {
			await github.rest.issues.getLabel({ owner, repo, name: LABEL });
		} catch (/** @type {any} */ e) {
			if (e?.status !== 404) throw e;
			await github.rest.issues.createLabel({
				owner,
				repo,
				name: LABEL,
				color: 'f9d0c4',
				description: 'Una corrida programada de pruebas falló (docs/pruebas-y-ci.md)'
			});
		}
		const body = `${spec.body}\n\nCorrida: ${runUrl}\n\nEste issue se cierra solo cuando la corrida vuelva a pasar.`;
		const { data } = await github.rest.issues.create({
			owner,
			repo,
			title: spec.title,
			body,
			labels: [LABEL]
		});
		core.notice(`Abrí el issue #${data.number}: ${spec.title}`);
	} else if (decision.action === 'comment') {
		await github.rest.issues.createComment({
			owner,
			repo,
			issue_number: decision.issue,
			body: `Volvió a fallar: ${runUrl}`
		});
		core.notice(`Comenté en el issue #${decision.issue}`);
	} else if (decision.action === 'close') {
		for (const issue_number of decision.issues) {
			await github.rest.issues.createComment({
				owner,
				repo,
				issue_number,
				body: `Volvió a pasar: ${runUrl}. Cierro este issue.`
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
