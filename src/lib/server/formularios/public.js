/**
 * Las páginas públicas de los formularios (docs/formularios.md): `/formularios/<dirección>` y la
 * encuesta de un evento en `/calendario/<evento>/encuesta`. Lo común a las dos: qué se muestra
 * (`publicFormData`), revisar el link personal (`checkInvite`) y guardar una respuesta
 * (`submitPublicForm`), con todas las reglas en el servidor:
 *
 * - **Quién responde.** «Cualquiera con el link»; «con cuenta» (sesión de cuenta); «quienes tenían
 *   entrada» (la clave del link personal: una entrada de una orden aprobada de ese evento, una sola
 *   vez; la entrada 1 responde con los datos de la compra, las demás con los de su titular).
 * - **Privacidad.** Anónima (o «Responder anónimamente» marcada en «Que cada persona elija"): se
 *   guarda sin nombre, mail, cuenta, orden ni hora. Con nombre: el de la orden o la cuenta, o el
 *   que escribe la persona en uno abierto a cualquiera.
 * - **Spam.** En los formularios sin link personal, un campo trampa invisible ({@link HONEYPOT_FIELD}:
 *   si llega lleno, se contesta «gracias» y no se guarda nada) y un límite por conexión (hash, sin
 *   la IP) y por cuenta.
 * - **Fotos.** Las preguntas «Foto» llegan como archivo (el formulario va `multipart`): las lee
 *   y limpia `takePhotos` (photos.js) y se guardan en R2 recién cuando todo lo demás está bien.
 *   La respuesta guarda la clave privada; un texto en un campo de foto se ignora.
 */
import { error, fail } from '@sveltejs/kit';
import { sha256Hex } from '$lib/server/hash.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { clientOf } from '$lib/server/cuentas/web.js';
import { getOrder, getOrderTickets } from '$lib/server/tickets/orders.js';
import { getDB } from '$lib/server/db';
import { formulariosEnabled } from '$lib/server/flags.js';
import {
	ANONYMOUS_FIELD,
	EMAIL_MAX,
	HONEYPOT_FIELD,
	MULTI_SEPARATOR,
	NAME_MAX,
	PRONOUNS_MAX,
	answerName,
	isAnonymousResponse,
	oneLine,
	validateFormAnswers
} from '$lib/utils/formularios.js';
import { checkInviteToken } from './invite.js';
import { inviteUsed, saveResponse } from './store.js';
import { storePhotos, takePhotos } from './photos.js';

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
 * ¿Sirve esta clave? `invalid` (no es de este formulario, la orden no está confirmada o la orden no
 * tiene esa entrada), `used` (ya se respondió con el link de esa entrada) u `ok`, con la orden, el
 * número de entrada y su fila (`null` en la entrada 1 de una orden sin entradas: los links que ya
 * salieron siguen andando).
 *
 * @param {D1Database} db
 * @param {Form} form
 * @param {unknown} token
 * @returns {Promise<{ state: 'invalid' | 'used' | 'ok',
 *   order?: import('$lib/server/tickets/orders.js').Order, number?: number,
 *   ticket?: import('$lib/server/tickets/orders.js').Ticket | null }>}
 */
