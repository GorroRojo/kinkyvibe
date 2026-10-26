/**
 * Pegamento entre las piezas de la venta de entradas y el entorno (variables, mocks de dev).
 *
 * Variables (ver docs/tickets.md): MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET, RESEND_API_KEY,
 * TICKETS_FROM_EMAIL, TICKETS_REPLY_TO, TICKETS_CONTACT_EMAIL, SITE_URL, TICKETS_TRANSFER_INFO,
 * TICKETS_MP_FEE_PERCENT, EMAIL_ALLOWLIST (obligatoria para mandar
 * mails desde un preview; ver emailGuard.js). Solo en dev: MP_MOCK, TICKETS_DEV_FIXTURE.
 */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { siteOriginFrom } from '$lib/utils/site.js';
import {
	DEFAULT_CONTACT_EMAIL,
	DEFAULT_MP_FEE_PERCENT,
	parseFeePercent
} from '$lib/utils/tickets.js';
import {
	buildDateChangeEmail,
	buildRefundEmail,
	buildReminderEmail,
	buildStreamLinkEmail,
	buildTicketEmail,
	buildTransferEmail,
	autoSubmitted,
	maskEmail,
	resendBackoff,
	sendWithResend
} from './email.js';
import { noteResendQuota } from './resendQuota.js';
import { parseAllowlist, routeEmail, subjectForLog } from './emailGuard.js';
import { getEventMeta, getEventTickets, listTicketedEvents } from './events.js';
import { coveredPartsByWorkshop } from '../eventos/partes.js';
import { workshopPartsList } from './workshopParts.js';
import { isPreviewDeploy } from '../deploy.js';
import { sha256Hex } from '../hash.js';
import { trackFunnel } from '../analytics/track.js';
import { createPreference, findPaymentByOrder, getPayment, refundPayment } from './mercadopago.js';
import { applyPayment, getOrderTickets, markEmailSent } from './orders.js';
import {
	DEFAULT_FROM_EMAIL,
	DEFAULT_REPLY_TO,
	getSalesSettings,
	isAllowedFrom,
	transferInfoFromSettings
} from './settings.js';
import { parseReminders, reminderKey, sendDueReminders } from './reminders.js';
import { resolveTemplate } from './templates.js';
import { queueWaitlistAdvance } from './waitlistEngine.js';
import { buildBuyerMail, sendBuyerMailBatch } from './buyerMail.js';
import { buyerLocation, venueNotesForMail } from '../amigues/venues.js';
import {
	claimStreamLinkSend,
	getStreamLink,
	releaseStreamLinkSend,
	sendStreamLinkBatch
} from './stream.js';
import { mailBatchSize } from './batchSize.js';
import { withMailFooter } from '../email/layout.js';
import { isFreeOrder, isSuppressed, optOutUrl } from '../email/suppressions.js';
import { runMailQueueWith } from './mailQueue.js';
import { calendarStamp } from './calendarFile.js';
import { getDateChange, sendDateChangeBatch } from './dateChange.js';
import { comboCodesForOrder } from './combos.js';
import { isFlagOn } from '../flags.js';
import { queueOrderNotice } from '$lib/server/telegram/adminNotify.js';

/** Secreto fijo del webhook para el checkout simulado en dev (no sirve para nada en producción). */
const DEV_MOCK_WEBHOOK_SECRET = 'dev-mock-webhook-secret';

/**
 * @typedef {{
 *   mock: boolean,
 *   createPreference: (preference: ReturnType<typeof import('./mercadopago.js').checkoutProPreference>, idempotencyKey: string) => Promise<{ id: string, init_point: string }>,
 *   getPayment: (id: string) => Promise<import('./orders.js').MPPayment>,
 *   findPaymentByOrder: (orderId: string) => Promise<import('./orders.js').MPPayment | null>,
 *   refundPayment: (paymentId: string, idempotencyKey: string) => Promise<{ id: number | string, status?: string }>
 * }} Gateway
 */

/**
 * `true` solo en `vite dev` con MP_MOCK=1 o sin MP_ACCESS_TOKEN. `dev` es la constante `false`
 * en el build, así que en producción esto es siempre `false` y el mock no se incluye.
 */
export function isMpMock() {
	return dev && (env.MP_MOCK === '1' || !env.MP_ACCESS_TOKEN);
}

/**
 * Cliente de pagos: Mercado Pago real, el simulado (solo dev) o `null` si no está configurado.
 *
 * @param {typeof fetch} fetchFn
 * @returns {Promise<Gateway | null>}
 */
export async function getGateway(fetchFn) {
	if (dev && isMpMock()) {
		const { mockGateway } = await import('./mock.js');
		return mockGateway;
	}
	const accessToken = env.MP_ACCESS_TOKEN;
	if (!accessToken) return null;
	const client = { fetch: fetchFn, accessToken };
	return {
		mock: false,
		createPreference: (pref, key) => createPreference(client, pref, key),
		getPayment: (id) => getPayment(client, id),
		findPaymentByOrder: (orderId) => findPaymentByOrder(client, orderId),
		refundPayment: (id, key) => refundPayment(client, id, key)
	};
}

/**
 * Datos de la cuenta para transferencias de TICKETS_TRANSFER_INFO (la variable de entorno, que
 * se usa si no hay nada cargado en /admin/ajustes/cobros). Se aceptan saltos de línea reales
 * o escritos como `\n`. `null` si no está configurada.
 */
export function envTransferInfo() {
	const raw = env.TICKETS_TRANSFER_INFO?.replaceAll('\\n', '\n').trim();
	return raw ? raw : null;
}

