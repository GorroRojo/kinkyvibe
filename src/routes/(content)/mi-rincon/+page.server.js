/**
 * "Mi rincón": la cuenta del público (docs/cuentas.md). Mail, contraseña (poner, cambiar,
 * sacar), compras de ese mail (solo lectura, con «¿Son tuyas?» para las gratis hechas sin
 * sesión), «Mis datos» (lo guardado para la compra: ver, cambiar, borrar), cerrar sesión (acá o
 * en todos lados) y borrar la cuenta. Sin sesión, lleva a /ingresar.
 *
 * La sesión dura para siempre, así que tocar la contraseña y borrar la cuenta piden además un
 * código fresco por mail, del mismo `purpose` que la acción (?/confirmar lo manda; la acción lo
 * verifica y lo gasta). Un código de ingreso no sirve para esto, ni al revés.
 */
import { fail, redirect } from '@sveltejs/kit';
import { logDBError } from '$lib/server/db';
import {
	canHaveProfiles,
	getAccount,
	getReadingSpeed,
	removePassword,
	setPassword,
	setReadingSpeed
} from '$lib/server/cuentas/accounts.js';
import { READING_SPEEDS, parseReadingSpeed } from '$lib/utils/readingTime.js';
import { passwordProblem } from '$lib/server/cuentas/password.js';
import {
	chooseFreeOrder,
	ordersForAccount,
	verifiedEmail,
	unconfirmedFreeOrders
} from '$lib/server/cuentas/orders.js';
import { SESSION_COOKIE, destroyOtherSessions } from '$lib/server/cuentas/session.js';
import { unlinkAccount } from '$lib/server/telegram/link.js';
import { revokeFeeds } from '$lib/server/series/feeds.js';
import {
	checkConfirmCode,
	closeAccount,
	isConfirmPurpose,
	requestConfirmCode
} from '$lib/server/cuentas/index.js';
import { clientOf, endSession, mailSender, requireCuentas } from '$lib/server/cuentas/web.js';
import { getEventInfo } from '$lib/server/tickets/events.js';
import { orderReference } from '$lib/utils/tickets.js';
import { sigoEnabled } from '$lib/server/sigo/web.js';
import { getSavedBuyer, setSavedBuyer } from '$lib/server/cuentas/savedBuyer.js';
import {
	editSavedBuyer,
	isSavedBuyerField,
	maskDni,
	withoutSavedField
} from '$lib/utils/savedBuyer.js';
import { accountAvatarKeys, mediaPurgeEnabled, schedulePurge } from '$lib/server/media/purge.js';

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
	// La base está lejos: lo que no depende de otra cosa se lee a la par. La velocidad de lectura
	// y el permiso de perfiles ya vinieron con la sesión (`locals.member`, getSessionAccount).
	const [account, ordersRead, savedRead, profilesOk, sigoOn, readingSpeed] = await Promise.all([
		getAccount(db, member.id),
		// «¿Son tuyas?»: entradas gratis pedidas con este mail sin la sesión de la cuenta («No fui yo»,
		// parte 2). No van en la lista hasta que la persona dice que son suyas.
		verifiedEmail(db, member.id)
			.then((email) =>
				Promise.all([
					ordersForAccount(db, member.id, { email }),
					unconfirmedFreeOrders(db, member.id, { email })
				])
			)
			.then(
				([orders, unconfirmed]) => ({ orders, unconfirmed, error: false }),
				(e) => {
					logDBError('cuentas: compras', e);
					return {
						orders: /** @type {Awaited<ReturnType<typeof ordersForAccount>>} */ ([]),
						unconfirmed: /** @type {Awaited<ReturnType<typeof unconfirmedFreeOrders>>} */ ([]),
						error: true
					};
				}
			),
		// «Mis datos»: el DNI va tapado (salvo los últimos 3); entero, solo con «Mostrar» (?/mostrarDni).
		getSavedBuyer(db, member.id).then(
			(saved) => ({ saved, error: false }),
			() => {
				console.error('[cuentas] no se pudieron leer los datos guardados');
				return {
					saved: /** @type {import('$lib/utils/savedBuyer.js').SavedBuyer} */ ({}),
					error: true
				};
			}
		),
		member.canHaveProfiles ?? canHaveProfiles(db, member.id),
		// Interruptor `lo_que_sigo`: una sola tarjeta, Mi rincón → Lo que sigo, que incluye el
		// calendario personal (docs/lo-que-sigo.md).
		sigoEnabled(event.platform),
		member.readingSpeed !== undefined
			? member.readingSpeed
			: getReadingSpeed(db, member.id).catch(() => null)
	]);
	if (!account) {
		await endSession(event, db);
		redirect(303, LOGIN);
	}
	const { orders, unconfirmed, error: ordersError } = ordersRead;
	const { saved, error: savedError } = savedRead;
	// El título y la fecha de cada evento de las compras, todos a la par.
	const slugs = [...new Set([...orders, ...unconfirmed].map((o) => o.event_slug))];
	const infos = await Promise.all(slugs.map((slug) => getEventInfo(slug)));
	/** @type {Map<string, { title: string, start: string | null } | null>} */
	const events = new Map(slugs.map((slug, i) => [slug, infos[i]]));
	/** @param {(typeof orders)[number]} o */
	const listed = (o) => ({
		id: o.id,
		reference: orderReference(o.id),
		event: events.get(o.event_slug)?.title ?? o.event_slug,
		eventStart: events.get(o.event_slug)?.start ?? null,
		quantity: o.quantity,
		total: o.total,
		status: o.status,
		createdAt: o.created_at
	});
	return {
		email: account.email,
		hasPassword: account.has_password,
		createdAt: account.created_at,
		// Sin el permiso "puede tener perfiles" (lo dan les admins), nada de perfiles a la vista.
		canHaveProfiles: profilesOk,
		sigoOn,
		ordersError,
		saved: {
			name: saved.name ?? '',
			pronouns: saved.pronouns ?? '',
			hasDni: Boolean(saved.dni),
			dniMasked: maskDni(saved.dni)
		},
		savedError,
		// La velocidad de lectura de la cuenta (null: la de siempre). $lib/utils/readingSpeed.js.
		readingSpeed,
		orders: orders.map(listed),
		unconfirmed: unconfirmed.map(listed)
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
		// Acá solo los de la cuenta; los de proyectos se piden en la página del proyecto.
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

	// «Mis datos»: cambia el nombre y los pronombres (vacíos se sacan) y el DNI (vacío no cambia).
	// Mismas reglas que la compra (validadores de quien compra).
	datos: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		try {
			const current = await getSavedBuyer(db, member.id);
			const r = editSavedBuyer(current, {
				name: field(form, 'name'),
				pronouns: field(form, 'pronouns'),
				dni: field(form, 'dni')
			});
			// Lo escrito vuelve, salvo el DNI (no se devuelve nunca en un error).
			if (!r.ok)
				return fail(400, {
					action: 'datos',
					errors: r.errors,
					values: { name: field(form, 'name'), pronouns: field(form, 'pronouns') }
				});
			await setSavedBuyer(db, member.id, r.saved);
		} catch {
			console.error('[cuentas] no se pudieron guardar los datos');
			return fail(500, { action: 'datos', error: 'No se pudo guardar. Probá de nuevo.' });
		}
		return { action: 'datos', message: 'Tus datos quedaron guardados.' };
	},

	// «Velocidad de lectura»: una de las tres o «Otro» con un número (llevado al rango permitido).
	// «Predeterminado» saca lo guardado. El sitio la toma al recargar los datos ((content)/+layout.svelte).
	velocidad: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		const choice = field(form, 'velocidad');
		const preset = READING_SPEEDS.find((s) => s.id === choice);
		const wpm = preset
			? preset.wpm
			: choice === 'otro'
				? parseReadingSpeed(field(form, 'otro'))
				: null;
		if (wpm === null)
			return fail(400, {
				action: 'velocidad',
				error:
					choice === 'otro' ? 'Escribí cuántas palabras por minuto leés.' : 'Elegí una velocidad.'
			});
		try {
			const saved = await setReadingSpeed(db, member.id, wpm);
			// Sin JavaScript, el layout y la página se cargan en este mismo pedido: que vean lo nuevo.
			member.readingSpeed = saved;
			return {
				action: 'velocidad',
				message:
					saved === null
						? 'Listo: volviste a la velocidad normal.'
						: `Listo: ${saved} palabras por minuto.`
			};
		} catch {
			console.error('[cuentas] no se pudo guardar la velocidad de lectura');
			return fail(500, { action: 'velocidad', error: 'No se pudo guardar. Probá de nuevo.' });
		}
	},

	borrarDato: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		const campo = field(form, 'campo');
		if (!isSavedBuyerField(campo))
			return fail(400, { action: 'datos', error: 'No sabemos qué borrar.' });
		try {
			const current = await getSavedBuyer(db, member.id);
			await setSavedBuyer(db, member.id, withoutSavedField(current, campo));
		} catch {
			console.error('[cuentas] no se pudo borrar un dato guardado');
			return fail(500, { action: 'datos', error: 'No se pudo borrar. Probá de nuevo.' });
		}
		const what = { name: 'Tu nombre', pronouns: 'Tus pronombres', dni: 'Tu DNI' }[campo];
		return { action: 'datos', message: `${what}: borrado.` };
	},

	borrarDatos: async (event) => {
		const { db, member } = await requireMember(event);
		try {
			await setSavedBuyer(db, member.id, {});
		} catch {
			console.error('[cuentas] no se pudieron borrar los datos guardados');
			return fail(500, { action: 'datos', error: 'No se pudo borrar. Probá de nuevo.' });
		}
		return { action: 'datos', message: 'Listo: borramos todos tus datos guardados.' };
	},

	// «Mostrar» el DNI entero: solo a la propia cuenta, en la respuesta de esta acción.
	mostrarDni: async (event) => {
		const { db, member } = await requireMember(event);
		try {
			const { dni } = await getSavedBuyer(db, member.id);
			return { action: 'datos', dni: dni ?? '' };
		} catch {
			console.error('[cuentas] no se pudieron leer los datos guardados');
			return fail(500, { action: 'datos', error: 'No se pudo. Probá de nuevo.' });
		}
	},

	// «¿Son tuyas?»: «Sí, son mías» (mine=1) la pasa a la lista; «No es mía» (mine=0) la saca.
	elegirOrden: async (event) => {
		const { db, member } = await requireMember(event);
		const form = await event.request.formData();
		const orderId = field(form, 'orden');
		const mine = field(form, 'mine');
		if (!orderId || (mine !== '1' && mine !== '0'))
			return fail(400, { action: 'elegirOrden', error: 'No sabemos qué elegiste.' });
		try {
			const ok = await chooseFreeOrder(db, { accountId: member.id, orderId, mine: mine === '1' });
			if (!ok) return fail(404, { action: 'elegirOrden', error: 'No encontramos esas entradas.' });
		} catch (e) {
			logDBError('cuentas: elegir orden gratis', e);
			return fail(500, { action: 'elegirOrden', error: 'No se pudo. Probá de nuevo.' });
		}
		return {
			action: 'elegirOrden',
			message:
				mine === '1'
					? 'Listo: las sumamos a tus compras y entradas.'
					: 'Listo: no te las mostramos más.'
		};
	},

	salir: async (event) => {
		const db = await requireCuentas(event.platform);
		try {
			await endSession(event, db);
		} catch (e) {
			logDBError('cuentas: cerrar sesión', e);
		}
		// El inicio muestra «Saliste de tu cuenta» (src/routes/(content)/+layout.svelte).
		redirect(303, '/?salida=1');
	},

	// Cierra todas las sesiones de la cuenta, también esta. No pide código: solo saca acceso.
	salirTodos: async (event) => {
		const { db, member } = await requireMember(event);
		try {
			await destroyOtherSessions(db, member.id, undefined);
			// «En todos lados» también corta lo que no es una sesión: el Telegram vinculado y el link
			// del calendario personal (quien tenía el celu o la cuenta los podía seguir usando).
			await unlinkAccount(db, member.id);
			await revokeFeeds(db, member.id);
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
			// Las fotos de sus perfiles, antes de soltarlos (después ya no se sabe cuáles eran).
			const avatars = mediaPurgeEnabled(event.platform?.env)
				? await accountAvatarKeys(db, member.id).catch(() => [])
				: [];
			await closeAccount(db, member.id);
			// Dejan de servirse: que tampoco queden en la caché del borde.
			schedulePurge(event.platform, avatars);
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
