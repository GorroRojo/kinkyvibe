/**
 * Crear una propina y mandar a la persona al checkout de Mercado Pago (la form action de
 * /propinas). Las dependencias vienen por parámetro (base, gateway de MP, búsqueda de la
 * publicación) para poder probarlo sin la red ni los markdown.
 */
import { logDBError } from '$lib/server/db';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { validateTip } from '$lib/utils/propinas.js';
import {
	TIP_RATE_LIMITS,
	buildTipPreference,
	createTip,
	discardTip,
	setTipPreference
} from './index.js';

/**
 * ¿Se puede redirigir a esta URL de checkout? Solo a Mercado Pago por https o a una ruta de este
 * mismo sitio (el checkout simulado de dev). Nunca a otra web, aunque MP devolviera algo raro.
 *
 * @param {unknown} url
 * @param {string} origin
 */
export function isSafeCheckoutUrl(url, origin) {
	if (typeof url !== 'string' || !url) return false;
	let parsed;
	try {
		parsed = new URL(url, origin);
	} catch {
		return false;
	}
	if (parsed.origin === new URL(origin).origin) return true;
	return (
		parsed.protocol === 'https:' &&
		/(^|\.)mercadopago\.com(\.ar)?$/.test(parsed.hostname) &&
		!parsed.username &&
		!parsed.password
	);
}

/** @typedef {import('$lib/utils/propinas.js').TipFormValues} TipFormValues */

/**
 * Lee el formulario (todo como texto acotado; el servidor valida después). No lee `destination`:
 * toda propina va al Fondo.
 * @param {FormData} form
 * @returns {TipFormValues}
 */
export function readTipForm(form) {
	/** @param {string} k @param {number} max */
	const get = (k, max) => String(form.get(k) ?? '').slice(0, max);
	return {
		amount: get('amount', 20),
		custom: get('custom', 20),
		message: get('message', 600),
		category: get('category', 20),
		slug: get('slug', 160)
	};
}

/**
 * Crea la propina (pendiente) y su preferencia de MP.
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   gateway: import('$lib/server/tickets/index.js').Gateway | null,
 *   values: TipFormValues,
 *   client: string,
 *   origin: string,
 *   findPost: (category: 'material' | 'calendario', slug: string) => Promise<{ title: string } | null>,
 *   now?: number
 * }} input
 * @returns {Promise<{ ok: true, checkoutUrl: string, tipId: string }
 *   | { ok: false, status: number, error: string, errors: Record<string, string> }>}
 */
export async function startTip({
	db,
	gateway,
	values,
	client,
	origin,
	findPost,
	now = Date.now()
}) {
	/** @param {number} status @param {string} error @param {Record<string, string>} [errors] */
	const failWith = (status, error, errors = {}) =>
		/** @type {const} */ ({ ok: false, status, error, errors });

	// Cada intento cuenta (válido o no), antes de mirar nada más.
	try {
		const perClient = await hitRateLimit(db, `propinas:c:${client}`, TIP_RATE_LIMITS.client, now);
		const global = perClient.allowed
			? await hitRateLimit(db, 'propinas:all', TIP_RATE_LIMITS.global, now)
			: perClient;
		if (!perClient.allowed || !global.allowed) {
			return failWith(429, 'Demasiados intentos seguidos. Probá de nuevo en unos minutos.');
		}
	} catch (error) {
		logDBError('tip rate limit', error);
		return failWith(500, 'No pudimos preparar tu propina. Probá de nuevo más tarde.');
	}

	const valid = validateTip(values);
	if (!valid.ok) return failWith(400, 'Revisá lo marcado.', valid.errors);

	const post = await findPost(valid.category, valid.slug).catch(() => null);
	if (!post) {
		return failWith(400, 'Revisá lo marcado.', {
			post: 'No encontramos la publicación desde la que llegaste.'
		});
	}
	if (!gateway) return failWith(503, 'El pago con Mercado Pago no está disponible ahora.');

	/** @type {import('./index.js').Tip} */
	let tip;
	try {
		tip = await createTip(db, valid, { now });
	} catch (error) {
		logDBError('create tip', error);
		return failWith(500, 'No pudimos preparar tu propina. Probá de nuevo más tarde.');
	}
	try {
		const created = await gateway.createPreference(
			buildTipPreference({ tip, postTitle: post.title, origin }),
			tip.id
		);
		if (!isSafeCheckoutUrl(created.init_point, origin)) {
			throw new Error('Mercado Pago devolvió un link de pago inesperado');
		}
		await setTipPreference(db, tip.id, created.id);
		return { ok: true, checkoutUrl: created.init_point, tipId: tip.id };
	} catch (error) {
		console.error(`[propinas] no se pudo crear la preferencia de la propina ${tip.id}:`, error);
		await discardTip(db, tip.id).catch((e) => logDBError('discard tip', e));
		return failWith(502, 'No pudimos conectar con Mercado Pago. Probá de nuevo en un ratito.');
	}
}