/**
 * Datos para transferir (alias, CBU/CVU, titular, banco): los de /admin/ajustes/cobros o, si
 * no hay ninguno cargado, TICKETS_TRANSFER_INFO. `null` si no hay ninguno: en ese caso la opción
 * "Transferencia" no se ofrece aunque el evento la habilite.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 */
export async function transferInfo(db) {
	try {
		const fromSettings = transferInfoFromSettings(await getSalesSettings(db));
		if (fromSettings) return fromSettings;
	} catch (error) {
		console.error('[tickets] no se pudieron leer los ajustes de venta:', error);
	}
	return envTransferInfo();
}

/**
 * ¿Hay datos para transferir? Solo sí/no, para los avisos del panel (el editor de eventos y el
 * Inicio): nunca los datos en sí, que solo ve quien compra por transferencia.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 */
export async function transferReady(db) {
	return Boolean(await transferInfo(db));
}

/**
 * Lo mismo que {@link transferReady} con los ajustes ya leídos (el Inicio los lee en su tanda).
 * `null` (no se pudieron leer): como {@link transferInfo}, cuenta solo TICKETS_TRANSFER_INFO.
 *
 * @param {import('./settings.js').SalesSettings | null} settings
 */
export function transferReadyFromSettings(settings) {
	return Boolean((settings && transferInfoFromSettings(settings)) || envTransferInfo());
}

/** Contacto público de la organización (política de devoluciones, cambios de titular…). */
export function contactEmail() {
	return env.TICKETS_CONTACT_EMAIL?.trim() || DEFAULT_CONTACT_EMAIL;
}

/**
 * El remitente guardado, si es de un dominio verificado (`isAllowedFrom` en settings.js); si no
 * (un valor viejo guardado en D1 o una variable mal cargada), el de siempre: con otro dominio
 * Resend rechazaría todos los mails. Lo registra en la consola sin el valor.
 *
 * @param {string} from
 */
function allowedFrom(from) {
	if (!from) return DEFAULT_FROM_EMAIL;
	if (isAllowedFrom(from)) return from;
	console.error('[mails] el remitente configurado no es @kinkyvibe.ar: se usa el de siempre');
	return DEFAULT_FROM_EMAIL;
}

/**
 * Remitente y dirección de respuesta de los mails (y adonde se mandan los comprobantes): los de
 * /admin/mensajes/configuracion o, vacíos, TICKETS_FROM_EMAIL / TICKETS_REPLY_TO, o los de por defecto
 * ("KinkyVibe <entradas@kinkyvibe.ar>" y entradas@kinkyvibe.ar).
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 */
export async function emailSettings(db) {
	/** @type {{ from_email?: string, reply_to_email?: string, mail_footer_contact?: string, mail_footer_signoff?: string }} */
	let s = {};
	try {
		s = await getSalesSettings(db);
	} catch (error) {
		console.error('[tickets] no se pudieron leer los ajustes de venta:', error);
	}
	return {
		from: allowedFrom(s.from_email || env.TICKETS_FROM_EMAIL?.trim() || ''),
		replyTo: s.reply_to_email || env.TICKETS_REPLY_TO?.trim() || DEFAULT_REPLY_TO,
		// Pie de los mails (vacío = el de siempre): lo aplica `deliver()` con `withMailFooter`.
		footer: { contact: s.mail_footer_contact || '', signoff: s.mail_footer_signoff || '' }
	};
}

/**
 * El pie de los mails de los ajustes (para la vista previa de las plantillas; ver `emailSettings`).
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 */
export async function mailFooter(db) {
	return (await emailSettings(db)).footer;
}

/**
 * Dirección para responder los mails y mandar comprobantes (ver `emailSettings`).
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 */
export async function replyToAddress(db) {
	return (await emailSettings(db)).replyTo;
}

let warnedFee = false;

/**
 * Comisión de Mercado Pago que se suma como recargo, en centésimos de punto (773 = 7,73 %). En
 * orden: la del evento (`mp_fee_percent`), la de /admin/ajustes/cobros, TICKETS_MP_FEE_PERCENT
 * o, si no hay ninguna, DEFAULT_MP_FEE_PERCENT (2 %). Con `0` en cualquiera, sin recargo.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 * @param {{ mpFeeBasisPoints: number | null } | null | undefined} config
 */
export async function mpFeeBasisPoints(db, config) {
	if (config?.mpFeeBasisPoints !== null && config?.mpFeeBasisPoints !== undefined) {
		return config.mpFeeBasisPoints;
	}
	try {
		const fromSettings = parseFeePercent((await getSalesSettings(db)).mp_fee_percent);
		if (fromSettings !== null) return fromSettings;
	} catch (error) {
		console.error('[tickets] no se pudieron leer los ajustes de venta:', error);
	}
	return envMpFeeBasisPoints();
}

/**
 * TICKETS_MP_FEE_PERCENT en centésimos de punto; si no está (o es inválida), la comisión por
 * defecto (DEFAULT_MP_FEE_PERCENT).
 */
export function envMpFeeBasisPoints() {
	const raw = env.TICKETS_MP_FEE_PERCENT;
	const parsed = parseFeePercent(raw);
	if (parsed === null && raw && !warnedFee) {
		warnedFee = true;
		console.error(
			`[tickets] TICKETS_MP_FEE_PERCENT inválido ("${raw}"): se usa ${DEFAULT_MP_FEE_PERCENT} %`
		);
	}
	return parsed ?? Math.round(DEFAULT_MP_FEE_PERCENT * 100);
}

