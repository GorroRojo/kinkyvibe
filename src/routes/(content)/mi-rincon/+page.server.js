/**
 * "Mi rincón": la cuenta del público (docs/cuentas.md). Mail, contraseña (poner, cambiar,
 * sacar), compras de ese mail (solo lectura), cerrar sesión (acá o en todos lados) y borrar la
 * cuenta. Con el
 * interruptor `cuentas` apagado da 404; sin sesión, lleva a /ingresar.
 *
 * La sesión dura para siempre, así que tocar la contraseña y borrar la cuenta piden además un
 * código fresco por mail, del mismo `purpose` que la acción (?/confirmar lo manda; la acción lo
 * verifica y lo gasta). Un código de ingreso no sirve para esto, ni al revés.
 */
import { fail, redirect } from '@sveltejs/kit';
import { logDBError } from '$lib/server/db';
import { getAccount, removePassword, setPassword } from '$lib/server/cuentas/accounts.js';
import { passwordProblem } from '$lib/server/cuentas/password.js';
import { ordersForAccount } from '$lib/server/cuentas/orders.js';
import { SESSION_COOKIE, destroyOtherSessions } from '$lib/server/cuentas/session.js';
import {
	checkConfirmCode,
	closeAccount,
	isConfirmPurpose,
	requestConfirmCode
} from '$lib/server/cuentas/index.js';
import { clientOf, endSession, mailSender, requireCuentas } from '$lib/server/cuentas/web.js';
import { getEventInfo } from '$lib/server/tickets/events.js';
import { orderReference } from '$lib/utils/tickets.js';

/** Lo que hay que escribir para confirmar el borrado. */
const DELETE_CONFIRMATION = 'borrar';

const LOGIN = '/ingresar?next=%2Fmi-rincon';

/**
 * La cuenta de la sesión, o redirect a /ingresar.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
async function requireMember(event) {
	const db = await requireCuentas(event.platform);
	const member = event.locals.member;
	if (!member) redirect(303, LOGIN);
	return { db, member };
}

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	event.setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	const { db, member } = await requireMember(event);
	const account = await getAccount(db, member.id);
	if (!account) {
		await endSession(event, db);
		redirect(303, LOGIN);
	}
	let orders = /** @type {Awaited<ReturnType<typeof ordersForAccount>>} */ ([]);
	let ordersError = false;
	try {
		orders = await ordersForAccount(db, account.id);
	} catch (e) {
		logDBError('cuentas: compras', e);
		ordersError = true;
	}
	/** @type {Map<string, { title: string, start: string | null } | null>} */
	const events = new Map();
	for (const o of orders) {
		if (!events.has(o.event_slug)) events.set(o.event_slug, await getEventInfo(o.event_slug));
	}
	return {
		email: account.email,
		hasPassword: account.has_password,
		createdAt: account.created_at,
		ordersError,
		orders: orders.map((o) => ({
			id: o.id,
			reference: orderReference(o.id),
			event: events.get(o.event_slug)?.title ?? o.event_slug,
			eventStart: events.get(o.event_slug)?.start ?? null,
			quantity: o.quantity,
			total: o.total,
			status: o.status,
			createdAt: o.created_at
		}))
	};
}

/** @param {FormData} form @param {string} key */
const field = (form, key) => {
	const v = form.get(key);
	return typeof v === 'string' ? v.slice(0, 300) : '';
};

/**
 * Verifica el código de confirmación del formulario. Devuelve `null` si está bien o el `fail`.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ id: string, email: string }} member
 * @param {'password' | 'delete'} purpose
 * @param {FormData} form
 * @param {string} action
 */
async function confirmed(event, db, member, purpose, form, action) {
	const result = await checkConfirmCode({
		db,
		email: member.email,
		purpose,
		code: field(form, 'code'),
		client: await clientOf(event)
	});
	if (result.ok) return null;
	// El formulario sigue abierto (codeSentFor) para que se pueda corregir o pedir otro.
	return fail(result.status, { action, codeSentFor: purpose, error: result.message });
}

