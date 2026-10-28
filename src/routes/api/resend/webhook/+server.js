/**
 * Avisos (webhooks) de Resend: rebotes y quejas de los mails (docs/mails.md, «Rebotes y quejas»;
 * src/lib/server/email/resendWebhook.js).
 *
 * 1. Sin `RESEND_WEBHOOK_SECRET` no hace nada: 503 (hasta que gorrite cargue el secreto).
 * 2. Verifica la firma Svix y que la marca de tiempo tenga menos de 5 minutos. Si no: 401.
 * 3. Recién ahí lee el JSON y lo procesa una vez por `svix-id`. Contesta 200 también a lo que no
 *    le importa, así Resend no reintenta.
 *
 * Nunca loguea direcciones. Un error de la base devuelve 500 para que Resend reintente.
 */
import { json, text } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDB, logDBError } from '$lib/server/db';
import { readTextCapped } from '$lib/server/http/body.js';
import {
	WEBHOOK_MAX_BYTES,
	handleResendEvent,
	verifyWebhook
} from '$lib/server/email/resendWebhook.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, platform }) {
	const secret = env.RESEND_WEBHOOK_SECRET;
	if (!secret) return text('not configured', { status: 503 });

	if (Number(request.headers.get('content-length') ?? 0) > WEBHOOK_MAX_BYTES)
		return text('too large', { status: 413 });
	// Sin content-length (chunked) se lee de a pedazos y se corta al pasar el tope.
	const body = await readTextCapped(request, WEBHOOK_MAX_BYTES);
	if (body === null) return text('too large', { status: 413 });

	const svixId = request.headers.get('svix-id');
	const check = await verifyWebhook({
		secret,
		id: svixId,
		timestamp: request.headers.get('svix-timestamp'),
		signature: request.headers.get('svix-signature'),
		body
	});
	if (!check.ok || !svixId) {
		console.warn(`[mails] aviso de Resend rechazado (${check.ok ? 'svix-id' : check.reason})`);
		return text('invalid signature', { status: 401 });
	}

	/** @type {unknown} */
	let event;
	try {
		event = JSON.parse(body);
	} catch {
		return text('bad request', { status: 400 });
	}

	const db = getDB(platform);
	if (!db) return text('not configured', { status: 503 });
	try {
		const { outcome } = await handleResendEvent(db, { svixId, event });
		return json({ ok: true, outcome });
	} catch (error) {
		logDBError('aviso de Resend', error);
		return text('error', { status: 500 });
	}
}