/** Secreto para verificar webhooks, o `null` si no está configurado. */
export function webhookSecret() {
	if (env.MP_WEBHOOK_SECRET) return env.MP_WEBHOOK_SECRET;
	if (dev && isMpMock()) return DEV_MOCK_WEBHOOK_SECRET;
	return null;
}

/**
 * Origen público del sitio para links en emails y URLs de MP.
 *
 * @param {URL} url
 */
export function siteOrigin(url) {
	return siteOriginFrom(env.SITE_URL, url.origin);
}

/**
 * Aplica un pago y, si recién se aprobó, manda el email con las entradas (en segundo plano si la
 * plataforma lo permite, para contestarle rápido a MP).
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   payment: import('./orders.js').MPPayment,
 *   origin: string,
 *   fetch: typeof fetch,
 *   platform?: App.Platform
 * }} input
 */
export async function processPayment({ db, payment, origin, fetch: fetchFn, platform }) {
	const result = await applyPayment(db, payment, {
		// Para marcar una aprobación tardía que pasa el cupo (ver applyPayment). Tipo sin cupo:
		// Infinity (nunca se pasa); tipo que ya no existe: null (se revisa).
		capacityOf: async (order) => {
			const type = (await getEventTickets(order.event_slug))?.types.find(
				(t) => t.id === order.ticket_type
			);
			if (!type) return null;
			return type.capacity ?? Number.POSITIVE_INFINITY;
		}
	});
	if (result.outcome === 'unknown-order') {
		console.warn(`[tickets] pago ${payment.id} sin orden conocida`);
	}
	if (result.outcome === 'updated' && result.order?.status === 'refunded') {
		if (payment.status === 'charged_back') {
			// Contracargo: el banco de quien compró revirtió el cobro, no se lo devolvimos nosotres.
			// La orden queda reembolsada igual, pero el mail «Reembolsamos tu compra» sería falso:
			// no se manda nada y queda el aviso en el log (sin datos personales) para revisarlo. Les
			// admins que prendieron «Cada venta» en Telegram reciben un aviso (nunca tira).
			console.warn(
				`[tickets] contracargo del pago ${payment.id} en la orden ${result.order.id}: queda reembolsada, sin mail de reembolso`
			);
			await queueOrderNotice({
				db,
				platform,
				kind: 'contracargo',
				order: result.order,
				origin,
				fetch: fetchFn
			});
		} else {
			// Reembolso hecho desde el panel de MP: avisar una vez (solo quien cambió el estado
			// llega acá; un reembolso hecho desde nuestro admin ya lo avisó).
			await inBackground(sendRefundEmail({ db, order: result.order, fetch: fetchFn }), platform);
		}
	}
	// Reembolso, contracargo o pago cancelado: se liberó el lugar y la lista de espera pasa a la
	// próxima persona (en segundo plano; el cron lo garantiza igual).
	if (
		result.outcome === 'updated' &&
		(result.order?.status === 'refunded' || result.order?.status === 'cancelled')
	) {
		queueWaitlistAdvance({
			platform,
			db,
			eventSlug: result.order.event_slug,
			fetch: fetchFn,
			origin
		});
	}
	if (result.newlyApproved && result.order) {
		const order = result.order;
		// Embudo anónimo (docs/analiticas.md): solo el evento y el medio.
		trackFunnel(platform?.env, {
			slug: order.event_slug,
			step: 'aprobada',
			method: order.payment_method
		});
		const sending = sendOrderEmail({ db, order, tickets: result.tickets, origin, fetch: fetchFn });
		const ctx = platform?.ctx;
		if (ctx?.waitUntil) ctx.waitUntil(sending);
		else await sending;
		// «Cada venta» por Telegram a les admins que lo prendieron (decisión 0041; nunca tira).
		await queueOrderNotice({ db, platform, kind: 'cada_venta', order, origin, fetch: fetchFn });
	}
	return result;
}

/**
 * Manda un mail con Resend. Sin RESEND_API_KEY: en dev lo resume en la consola (`simulated`),
 * en producción loguea un error (`failed`). En un preview, solo a EMAIL_ALLOWLIST (emailGuard.js).
 * `from`: remitente fijo de un mail que no es del sitio de entradas (el del Fondo); sin él, el de
 * los ajustes, como siempre.
 * `optOut`: un mail que no es de una compra pagada (entradas gratis, reservas por transferencia,
 * lista de espera, avisos de series…): si la dirección dijo «No fui yo» (email/suppressions.js), no
 * sale y vuelve `simulated` (como enviado: no se reintenta). Si no se puede leer la base, no sale
 * (`failed`). Los de una compra pagada no lo llevan y salen siempre.
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database | null | undefined,
 *   fetch: typeof fetch,
 *   to: string,
 *   message: { subject: string, html: string, text: string,
 *     attachments?: import('./email.js').MailAttachment[], headers?: Record<string, string> },
 *   idempotencyKey?: string,
 *   log?: string,
 *   from?: string,
 *   optOut?: boolean
 * }} input
 * @returns {Promise<'sent' | 'simulated' | 'failed'>}
 */
