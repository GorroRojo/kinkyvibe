/**
 * El aviso «Cada deploy» por Telegram (gorrite: «message me on telegram every time something's
 * merged to prod»). Lo pide el workflow `.github/workflows/aviso-deploy.yml` cuando termina el
 * build de producción de Workers Builds de un push a `main`, con `POST /api/interno/deploy`
 * (header `x-deploy-secret` = `DEPLOY_NOTIFY_SECRET`). Detalle en docs/telegram.md, «Cada deploy».
 *
 * - **A quién**: les admins vinculades, que siguen en `ADMINS` y prendieron «Cada deploy» en
 *   «🔔 Mis avisos» (apagado por defecto, como todos los avisos: sin fila = apagado, migración
 *   0054), con el bot y «Telegram para admins» prendidos y `TELEGRAM_BOT_TOKEN`. En el horario de
 *   silencio sale igual, sin sonido.
 * - **Qué dice**: «🚀 En producción: <título> (#N)», una descripción corta (./resumen.js) y el
 *   commit; varios PRs en un push, en lista. Si el build falló: «⚠️ Falló el deploy de …». Solo
 *   títulos y descripciones de PRs (el repo es público): nada de la base.
 * - **Nada dos veces**: clave `deploy:<sha>:<resultado>` en `telegram_admin_sent` (como los demás
 *   avisos, `deliverOnce`): volver a correr el workflow no repite el aviso.
 */
import { env } from '$env/dynamic/private';
import { sha256Hex, timingSafeEqual } from '$lib/server/hash.js';
import { adminBotEnabled, noticeRecipients } from '$lib/server/telegram/adminData.js';
import { adminSender, deliverOnce } from '$lib/server/telegram/adminNotify.js';
import { escapeHtml } from '$lib/server/telegram/format.js';
import { isQuietHour } from '$lib/server/telegram/quiet.js';
import { prSummary } from './resumen.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/telegram/adminNotify.js').AdminSend} AdminSend */

/** El tipo de aviso de «🔔 Mis avisos». */
export const NOTICE_KIND = 'cada_deploy';

/** El repo de los links (público). */
export const REPO_URL = 'https://github.com/GorroRojo/kinkyvibe';

/** Largo mínimo de DEPLOY_NOTIFY_SECRET (más corto se considera no configurado). */
export const MIN_DEPLOY_SECRET_LENGTH = 32;

/** Hasta cuántos PRs (o commits) lista un aviso; el resto, «y N más». */
export const DEPLOY_ITEMS_MAX = 10;
/** Hasta cuántos commits acepta un pedido (el evento `push` de GitHub trae hasta 20). */
const COMMITS_MAX = 50;
/** Hasta cuántos caracteres de un título. */
const TITLE_MAX = 200;
/** Hasta cuántos caracteres de un cuerpo de PR o mensaje de commit se miran. */
const BODY_MAX = 20_000;

/**
 * Cómo terminó el build: `success`; `failure` (o cualquier otro resultado del check que no sea
 * éxito); `timed_out` si el workflow se cansó de esperar el check.
 *
 * @typedef {'success' | 'failure' | 'timed_out'} DeployOutcome
 */

/**
 * Un PR (o un commit sin PR) del aviso, ya con su descripción en texto plano.
 *
 * @typedef {{ number: number | null, title: string, url: string, summary: string }} DeployItem
 */

/**
 * @typedef {{ outcome: DeployOutcome, sha: string, items: DeployItem[] }} Deploy
 */

/**
 * ¿El header coincide con DEPLOY_NOTIFY_SECRET? En tiempo constante, sobre los SHA-256 (así
 * tampoco se filtra el largo). Sin secreto configurado (o muy corto), siempre `false`.
 *
 * @param {string | null | undefined} given
 * @param {string | undefined} expected
 */
export async function isValidDeploySecret(given, expected) {
	if (!expected || expected.length < MIN_DEPLOY_SECRET_LENGTH || !given) return false;
	return timingSafeEqual(await sha256Hex(given), await sha256Hex(expected));
}

const SHA = /^[0-9a-f]{40}$/;

/** @param {unknown} v @param {number} max */
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * Lee el pedido del workflow:
 *
 * ```json
 * { "sha": "<40 hex>", "conclusion": "success" | "failure" | "cancelled" | "timed_out" | …,
 *   "commits": [{ "sha": "<40 hex>", "message": "…",
 *     "prs": [{ "number": 12, "title": "…", "body": "…" }] }] }
 * ```
 *
 * Arma la lista de lo publicado: un ítem por PR (sin repetir: con un merge commit, varios commits
 * son del mismo PR) y uno por commit sin PR (su primera línea). Los links se arman acá con el
 * número o el SHA: no se aceptan URLs de afuera. `null` si no se entiende o no hay commits.
 *
 * @param {unknown} input
 * @returns {Deploy | null}
 */
