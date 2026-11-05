// Vigilante del repaso semanal del plan (ítem `plan-repaso-semanal` en docs/plan.md).
//
// Una rutina de Claude abre todos los lunes a la mañana un PR «Repaso semanal del plan <fecha>»
// con la etiqueta `repaso-semanal`, aunque no haya cambios. Este vigilante, independiente de
// Claude, lo corre `.github/workflows/repaso-vigilante.yml` todos los días: si no hay ningún PR con
// esa etiqueta creado en los últimos 8 días, abre un issue (uno solo); si vuelve a haber uno y el
// issue sigue abierto, lo cierra con un comentario.
//
// `decide` es pura (la prueban los tests); `run` hace las llamadas a la API desde
// actions/github-script. Sin dependencias.

export const LABEL = 'repaso-semanal';
export const ISSUE_TITLE = 'El repaso semanal del plan no corrió';
export const MAX_DAYS = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

/** @typedef {{ name?: string } | string} Label */
/** @typedef {{ number: number, created_at: string, labels?: Label[] }} Pull */
/** @typedef {{ number: number, title: string, labels?: Label[], pull_request?: unknown }} Issue */
/**
 * @typedef {{ action: 'none', reason: string }
 *   | { action: 'open', reason: string }
 *   | { action: 'close', issues: number[], pull: Pull, reason: string }} Decision
 */

/**
 * @param {{ labels?: Label[] }} item
 * @param {string} name
 */
function hasLabel(item, name) {
	return (item.labels ?? []).some((l) => (typeof l === 'string' ? l : l?.name) === name);
}

/**
 * Decide qué hacer.
 * @param {{ pulls: Pull[], openIssues: Issue[], now: Date | number, maxDays?: number }} input
 *   `pulls`: PRs (de cualquier estado); `openIssues`: issues abiertos (si vienen PRs mezclados,
 *   como devuelve la API de issues, se ignoran).
 * @returns {Decision}
 */
export function decide({ pulls, openIssues, now, maxDays = MAX_DAYS }) {
	const nowMs = typeof now === 'number' ? now : now.getTime();
	const since = nowMs - maxDays * DAY_MS;
	const recent = pulls
		.filter((pr) => hasLabel(pr, LABEL))
		.filter((pr) => {
			const t = Date.parse(pr.created_at);
			return Number.isFinite(t) && t >= since && t <= nowMs;
		})
		.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
	const alarms = openIssues
		.filter((i) => !i.pull_request && i.title === ISSUE_TITLE && hasLabel(i, LABEL))
		.map((i) => i.number);

	if (recent.length === 0) {
		if (alarms.length > 0) {
			return { action: 'none', reason: `sin repaso, pero ya está abierto el issue #${alarms[0]}` };
		}
		return { action: 'open', reason: `ningún PR con «${LABEL}» en los últimos ${maxDays} días` };
	}
	if (alarms.length > 0) {
		return {
			action: 'close',
			issues: alarms,
			pull: recent[0],
			reason: `hay repaso reciente (#${recent[0].number})`
		};
	}
	return { action: 'none', reason: `hay repaso reciente (#${recent[0].number})` };
}

export const ISSUE_BODY = `El vigilante diario no encontró ningún PR con la etiqueta \`${LABEL}\` creado en los últimos ${MAX_DAYS} días.

La rutina de Claude del repaso semanal (lunes a la mañana, ítem \`plan-repaso-semanal\` en \`docs/plan.md\`) abre ese PR siempre, aunque no haya cambios. Así que lo más probable es que la rutina haya fallado o no se haya disparado.

Qué hacer:

- Revisá la rutina y su última corrida en claude.ai.
- Corré el repaso a mano: una sesión nueva que siga \`plan-repaso-semanal\` y abra el PR «Repaso semanal del plan <AAAA-MM-DD>» con la etiqueta \`${LABEL}\`.

Este issue se cierra solo cuando aparezca un PR de repaso nuevo. Lo abrió \`.github/workflows/repaso-vigilante.yml\`.`;

/**
 * @param {Pull} pull
 */
export function closeComment(pull) {
	return `Apareció el PR de repaso #${pull.number} (creado el ${pull.created_at.slice(0, 10)}). Cierro este issue.`;
}

/**
 * Corre el vigilante desde actions/github-script.
 * @param {{ github: any, context: any, core: any, now?: Date }} args
 */
export async function run({ github, context, core, now = new Date() }) {
	const { owner, repo } = context.repo;
	// La API de issues devuelve issues y PRs con la etiqueta, los más nuevos primero.
	const items = await github.paginate(github.rest.issues.listForRepo, {
		owner,
		repo,
		labels: LABEL,
		state: 'all',
		sort: 'created',
		direction: 'desc',
		per_page: 100
	});
	/** @type {Pull[]} */
	const pulls = items.filter((/** @type {any} */ i) => i.pull_request);
	/** @type {Issue[]} */
	const openIssues = items.filter((/** @type {any} */ i) => !i.pull_request && i.state === 'open');

	const decision = decide({ pulls, openIssues, now });
	core.info(`${decision.action}: ${decision.reason}`);

	if (decision.action === 'open') {
		try {
			await github.rest.issues.getLabel({ owner, repo, name: LABEL });
		} catch (/** @type {any} */ e) {
			if (e?.status !== 404) throw e;
			await github.rest.issues.createLabel({
				owner,
				repo,
				name: LABEL,
				color: 'c5def5',
				description: 'Repaso semanal del plan (docs/plan.md)'
			});
		}
		const { data } = await github.rest.issues.create({
			owner,
			repo,
			title: ISSUE_TITLE,
			body: ISSUE_BODY,
			labels: [LABEL],
			// Asignado al dueño del repo, así le llega la notificación (nunca un usuario tipeado).
			assignees: [owner]
		});
		core.notice(`Abrí el issue #${data.number}: ${ISSUE_TITLE}`);
	} else if (decision.action === 'close') {
		for (const issue_number of decision.issues) {
			await github.rest.issues.createComment({
				owner,
				repo,
				issue_number,
				body: closeComment(decision.pull)
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