async function deliver({
	db,
	fetch: fetchFn,
	to,
	message: built,
	idempotencyKey,
	log = '',
	from: fixedFrom,
	optOut = false
}) {
	if (optOut) {
		try {
			if (!db) throw new Error('sin base');
			if (await isSuppressed(db, to)) {
				console.log(`[mails] «No fui yo»: no se manda "${subjectForLog(built.subject)}"`);
				return 'simulated';
			}
		} catch (error) {
			console.error('[mails] no se pudo revisar «No fui yo»: no se manda', error);
			return 'failed';
		}
	}
	// Todo mail pasa por acá: el pie de Mensajes → Configuración se pone una sola vez, para todos.
	const settings = await emailSettings(db);
	const message = { ...built, html: withMailFooter(built.html, settings.footer) };
	const apiKey = env.RESEND_API_KEY;
	if (!apiKey) {
		if (dev) {
			console.log(
				`[tickets:email simulado] para ${maskEmail(to)} · "${message.subject}"${message.attachments?.length ? ` · adjuntos: ${message.attachments.map((a) => a.filename).join(', ')}` : ''}${log ? `\n${log}` : ''}`
			);
			return 'simulated';
		}
		console.error(
			`[tickets] falta RESEND_API_KEY: no se mandó "${subjectForLog(message.subject)}"`
		);
		return 'failed';
	}
	const route = routeEmail({
		to,
		subject: message.subject,
		preview: isPreviewDeploy(),
		allowlist: parseAllowlist(env.EMAIL_ALLOWLIST)
	});
	if (!route) {
		console.warn(
			`[tickets] preview sin EMAIL_ALLOWLIST: no se mandó "${subjectForLog(message.subject)}"`
		);
		return 'simulated';
	}
	const { replyTo } = settings;
	const from = fixedFrom || settings.from;
	try {
		await sendWithResend({
			fetch: fetchFn,
			apiKey,
			from,
			to: route.to,
			replyTo,
			message: { ...message, subject: route.subject },
			idempotencyKey
		});
	} catch (error) {
		// Cupo terminado: queda el aviso en «Para revisar» (resendQuota.js). El error sigue: quien
		// llama decide (las tandas no gastan el intento, ver `resendBackoff`).
		if (resendBackoff(error) === 'quota') {
			await noteResendQuota(db, {
				code: /** @type {import('./email.js').ResendError} */ (error).code
			});
		}
		throw error;
	}
	return 'sent';
}

/**
 * El mismo envío (Resend, filtro de los previews, remitente de los ajustes) para mails que no
 * son de entradas, como el código para ingresar de las cuentas (src/lib/server/cuentas/).
 *
 * @param {Parameters<typeof deliver>[0]} input
 */
export function deliverEmail(input) {
	return deliver(input);
}

/**
 * Link de la transmisión de un evento online (o `null`), sin romper si falta la tabla.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 */
export async function streamLinkFor(db, slug) {
	return (await streamLinkInfoFor(db, slug))?.link ?? null;
}

/**
 * El link de la transmisión y cuándo se cargó (o `null`), sin romper si falta la tabla. El
 * `updatedAt` da la versión del .ics de los mails (`calendarStamp` en calendarFile.js).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 * @returns {Promise<{ link: string, updatedAt: number | null } | null>}
 */
async function streamLinkInfoFor(db, slug) {
	try {
		const row = await getStreamLink(db, slug);
		return row ? { link: row.link, updatedAt: row.updatedAt } : null;
	} catch (error) {
		console.error(`[tickets] no se pudo leer el link de ${slug}:`, error);
		return null;
	}
}

/**
 * La versión del último cambio de fecha del evento (dateChange.js), o `null`, sin romper si falta
 * la tabla. Entra en la versión del .ics de los mails (`calendarStamp`): un mail que sale después
 * de un cambio de fecha no tiene un SEQUENCE más bajo que el del aviso.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 */
async function dateChangeVersionFor(db, slug) {
	try {
		return (await getDateChange(db, slug))?.version ?? null;
	} catch (error) {
		console.error(`[tickets] no se pudo leer el cambio de fecha de ${slug}:`, error);
		return null;
	}
}

/**
 * Manda (o, sin RESEND_API_KEY, loguea) el email con las entradas de una orden aprobada. En los
 * eventos online, si ya hay link de la transmisión, va en el mail y queda registrado (así
 * "Enviar el link a todes" no se lo vuelve a mandar).
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   order: import('./orders.js').Order,
 *   tickets?: import('./orders.js').Ticket[],
 *   origin: string,
 *   fetch: typeof fetch,
 *   idempotent?: boolean,
 *   idempotencyKey?: string
 * }} input `idempotencyKey`: otra clave para Resend en vez de `tickets-<orden>` (la corrección
 *   del mail manda con una propia: la de siempre ya se usó con otra dirección)
 * @returns {Promise<boolean>} si se envió
 */
export async function sendOrderEmail(input) {
	return (await sendOrderEmailResult(input)) === 'sent';
}

/**
 * {@link sendOrderEmail} con el resultado de `deliver()`: `sent` (salió y quedó marcado),
 * `simulated` (no salió a propósito: «No fui yo», preview sin EMAIL_ALLOWLIST o dev sin clave) o
 * `failed`. Lo usa el reintento del cron (unsentOrders.js) para no volver a tomar una orden
 * cortada a propósito. Si Resend dijo «ahora no» (cupo, tasa o un 5xx: `resendBackoff` en
 * email.js), devuelve eso en vez de `failed`, así el reintento no gasta el intento.
 *
 * @param {Parameters<typeof sendOrderEmail>[0]} input
 * @returns {Promise<'sent' | 'simulated' | 'failed' | 'quota' | 'rate' | 'server'>}
 */