/** @type {import('./$types').Actions} */
export const actions = {
	// Paso 1 de las acciones delicadas: manda el código para confirmar.
	confirmar: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		const purpose = field(form, 'para');
		// Acá solo los de la cuenta; los de grupos se piden en la página del grupo.
		if (!isConfirmPurpose(purpose) || purpose === 'grupo')
			return fail(400, { error: 'No sabemos qué confirmar.' });
		const action = purpose === 'delete' ? 'borrar' : 'contrasena';
		try {
			const result = await requestConfirmCode({
				db,
				email: member.email,
				purpose,
				client: await clientOf(event),
				send: mailSender(event, db)
			});
			if (!result.ok) return fail(result.status, { action, error: result.message });
		} catch (e) {
			logDBError('cuentas: código para confirmar', e);
			return fail(500, { action, error: 'Algo falló. Probá de nuevo.' });
		}
		return {
			action,
			codeSentFor: purpose,
			message: 'Te mandamos un código a tu mail para confirmar.'
		};
	},

	contrasena: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		const password = field(form, 'password');
		const again = { action: 'contrasena', codeSentFor: 'password' };
		// Primero lo que no gasta el código: así un error de tipeo no obliga a pedir otro.
		if (password !== field(form, 'confirm'))
			return fail(400, { ...again, error: 'Las dos contraseñas no coinciden.' });
		const problem = passwordProblem(password);
		if (problem) return fail(400, { ...again, error: problem });
		try {
			const bad = await confirmed(event, db, member, 'password', form, 'contrasena');
			if (bad) return bad;
			const saveProblem = await setPassword(db, member.id, password);
			if (saveProblem) return fail(400, { action: 'contrasena', error: saveProblem });
			// Con contraseña nueva, se cierran las otras sesiones (queda abierta esta).
			await destroyOtherSessions(db, member.id, event.cookies.get(SESSION_COOKIE));
		} catch (e) {
			logDBError('cuentas: poner contraseña', e);
			return fail(500, { ...again, error: 'No se pudo guardar. Probá de nuevo.' });
		}
		return { action: 'contrasena', message: 'Contraseña guardada.' };
	},

	sacarContrasena: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		try {
			const bad = await confirmed(event, db, member, 'password', form, 'contrasena');
			if (bad) return bad;
			await removePassword(db, member.id);
			// Igual que al cambiarla: se cierran las otras sesiones (queda abierta esta).
			await destroyOtherSessions(db, member.id, event.cookies.get(SESSION_COOKIE));
		} catch (e) {
			logDBError('cuentas: sacar contraseña', e);
			return fail(500, { action: 'contrasena', error: 'No se pudo guardar. Probá de nuevo.' });
		}
		return {
			action: 'contrasena',
			message: 'Listo: ya no tenés contraseña. Entrás con el código por mail.'
		};
	},

	salir: async (event) => {
		const db = await requireCuentas(event.platform);
		try {
			await endSession(event, db);
		} catch (e) {
			logDBError('cuentas: cerrar sesión', e);
		}
		redirect(303, '/');
	},

	// Cierra todas las sesiones de la cuenta, también esta. No pide código: solo saca acceso.
	salirTodos: async (event) => {
		const { db, member } = await requireMember(event);
		try {
			await destroyOtherSessions(db, member.id, undefined);
			await endSession(event, db);
		} catch (e) {
			logDBError('cuentas: cerrar todas las sesiones', e);
			return fail(500, { action: 'sesiones', error: 'No se pudo. Probá de nuevo.' });
		}
		redirect(303, '/ingresar?salida=todas');
	},

	borrar: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		if (field(form, 'confirm').trim().toLowerCase() !== DELETE_CONFIRMATION)
			return fail(400, {
				action: 'borrar',
				codeSentFor: 'delete',
				error: `Para borrar tu cuenta, escribí «${DELETE_CONFIRMATION}».`
			});
		try {
			const bad = await confirmed(event, db, member, 'delete', form, 'borrar');
			if (bad) return bad;
			await closeAccount(db, member.id);
			await endSession(event, db);
		} catch (e) {
			logDBError('cuentas: borrar', e);
			return fail(500, {
				action: 'borrar',
				codeSentFor: 'delete',
				error: 'No se pudo borrar. Probá de nuevo.'
			});
		}
		redirect(303, '/ingresar?borrada=1');
	}
};
