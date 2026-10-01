/**
 * Datos inventados para las pruebas de series (solo vitest; nunca se importa desde la app).
 * Eventos de una serie de mentira con fechas relativas a `now`, con la forma de los posts
 * procesados (fetchMarkdownPosts), órdenes mínimas y un envío de mails de mentira.
 */
import { escapeRegExp } from '$lib/utils/text.js';

export const DAY = 24 * 60 * 60 * 1000;

/**
 * Un evento de calendario procesado.
 *
 * @param {string} slug
 * @param {number} start ms
 * @param {string[]} tags
 * @param {Record<string, unknown>} [extra] más frontmatter (title, status, location...)
 * @returns {ProcessedPost}
 */
export function fakeEvent(slug, start, tags, extra = {}) {
	return /** @type {ProcessedPost} */ ({
		path: `/calendario/${slug}`,
		meta: /** @type {any} */ ({
			postID: slug,
			category: 'calendario',
			layout: 'calendario',
			title: `Evento de prueba ${slug}`,
			summary: 'Resumen inventado',
			tags,
			authors: ['KinkyVibe'],
			status: 'abierto',
			start: new Date(start).toISOString(),
			...extra
		})
	});
}

/**
 * Una serie «Picantearla» (etiqueta real del árbol) con dos ediciones pasadas y una próxima, más
 * un evento de otra cosa. Títulos y lugares inventados.
 *
 * @param {number} now
 */
export function fakeSeriesPosts(now) {
	return [
		fakeEvent('serie-prueba-1', now - 60 * DAY, ['Picantearla', 'KinkyVibe'], {
			title: 'Serie de prueba (7° Edición)',
			location: 'Calle Falsa 123'
		}),
		fakeEvent('serie-prueba-2', now - 30 * DAY, ['Picantearla', 'KinkyVibe'], {
			title: 'Serie de prueba'
		}),
		fakeEvent('serie-prueba-3', now + 10 * DAY, ['Picantearla', 'KinkyVibe'], {
			title: 'Serie de prueba: la próxima'
		}),
		fakeEvent('otra-cosa', now + 5 * DAY, ['taller'], { title: 'Taller inventado' })
	];
}

let orderSeq = 0;

/**
 * Orden mínima válida (datos inventados), para "lo tuyo".
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ email: string, slug: string, status?: string, accountId?: string | null, now?: number }} o
 */
export async function insertOrder(
	db,
	{ email, slug, status = 'approved', accountId = null, now = 0 }
) {
	const id = `00000000-0000-4000-9000-${String(++orderSeq).padStart(12, '0')}`;
	await db
		.prepare(
			`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, subtotal, total,
				buyer_name, buyer_email, status, created_at, updated_at, expires_at, account_id)
			VALUES (?1, ?2, 'general', 1, 1000, 1000, 1000, 'Persona de Prueba', ?3, ?4, ?5, ?5, ?5, ?6)`
		)
		.bind(id, slug, email, status, now, accountId)
		.run();
	return id;
}

/**
 * Un envío de mails de mentira que guarda lo que se mandó. `send.result` decide qué contesta.
 *
 * @param {'sent' | 'simulated' | 'failed'} [result]
 */
export function fakeSend(result = 'sent') {
	/** @type {Array<{ to: string, subject: string, text: string, html: string, key?: string }>} */
	const sent = [];
	const state = { result };
	/** @type {import('./subscriptions.js').SeriesSend} */
	const fn = async (to, message, key) => {
		sent.push({ to, ...message, key });
		return state.result;
	};
	return Object.assign(fn, { sent, state });
}

/**
 * El primer link de `path` (p. ej. '/avisos/confirmar/') que aparece en un texto.
 *
 * @param {string} text
 * @param {string} path
 */
export function linkIn(text, path) {
	const m = text.match(new RegExp(`https?://[^\\s"]*${escapeRegExp(path)}[^\\s"<]+`));
	return m ? m[0] : null;
}

/**
 * Evento de SvelteKit de mentira para probar loads, actions y endpoints.
 *
 * @param {{ platform: App.Platform, path?: string, params?: Record<string, string>,
 *   form?: Record<string, string>, user?: any, token?: string, member?: { id: string, email: string } }} o
 */
export function fakeRequestEvent({ platform, path = '/', params = {}, form, user, token, member }) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	/** @type {any} */
	const event = {
		url,
		params,
		platform,
		locals: { user, user_token: token ?? (user ? 'token-de-prueba' : ''), member },
		setHeaders: () => {},
		getClientAddress: () => '203.0.113.7',
		fetch,
		request: new Request(url, {
			method: form ? 'POST' : 'GET',
			body: form ? new URLSearchParams(form) : undefined
		}),
		cookies: { get: () => undefined, set: () => {}, delete: () => {} }
	};
	return event;
}

/**
 * Lo que tira (error o redirect de SvelteKit) una función, o `null` si no tira.
 *
 * @param {() => unknown} fn
 * @returns {Promise<any>}
 */
export async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return e;
	}
}