export async function sendOrderEmailResult({
	db,
	order,
	tickets,
	origin,
	fetch: fetchFn,
	idempotent = true,
	idempotencyKey = idempotent ? `tickets-${order.id}` : undefined
}) {
	/** @type {string | null} */
	let claimedLink = null;
	try {
		const list = tickets?.length ? tickets : await getOrderTickets(db, order.id);
		const config = await getEventTickets(order.event_slug);
		const typeName =
			config?.types.find((t) => t.id === order.ticket_type)?.name ?? order.ticket_type;
		const online = Boolean(config?.online);
		const linkInfo = online ? await streamLinkInfoFor(db, order.event_slug) : null;
		const streamLink = linkInfo?.link ?? null;
		if (streamLink && (await claimStreamLinkSend(db, { orderId: order.id, link: streamLink }))) {
			claimedLink = streamLink;
		}
		// Si el evento tiene lugar, quien compró recibe la
		// dirección completa, aunque en el sitio no se muestre (docs/amigues.md).
		const venue = await buyerLocation(db, order.event_slug);
		// «Cómo llegar» y «Accesibilidad»: solo si la página del evento se los muestra a cualquiera.
		const notes = await venueNotesForMail(db, order.event_slug);
		const message = buildTicketEmail({
			order,
			tickets: list,
			// Entradas gratis: el pie lleva «¿No pediste vos estas entradas?» (email/suppressions.js).
			optOutUrl: isFreeOrder(order) ? await optOutUrl(db, origin, order.buyer_email) : null,
			event: {
				// Con el slug, el mail lleva adjunto el .ics del evento (calendarFile.js).
				slug: order.event_slug,
				title: config?.title || order.event_slug,
				start: config?.start,
				end: config?.end,
				status: config?.status,
				// Versión del .ics: la misma en los reintentos; «Reenviar» (sin clave), ahora.
				stamp: calendarStamp({
					orderCreatedAt: order.created_at,
					linkUpdatedAt: linkInfo?.updatedAt,
					dateChangedAt: await dateChangeVersionFor(db, order.event_slug),
					now: idempotent ? null : Date.now()
				}),
				location: venue ? venue.location : config?.location,
				location_name: venue ? venue.location_name : config?.location_name,
				howTo: notes?.howTo,
				accessibility: notes?.accessibility,
				online,
				streamLink,
				// Taller en varias partes con una sola entrada: la fecha y el lugar de cada parte.
				parts: await workshopPartsList(db, order.event_slug, { online })
			},
			typeName,
			origin,
			contactEmail: contactEmail(),
			template: await resolveTemplate(db, order.event_slug, 'tickets'),
			combos: await orderCombos(db, order, origin)
		});
		const result = await deliver({
			db,
			fetch: fetchFn,
			to: order.buyer_email,
			message,
			idempotencyKey,
			optOut: isFreeOrder(order),
			// Nunca logueamos el token completo: con él se entra al evento.
			log: list
				.map((t) => `  ${origin}/entradas/t/${t.token.slice(0, 6)}… (${t.code ?? 'sin código'})`)
				.join('\n')
		});
		if (result === 'failed' && claimedLink) {
			await releaseStreamLinkSend(db, { orderId: order.id, link: claimedLink });
		}
		if (result !== 'sent') return result;
		await markEmailSent(db, order.id);
		return 'sent';
	} catch (error) {
		console.error(`[tickets] no se pudo mandar el email de la orden ${order.id}:`, error);
		if (claimedLink) {
			await releaseStreamLinkSend(db, { orderId: order.id, link: claimedLink }).catch(() => {});
		}
		return resendBackoff(error) ?? 'failed';
	}
}

/**
 * Los códigos combo de la orden para el mail de las entradas (combos.js), solo con el interruptor
 * `combo_codigos` prendido. Si algo falla, el mail sale igual, sin el bloque.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {import('./orders.js').Order} order
 * @param {string} origin
 */
async function orderCombos(db, order, origin) {
	try {
		if (!(await isFlagOn(db, 'combo_codigos'))) return [];
		return await comboCodesForOrder(db, order, { origin });
	} catch (error) {
		console.error(`[tickets] códigos combo de la orden ${order.id}:`, error);
		return [];
	}
}

/**
 * "Enviar el link a todes": manda una tanda del link de la transmisión (como mucho `limit`
 * mails, por defecto el "de a cuántos" de los ajustes) a las órdenes aprobadas del evento que
 * todavía no lo recibieron (idempotente por valor del link; ver stream.js). Lo que quede lo
 * sigue el cron ({@link runMailQueue}) si el envío está pedido con `requestStreamLinkSend`.
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   eventSlug: string,
 *   link: string,
 *   origin: string,
 *   fetch: typeof fetch,
 *   limit?: number,
 *   now?: number
 * }} input
 */
export async function sendStreamLinkEmails({
	db,
	eventSlug,
	link,
	origin,
	fetch: fetchFn,
	limit,
	now = Date.now()
}) {
	const config = await getEventTickets(eventSlug);
	// Cuándo se cargó ESTE link (versión del .ics adjunto; si ya cambió, el de la compra).
	const info = await streamLinkInfoFor(db, eventSlug);
	const linkUpdatedAt = info?.link === link ? info.updatedAt : null;
	const dateChangedAt = await dateChangeVersionFor(db, eventSlug);
	const event = {
		slug: eventSlug,
		title: config?.title || eventSlug,
		start: config?.start,
		end: config?.end,
		status: config?.status
	};
	// Los primeros 8 bytes del hash del link (cambia si cambia el link).
	const key = (await sha256Hex(link)).slice(0, 16);
	const template = await resolveTemplate(db, eventSlug, 'stream');
	return sendStreamLinkBatch(db, {
		eventSlug,
		link,
		now,
		limit: limit ?? mailBatchSize((await getSalesSettings(db)).mail_batch_size),
		send: async (order) => {
			const tickets = await getOrderTickets(db, order.id);
			const message = buildStreamLinkEmail({
				order,
				tickets,
				event: {
					...event,
					stamp: calendarStamp({ orderCreatedAt: order.created_at, linkUpdatedAt, dateChangedAt })
				},
				link,
				origin,
				contactEmail: contactEmail(),
				template
			});
			const result = await deliver({
				db,
				fetch: fetchFn,
				to: order.buyer_email,
				message: autoSubmitted(message),
				idempotencyKey: `stream-${order.id}-${key}`,
				optOut: isFreeOrder(order)
			});
			return result !== 'failed';
		}
	});
}

