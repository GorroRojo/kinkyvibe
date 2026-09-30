/**
 * "Mi rincón": la cuenta del público (docs/cuentas.md). Mail, contraseña (poner, cambiar,
 * sacar), compras de ese mail (solo lectura), cerrar sesión y borrar la cuenta. Con el
 * interruptor `cuentas` apagado da 404; sin sesión, lleva a /ingresar.
 */
import { fail, redirect } from '@sveltejs/kit';
import { logDBError } from '$lib/server/db';
import {
	deleteAccount,
	getAccount,
	removePassword,
	setPassword
} from '$lib/server/cuentas/accounts.js';
import { ordersForAccount } from '$lib/server/cuentas/orders.js';
import { SESSION_COOKIE, destroyOtherSessions } from '$lib/server/cuentas/session.js';
import { endSession, requireCuentas } from '$lib/server/cuentas/web.js';
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

/** @type {import('./$types').Actions} */
export const actions = {
	contrasena: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		const password = field(form, 'password');
		if (password !== field(form, 'confirm'))
			return fail(400, { action: 'contrasena', error: 'Las dos contraseñas no coinciden.' });
		try {
			const problem = await setPassword(db, member.id, password);
			if (problem) return fail(400, { action: 'contrasena', error: problem });
			// Con contraseña nueva, se cierran las otras sesiones (queda abierta esta).
			await destroyOtherSessions(db, member.id, event.cookies.get(SESSION_COOKIE));
		} catch (e) {
			logDBError('cuentas: poner contraseña', e);
			return fail(500, { action: 'contrasena', error: 'No se pudo guardar. Probá de nuevo.' });
		}
		return { action: 'contrasena', message: 'Contraseña guardada.' };
	},

	sacarContrasena: async (event) => {
		const { db, member } = await requireMember(event);
		try {
			await removePassword(db, member.id);
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

	borrar: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		if (field(form, 'confirm').trim().toLowerCase() !== DELETE_CONFIRMATION)
			return fail(400, {
				action: 'borrar',
				error: `Para borrar tu cuenta, escribí «${DELETE_CONFIRMATION}».`
			});
		try {
			await deleteAccount(db, member.id);
			await endSession(event, db);
		} catch (e) {
			logDBError('cuentas: borrar', e);
			return fail(500, { action: 'borrar', error: 'No se pudo borrar. Probá de nuevo.' });
		}
		redirect(303, '/ingresar?borrada=1');
	}
};
