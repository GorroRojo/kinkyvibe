/**
 * "Ingresar": cuentas del público (docs/cuentas.md), con código por mail o con contraseña.
 * Aparte del login de admins (/login, con GitHub). Con el interruptor `cuentas` apagado da 404.
 *
 * `?next=` solo acepta rutas de este mismo sitio (safeRedirect).
 */
import { fail, redirect } from '@sveltejs/kit';
import { safeRedirect } from '$lib/server/auth';
import { logDBError } from '$lib/server/db';
import { passwordLogin, requestCode, verifyCode } from '$lib/server/cuentas/index.js';
import { CODE_TTL_MS } from '$lib/server/cuentas/codes.js';
import { clientOf, mailSender, requireCuentas, startSession } from '$lib/server/cuentas/web.js';

const HOME = '/mi-rincon';

/**
 * Adónde volver después de ingresar (solo este sitio).
 * @param {unknown} raw
 * @param {URL} url
 */
function nextPath(raw, url) {
	return safeRedirect(raw, url.origin, HOME);
}

/** @param {FormData} form @param {string} key */
const field = (form, key) => {
	const v = form.get(key);
	return typeof v === 'string' ? v.slice(0, 300) : '';
};

/**
 * Cuándo vence el código que se mandó, para mostrar la hora (vuelve en un campo oculto si se
 * escribe mal). Solo un momento de los próximos minutos: si no, no se muestra.
 * @param {FormData} form
 * @param {number} [now]
 * @returns {number | null}
 */
function codeExpiry(form, now = Date.now()) {
	const n = Number(form.get('vence'));
	return Number.isInteger(n) && n > now && n <= now + CODE_TTL_MS ? n : null;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ platform, locals, url, setHeaders }) {
	await requireCuentas(platform);
	setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	const next = nextPath(url.searchParams.get('next'), url);
	if (locals.member) redirect(303, next);
	// Después de borrar la cuenta o de cerrar sesión en todos lados (Mi rincón) se vuelve acá
	// con un aviso.
	return {
		next,
		codeTtlMs: CODE_TTL_MS,
		deleted: url.searchParams.get('borrada') === '1',
		loggedOutEverywhere: url.searchParams.get('salida') === 'todas'
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	// Paso 1: mandar el código.
	codigo: async (event) => {
		const db = await requireCuentas(event.platform);
		const form = await event.request.formData();
		const email = field(form, 'email');
		const next = nextPath(field(form, 'next'), event.url);
		try {
			const result = await requestCode({
				db,
				email,
				client: await clientOf(event),
				send: mailSender(event, db)
			});
			if (!result.ok)
				return fail(result.status, { step: 'email', email, next, error: result.message });
			return { step: 'code', email: result.email, next, sent: true, expiresAt: result.expiresAt };
		} catch (e) {
			logDBError('cuentas: pedir código', e);
			return fail(500, { step: 'email', email, next, error: 'Algo falló. Probá de nuevo.' });
		}
	},

	// Paso 2: el código que llegó por mail.
	verificar: async (event) => {
		const db = await requireCuentas(event.platform);
		const form = await event.request.formData();
		const email = field(form, 'email');
		const next = nextPath(field(form, 'next'), event.url);
		const expiresAt = codeExpiry(form);
		let ok = false;
		try {
			const result = await verifyCode({
				db,
				email,
				code: field(form, 'code'),
				client: await clientOf(event)
			});
			if (!result.ok)
				return fail(result.status, { step: 'code', email, next, expiresAt, error: result.message });
			await startSession(event, db, result.account.id, 'code');
			ok = true;
		} catch (e) {
			logDBError('cuentas: verificar código', e);
		}
		if (!ok)
			return fail(500, {
				step: 'code',
				email,
				next,
				expiresAt,
				error: 'Algo falló. Probá de nuevo.'
			});
		redirect(303, next);
	},

	// Alternativa: mail y contraseña.
	contrasena: async (event) => {
		const db = await requireCuentas(event.platform);
		const form = await event.request.formData();
		const email = field(form, 'email');
		const next = nextPath(field(form, 'next'), event.url);
		let ok = false;
		try {
			const result = await passwordLogin({
				db,
				email,
				password: field(form, 'password'),
				client: await clientOf(event)
			});
			// Nunca se devuelve la contraseña al formulario.
			if (!result.ok)
				return fail(result.status, { step: 'password', email, next, error: result.message });
			await startSession(event, db, result.account.id, 'password');
			ok = true;
		} catch (e) {
			logDBError('cuentas: contraseña', e);
		}
		if (!ok)
			return fail(500, { step: 'password', email, next, error: 'Algo falló. Probá de nuevo.' });
		redirect(303, next);
	}
};