/**
 * «Avisar a les compradores»: manda una tanda del aviso de cambio de fecha (como mucho `limit`
 * mails, por defecto el "de a cuántos" de los ajustes) a las órdenes aprobadas de antes del
 * cambio que todavía no lo recibieron (una vez por orden y versión; ver dateChange.js). Lo que
 * quede lo sigue el cron ({@link runMailQueue}) si el envío está pedido con
 * `requestDateChangeSend`. La fecha y el lugar son los de ahora; el .ics, con la versión del
 * cambio (mismo UID, SEQUENCE más alto).
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   change: import('./dateChange.js').DateChange,
 *   origin: string,
 *   fetch: typeof fetch,
 *   limit?: number,
 *   now?: number
 * }} input
 */
export async function sendDateChangeEmails({
	db,
	change,
	origin,
	fetch: fetchFn,
	limit,
	now = Date.now()
}) {
	const eventSlug = change.event_slug;
	const config = await getEventTickets(eventSlug);
	const online = Boolean(config?.online);
	const linkInfo = online ? await streamLinkInfoFor(db, eventSlug) : null;
	const venue = await buyerLocation(db, eventSlug);
	const template = await resolveTemplate(db, eventSlug, 'date_change');
	const event = {
		slug: eventSlug,
		title: config?.title || eventSlug,
		start: config?.start ?? change.new_start,
		end: config ? config.end : change.new_end,
		status: config?.status,
		location: venue ? venue.location : config?.location,
		location_name: venue ? venue.location_name : config?.location_name,
		online,
		streamLink: linkInfo?.link ?? null
	};
	const previous = change.old_start ? { start: change.old_start, end: change.old_end } : null;
	return sendDateChangeBatch(db, {
		change,
		now,
		limit: limit ?? mailBatchSize((await getSalesSettings(db)).mail_batch_size),
		send: async (order) => {
			const tickets = await getOrderTickets(db, order.id);
			const message = buildDateChangeEmail({
				order,
				tickets,
				event: {
					...event,
					stamp: calendarStamp({
						orderCreatedAt: order.created_at,
						linkUpdatedAt: linkInfo?.updatedAt,
						dateChangedAt: change.version
					})
				},
				previous,
				typeName: config?.types.find((t) => t.id === order.ticket_type)?.name ?? order.ticket_type,
				origin,
				contactEmail: contactEmail(),
				template
			});
			const result = await deliver({
				db,
				fetch: fetchFn,
				to: order.buyer_email,
				message: autoSubmitted(message),
				idempotencyKey: `datechange-${order.id}-${change.version}`,
				optOut: isFreeOrder(order)
			});
			return result !== 'failed';
		}
	});
}

/**
 * Manda (o, sin RESEND_API_KEY, loguea) el email con los datos para transferir.
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   order: import('./orders.js').Order,
 *   origin: string,
 *   fetch: typeof fetch
 * }} input
 * @returns {Promise<boolean>} si se envió
 */
export async function sendTransferEmail({ db, order, origin, fetch: fetchFn }) {
	try {
		const info = await transferInfo(db);
		if (!info) throw new Error('no hay datos para transferir configurados');
		const config = await getEventTickets(order.event_slug);
		const message = buildTransferEmail({
			order,
			event: {
				title: config?.title || order.event_slug,
				start: config?.start,
				end: config?.end,
				// La compra todavía no está pagada: el lugar como se ve en el sitio.
				parts: await workshopPartsList(db, order.event_slug, {
					online: Boolean(config?.online),
					buyer: false
				})
			},
			typeName: config?.types.find((t) => t.id === order.ticket_type)?.name ?? order.ticket_type,
			transferInfo: info,
			replyTo: await replyToAddress(db),
			contactEmail: contactEmail(),
			origin,
			template: await resolveTemplate(db, order.event_slug, 'transfer'),
			// Todavía no está pagada: el pie lleva «¿No reservaste vos?» (email/suppressions.js).
			optOutUrl: await optOutUrl(db, origin, order.buyer_email)
		});
		const result = await deliver({
			db,
			fetch: fetchFn,
			to: order.buyer_email,
			message,
			idempotencyKey: `transfer-${order.id}`,
			optOut: true
		});
		return result === 'sent';
	} catch (error) {
		console.error(`[tickets] no se pudo mandar el email de transferencia ${order.id}:`, error);
		return false;
	}
}

/**
 * Avisa por mail que la compra se reembolsó (idempotente del lado de Resend por orden).
 *
 * @param {{ db: import('@cloudflare/workers-types').D1Database, order: import('./orders.js').Order, fetch: typeof fetch }} input
 */
