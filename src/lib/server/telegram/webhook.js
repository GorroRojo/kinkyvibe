/**
 * El webhook de Telegram (decisión 0029), separado de la ruta para poder probarlo sin SvelteKit.
 *
 * 1. Verifica el header `x-telegram-bot-api-secret-token` (el secreto que se pasó a `setWebhook`)
 *    en tiempo constante. Sin secreto configurado o con uno inválido: 503 / 401.
 * 2. Con el interruptor `telegram_bot` apagado contesta 200 sin hacer nada: un error haría que
 *    Telegram reintente y acumule pedidos.
 * 3. Sin token (`TELEGRAM_BOT_TOKEN`), contesta en el mismo pedido (Telegram acepta un método de
 *    la API como respuesta). Con token (decisión 0034), contesta 200 enseguida y llama a la API
 *    en `waitUntil` (run.js): editar pantallas, fotos, contestar el botón al instante, efímeros.
 */
import { json } from '@sveltejs/kit';
import { sha256Hex, timingSafeEqual } from '$lib/server/hash.js';
import { readTextCapped } from '$lib/server/http/body.js';
import { handleUpdate, planUpdate } from './router.js';
import { runPlan, telegramCaller } from './run.js';
import { runWithBotTexts } from './texts.js';
import { createUsoRecorder } from './uso.js';
import { classifyUpdate } from './usoUpdate.js';

/** Largo mínimo del secreto (más corto se considera no configurado). */
export const MIN_WEBHOOK_SECRET_LENGTH = 16;

/** Tamaño máximo del pedido: un update de Telegram con un mensaje pesa unos pocos KB. */
export const MAX_BODY_BYTES = 64 * 1024;

/**
 * @param {string | null | undefined} given
 * @param {string | undefined} expected
 */
export async function isValidWebhookSecret(given, expected) {
	if (!expected || expected.length < MIN_WEBHOOK_SECRET_LENGTH || !given) return false;
	return timingSafeEqual(await sha256Hex(given), await sha256Hex(expected));
}

/**
 * @param {{
 *   request: Request,
 *   secret: string | undefined,
 *   enabled: boolean,
 *   origin: string,
 *   listUpcoming: import('./router.js').Deps['listUpcoming'],
 *   accounts?: import('./router.js').Deps['accounts'],
 *   adminLink?: import('./router.js').Deps['adminLink'],
 *   inline?: import('./router.js').Deps['inline'],
 *   door?: import('./router.js').Deps['door'],
 *   admin?: import('./router.js').Deps['admin'],
 *   card?: import('./router.js').Deps['card'],
 *   fondo?: import('./router.js').Deps['fondo'],
 *   botUsername?: string | null,
 *   token?: string,
 *   waitUntil?: (task: Promise<unknown>) => void,
 *   fetch?: typeof fetch,
 *   texts?: () => Promise<import('$lib/utils/botTexts.js').BotTexts>,
 *   uso?: ((batch: UsoBatch) => Promise<void>) | null
 * }} args `accounts`: la fase 2 (vincular cuentas); se llama solo para esos comandos y da `null`
 *   con `lo_que_sigo` apagado. `adminLink`: `/start adm_<código>`, vincular el Telegram de une
 *   admin desde el panel (la puerta por Telegram, adminLink.js); `null` con `telegram_puerta`
 *   apagado. `inline`: el modo inline (inline.js), con lo público del índice de la búsqueda.
 *   `door`: ¿puede este usuario de Telegram abrir la puerta? (el botón «🚪 Puerta» del inicio,
 *   puerta.js); `null` con `telegram_puerta` apagado. `admin`: «📊 Estado» y «🔔 Mis avisos»
 *   (adminData.js); `null` con `telegram_admin` apagado. `token`: el del bot; con él, el webhook
 *   llama a la API. `texts`: lo cambiado en «Textos del bot» (se lee una vez, después del
 *   secreto; todo el pedido lo usa, ver texts.js). `uso`: guarda las estadísticas de uso de este
 *   update (uso.js, `usoWriter`); `null` con `telegram_estadisticas` apagado (no se cuenta nada).
 */
