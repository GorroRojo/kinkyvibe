/**
 * Ejecuta un {@link BotPlan} (deliver.js) llamando a la API de Telegram con el token
 * (`callTelegramApi`, que nunca loguea ni devuelve el token). Decisión 0034: con el token cargado,
 * el webhook contesta 200 enseguida y esto corre en `waitUntil`; así el botón deja de «cargar»
 * apenas se cambia la pantalla y se sabe si algo falló.
 *
 * - **429** (demasiado rápido): se corta, se contesta el botón con «Más despacio 🙂» y no se
 *   reintenta.
 * - **«message is not modified»** (tocó dos veces el mismo botón): no es un error, se sigue.
 * - Otro error en el primer paso: se prueba `fallback` una sola vez (mandar la pantalla de nuevo,
 *   la tarjeta sin foto…); si tampoco anda, el botón se contesta con `callback.onFail` o un error
 *   corto.
 * - `deleteMessage` que falla (mensaje de más de 48 h) no corta nada.
 */
import { callTelegramApi } from './send.js';
import { renderBotText } from '$lib/utils/botTexts.js';
import { botText } from './texts.js';

/** @typedef {import('./deliver.js').BotPlan} BotPlan */
/** @typedef {import('./deliver.js').BotMethod} BotMethod */
/**
 * @typedef {(method: string, body: Record<string, unknown>) =>
 *   Promise<{ ok: boolean, status: number | null, description?: string }>} TelegramCall
 */

/** El aviso original cuando Telegram pide ir más despacio (se usa el de este pedido). */
export const SLOW_DOWN_TEXT = renderBotText('errores.despacio');

/** @param {string | undefined} description */
export const isNotModified = (description) => /message is not modified/i.test(description ?? '');

/**
 * Llamar a la API con el token. `fetch` se puede cambiar (en los tests, uno de mentira).
 *
 * @param {string} token
 * @param {typeof fetch} [fetchFn]
 * @returns {TelegramCall}
 */
export function telegramCaller(token, fetchFn) {
	return (method, body) => callTelegramApi({ token, method, body, fetch: fetchFn });
}

/**
 * @param {BotMethod} step
 * @param {TelegramCall} call
 */
function callStep(step, call) {
	const { method, ...body } = step;
	return call(method, body);
}

/**
 * Corre los pasos en orden. `'ok'`, `'slow'` (429) o `'failed'`.
 *
 * @param {BotMethod[]} steps
 * @param {TelegramCall} call
 * @returns {Promise<'ok' | 'slow' | 'failed'>}
 */
async function runSteps(steps, call) {
	for (const step of steps) {
		const r = await callStep(step, call);
		if (r.ok || isNotModified(r.description)) continue;
		if (r.status === 429) return 'slow';
		if (step.method === 'deleteMessage') continue;
		return 'failed';
	}
	return 'ok';
}

/**
 * @param {BotPlan | null} plan
 * @param {TelegramCall} call
 * @returns {Promise<'ok' | 'slow' | 'failed' | 'empty'>}
 */
export async function runPlan(plan, call) {
	if (!plan) return 'empty';
	let outcome = await runSteps(plan.steps, call);
	if (outcome === 'failed' && plan.fallback?.length) outcome = await runSteps(plan.fallback, call);
	if (plan.callback) {
		const { id, text, url, onFail } = plan.callback;
		/** @type {Record<string, unknown>} */
		const answer = { callback_query_id: id };
		if (outcome === 'slow') answer.text = botText('errores.despacio');
		else if (outcome === 'failed') {
			answer.text = onFail?.text ?? botText('errores.algo_salio_mal');
			if (onFail?.url) answer.url = onFail.url;
		} else {
			if (text) answer.text = text;
			if (url) answer.url = url;
		}
		// Si ya pasó mucho o ya se contestó, Telegram lo rechaza: no importa.
		await call('answerCallbackQuery', answer);
	}
	return plan.steps.length === 0 && !plan.callback ? 'empty' : outcome;
}
