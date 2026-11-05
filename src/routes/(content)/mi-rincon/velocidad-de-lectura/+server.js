/**
 * POST /mi-rincon/velocidad-de-lectura con `{ wpm: number | null }`: guarda en la cuenta la
 * velocidad de lectura elegida desde la explicación de «X min de lectura»
 * ($lib/utils/readingSpeed.js). `null` (o «Predeterminado») la saca. Responde `{ wpm }` con lo que quedó.
 *
 * Solo JSON: un formulario de otro sitio no puede mandar `application/json` (el chequeo de origen
 * de SvelteKit frena los otros tipos) y sin headers CORS un navegador de otro sitio no puede hacer
 * este pedido. Sin sesión: 401 (la elección queda solo en el navegador).
 */
import { error, json } from '@sveltejs/kit';
import { getDB, logDBError } from '$lib/server/db';
import { readJsonCapped } from '$lib/server/http/body.js';
import { setReadingSpeed } from '$lib/server/cuentas/accounts.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, request, platform }) {
	const member = locals.member;
	if (!member) error(401, 'Sin sesión');
	if (!request.headers.get('content-type')?.startsWith('application/json')) error(415, 'Solo JSON');
	const db = getDB(platform);
	if (!db) error(503, 'Sin base');
	// Un número y poco más: 4 KB alcanzan (también sin content-length).
	const read = await readJsonCapped(request, 4096);
	if (!read.ok && read.reason === 'too-large') error(413, 'Demasiado grande');
	if (!read.ok) error(400, 'JSON inválido');
	const body = read.value;
	const wpm = body && typeof body === 'object' && 'wpm' in body ? body.wpm : undefined;
	if (wpm !== null && typeof wpm !== 'number') error(400, 'Falta wpm');
	try {
		return json({ wpm: await setReadingSpeed(db, member.id, wpm) });
	} catch (e) {
		logDBError('cuentas: velocidad de lectura', e);
		error(500, 'No se pudo guardar');
	}
}