export function parseDeploy(input) {
	if (!input || typeof input !== 'object') return null;
	const o = /** @type {Record<string, unknown>} */ (input);
	const sha = str(o.sha, 40).toLowerCase();
	if (!SHA.test(sha) || !Array.isArray(o.commits) || o.commits.length === 0) return null;
	/** @type {DeployOutcome} */
	const outcome =
		o.conclusion === 'success' ? 'success' : o.conclusion === 'timed_out' ? 'timed_out' : 'failure';
	/** @type {DeployItem[]} */
	const items = [];
	const seen = new Set();
	for (const c of o.commits.slice(0, COMMITS_MAX)) {
		if (!c || typeof c !== 'object') continue;
		const commit = /** @type {Record<string, unknown>} */ (c);
		const commitSha = str(commit.sha, 40).toLowerCase();
		const message = str(commit.message, BODY_MAX);
		const prs = Array.isArray(commit.prs) ? commit.prs : [];
		let withPr = false;
		for (const p of prs) {
			if (!p || typeof p !== 'object') continue;
			const pr = /** @type {Record<string, unknown>} */ (p);
			const number = Number(pr.number);
			if (!Number.isSafeInteger(number) || number <= 0) continue;
			withPr = true;
			if (seen.has(number)) continue;
			seen.add(number);
			items.push({
				number,
				title: str(pr.title, TITLE_MAX).trim() || `PR #${number}`,
				url: `${REPO_URL}/pull/${number}`,
				summary: prSummary({ body: str(pr.body, BODY_MAX), commitMessage: message })
			});
		}
		if (!withPr && SHA.test(commitSha)) {
			items.push({
				number: null,
				title: message.split(/\r?\n/)[0].trim().slice(0, TITLE_MAX) || commitSha.slice(0, 7),
				url: `${REPO_URL}/commit/${commitSha}`,
				summary: prSummary({ body: '', commitMessage: message })
			});
		}
	}
	if (items.length === 0) return null;
	return { outcome, sha, items };
}

/** «<a href="…">Título</a> (#12)». @param {DeployItem} item */
const itemLink = (item) =>
	`<a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>${item.number ? ` (#${item.number})` : ''}`;

/**
 * El texto del aviso (HTML de Telegram). Con un solo ítem:
 *
 * ```
 * 🚀 En producción: <título> (#12)
 * <i>La descripción corta.</i>
 *
 * Commit abc1234
 * ```
 *
 * Con varios, «🚀 En producción, 3 cambios:» y una viñeta por PR. Si falló, «⚠️ Falló el deploy
 * de …» y que sigue la versión anterior; si el workflow se cansó de esperar, «⏳ El deploy de …
 * no terminó en 20 minutos».
 *
 * @param {Deploy} deploy
 */
export function deployNoticeText({ outcome, sha, items }) {
	const one = items.length === 1;
	const head =
		outcome === 'success'
			? one
				? '🚀 En producción: '
				: `🚀 En producción, ${items.length} cambios:`
			: outcome === 'timed_out'
				? one
					? '⏳ El deploy de '
					: `⏳ El deploy de ${items.length} cambios no terminó en 20 minutos:`
				: one
					? '⚠️ Falló el deploy de '
					: `⚠️ Falló el deploy de ${items.length} cambios:`;
	const summaryLine = (/** @type {DeployItem} */ item) =>
		item.summary ? `\n<i>${escapeHtml(item.summary)}</i>` : '';
	/** @type {string[]} */
	const lines = [];
	if (one) {
		const tail = outcome === 'timed_out' ? ' no terminó en 20 minutos.' : '';
		lines.push(`${head}${itemLink(items[0])}${tail}${summaryLine(items[0])}`);
	} else {
		lines.push(head, '');
		for (const item of items.slice(0, DEPLOY_ITEMS_MAX)) {
			lines.push(`• ${itemLink(item)}${summaryLine(item)}`);
		}
		const rest = items.length - DEPLOY_ITEMS_MAX;
		if (rest > 0) lines.push(`• y ${rest} más`);
	}
	lines.push('');
	if (outcome === 'failure') lines.push('Producción sigue con la versión anterior.');
	if (outcome === 'timed_out') lines.push('Mirá el build en Cloudflare.');
	lines.push(
		`Commit <a href="${escapeHtml(`${REPO_URL}/commit/${sha}`)}"><code>${sha.slice(0, 7)}</code></a>`
	);
	return lines.join('\n');
}

/**
 * Manda el aviso a quienes prendieron «Cada deploy», una sola vez por commit y resultado.
 *
 * @param {{ db: D1Database, send: AdminSend, deploy: Deploy, now?: number }} input
 * @returns {Promise<{ sent: number, failed: number, skipped: number } | null>} `null`: no había
 *   a quién
 */
export async function notifyDeploy({ db, send, deploy, now = Date.now() }) {
	const recipients = await noticeRecipients(db, NOTICE_KIND);
	if (recipients.length === 0) return null;
	return deliverOnce({
		db,
		send,
		key: `deploy:${deploy.sha}:${deploy.outcome}`,
		message: { text: deployNoticeText(deploy), panelUrl: null, silent: isQuietHour(now) },
		now,
		recipients
	});
}

/**
 * Lo que corre el endpoint: con el bot de admins prendido y token, manda el aviso.
 *
 * @param {{ db: D1Database, deploy: Deploy, now?: number, token?: string, send?: AdminSend,
 *   fetch?: typeof fetch }} input
 * @returns {Promise<{ sent: number, failed: number, skipped: number, reason?: string }>}
 */
export async function runDeployNotice({ db, deploy, now = Date.now(), ...opts }) {
	const token = opts.token ?? env.TELEGRAM_BOT_TOKEN;
	const none = { sent: 0, failed: 0, skipped: 0 };
	if (!token && !opts.send) return { ...none, reason: 'sin TELEGRAM_BOT_TOKEN' };
	if (!(await adminBotEnabled(db))) return { ...none, reason: 'bot de admins apagado' };
	const send = opts.send ?? adminSender(String(token), opts.fetch ?? fetch);
	const r = await notifyDeploy({ db, send, deploy, now });
	return r ?? { ...none, reason: 'nadie prendió «Cada deploy»' };
}
