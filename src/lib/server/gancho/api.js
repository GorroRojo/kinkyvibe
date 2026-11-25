/**
 * La API para gancho.kinkyvibe.ar (docs/gancho-api.md): la app de Gancho Fácil (otro Worker, otro
 * repo) lee las respuestas de un formulario y sus fotos para mostrarle a cada persona las fotos de
 * sus matches. Qué ve cada quien lo decide esa app.
 *
 * - `GET /api/gancho/formularios/<dirección>/respuestas`: las respuestas en JSON.
 * - `GET /api/gancho/formularios/<dirección>/fotos/<respuesta>/<pregunta>`: los bytes de una foto.
 *
 * En orden:
 * 1. Sin `GANCHO_SECRET` configurado (o con menos de {@link MIN_GANCHO_SECRET_LENGTH} caracteres):
 *    404, como si no existiera.
 * 2. Header `x-gancho-secret` = GANCHO_SECRET, en tiempo constante sobre los SHA-256 (no se filtra
 *    el largo; como `x-fondo-secret`): si falta o no coincide, 401.
 * 3. Solo formularios comunes (no encuestas ni plantillas), no borrados y con al menos una pregunta
 *    «Foto»: cualquier otro, 404. Así el secreto no abre los demás formularios del sitio.
 *
 * Quién respondió va solo si la privacidad de hoy lo deja ver (`showsIdentity`, lo mismo que el
 * panel): nombre, pronombres y mail; en una anónima, `null`. Pedido de servidor a servidor: sin
 * CORS, sin caché.
 */
import { sha256Hex, timingSafeEqual } from '$lib/server/hash.js';
import { getFormBySlug, getResponse, listResponses } from '$lib/server/formularios/store.js';
import { hasPhotoQuestion, photoResponse } from '$lib/server/formularios/photos.js';
import { isPhotoKey, showsIdentity } from '$lib/utils/formularios.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').R2Bucket} R2Bucket */

/** El header del secreto compartido. */
export const GANCHO_HEADER = 'x-gancho-secret';
/** Largo mínimo de GANCHO_SECRET (más corto se considera no configurado). */
export const MIN_GANCHO_SECRET_LENGTH = 16;

/** @param {number} status */
const bare = (status) =>
	new Response(null, { status, headers: { 'cache-control': 'private, no-store' } });

/**
 * `null` si el pedido puede seguir; si no, la respuesta (404 sin secreto configurado, 401 con uno
 * que falta o no coincide).
 * @param {Request} request
 * @param {string | undefined} secret
 */
export async function ganchoGate(request, secret) {
	if (!secret || secret.length < MIN_GANCHO_SECRET_LENGTH) return bare(404);
	const given = request.headers.get(GANCHO_HEADER);
	if (!given || !timingSafeEqual(await sha256Hex(given), await sha256Hex(secret))) return bare(401);
	return null;
}

/**
 * El formulario de la dirección, si la API lo sirve.
 * @param {D1Database} db @param {string} slug
 */
async function ganchoForm(db, slug) {
	const form = await getFormBySlug(db, slug);
	return form && hasPhotoQuestion(form) ? form : null;
}

/**
 * La dirección (relativa) de una foto en la API.
 * @param {string} slug @param {number} responseId @param {string} questionId
 */
export const ganchoPhotoPath = (slug, responseId, questionId) =>
	`/api/gancho/formularios/${encodeURIComponent(slug)}/fotos/${responseId}/${encodeURIComponent(questionId)}`;

/**
 * `GET …/respuestas`.
 * @param {{ request: Request, secret: string | undefined, db: D1Database | null | undefined,
 *   slug: string }} input
 * @returns {Promise<Response>}
 */
export async function handleGanchoResponses({ request, secret, db, slug }) {
	const denied = await ganchoGate(request, secret);
	if (denied) return denied;
	if (!db) return bare(503);
	const form = await ganchoForm(db, slug);
	if (!form) return bare(404);
	const kinds = new Map(form.questions.map((q) => [q.id, q.kind]));
	const responses = (await listResponses(db, form.id)).map((r) => {
		const show = showsIdentity(form.privacy, r);
		return {
			id: r.id,
			createdAt: r.createdAt === null ? null : new Date(r.createdAt).toISOString(),
			day: r.day,
			anonymous: !show,
			name: show ? r.name : null,
			pronouns: show ? r.pronouns : null,
			email: show ? r.email : null,
			answers: r.answers.map((a) => {
				const photo = isPhotoKey(a.value);
				return {
					id: a.id,
					label: a.label,
					kind: photo ? 'photo' : (kinds.get(a.id) ?? null),
					value: photo ? ganchoPhotoPath(form.slug, r.id, a.id) : a.value
				};
			})
		};
	});
	return Response.json(
		{
			form: {
				slug: form.slug,
				title: form.title,
				privacy: form.privacy,
				open: form.open,
				questions: form.questions.map((q) => ({
					id: q.id,
					label: q.label,
					kind: q.kind,
					required: q.required,
					...(q.options.length ? { options: q.options } : {})
				}))
			},
			responses
		},
		{ headers: { 'cache-control': 'private, no-store' } }
	);
}

/**
 * `GET …/fotos/<respuesta>/<pregunta>`.
 * @param {{ request: Request, secret: string | undefined, db: D1Database | null | undefined,
 *   bucket: R2Bucket | null | undefined, slug: string, responseId: string, questionId: string }} input
 * @returns {Promise<Response>}
 */
export async function handleGanchoPhoto({
	request,
	secret,
	db,
	bucket,
	slug,
	responseId,
	questionId
}) {
	const denied = await ganchoGate(request, secret);
	if (denied) return denied;
	if (!db) return bare(503);
	const form = await ganchoForm(db, slug);
	if (!form || !/^[1-9]\d{0,15}$/.test(responseId)) return bare(404);
	const response = await getResponse(db, form.id, Number(responseId));
	const key = response?.answers.find((a) => a.id === questionId)?.value;
	return (await photoResponse(bucket, key)) ?? bare(404);
}
