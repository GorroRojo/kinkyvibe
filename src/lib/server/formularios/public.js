/**
 * Las páginas públicas de los formularios (docs/formularios.md): `/formularios/<dirección>` y la
 * encuesta de un evento en `/calendario/<evento>/encuesta`. Lo común a las dos: qué se muestra
 * (`publicFormData`), revisar el link personal (`checkInvite`) y guardar una respuesta
 * (`submitPublicForm`), con todas las reglas en el servidor:
 *
 * - **Quién responde.** «Cualquiera con el link»; «con cuenta» (sesión de cuenta); «quienes tenían
 *   entrada» (la clave del link personal: la orden aprobada de ese evento, una sola vez).
 * - **Privacidad.** Anónima (o «Responder anónimamente» marcada en «Que cada persona elija"): se
 *   guarda sin nombre, mail, cuenta, orden ni hora. Con nombre: el de la orden o la cuenta, o el
 *   que escribe la persona en uno abierto a cualquiera.
 * - **Spam.** En los formularios sin link personal, un campo trampa invisible ({@link HONEYPOT_FIELD}:
 *   si llega lleno, se contesta «gracias» y no se guarda nada) y un límite por conexión (hash, sin
 *   la IP) y por cuenta.
 */
import { error, fail } from '@sveltejs/kit';
import { sha256Hex } from '$lib/server/hash.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { clientOf } from '$lib/server/cuentas/web.js';
import { getOrder } from '$lib/server/tickets/orders.js';
import { getDB } from '$lib/server/db';
import { formulariosEnabled } from '$lib/server/flags.js';
import {
	ANONYMOUS_FIELD,
	EMAIL_MAX,
	HONEYPOT_FIELD,
	NAME_MAX,
	isAnonymousResponse,
	oneLine,
	validateFormAnswers
} from '$lib/utils/formularios.js';
import { checkInviteToken } from './invite.js';
import { inviteUsed, saveResponse } from './store.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./store.js').Form} Form */

/** Respuestas por conexión y por cuenta en una hora, en los formularios sin link personal. */
export const FORM_RATE_LIMIT = Object.freeze({ limit: 10, windowSeconds: 60 * 60 });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * La base y el interruptor, o 404.
 * @param {App.Platform | undefined} platform
 */
export async function requireFormsPublic(platform) {
	const db = getDB(platform);
	if (!db || !(await formulariosEnabled(platform))) error(404, 'No encontramos esta página.');
	return db;
}

/** Los encabezados de las páginas de formularios: privadas, sin caché ni buscadores. */
export const FORM_HEADERS = Object.freeze({
	'cache-control': 'private, no-store',
	'x-robots-tag': 'noindex',
	// same-origin (no no-referrer): si no, el POST sale con `Origin: null` y SvelteKit lo rechaza.
	'referrer-policy': 'same-origin'
});

/**
 * Lo que necesita la página (nunca las respuestas ni nada de otras personas).
 *
 * @param {Form} form
 * @param {{ member?: App.Locals['member'], eventTitle?: string | null }} opts
 */
export function publicFormData(form, { member, eventTitle = null }) {
	return {
		kind: form.kind,
		title: form.title,
		intro: form.intro,
		questions: form.questions,
		access: form.access,
		privacy: form.privacy,
		open: form.open,
		eventTitle,
		signedIn: Boolean(member),
		memberEmail: member?.email ?? null
	};
}

/**
 * ¿Sirve esta clave? `invalid` (no es de este formulario o la orden no está confirmada), `used`
 * (ya se respondió) u `ok`.
 *
 * @param {D1Database} db
 * @param {Form} form
 * @param {unknown} token
 * @returns {Promise<{ state: 'invalid' | 'used' | 'ok', order?: import('$lib/server/tickets/orders.js').Order }>}
 */
export async function checkInvite(db, form, token) {
	const orderId = await checkInviteToken(db, form.id, token);
	if (!orderId) return { state: 'invalid' };
	const order = await getOrder(db, orderId);
	if (!order || order.status !== 'approved' || order.event_slug !== form.eventSlug)
		return { state: 'invalid' };
	const used = await inviteUsed(db, form.id, orderId);
	if (used === null) return { state: 'invalid' };
	return used ? { state: 'used' } : { state: 'ok', order };
}

/**
 * La acción `check` de las páginas: el navegador manda la clave del fragmento y la página sabe
 * qué mostrar antes de que la persona escriba nada.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {Form | null} form
 */