export async function sendRefundEmail({ db, order, fetch: fetchFn }) {
	// Una venta en la puerta puede no tener email.
	if (!order.buyer_email) return false;
	try {
		const config = await getEventTickets(order.event_slug);
		const message = buildRefundEmail({
			order,
			event: { title: config?.title || order.event_slug, start: config?.start },
			typeName: config?.types.find((t) => t.id === order.ticket_type)?.name ?? order.ticket_type,
			contactEmail: contactEmail(),
			template: await resolveTemplate(db, order.event_slug, 'refund')
		});
		const result = await deliver({
			db,
			fetch: fetchFn,
			to: order.buyer_email,
			message,
			idempotencyKey: `refund-${order.id}`,
			optOut: isFreeOrder(order)
		});
		return result !== 'failed';
	} catch (error) {
		console.error(`[tickets] no se pudo mandar el aviso de reembolso de ${order.id}:`, error);
		return false;
	}
}

/**
 * Manda una tanda de los recordatorios que tocan ahora (como mucho `limit` mails; por defecto,
 * el "de a cuántos" de los ajustes). Ver reminders.js: idempotente, solo órdenes aprobadas de
 * eventos que no empezaron.
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   origin: string,
 *   fetch: typeof fetch,
 *   now?: number,
 *   limit?: number
 * }} input
 */
export async function sendReminderEmails({ db, origin, fetch: fetchFn, now = Date.now(), limit }) {
	const settings = await getSalesSettings(db);
	const reminders = parseReminders(settings.reminders);
	const ticketed = await listTicketedEvents();
	const events = ticketed
		.map(({ slug, config }) => ({
			slug,
			config,
			start: config.start ? Date.parse(config.start) : NaN,
			reminders: config.reminders,
			cancelled: config.status === 'cancelado'
		}))
		.filter((e) => Number.isFinite(e.start));
	const bySlug = new Map(events.map((e) => [e.slug, e]));
	// Talleres en varias partes con una sola entrada (docs/talleres-partes.md): cada otra parte es un
	// evento más para los recordatorios, con su fecha y las órdenes del taller.
	/** @type {Map<string, { title: string, start: string }>} */
	const partInfo = new Map();
	/** @type {import('./reminders.js').ReminderEvent[]} */
	const partEvents = [];
	const covered = await coveredPartsByWorkshop(db).catch((e) => {
		console.error('[recordatorios] partes de los talleres:', e);
		return new Map();
	});
	for (const [workshop, { parts }] of covered) {
		const e = bySlug.get(workshop);
		if (!e) continue;
		for (const p of parts) {
			const start = p.start ? Date.parse(p.start) : NaN;
			if (!Number.isFinite(start)) continue;
			partInfo.set(p.slug, { title: p.title, start: String(p.start) });
			partEvents.push({
				slug: workshop,
				start,
				reminders: e.reminders,
				cancelled: e.cancelled || p.status === 'cancelado',
				part: p.slug
			});
		}
	}
	/** @type {Map<string, { link: string, updatedAt: number | null } | null>} */
	const links = new Map();
	/** @type {Map<string, number | null>} */
	const dateChanges = new Map();
	/** @type {Map<string, Awaited<ReturnType<typeof buyerLocation>>>} */
	const venues = new Map();
	/** @type {Map<string, Awaited<ReturnType<typeof venueNotesForMail>>>} */
	const venueNotes = new Map();
	/** @type {Map<string, Record<string, any> | null>} */
	const partMetas = new Map();
	// La lista de partes de cada taller con una sola entrada, leída una vez por taller.
	/** @type {Map<string, Awaited<ReturnType<typeof workshopPartsList>>>} */
	const partLists = new Map();
	// Plantilla de cada evento (la del evento sobre la general), leída una vez por evento.
	/** @type {Map<string, Awaited<ReturnType<typeof resolveTemplate>>>} */
	const templates = new Map();
	return sendDueReminders(db, {
		events: [...events, ...partEvents],
		reminders,
		now,
		limit: limit ?? mailBatchSize(settings.mail_batch_size),
		send: async (order, reminder, part) => {
			const e = bySlug.get(order.event_slug);
			if (!e) return false;
			const config = e.config;
			// Una parte: su título, su fecha y su lugar; las entradas y la plantilla, las del taller.
			const where = part ?? e.slug;
			const info = part ? partInfo.get(part) : null;
			if (part && !info) return false;
			if (part && !partMetas.has(part)) partMetas.set(part, await getEventMeta(part));
			const meta = part ? partMetas.get(part) : null;
			if (config.online && !links.has(e.slug)) {
				links.set(e.slug, await streamLinkInfoFor(db, e.slug));
			}
			const linkInfo = config.online ? (links.get(e.slug) ?? null) : null;
			if (!dateChanges.has(e.slug)) dateChanges.set(e.slug, await dateChangeVersionFor(db, e.slug));
			const tickets = await getOrderTickets(db, order.id);
			if (!venues.has(where)) venues.set(where, await buyerLocation(db, where));
			const venue = venues.get(where);
			if (!venueNotes.has(where)) venueNotes.set(where, await venueNotesForMail(db, where));
			const notes = venueNotes.get(where);
			if (!templates.has(e.slug))
				templates.set(e.slug, await resolveTemplate(db, e.slug, 'reminder'));
			if (!partLists.has(e.slug)) {
				partLists.set(
					e.slug,
					await workshopPartsList(db, e.slug, { online: Boolean(config.online) })
				);
			}
			const message = buildReminderEmail({
				order,
				tickets,
				reminder,
				event: {
					// Con el slug (el de la parte, si es una), el .ics y el link a Google Calendar.
					slug: where,
					title: info ? info.title : config.title || e.slug,
					start: info ? info.start : config.start,
					end: part ? (typeof meta?.end === 'string' ? meta.end : undefined) : config.end,
					status: part ? meta?.status : config.status,
					location: venue ? venue.location : meta ? meta.location : config.location,
					location_name: venue
						? venue.location_name
						: meta
							? meta.location_name
							: config.location_name,
					howTo: notes?.howTo,
					accessibility: notes?.accessibility,
					online: config.online,
					streamLink: linkInfo?.link ?? null,
					stamp: calendarStamp({
						orderCreatedAt: order.created_at,
						linkUpdatedAt: linkInfo?.updatedAt,
						// Una parte de un taller tiene su propia fecha: el cambio del taller no cuenta.
						dateChangedAt: part ? null : dateChanges.get(e.slug)
					}),
					parts: partLists.get(e.slug) ?? null
				},
				typeName: config.types.find((t) => t.id === order.ticket_type)?.name ?? order.ticket_type,
				origin,
				contactEmail: contactEmail(),
				template: templates.get(e.slug)
			});
			const result = await deliver({
				db,
				fetch: fetchFn,
				to: order.buyer_email,
				message: autoSubmitted(message),
				idempotencyKey: `reminder-${order.id}-${reminderKey(reminder, part ?? undefined)}`,
				optOut: isFreeOrder(order)
			});
			return result !== 'failed';
		}
	});
}