export async function checkInvite(db, form, token) {
	const invite = await checkInviteToken(db, form.id, token);
	if (!invite) return { state: 'invalid' };
	const [order, tickets] = await Promise.all([
		getOrder(db, invite.orderId),
		getOrderTickets(db, invite.orderId)
	]);
	if (!order || order.status !== 'approved' || order.event_slug !== form.eventSlug)
		return { state: 'invalid' };
	const ticket = tickets[invite.ticket - 1] ?? null;
	if (invite.ticket > 1 && !ticket) return { state: 'invalid' };
	const used = await inviteUsed(db, form.id, invite.orderId, invite.ticket);
	if (used === null) return { state: 'invalid' };
	return used ? { state: 'used' } : { state: 'ok', order, number: invite.ticket, ticket };
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
		// «Varias opciones»: una casilla por opción con el mismo `name`; vuelven juntas.
		const v =
			q.kind === 'multi'
				? data
						.getAll(answerName(q.id))
						.filter((x) => typeof x === 'string')
						.join(MULTI_SEPARATOR)
				: data.get(answerName(q.id));
		if (typeof v === 'string') values[q.id] = v.slice(0, 4000);
	}
	const typed = {
		name: oneLine(data.get('nombre')).slice(0, NAME_MAX),
		pronouns: oneLine(data.get('pronombres')).slice(0, PRONOUNS_MAX),
		email: oneLine(data.get('mail')).slice(0, EMAIL_MAX).toLowerCase(),
		anonymous: data.get(ANONYMOUS_FIELD) === 'on'
	};
	/**
	 * Una foto que estaba bien no vuelve en el formulario (el navegador no deja rellenar un campo de
	 * archivo): si algo más falla, se pide elegirla de nuevo.
	 * @type {Record<string, string>}
	 */
	let repick = {};
	/** @param {number} status @param {string} message @param {Record<string, string>} [errors] */
	const failWith = (status, message, errors = {}) =>
		fail(status, { error: message, errors: { ...repick, ...errors }, values, typed });
	if (!form.open) return failWith(409, 'Este formulario ya no recibe respuestas.');

	/** @type {{ orderId: string, ticket: number } | null} */
	let invite = null;
	/** @type {import('$lib/server/tickets/orders.js').Order | undefined} */
	let order;
	/** @type {import('$lib/server/tickets/orders.js').Ticket | null} */
	let holder = null;
	if (form.access === 'ticket') {
		const r = await checkInvite(db, form, data.get('clave'));
		if (r.state === 'used') return { sent: true, repeated: true };
		if (r.state !== 'ok' || !r.order) {
			return failWith(400, 'Este link no es válido. Revisá que esté completo.');
		}
		order = r.order;
		invite = { orderId: r.order.id, ticket: r.number ?? 1 };
		holder = r.ticket ?? null;
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

	const photos = await takePhotos(event, db, form, data);
	if (!photos.ok) return failWith(photos.status, photos.message);
	const photoKeys = photos.keys;
	repick = Object.fromEntries(Object.keys(photoKeys).map((id) => [id, 'Volvé a elegir la foto.']));
	const photoNames = new Map(
		form.questions.filter((q) => q.kind === 'photo').map((q) => [answerName(q.id), q.id])
	);
	// Los campos de foto: solo la clave de lo que se subió recién (nunca lo que mandó el navegador).
	const answersIn = {
		/** @param {string} name */
		get: (name) =>
			photoNames.has(name) ? (photoKeys[photoNames.get(name) ?? ''] ?? '') : data.get(name),
		/** @param {string} name */
		getAll: (name) => data.getAll(name)
	};
	const checked = validateFormAnswers(form.questions, answersIn);
	if (!checked.ok || Object.keys(photos.errors).length)
		return failWith(400, checked.ok ? 'Revisá lo marcado.' : checked.message, {
			...(checked.ok ? {} : checked.errors),
			...photos.errors
		});

	const anonymous = isAnonymousResponse(form.privacy, data.get(ANONYMOUS_FIELD));
	/** @type {import('./store.js').Identity | null} */
	let identity = null;
	if (!anonymous) {
		if (order && invite && invite.ticket > 1 && holder) {
			// La entrada 2, 3…: su titular; el mail es el de la compra (el único que hay).
			identity = {
				name: holder.holder_name,
				pronouns: holder.holder_pronouns || null,
				email: order.buyer_email,
				orderId: order.id
			};
		} else if (order) {
			identity = {
				name: order.buyer_name,
				pronouns: order.buyer_pronouns || null,
				email: order.buyer_email,
				orderId: order.id
			};
		} else if (form.access === 'account' && event.locals.member) {
			identity = {
				name: typed.name || null,
				pronouns: typed.pronouns || null,
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
				pronouns: typed.pronouns || null,
				email: typed.email,
				accountId: event.locals.member?.id ?? null
			};
		}
	}
	if (photos.pending.length && event.platform?.env?.MEDIA)
		await storePhotos(event.platform.env.MEDIA, photos.pending);
	const saved = await saveResponse(db, {
		formId: form.id,
		answers: checked.answers,
		identity,
		invite
	});
	return saved === 'ok' ? { sent: true } : { sent: true, repeated: true };
}