export async function checkAction(event, form) {
	const db = await requireFormsPublic(event.platform);
	if (!form || form.access !== 'ticket') return { check: { state: 'invalid' } };
	const token = (await event.request.formData()).get('clave');
	const r = await checkInvite(db, form, token);
	return { check: { state: r.state } };
}

/**
 * ¿Se pasó del límite? Cuenta cada envío (válido o no), por conexión y, con sesión, por cuenta.
 * Los buckets van con hash (nunca la IP ni el id a la vista).
 *
 * @param {D1Database} db
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {Form} form
 */
async function overLimit(db, event, form) {
	const client = await clientOf(event);
	const byClient = await hitRateLimit(db, `form:${form.id}:c:${client}`, FORM_RATE_LIMIT);
	if (!byClient.allowed) return true;
	const member = event.locals.member;
	if (!member) return false;
	const key = await sha256Hex(`form:account:${member.id}`);
	return !(await hitRateLimit(db, `form:${form.id}:a:${key}`, FORM_RATE_LIMIT)).allowed;
}

/**
 * Guarda una respuesta. Devuelve lo que la página muestra (`{ sent: true }`, o el error con lo que
 * escribió la persona para no perderlo).
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {Form | null} form
 */
export async function submitPublicForm(event, form) {
	const db = await requireFormsPublic(event.platform);
	if (!form || form.kind === 'template') error(404, 'No encontramos esta página.');
	const data = await event.request.formData();
	/** @type {Record<string, string>} */
	const values = {};
	for (const q of form.questions) {
		const v = data.get(`p_${q.id}`);
		if (typeof v === 'string') values[q.id] = v.slice(0, 2000);
	}
	const typed = {
		name: oneLine(data.get('nombre')).slice(0, NAME_MAX),
		email: oneLine(data.get('mail')).slice(0, EMAIL_MAX).toLowerCase(),
		anonymous: data.get(ANONYMOUS_FIELD) === 'on'
	};
	/** @param {number} status @param {string} message @param {Record<string, string>} [errors] */
	const failWith = (status, message, errors = {}) =>
		fail(status, { error: message, errors, values, typed });
	if (!form.open) return failWith(409, 'Este formulario ya no recibe respuestas.');

	/** @type {{ orderId: string } | null} */
	let invite = null;
	/** @type {import('$lib/server/tickets/orders.js').Order | undefined} */
	let order;
	if (form.access === 'ticket') {
		const r = await checkInvite(db, form, data.get('clave'));
		if (r.state === 'used') return { sent: true, repeated: true };
		if (r.state !== 'ok' || !r.order) {
			return failWith(400, 'Este link no es válido. Revisá que esté completo.');
		}
		order = r.order;
		invite = { orderId: r.order.id };
	} else {
		// La trampa: un robot llena todo. Se contesta como si hubiera salido bien.
		if (oneLine(data.get(HONEYPOT_FIELD))) return { sent: true };
		if (form.access === 'account' && !event.locals.member) {
			return failWith(401, 'Entrá con tu cuenta para responder.');
		}
		if (await overLimit(db, event, form)) {
			return failWith(429, 'Mandaste muchas respuestas seguidas. Esperá un rato y probá de nuevo.');
		}
	}

	const checked = validateFormAnswers(form.questions, data);
	if (!checked.ok) return failWith(400, checked.message, checked.errors);

	const anonymous = isAnonymousResponse(form.privacy, data.get(ANONYMOUS_FIELD));
	/** @type {import('./store.js').Identity | null} */
	let identity = null;
	if (!anonymous) {
		if (order) {
			identity = { name: order.buyer_name, email: order.buyer_email, orderId: order.id };
		} else if (form.access === 'account' && event.locals.member) {
			identity = {
				name: typed.name || null,
				email: event.locals.member.email,
				accountId: event.locals.member.id
			};
		} else {
			/** @type {Record<string, string>} */
			const errors = {};
			if (typed.name.length < 2) errors.nombre = 'Escribí tu nombre.';
			if (!EMAIL_RE.test(typed.email)) errors.mail = 'Escribí un mail válido.';
			if (Object.keys(errors).length) return failWith(400, 'Revisá lo marcado.', errors);
			identity = {
				name: typed.name,
				email: typed.email,
				accountId: event.locals.member?.id ?? null
			};
		}
	}
	const saved = await saveResponse(db, {
		formId: form.id,
		answers: checked.answers,
		identity,
		invite
	});
	return saved === 'ok' ? { sent: true } : { sent: true, repeated: true };
}