/**
 * Una corrida del cron de mails (POST /api/cron/recordatorios, cada 15 minutos): una tanda de
 * recordatorios y, con lo que sobre, de lo que quede de cada "Enviar el link a todes" y de cada
 * «Avisar a les compradores» de un cambio de fecha (ver mailQueue.js). Se puede llamar dos veces a la vez sin duplicar nada (ver sendState.js).
 * Con `sendWaitlist` (interruptor `lista_espera` prendido; `waitlistMailBatch` de
 * waitlistEngine.js), los mails de la lista de espera van primero.
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   origin: string,
 *   fetch: typeof fetch,
 *   now?: number,
 *   limit?: number,
 *   sendWaitlist?: (limit: number) => Promise<{ sent: number, failed: number, remaining: number }>
 * }} input
 */
export async function runMailQueue({
	db,
	origin,
	fetch: fetchFn,
	now = Date.now(),
	limit,
	sendWaitlist
}) {
	return runMailQueueWith(db, {
		limit,
		...(sendWaitlist ? { sendWaitlist } : {}),
		sendReminders: (limit) => sendReminderEmails({ db, origin, fetch: fetchFn, now, limit }),
		sendStreamLink: ({ eventSlug, link, limit }) =>
			sendStreamLinkEmails({ db, eventSlug, link, origin, fetch: fetchFn, now, limit }),
		sendDateChange: ({ change, limit }) =>
			sendDateChangeEmails({ db, change, origin, fetch: fetchFn, now, limit })
	});
}

/**
 * "Mail a compradores": manda una tanda de un envío (ver buyerMail.js) por `deliver()`, así que
 * en un preview solo llega a EMAIL_ALLOWLIST. Idempotente por envío y por persona (también del
 * lado de Resend, con una clave por envío y email).
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   send: import('./buyerMail.js').BuyerMailSend,
 *   fetch: typeof fetch,
 *   limit?: number
 * }} input
 */
export async function deliverBuyerMailBatch({ db, send, fetch: fetchFn, limit }) {
	const config = await getEventTickets(send.event_slug);
	const event = {
		title: config?.title || send.event_slug,
		start: config?.start,
		end: config?.end
	};
	return sendBuyerMailBatch(db, {
		send,
		limit,
		deliver: async (recipient) => {
			const message = buildBuyerMail({
				subject: send.subject,
				body: send.body,
				buyerName: recipient.name,
				event,
				contactEmail: contactEmail()
			});
			const digest = await crypto.subtle.digest(
				'SHA-256',
				new TextEncoder().encode(recipient.email)
			);
			const who = Array.from(new Uint8Array(digest).slice(0, 8), (b) =>
				b.toString(16).padStart(2, '0')
			).join('');
			const result = await deliver({
				db,
				fetch: fetchFn,
				to: recipient.email,
				message,
				idempotencyKey: `buyer-mail-${send.id}-${who}`,
				optOut: !recipient.paid
			});
			return result !== 'failed';
		}
	});
}

/**
 * "Mandarme una prueba" (editor de plantillas): manda un mail armado con datos de ejemplo por el
 * mismo camino que los de verdad (`deliver`: en un preview, solo a EMAIL_ALLOWLIST).
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database | null | undefined,
 *   fetch: typeof fetch,
 *   to: string,
 *   message: { subject: string, html: string, text: string }
 * }} input
 * @returns {Promise<'sent' | 'simulated' | 'failed'>}
 */
export async function sendTestEmail({ db, fetch: fetchFn, to, message }) {
	try {
		return await deliver({
			db,
			fetch: fetchFn,
			to,
			message: { ...message, subject: `[Prueba] ${message.subject}` }
		});
	} catch (error) {
		console.error('[tickets] no se pudo mandar el mail de prueba:', error);
		return 'failed';
	}
}

/**
 * Manda el email de las entradas en segundo plano si la plataforma lo permite.
 *
 * @param {Promise<unknown>} task
 * @param {App.Platform | undefined} platform
 */
export async function inBackground(task, platform) {
	const ctx = platform?.ctx;
	if (ctx?.waitUntil) ctx.waitUntil(task);
	else await task;
}