export async function handleWebhook({
	request,
	secret,
	enabled,
	origin,
	listUpcoming,
	accounts,
	adminLink,
	inline,
	door,
	admin,
	card,
	fondo,
	botUsername,
	token,
	waitUntil,
	fetch: fetchFn,
	texts,
	uso
}) {
	if (!secret || secret.length < MIN_WEBHOOK_SECRET_LENGTH) {
		console.error('[telegram] falta TELEGRAM_WEBHOOK_SECRET: no se pueden verificar pedidos');
		return new Response('not configured', { status: 503 });
	}
	const given = request.headers.get('x-telegram-bot-api-secret-token');
	if (!(await isValidWebhookSecret(given, secret))) {
		return new Response('unauthorized', { status: 401 });
	}
	// El secreto se chequea antes que el interruptor: así nadie sin él puede ver si está prendido.
	if (!enabled) return new Response(null, { status: 200 });

	// Tope también sin content-length: se corta al leer, sin guardar el cuerpo entero.
	const text = await readTextCapped(request, MAX_BODY_BYTES);
	if (text === null) return new Response('too large', { status: 413 });
	/** @type {unknown} */
	let update;
	try {
		update = JSON.parse(text);
	} catch {
		return new Response('bad request', { status: 400 });
	}
	const usage = uso ? startUso(update) : null;
	const deps = {
		usage: usage?.recorder,
		listUpcoming,
		origin,
		accounts,
		adminLink,
		inline,
		door,
		admin,
		card,
		fondo,
		botUsername
	};
	/** @type {import('$lib/utils/botTexts.js').BotTexts} */
	let overrides = {};
	try {
		overrides = texts ? await texts() : {};
	} catch {
		// Sin los textos cambiados, los originales: el bot nunca se queda mudo por esto.
	}
	// Todo el pedido (también lo que sigue en `waitUntil`) con esos textos.
	const save = usage && uso ? () => saveUso(uso, usage) : null;
	return runWithBotTexts(overrides, () =>
		answer(update, deps, { token, waitUntil, fetchFn, save })
	);
}

/**
 * Lo que se guarda de un update (uso.js): quién (o `null`) y los conteos.
 *
 * @typedef {{ person: import('./uso.js').UsoPerson | null,
 *   counts: { tipo: string, clave: string, n: number }[] }} UsoBatch
 */

/**
 * Empieza a contar un update: quién lo mandó y lo que se sabe sin contestarlo (usoUpdate.js). El
 * router suma lo demás al recorder. Si algo falla, no se cuenta nada (y el bot contesta igual).
 *
 * @param {unknown} update
 */
function startUso(update) {
	try {
		const recorder = createUsoRecorder();
		const { person, counts } = classifyUpdate(update);
		for (const c of counts) recorder.add(c.tipo, c.clave);
		return { person, recorder };
	} catch {
		return null;
	}
}

/**
 * Guarda lo contado, sin tirar nunca.
 *
 * @param {(batch: UsoBatch) => Promise<void>} uso
 * @param {{ person: import('./uso.js').UsoPerson | null,
 *   recorder: ReturnType<typeof createUsoRecorder> }} usage
 */
async function saveUso(uso, usage) {
	try {
		const counts = usage.recorder.counts();
		if (!usage.person && counts.length === 0) return;
		await uso({ person: usage.person, counts });
	} catch {
		// Contar nunca rompe el bot.
	}
}

/**
 * Contesta el update ya leído (ver {@link handleWebhook}).
 *
 * @param {unknown} update
 * @param {import('./router.js').Deps} deps
 * @param {{ token?: string, waitUntil?: (task: Promise<unknown>) => void,
 *   fetchFn?: typeof fetch, save?: (() => Promise<void>) | null }} opts `save`: guarda las
 *   estadísticas, después de armar la respuesta (el router ya sumó lo suyo) y sin esperarla.
 */
async function answer(update, deps, { token, waitUntil, fetchFn, save }) {
	/** @param {Promise<unknown>} task */
	const later = async (task) => {
		// Sin `waitUntil` (vite dev) se espera acá: igual contesta rápido.
		if (waitUntil) waitUntil(task);
		else await task;
	};
	const clean = String(token ?? '').trim();
	if (clean) {
		const planned = planUpdate(update, { ...deps, media: true });
		const task = planned
			.then((plan) => runPlan(plan, telegramCaller(clean, fetchFn)))
			.catch((error) => {
				// Sin detalles: el error puede traer partes del pedido.
				console.error('[telegram] no se pudo contestar:', /** @type {Error} */ (error)?.name);
			});
		await later(task);
		if (save) await later(planned.then(save, save));
		return new Response(null, { status: 200 });
	}
	const response = await handleUpdate(update, deps);
	if (save) await later(save());
	return response ? json(response) : new Response(null, { status: 200 });
}
